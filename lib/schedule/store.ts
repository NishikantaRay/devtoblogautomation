import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { STALE_PUBLISHING_MS, type ScheduledPost, type ScheduleStatus } from "./types";

/**
 * File-backed store for scheduled posts. A single JSON document under
 * `.data/` (gitignored), rewritten atomically.
 *
 * Two safeguards make that safe enough for the single-process MVP:
 *   1. every mutation runs through `queue`, so reads and writes never
 *      interleave within this process;
 *   2. writes go to a temp file and are `rename`d into place, so a crash
 *      mid-write can never leave a truncated, unparseable schedule behind.
 *
 * It is deliberately NOT safe across multiple processes — two Node instances
 * pointed at the same file can still clobber each other. Move to SQLite or a
 * real database before running more than one server or worker.
 */

/**
 * Store location, resolved per call rather than at import time so that
 * `SCHEDULE_FILE` is honoured no matter when the module first gets loaded.
 * The worker, the server and tests all resolve it the same way.
 */
const DATA_DIR = ".data";
const DATA_NAME = "schedule.json";

export function dataFile(): string {
  if (process.env.SCHEDULE_FILE) return process.env.SCHEDULE_FILE;
  // Note: `process.cwd()` is opaque to Turbopack's file tracing, so the build
  // prints one "whole project was traced" warning for the schedule routes.
  // It's a warning about trace breadth only — the build succeeds and the
  // routes work. Moving the store behind a database would remove it.
  return path.join(process.cwd(), DATA_DIR, DATA_NAME);
}

interface ScheduleFile {
  version: 1;
  posts: ScheduledPost[];
}

const EMPTY: ScheduleFile = { version: 1, posts: [] };

/** Serializes all store access so concurrent requests can't lose writes. */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(operation, operation);
  // Keep the chain alive even if this operation rejects.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readFileRaw(): Promise<ScheduleFile> {
  const file = dataFile();
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ScheduleFile;
    if (!parsed || !Array.isArray(parsed.posts)) return { ...EMPTY };
    return { version: 1, posts: parsed.posts };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // No schedule yet — start empty. Anything else (corrupt JSON, EACCES)
    // is a real problem the caller should see rather than silently reset.
    if (code === "ENOENT") return { ...EMPTY };
    if (error instanceof SyntaxError) {
      throw new Error(
        `The schedule file at ${file} is not valid JSON. Fix or delete it to continue.`
      );
    }
    throw error;
  }
}

async function writeFileRaw(data: ScheduleFile): Promise<void> {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  // Unique temp name so parallel writers can't share a scratch file.
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await rename(temp, file);
}

/** All scheduled posts, soonest first. */
export async function listPosts(): Promise<ScheduledPost[]> {
  return serialize(async () => {
    const { posts } = await readFileRaw();
    return [...posts].sort((a, b) => {
      // Within a generated series, follow the intended reading order;
      // everything else falls back to soonest-first.
      if (a.seriesOrder !== undefined && b.seriesOrder !== undefined) {
        return a.seriesOrder - b.seriesOrder;
      }
      return a.publishAt.localeCompare(b.publishAt);
    });
  });
}

export interface NewPost {
  markdown: string;
  title: string;
  publishAt: string;
  publishLive: boolean;
  /** Defaults to "pending"; seeded series come in as "draft" for review. */
  status?: ScheduleStatus;
  source?: string;
  seriesOrder?: number;
}

export async function addPost(input: NewPost): Promise<ScheduledPost> {
  return serialize(async () => {
    const file = await readFileRaw();
    const now = new Date().toISOString();
    const post: ScheduledPost = {
      id: randomUUID(),
      markdown: input.markdown,
      title: input.title,
      publishAt: input.publishAt,
      publishLive: input.publishLive,
      status: input.status ?? "pending",
      source: input.source,
      seriesOrder: input.seriesOrder,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    file.posts.push(post);
    await writeFileRaw(file);
    return post;
  });
}

/**
 * Applies `changes` to one post. The update is computed inside the queued
 * operation, so it always reads the freshest state from disk.
 */
export async function updatePost(
  id: string,
  changes: Partial<Omit<ScheduledPost, "id" | "createdAt">>
): Promise<ScheduledPost | undefined> {
  return serialize(async () => {
    const file = await readFileRaw();
    const index = file.posts.findIndex((p) => p.id === id);
    if (index === -1) return undefined;
    const updated: ScheduledPost = {
      ...file.posts[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    file.posts[index] = updated;
    await writeFileRaw(file);
    return updated;
  });
}

export async function deletePost(id: string): Promise<boolean> {
  return serialize(async () => {
    const file = await readFileRaw();
    const remaining = file.posts.filter((p) => p.id !== id);
    if (remaining.length === file.posts.length) return false;
    file.posts = remaining;
    await writeFileRaw(file);
    return true;
  });
}

/**
 * Atomically claims the posts that are due, flipping them to `publishing` in
 * one write so a second worker pass can't pick up the same post.
 *
 * A post is due when it is `pending` and its time has arrived, or when it was
 * left `publishing` by a crashed run long enough ago to be considered stale.
 */
export async function claimDuePosts(now = new Date()): Promise<ScheduledPost[]> {
  return serialize(async () => {
    const file = await readFileRaw();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const claimed: ScheduledPost[] = [];

    file.posts = file.posts.map((post) => {
      const due = Date.parse(post.publishAt) <= nowMs;
      const stale =
        post.status === "publishing" &&
        nowMs - Date.parse(post.updatedAt) > STALE_PUBLISHING_MS;
      if (!((post.status === "pending" && due) || stale)) return post;
      const next: ScheduledPost = { ...post, status: "publishing", updatedAt: nowIso };
      claimed.push(next);
      return next;
    });

    if (claimed.length > 0) await writeFileRaw(file);
    return claimed;
  });
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setPublishedFlag } from "@/lib/schedule/runner";

describe("setPublishedFlag", () => {
  const doc = ['---', 'title: "Hello"', "published: false", "---", "", "Body text."].join("\n");

  it("flips published to true for a live post", () => {
    expect(setPublishedFlag(doc, true)).toContain("published: true");
  });

  it("keeps it false for a draft", () => {
    expect(setPublishedFlag(doc, false)).toContain("published: false");
  });

  it("preserves the body", () => {
    expect(setPublishedFlag(doc, true)).toContain("Body text.");
  });

  it("inserts the key when frontmatter lacks it", () => {
    const without = ['---', 'title: "Hi"', "---", "", "Body."].join("\n");
    const result = setPublishedFlag(without, true);
    expect(result).toContain("published: true");
    expect(result).toContain('title: "Hi"');
  });

  it("flips the flag on a CRLF document", () => {
    // Text pasted from a Windows editor previously slipped through unchanged,
    // so scheduled posts silently stayed drafts on DEV.
    const crlf = '---\r\ntitle: "My Post"\r\npublished: false\r\n---\r\n\r\nBody.';
    const out = setPublishedFlag(crlf, true);
    expect(out).toContain("published: true");
    expect(out).toContain('title: "My Post"');
    expect(out).not.toContain("\r");
  });

  it("leaves a document without frontmatter untouched", () => {
    expect(setPublishedFlag("Just a body.", true)).toBe("Just a body.");
  });

  it("does not touch a 'published' word in the body", () => {
    const result = setPublishedFlag(doc + "\n\nI published this.", true);
    expect(result).toContain("I published this.");
    expect(result.match(/^published:/gm)).toHaveLength(1);
  });
});

// Point the store at a temp file so tests never touch the real queue. The
// env var must be set before the module is first imported, hence the dynamic
// import inside beforeAll.
describe("schedule store", () => {
  let dir: string;
  let store: typeof import("@/lib/schedule/store");

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "blog2dev-schedule-"));
    process.env.SCHEDULE_FILE = path.join(dir, "schedule.json");
    store = await import("@/lib/schedule/store");
  });

  afterAll(() => {
    delete process.env.SCHEDULE_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  const future = () => new Date(Date.now() + 60_000).toISOString();
  const past = () => new Date(Date.now() - 60_000).toISOString();

  const newPost = (publishAt: string, title = "Test post") => ({
    markdown: "---\ntitle: \"Test post\"\npublished: false\n---\n\nBody.",
    title,
    publishAt,
    publishLive: false,
  });

  it("starts empty", async () => {
    expect(await store.listPosts()).toEqual([]);
  });

  it("adds and lists a post", async () => {
    const post = await store.addPost(newPost(future()));
    expect(post.status).toBe("pending");
    expect(post.attempts).toBe(0);
    const all = await store.listPosts();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(post.id);
  });

  it("only claims posts that are due", async () => {
    const claimed = await store.claimDuePosts();
    expect(claimed).toEqual([]);

    const duePost = await store.addPost(newPost(past(), "Due post"));
    const second = await store.claimDuePosts();
    expect(second.map((p) => p.id)).toEqual([duePost.id]);
    expect(second[0].status).toBe("publishing");
  });

  it("does not claim the same post twice", async () => {
    expect(await store.claimDuePosts()).toEqual([]);
  });

  // The review gate: a draft must never publish, however overdue it is.
  it("never claims a draft, even when overdue", async () => {
    const draft = await store.addPost({ ...newPost(past(), "Draft"), status: "draft" });
    expect(await store.claimDuePosts()).toEqual([]);

    const stored = (await store.listPosts()).find((p) => p.id === draft.id);
    expect(stored?.status).toBe("draft");

    // Approving it makes it eligible on the very next pass.
    await store.updatePost(draft.id, { status: "pending" });
    const claimed = await store.claimDuePosts();
    expect(claimed.map((p) => p.id)).toContain(draft.id);
  });

  it("updates a post", async () => {
    const [first] = await store.listPosts();
    const updated = await store.updatePost(first.id, { status: "published", url: "u" });
    expect(updated?.status).toBe("published");
    expect(updated?.url).toBe("u");
  });

  it("returns undefined updating an unknown post", async () => {
    expect(await store.updatePost("nope", { status: "failed" })).toBeUndefined();
  });

  it("serializes concurrent writes without losing any", async () => {
    const before = (await store.listPosts()).length;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => store.addPost(newPost(future(), `Bulk ${i}`)))
    );
    expect(await store.listPosts()).toHaveLength(before + 12);
  });

  it("deletes a post", async () => {
    const [first] = await store.listPosts();
    expect(await store.deletePost(first.id)).toBe(true);
    expect(await store.deletePost(first.id)).toBe(false);
  });
});

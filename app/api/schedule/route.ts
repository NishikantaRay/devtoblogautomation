import { connection } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import { addPost, listPosts } from "@/lib/schedule/store";
import { ERROR_MESSAGES } from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const scheduleSchema = z.object({
  markdown: z.string().min(50).max(1024 * 1024),
  /** ISO-8601 instant. Must be in the future. */
  publishAt: z.string().datetime({ offset: true }),
  /** true → goes live at the due time; false → lands as a DEV draft. */
  publishLive: z.boolean().default(false),
});

/** Lists the queue. Never prerendered — it reads mutable state from disk. */
export async function GET() {
  await connection();
  try {
    return NextResponse.json({ posts: await listPosts() });
  } catch (error) {
    console.error("Failed to read schedule:", error);
    return NextResponse.json(
      { error: { message: "Couldn't read the schedule." } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (isRateLimited(`schedule:${clientKey(request)}`)) {
    return NextResponse.json(
      { error: { message: ERROR_MESSAGES.RATE_LIMITED } },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid request body." } }, { status: 400 });
  }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "An article and a valid publish time are required." } },
      { status: 400 }
    );
  }

  const { markdown, publishAt, publishLive } = parsed.data;

  if (Date.parse(publishAt) <= Date.now()) {
    return NextResponse.json(
      { error: { message: "Pick a publish time in the future." } },
      { status: 400 }
    );
  }

  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) {
    return NextResponse.json(
      { error: { message: "The article is missing its frontmatter block." } },
      { status: 400 }
    );
  }

  try {
    const post = await addPost({
      markdown,
      title: frontmatterValue(frontmatter, "title") ?? "Untitled",
      // Normalize to UTC so comparisons never depend on the sender's offset.
      publishAt: new Date(publishAt).toISOString(),
      publishLive,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("Failed to schedule post:", error);
    return NextResponse.json(
      { error: { message: "Couldn't save the scheduled post." } },
      { status: 500 }
    );
  }
}

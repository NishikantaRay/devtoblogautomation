import { NextResponse } from "next/server";
import { z } from "zod";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import { deletePost, updatePost } from "@/lib/schedule/store";

export const runtime = "nodejs";

const patchSchema = z.object({
  publishAt: z.string().datetime({ offset: true }).optional(),
  publishLive: z.boolean().optional(),
  /**
   * "pending" approves a draft (or re-queues a failed/canceled post),
   * "canceled" stops it, "draft" sends it back for more review.
   */
  status: z.enum(["draft", "pending", "canceled"]).optional(),
  /** Edited article body, saved from the review screen. */
  markdown: z.string().min(50).max(1024 * 1024).optional(),
});

/** Reschedule, cancel, or re-queue one post. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid request body." } }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid changes." } }, { status: 400 });
  }

  const { publishAt, publishLive, status, markdown } = parsed.data;

  if (publishAt && Date.parse(publishAt) <= Date.now()) {
    return NextResponse.json(
      { error: { message: "Pick a publish time in the future." } },
      { status: 400 }
    );
  }

  // Keep the stored title in step with an edited frontmatter title.
  let title: string | undefined;
  if (markdown !== undefined) {
    const { frontmatter } = splitFrontmatter(markdown);
    if (!frontmatter) {
      return NextResponse.json(
        { error: { message: "The article is missing its frontmatter block." } },
        { status: 400 }
      );
    }
    title = frontmatterValue(frontmatter, "title") ?? "Untitled";
  }

  try {
    const post = await updatePost(id, {
      ...(markdown === undefined ? {} : { markdown, title }),
      ...(publishAt ? { publishAt: new Date(publishAt).toISOString() } : {}),
      ...(publishLive === undefined ? {} : { publishLive }),
      // Re-queuing clears the previous failure so the worker starts clean.
      // Approving or re-queuing clears any previous failure.
      ...(status === "pending" ? { status, attempts: 0, error: undefined } : {}),
      ...(status === "canceled" || status === "draft" ? { status } : {}),
    });
    if (!post) {
      return NextResponse.json({ error: { message: "No such scheduled post." } }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    console.error("Failed to update scheduled post:", error);
    return NextResponse.json(
      { error: { message: "Couldn't update the scheduled post." } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const removed = await deletePost(id);
    if (!removed) {
      return NextResponse.json({ error: { message: "No such scheduled post." } }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete scheduled post:", error);
    return NextResponse.json(
      { error: { message: "Couldn't delete the scheduled post." } },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { publishToDev, PublishError } from "@/lib/devto/publish";
import {
  splitFrontmatter,
  frontmatterValue,
  setPublishedFlag,
} from "@/lib/devto/frontmatter";
import { repairDocument } from "@/lib/devto/repair";
import { ERROR_MESSAGES } from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  apiKey: z.string().min(10).max(200),
  markdown: z.string().min(50).max(1024 * 1024),
  /** When set, updates the existing DEV article instead of creating a new one. */
  articleId: z.number().int().positive().optional(),
  /** true publishes the article live immediately; false creates a draft. */
  publishLive: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (isRateLimited(`publish:${clientKey(request)}`)) {
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "A DEV API key and the article markdown are required." } },
      { status: 400 }
    );
  }

  // DEV rejects an article whose frontmatter it can't parse ("Title can't be
  // blank", "unexpected end of stream while scanning a quoted scalar"). Repair
  // the document rather than relaying a known-bad one — the repair only
  // rewrites frontmatter syntax and heading levels, never the article's words.
  const { apiKey, markdown, articleId, publishLive } = parsed.data;
  // Honour an explicit live/draft choice by rewriting the frontmatter flag DEV
  // reads; without one, whatever the document already says stands.
  const withFlag =
    publishLive === undefined ? markdown : setPublishedFlag(markdown, publishLive);
  const repaired = repairDocument(withFlag);
  const { frontmatter } = splitFrontmatter(repaired.document);

  // A repair that still leaves no usable title means there is nothing to
  // publish under — the user has to supply one.
  if (!frontmatter || !frontmatterValue(frontmatter, "title")) {
    return NextResponse.json(
      {
        error: {
          message:
            "This article has no title and none could be inferred. Add a frontmatter " +
            'block at the very top:\n---\ntitle: "Your title"\npublished: false\n---',
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await publishToDev(apiKey, repaired.document, articleId);
    return NextResponse.json({
      result,
      updated: Boolean(articleId),
      live: publishLive === true,
      // Surfaced so the UI can tell the user what was corrected on their behalf.
      fixes: repaired.fixes,
    });
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    }
    console.error("Unexpected publish error:", error);
    return NextResponse.json(
      { error: { message: "Something went wrong while publishing." } },
      { status: 500 }
    );
  }
}

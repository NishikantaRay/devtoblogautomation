import { NextResponse } from "next/server";
import { z } from "zod";
import { publishToDev, PublishError } from "@/lib/devto/publish";
import { ERROR_MESSAGES } from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  apiKey: z.string().min(10).max(200),
  markdown: z.string().min(50).max(1024 * 1024),
  /** When set, updates the existing DEV article instead of creating a new one. */
  articleId: z.number().int().positive().optional(),
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

  try {
    const { apiKey, markdown, articleId } = parsed.data;
    const result = await publishToDev(apiKey, markdown, articleId);
    return NextResponse.json({ result, updated: Boolean(articleId) });
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { convertUrl } from "@/lib/pipeline";
import {
  ConversionError,
  ERROR_MESSAGES,
  MAX_BATCH_URLS,
  type BatchItem,
} from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(MAX_BATCH_URLS),
});

export async function POST(request: Request) {
  // A batch is up to 10 conversions, so its own budget is stricter: 3/minute.
  if (isRateLimited(`batch:${clientKey(request)}`, 3)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: ERROR_MESSAGES.RATE_LIMITED } },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "Invalid request body." } },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_URL",
          message: `Provide between 1 and ${MAX_BATCH_URLS} URLs.`,
        },
      },
      { status: 400 }
    );
  }

  // Deduplicate while preserving order, then convert in parallel — each fetch
  // has its own 15 s timeout, so the whole batch stays within maxDuration.
  const urls = [...new Set(parsed.data.urls.map((u) => u.trim()).filter(Boolean))];
  const items: BatchItem[] = await Promise.all(
    urls.map(async (url): Promise<BatchItem> => {
      try {
        return { url, ok: true, result: await convertUrl(url) };
      } catch (error) {
        const message =
          error instanceof ConversionError
            ? error.message
            : "Something went wrong while converting.";
        return { url, ok: false, error: message };
      }
    })
  );

  return NextResponse.json({ items });
}

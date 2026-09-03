import { NextResponse } from "next/server";
import { z } from "zod";
import { convertUrl, convertPastedHtml } from "@/lib/pipeline";
import { ConversionError, ERROR_MESSAGES } from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HTML_BYTES = 5 * 1024 * 1024;

const requestSchema = z.union([
  z.object({
    url: z.string().min(1).max(2048),
    html: z.undefined().optional(),
  }),
  z.object({
    html: z.string().min(1).max(MAX_HTML_BYTES),
    url: z.string().max(2048).optional(),
  }),
]);

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_URL: 400,
  NOT_FOUND: 404,
  PRIVATE: 403,
  NETWORK: 502,
  TIMEOUT: 504,
  INVALID_HTML: 422,
  EXTRACT_EMPTY: 422,
  RATE_LIMITED: 429,
};

export async function POST(request: Request) {
  if (isRateLimited(clientKey(request))) {
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
      { error: { code: "INVALID_URL", message: ERROR_MESSAGES.INVALID_URL } },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;
    const result =
      typeof data.html === "string"
        ? convertPastedHtml(data.html, data.url)
        : await convertUrl(data.url as string);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ConversionError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: STATUS_BY_CODE[error.code] ?? 500 }
      );
    }
    console.error("Unexpected conversion error:", error);
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Something went wrong while converting." } },
      { status: 500 }
    );
  }
}

import { ConversionError } from "@/lib/types";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "gi",
  "sk",
  "fbclid",
  "gclid",
];

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /^\[?f[cd][0-9a-f]{2}:/i,
];

/** Validates and normalizes a user-supplied blog URL. Throws ConversionError on failure. */
export function validateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ConversionError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConversionError("INVALID_URL", "Only http(s) URLs are supported.");
  }
  if (!url.hostname.includes(".") || PRIVATE_HOST_PATTERNS.some((p) => p.test(url.hostname))) {
    throw new ConversionError("INVALID_URL", "This host cannot be fetched.");
  }

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }
  url.hash = "";
  return url;
}

/** Resolves a possibly-relative URL against a base; returns undefined when unresolvable. */
export function absolutize(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return undefined;
  }
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return undefined;
  }
}

/** Picks the largest candidate URL from a srcset attribute value. */
export function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; size: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const size = descriptor ? parseFloat(descriptor) || 0 : 0;
    if (!best || size > best.size) best = { url, size };
  }
  return best?.url;
}

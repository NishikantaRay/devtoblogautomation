/**
 * Minimal in-memory sliding-window rate limiter, keyed by client IP.
 * Good enough for a single-instance MVP; swap for Redis/Upstash when scaling out.
 */
const WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string, maxRequests = DEFAULT_MAX_REQUESTS): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= maxRequests) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 1000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "local";
}

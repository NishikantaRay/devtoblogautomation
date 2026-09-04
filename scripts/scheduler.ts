/**
 * Scheduler worker — publishes queued posts to DEV.to when they come due.
 *
 *   npm run scheduler          poll forever (default: every 60s)
 *   npm run scheduler -- --once   run one pass and exit (useful from cron)
 *
 * Needs DEVTO_API_KEY in the environment (or .env.local). The key lives only
 * here and in the request to DEV — it is never written to the schedule file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { runDuePosts } from "@/lib/schedule/runner";
import { listPosts, dataFile } from "@/lib/schedule/store";

const DEFAULT_INTERVAL_MS = 60_000;

/** Minimal .env.local reader so the worker works without extra dependencies. */
function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(path.join(process.cwd(), file), "utf8");
      for (const line of raw.split("\n")) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key] !== undefined) continue;
        process.env[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    } catch {
      // No such env file — fall through to the real environment.
    }
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

async function pass(apiKey: string): Promise<void> {
  let summary;
  try {
    summary = await runDuePosts(apiKey);
  } catch (error) {
    // A bad schedule file shouldn't kill a long-running worker.
    log(`error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (summary.claimed === 0) {
    const pending = (await listPosts()).filter((p) => p.status === "pending");
    const next = pending[0];
    log(
      next
        ? `nothing due — next: “${next.title}” at ${next.publishAt}`
        : "nothing due — queue empty"
    );
    return;
  }

  for (const result of summary.results) {
    if (result.ok) log(`published “${result.title}” → ${result.url}`);
    else log(`failed “${result.title}”: ${result.error}`);
  }
  log(
    `pass complete — ${summary.published} published, ` +
      `${summary.failed} failed, ${summary.retrying} will retry`
  );
}

async function main(): Promise<void> {
  loadEnvFile();

  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "DEVTO_API_KEY is not set.\n" +
        "Add it to .env.local (DEVTO_API_KEY=your_key) or export it.\n" +
        "Get a key at https://dev.to/settings/extensions"
    );
    process.exit(1);
  }

  const once = process.argv.includes("--once");
  const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
  const interval = intervalArg
    ? Math.max(5_000, Number(intervalArg.split("=")[1]) * 1000)
    : DEFAULT_INTERVAL_MS;

  log(`scheduler starting — store: ${dataFile()}`);

  if (once) {
    await pass(apiKey);
    return;
  }

  log(`polling every ${interval / 1000}s — Ctrl+C to stop`);
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    log("shutting down…");
  });

  // Sequential loop rather than setInterval: one pass always finishes before
  // the next begins, so slow DEV responses can't stack up overlapping runs.
  while (!stopping) {
    await pass(apiKey);
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Scheduler crashed:", error);
  process.exit(1);
});

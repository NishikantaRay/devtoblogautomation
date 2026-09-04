/**
 * Seeds a blog series into the local schedule as drafts.
 *
 *   npm run seed:series                        every series, back to back
 *   npm run seed:series -- --series=duckdb     just one
 *   npm run seed:series -- --list              show what's available
 *   npm run seed:series -- --time=14:30        a different time of day
 *   npm run seed:series -- --start=2026-09-10
 *   npm run seed:series -- --replace           reseed, clearing prior drafts
 *   npm run seed:series -- --dry-run           show the plan without writing
 *
 * Everything lands with status "draft": the worker never publishes a draft, so
 * nothing can reach DEV.to until you approve it on the review screen.
 */
import { allSeries, findSeries, orderedPosts, type Series } from "@/lib/series";
import { renderSeriesPost } from "@/lib/series/render";
import { addPost, dataFile, deletePost, listPosts } from "@/lib/schedule/store";

/** Marks a scheduled post as belonging to a generated series. */
const SOURCE_PREFIX = "series:";

function arg(name: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match?.split("=").slice(1).join("=");
}

/** Local-time Date for a given day offset and HH:mm, as a UTC ISO string. */
function slotFor(start: Date, dayOffset: number, hour: number, minute: number): string {
  const date = new Date(start);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");

  const available = await allSeries();

  if (available.length === 0) {
    console.error(
      "No series content found under lib/series/.\n" +
        "Series posts are gitignored local content — see README \"Built-in blog series\"."
    );
    process.exit(1);
  }

  if (process.argv.includes("--list")) {
    console.log("Available series:\n");
    for (const series of available) {
      console.log(`  ${series.key.padEnd(14)} ${series.posts.length} posts — ${series.name}`);
    }
    console.log("\nSeed one with:  npm run seed:series -- --series=<key>");
    return;
  }

  // Default to every series, laid out back to back.
  const key = arg("series");
  let selected: Series[];
  if (key) {
    const series = await findSeries(key);
    if (!series) {
      console.error(
        `Unknown series "${key}". Available: ${available.map((s) => s.key).join(", ")}`
      );
      process.exit(1);
    }
    selected = [series];
  } else {
    selected = available;
  }

  const [hourRaw, minuteRaw] = (arg("time") ?? "09:00").split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute)) {
    console.error("--time must look like HH:mm, e.g. --time=09:00");
    process.exit(1);
  }

  // Default: start tomorrow, so the first post gets a full day of review.
  let start: Date;
  const startArg = arg("start");
  if (startArg) {
    start = new Date(`${startArg}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      console.error("--start must look like YYYY-MM-DD");
      process.exit(1);
    }
  } else {
    start = new Date();
    start.setDate(start.getDate() + 1);
  }

  const existing = await listPosts();
  const clashes = existing.filter((post) =>
    selected.some((series) => post.source === `${SOURCE_PREFIX}${series.key}`)
  );

  if (clashes.length > 0 && !replace) {
    console.error(
      `${clashes.length} post(s) from the selected series are already scheduled.\n` +
        "Re-run with --replace to clear and reseed them, or --dry-run to preview."
    );
    process.exit(1);
  }

  console.log(`Store: ${dataFile()}`);
  const total = selected.reduce((n, s) => n + s.posts.length, 0);
  console.log(
    `Seeding ${total} draft(s) from ${selected.length} series, one per day at ` +
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} local time.\n`
  );

  // Day offsets run continuously across series so two series never collide
  // on the same slot.
  let day = 0;
  const plan: Array<{ series: Series; post: ReturnType<typeof orderedPosts>[number]; when: string }> =
    [];
  for (const series of selected) {
    for (const post of orderedPosts(series)) {
      plan.push({ series, post, when: slotFor(start, day, hour, minute) });
      day += 1;
    }
  }

  let lastKey = "";
  for (const entry of plan) {
    if (entry.series.key !== lastKey) {
      lastKey = entry.series.key;
      console.log(`  ── ${entry.series.name} ──`);
    }
    console.log(
      `  ${String(entry.post.order).padStart(2, "0")}. ` +
        `${new Date(entry.when).toLocaleDateString()}  ${entry.post.title}`
    );
  }

  if (dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  if (replace && clashes.length > 0) {
    for (const post of clashes) await deletePost(post.id);
    console.log(`\nRemoved ${clashes.length} previously seeded post(s).`);
  }

  for (const entry of plan) {
    await addPost({
      markdown: renderSeriesPost(entry.post),
      title: entry.post.title,
      publishAt: entry.when,
      // Live at the scheduled time — but only once approved, since the
      // worker ignores anything still in "draft".
      publishLive: true,
      status: "draft",
      source: `${SOURCE_PREFIX}${entry.series.key}`,
      seriesOrder: entry.post.order,
    });
  }

  console.log(`\nSeeded ${plan.length} drafts.`);
  console.log("Review them at http://localhost:3000/review — nothing publishes until approved.");
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});

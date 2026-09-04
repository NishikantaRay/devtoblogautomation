import type { ScheduleStatus } from "./types";

/**
 * One place defining how each status looks and reads, so the queue, the review
 * screen, and any future view stay consistent.
 */
export const STATUS_META: Record<
  ScheduleStatus,
  { label: string; className: string; hint: string }
> = {
  draft: {
    label: "Needs review",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
    hint: "Waiting for you. Never published until approved.",
  },
  pending: {
    label: "Approved",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300",
    hint: "Queued — the scheduler publishes it at its scheduled time.",
  },
  publishing: {
    label: "Publishing",
    className:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
    hint: "Being sent to DEV.to right now.",
  },
  published: {
    label: "Published",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    hint: "Live on DEV.to.",
  },
  failed: {
    label: "Failed",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
    hint: "Publishing failed. Re-queue to try again.",
  },
  canceled: {
    label: "Canceled",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400",
    hint: "Stopped. Re-queue to schedule it again.",
  },
};

/** Renders a stored UTC instant in the viewer's local timezone. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "in 3 days" / "2 hours ago" — a relative gloss on an absolute time. */
export function relativeWhen(iso: string, now = Date.now()): string {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return "";
  const diffMs = target - now;
  const past = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return "now";

  // Step up through units while the value is too large for the current one.
  let value = minutes;
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  if (value >= 60) {
    value = Math.round(value / 60);
    unit = "hour";
    if (value >= 24) {
      value = Math.round(value / 24);
      unit = "day";
    }
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return formatter.format(past ? -value : value, unit);
}

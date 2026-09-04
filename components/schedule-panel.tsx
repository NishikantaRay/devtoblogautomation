"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SchedulePanelProps {
  /** Full article document (frontmatter + body), including user edits. */
  markdown: string;
}

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "done"; publishAt: string; live: boolean }
  | { state: "error"; message: string };

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
function localInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultWhen(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return localInputValue(tomorrow);
}

export function SchedulePanel({ markdown }: SchedulePanelProps) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(defaultWhen);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const schedule = async () => {
    setStatus({ state: "saving" });
    // The input is naive local time; Date parses it in the viewer's zone and
    // toISOString converts to the UTC instant the worker compares against.
    const publishAt = new Date(when);
    if (Number.isNaN(publishAt.getTime())) {
      setStatus({ state: "error", message: "That date and time isn't valid." });
      return;
    }
    if (publishAt.getTime() <= Date.now()) {
      setStatus({ state: "error", message: "Pick a publish time in the future." });
      return;
    }

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown,
          publishAt: publishAt.toISOString(),
          publishLive: live,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setStatus({ state: "error", message: data.error?.message ?? "Couldn't schedule." });
        return;
      }
      setStatus({ state: "done", publishAt: publishAt.toLocaleString(), live });
    } catch {
      setStatus({ state: "error", message: "Couldn't reach the server. Please try again." });
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Schedule
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Schedule for later</p>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            ✕
          </Button>
        </div>

        {status.state === "done" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            Queued for <strong>{status.publishAt}</strong> —{" "}
            {status.live ? "will go live automatically" : "will be created as a draft"}.
            <p className="mt-1 text-xs opacity-80">
              The scheduler process publishes it at that time, so leave{" "}
              <code>npm run scheduler</code> running.{" "}
              <a href="/schedule" className="font-semibold underline">
                View the queue →
              </a>
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="datetime-local"
                value={when}
                min={localInputValue(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                disabled={status.state === "saving"}
                aria-label="Publish date and time"
                className="h-10"
              />
              <Button size="default" onClick={schedule} disabled={status.state === "saving"}>
                {status.state === "saving" ? "Scheduling…" : "Schedule"}
              </Button>
            </div>

            {status.state === "error" && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {status.message}
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Publish live at that time (otherwise it lands as a draft)
            </label>

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Times are in your local timezone. The article is stored on this machine and
              published by the scheduler worker — your DEV key stays in{" "}
              <code>.env.local</code> and is never saved with the post.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

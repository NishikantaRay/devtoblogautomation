"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewEditor } from "@/components/review-editor";
import { STATUS_META, formatWhen, relativeWhen } from "@/lib/schedule/status";
import type { ScheduledPost, ScheduleStatus } from "@/lib/schedule/types";

type Filter = "all" | "draft" | "pending" | "published";

/** Turns a stored source ("series:duckdb") into a display name. */
function seriesKey(post: ScheduledPost): string | null {
  const source = post.source;
  if (!source?.startsWith("series:")) return null;
  return source.slice("series:".length);
}

const SERIES_LABELS: Record<string, string> = {
  insighttrack: "InsightTrack internals",
  duckdb: "DuckDB",
};

const FILTERS: Array<{ key: Filter; label: string; match: (s: ScheduleStatus) => boolean }> = [
  { key: "draft", label: "Needs review", match: (s) => s === "draft" },
  { key: "pending", label: "Approved", match: (s) => s === "pending" || s === "publishing" },
  { key: "published", label: "Published", match: (s) => s === "published" },
  { key: "all", label: "All", match: () => true },
];

export function ReviewBoard() {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("draft");
  const [series, setSeries] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error?.message ?? "Couldn't load the queue.");
        return;
      }
      setPosts(data.posts);
      setError(null);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) load();
    };
    // Deferred so the effect body doesn't set state synchronously.
    void Promise.resolve().then(refresh);
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  const seriesOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const post of posts ?? []) {
      const key = seriesKey(post);
      if (key) keys.add(key);
    }
    return [...keys].sort();
  }, [posts]);

  const visible = useMemo(() => {
    if (!posts) return [];
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    return posts.filter(
      (p) => match(p.status) && (series === "all" || seriesKey(p) === series)
    );
  }, [posts, filter, series]);

  // Keep a valid selection as filters change and posts move between states.
  const selected =
    visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  const selectedKey = selected ? seriesKey(selected) : null;
  const selectedSeriesTotal = selectedKey
    ? (posts ?? []).filter((p) => seriesKey(p) === selectedKey).length
    : undefined;
  const selectedSeriesName = selectedKey
    ? (SERIES_LABELS[selectedKey] ?? selectedKey)
    : undefined;

  const counts = useMemo(() => {
    const scoped = (posts ?? []).filter(
      (p) => series === "all" || seriesKey(p) === series
    );
    const base = { draft: 0, pending: 0, published: 0, total: scoped.length };
    for (const post of scoped) {
      if (post.status === "draft") base.draft += 1;
      else if (post.status === "pending" || post.status === "publishing") base.pending += 1;
      else if (post.status === "published") base.published += 1;
    }
    return base;
  }, [posts, series]);

  const save = useCallback(
    async (id: string, changes: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        const response = await fetch(`/api/schedule/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          setError(data.error?.message ?? "That didn't work.");
          return false;
        }
        setError(null);
        await load();
        return true;
      } catch {
        setError("Couldn't reach the server.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  if (error && !posts) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  if (!posts) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing queued yet. Seed the InsightTrack series with:
          </p>
          <code className="mt-3 inline-block rounded-lg bg-zinc-100 px-3 py-1.5 text-xs dark:bg-zinc-800">
            npm run seed:series
          </code>
        </CardContent>
      </Card>
    );
  }

  const progress = counts.total > 0 ? (counts.published / counts.total) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Progress summary */}
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium">
                {counts.published} of {counts.total} published
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {counts.draft} awaiting review · {counts.pending} approved
              </span>
            </div>
            {error && (
              <span role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Series switcher — only when more than one series is queued */}
      {seriesOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            Series
          </span>
          {["all", ...seriesOptions].map((key) => (
            <button
              key={key}
              onClick={() => setSeries(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                series === key
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {key === "all" ? "All series" : (SERIES_LABELS[key] ?? key)}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? counts.total
              : f.key === "draft"
                ? counts.draft
                : f.key === "pending"
                  ? counts.pending
                  : counts.published;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* List */}
        <div className="flex max-h-[75vh] flex-col gap-2 overflow-y-auto pr-1">
          {visible.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nothing in this view.
            </p>
          )}
          {visible.map((post) => {
            const meta = STATUS_META[post.status];
            const active = selected?.id === post.id;
            return (
              <button
                key={post.id}
                onClick={() => setSelectedId(post.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/30"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {post.seriesOrder !== undefined && (
                    <span className="text-xs font-semibold tabular-nums text-zinc-400">
                      {String(post.seriesOrder).padStart(2, "0")}
                    </span>
                  )}
                  <Badge className={`${meta.className} text-[10px]`}>{meta.label}</Badge>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">
                  {post.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatWhen(post.publishAt)} · {relativeWhen(post.publishAt)}
                </p>
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <Card className="min-w-0">
          <CardContent className="pt-4 sm:pt-5">
            {selected ? (
              <ReviewEditor
                post={selected}
                onSave={save}
                busy={busy}
                seriesTotal={selectedSeriesTotal}
                seriesName={selectedSeriesName}
              />
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Select a post to review.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

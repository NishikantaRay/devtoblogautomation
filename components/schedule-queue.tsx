"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_META, formatWhen, relativeWhen } from "@/lib/schedule/status";
import type { ScheduledPost } from "@/lib/schedule/types";

export function ScheduleQueue() {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error?.message ?? "Couldn't load the schedule.");
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
    // Kick the first fetch off the effect body (a microtask later) so the
    // effect itself doesn't set state synchronously, then poll so the list
    // reflects what the worker has published.
    const refresh = () => {
      if (active) load();
    };
    void Promise.resolve().then(refresh);
    const timer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  const mutate = async (id: string, init: RequestInit) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/schedule/${id}`, init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        setError(data.error?.message ?? "That didn't work.");
      } else {
        await load();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const patch = (id: string, changes: Record<string, unknown>) =>
    mutate(id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });

  const remove = (id: string) => mutate(id, { method: "DELETE" });

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
        <CardContent className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Nothing scheduled yet. Convert an article and hit <strong>Schedule</strong>,
          or seed the InsightTrack series with <code>npm run seed:series</code>.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {posts.map((post) => (
        <Card key={post.id}>
          <CardContent className="flex flex-col gap-3 pt-4 sm:pt-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge className={STATUS_META[post.status].className}>
                {STATUS_META[post.status].label}
              </Badge>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{post.title}</span>
              {post.publishLive ? (
                <Badge>goes live</Badge>
              ) : (
                <Badge>draft</Badge>
              )}
            </div>

            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {post.status === "published" ? "Published" : "Scheduled for"}{" "}
              {formatWhen(post.publishAt)} · {relativeWhen(post.publishAt)}
              {post.attempts > 0 && post.status !== "published" && (
                <span> · {post.attempts} attempt{post.attempts === 1 ? "" : "s"}</span>
              )}
            </p>

            {post.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{post.error}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
                >
                  View on DEV →
                </a>
              )}
              {post.status === "draft" && (
                <a
                  href="/review"
                  className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400"
                >
                  Review it →
                </a>
              )}
              {post.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === post.id}
                  onClick={() => patch(post.id, { status: "canceled" })}
                >
                  Cancel
                </Button>
              )}
              {(post.status === "failed" || post.status === "canceled") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === post.id}
                  onClick={() => patch(post.id, { status: "pending" })}
                >
                  Re-queue
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === post.id}
                onClick={() => remove(post.id)}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

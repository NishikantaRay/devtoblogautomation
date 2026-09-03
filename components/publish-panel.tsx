"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KEY_STORAGE = "devto-api-key";

interface PublishPanelProps {
  /** Full article document (frontmatter + body), including user edits. */
  markdown: string;
}

import { publishArticle } from "@/lib/utils/publish-store";

type Status =
  | { state: "idle" }
  | { state: "publishing" }
  | { state: "done"; url: string; title: string; updated: boolean }
  | { state: "error"; message: string };

export function PublishPanel({ markdown }: PublishPanelProps) {
  const [open, setOpen] = useState(false);
  // Lazy init: the key field is only rendered after user interaction (open),
  // so reading localStorage here can't cause a hydration mismatch.
  const [apiKey, setApiKey] = useState(
    () => (typeof window === "undefined" ? "" : localStorage.getItem(KEY_STORAGE) ?? "")
  );
  const [remember, setRemember] = useState(() => apiKey.length > 0);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const publish = async () => {
    setStatus({ state: "publishing" });
    if (remember) {
      localStorage.setItem(KEY_STORAGE, apiKey);
    } else {
      localStorage.removeItem(KEY_STORAGE);
    }
    const outcome = await publishArticle(apiKey.trim(), markdown);
    if (!outcome.ok) {
      setStatus({ state: "error", message: outcome.message ?? "Publishing failed." });
      return;
    }
    setStatus({
      state: "done",
      url: outcome.url ?? "",
      title: outcome.title ?? "",
      updated: outcome.updated ?? false,
    });
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Publish to DEV
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Publish to DEV</p>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            ✕
          </Button>
        </div>

        {status.state === "done" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {status.updated ? "Existing DEV draft updated" : "Draft created on DEV"}
            {status.title ? `: “${status.title}”` : ""}.{" "}
            <a
              href="https://dev.to/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Open your DEV dashboard →
            </a>{" "}
            Your draft is at the top — review and hit Publish there when ready.
            <p className="mt-1 text-xs opacity-80">
              (Drafts have no public page yet — the{" "}
              <a href={status.url} target="_blank" rel="noopener noreferrer" className="underline">
                direct draft link
              </a>{" "}
              only works while you&apos;re signed in to DEV as the author, and 404s otherwise.)
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                placeholder="Your DEV API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={status.state === "publishing"}
                aria-label="DEV API key"
                autoComplete="off"
                className="h-10"
              />
              <Button
                size="default"
                onClick={publish}
                disabled={status.state === "publishing" || apiKey.trim().length < 10}
              >
                {status.state === "publishing" ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Publishing…
                  </>
                ) : (
                  "Create draft"
                )}
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
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Remember this key on this device
            </label>

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Get a key at{" "}
              <a
                href="https://dev.to/settings/extensions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                dev.to/settings/extensions
              </a>
              . The article is created as a <strong>draft</strong> (frontmatter has{" "}
              <code>published: false</code>); your key is relayed to DEV once and never stored on
              the server.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

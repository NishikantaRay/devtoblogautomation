"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import { repairDocument } from "@/lib/devto/repair";
import { STATUS_META, formatWhen, relativeWhen } from "@/lib/schedule/status";
import type { ScheduledPost } from "@/lib/schedule/types";

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
function localInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface ReviewEditorProps {
  post: ScheduledPost;
  onSave: (id: string, changes: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  /** How many posts are in this post's series, for the "Part n of m" badge. */
  seriesTotal?: number;
  /** Display name of the series this post belongs to. */
  seriesName?: string;
}

type Tab = "preview" | "markdown";

export function ReviewEditor({
  post,
  onSave,
  busy,
  seriesTotal,
  seriesName,
}: ReviewEditorProps) {
  const [text, setText] = useState(post.markdown);
  const [when, setWhen] = useState(() => localInputValue(post.publishAt));
  const [live, setLive] = useState(post.publishLive);
  const [tab, setTab] = useState<Tab>("preview");
  const [notice, setNotice] = useState<string | null>(null);
  // Track which post the local edits belong to, so switching posts resets
  // the editor instead of carrying one post's draft onto another.
  const loadedId = useRef(post.id);

  useEffect(() => {
    if (loadedId.current === post.id) return;
    loadedId.current = post.id;
    setText(post.markdown);
    setWhen(localInputValue(post.publishAt));
    setLive(post.publishLive);
    setNotice(null);
  }, [post]);

  const { frontmatter, body } = useMemo(() => splitFrontmatter(text), [text]);
  const title = frontmatterValue(frontmatter, "title") ?? post.title;
  const description = frontmatterValue(frontmatter, "description");
  const tags = (frontmatterValue(frontmatter, "tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const mermaidCount = (body.match(/```mermaid/g) ?? []).length;
  const repair = useMemo(() => repairDocument(text), [text]);
  const edited = text !== post.markdown;
  const timeChanged = when !== localInputValue(post.publishAt);
  const liveChanged = live !== post.publishLive;
  const dirty = edited || timeChanged || liveChanged;

  const changes = () => {
    const payload: Record<string, unknown> = {};
    if (edited) payload.markdown = text;
    if (timeChanged) {
      const parsed = new Date(when);
      if (Number.isNaN(parsed.getTime())) return null;
      payload.publishAt = parsed.toISOString();
    }
    if (liveChanged) payload.publishLive = live;
    return payload;
  };

  const save = async (extra: Record<string, unknown> = {}, message?: string) => {
    const payload = changes();
    if (!payload) {
      setNotice("That date and time isn't valid.");
      return;
    }
    const ok = await onSave(post.id, { ...payload, ...extra });
    if (ok && message) setNotice(message);
  };

  const isDraft = post.status === "draft";
  const meta = STATUS_META[post.status];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={meta.className}>{meta.label}</Badge>
          {post.seriesOrder !== undefined && (
            <Badge>
              {seriesName ? `${seriesName} · ` : ""}Part {post.seriesOrder}
              {seriesTotal ? ` of ${seriesTotal}` : ""}
            </Badge>
          )}
          {edited && (
            <Badge className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              unsaved edits
            </Badge>
          )}
        </div>
        <h2 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </div>

      {/* Scheduling controls */}
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Publish time
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              disabled={busy}
              className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:pb-3">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              disabled={busy}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Publish live (otherwise lands as a DEV draft)
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {formatWhen(post.publishAt)} · {relativeWhen(post.publishAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {isDraft ? (
          <Button
            onClick={() => save({ status: "pending" }, "Approved — queued for publishing.")}
            disabled={busy}
          >
            {busy ? "Working…" : "Approve & schedule"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => save({ status: "draft" }, "Moved back to review.")}
            disabled={busy}
          >
            Unapprove
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => save({}, "Changes saved.")}
          disabled={busy || !dirty}
        >
          Save changes
        </Button>
        {repair.fixes.length > 0 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setText(repair.document);
              setNotice(`Fixed: ${repair.fixes.join("; ")}. Save to keep the changes.`);
            }}
            title="Repair frontmatter and heading levels"
          >
            Fix {repair.fixes.length} issue{repair.fixes.length === 1 ? "" : "s"}
          </Button>
        )}
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setText(post.markdown);
              setWhen(localInputValue(post.publishAt));
              setLive(post.publishLive);
              setNotice(null);
            }}
            disabled={busy}
          >
            Revert
          </Button>
        )}
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
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {post.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {post.error}
        </p>
      )}

      {/* Content tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["preview", "markdown"] as Tab[]).map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors ${
              tab === name
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "preview" && mermaidCount > 0 && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
          {mermaidCount} Mermaid diagram{mermaidCount === 1 ? "" : "s"} shown as code here —
          DEV.to renders {mermaidCount === 1 ? "it" : "them"} as diagrams once published.
        </p>
      )}
      {tab === "preview" ? (
        <article className="prose prose-zinc max-w-none dark:prose-invert prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </article>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Article markdown"
          spellCheck={false}
          className="h-[60vh] w-full resize-none rounded-lg border border-zinc-200 bg-transparent p-4 font-mono text-xs leading-relaxed text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:border-zinc-800 dark:text-zinc-200"
        />
      )}
    </div>
  );
}

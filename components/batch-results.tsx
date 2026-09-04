"use client";

import { useState } from "react";
import JSZip from "jszip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/utils/slug";
import { publishArticle } from "@/lib/utils/publish-store";
import { PLATFORM_LABELS, type BatchItem } from "@/lib/types";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Unique per-item filename, disambiguated by index when titles collide. */
function itemFilename(item: BatchItem, index: number, taken: Set<string>): string {
  let name = `${slugify(item.result?.metadata.title ?? `article-${index + 1}`)}.md`;
  if (taken.has(name)) name = `${name.slice(0, -3)}-${index + 1}.md`;
  taken.add(name);
  return name;
}

type PublishState = "pending" | "publishing" | "done" | "failed";

interface PublishProgress {
  state: PublishState;
  url?: string;
  message?: string;
  updated?: boolean;
}

interface BatchResultsProps {
  items: BatchItem[];
  onEdit: (index: number) => void;
  onReset: () => void;
}

export function BatchResults({ items, onEdit, onReset }: BatchResultsProps) {
  const succeeded = items.filter((i) => i.ok && i.result);
  // Selection controls which articles get zipped and published; all successful
  // conversions start selected.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(succeeded.map((i) => i.url))
  );
  const [apiKey, setApiKey] = useState("");
  const [live, setLive] = useState(false);
  // Publishing many posts live at once is worth a deliberate second click.
  const [confirmLive, setConfirmLive] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<Record<string, PublishProgress>>({});

  const selectedItems = succeeded.filter((i) => selected.has(i.url));
  const allSelected = selected.size === succeeded.length && succeeded.length > 0;

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(succeeded.map((i) => i.url)));
  };

  const downloadSelected = async () => {
    const zip = new JSZip();
    const taken = new Set<string>();
    items.forEach((item, index) => {
      if (item.ok && item.result && selected.has(item.url)) {
        zip.file(itemFilename(item, index, taken), item.result.full);
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("blog2dev-articles.zip", blob);
  };

  const publishSelected = async () => {
    if (live && !confirmLive) {
      setConfirmLive(true);
      return;
    }
    setConfirmLive(false);
    setPublishing(true);
    setProgress(
      Object.fromEntries(selectedItems.map((i) => [i.url, { state: "pending" as const }]))
    );
    for (const item of selectedItems) {
      setProgress((p) => ({ ...p, [item.url]: { state: "publishing" } }));
      const outcome = await publishArticle(apiKey.trim(), item.result!.full, live);
      setProgress((p) => ({
        ...p,
        [item.url]: outcome.ok
          ? { state: "done", url: outcome.url, updated: outcome.updated }
          : { state: "failed", message: outcome.message },
      }));
      // Space requests out so DEV's own rate limits aren't tripped.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setPublishing(false);
  };

  const taken = new Set<string>();

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            Batch conversion — {succeeded.length}/{items.length} succeeded
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={downloadSelected} disabled={selectedItems.length === 0}>
              Download {selectedItems.length} (.zip)
            </Button>
            <Button size="sm" variant="ghost" onClick={onReset}>
              ← Convert another batch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {succeeded.length > 0 && (
            <label className="flex items-center gap-2 border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              {allSelected ? "Deselect all" : "Select all"} ({selectedItems.length}/
              {succeeded.length} selected)
            </label>
          )}
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.map((item, index) => {
              const p = progress[item.url];
              return (
                <li key={item.url} className="flex flex-wrap items-center gap-3 py-3">
                  {item.ok ? (
                    <input
                      type="checkbox"
                      checked={selected.has(item.url)}
                      onChange={() => toggle(item.url)}
                      aria-label={`Include ${item.result!.metadata.title}`}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  ) : (
                    <span aria-hidden className="text-base">
                      ❌
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.ok ? item.result!.metadata.title : "Conversion failed"}
                    </p>
                    <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{item.url}</p>
                    {!item.ok && (
                      <p className="text-xs text-red-600 dark:text-red-400">{item.error}</p>
                    )}
                    {p?.state === "failed" && (
                      <p className="text-xs text-red-600 dark:text-red-400">{p.message}</p>
                    )}
                  </div>
                  {item.ok && <Badge>{PLATFORM_LABELS[item.result!.platform]}</Badge>}
                  {p?.state === "publishing" && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                  )}
                  {p?.state === "done" && (
                    <a
                      href="https://dev.to/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Drafts have no public page; find it at the top of your DEV dashboard"
                      className="text-xs font-semibold text-emerald-600 underline dark:text-emerald-400"
                    >
                      {p.updated ? "Draft updated →" : "Draft created →"}
                    </a>
                  )}
                  {item.ok && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(index)}
                        disabled={publishing}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          downloadBlob(
                            itemFilename(item, index, taken),
                            new Blob([item.result!.full], {
                              type: "text/markdown;charset=utf-8",
                            })
                          )
                        }
                      >
                        .md
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {succeeded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Publish selected to DEV {live ? "live" : "as drafts"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                placeholder="Your DEV API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={publishing}
                aria-label="DEV API key"
                autoComplete="off"
                className="h-10"
              />
              <Button
                onClick={publishSelected}
                disabled={
                  publishing || apiKey.trim().length < 10 || selectedItems.length === 0
                }
              >
                {publishing
                  ? "Publishing…"
                  : confirmLive
                    ? `Confirm — publish ${selectedItems.length} live`
                    : live
                      ? `Publish ${selectedItems.length} live`
                      : `Create ${selectedItems.length} draft${selectedItems.length === 1 ? "" : "s"}`}
              </Button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => {
                  setLive(e.target.checked);
                  setConfirmLive(false);
                }}
                disabled={publishing}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Publish live immediately (skip the draft)
            </label>

            {confirmLive && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                This publishes {selectedItems.length} article
                {selectedItems.length === 1 ? "" : "s"} publicly on DEV.to right away. Click{" "}
                <strong>Confirm</strong> to continue, or untick the box to create drafts.
              </p>
            )}

            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Only checked articles are published, one by one, spaced out to respect
              DEV&apos;s rate limits.{" "}
              {live ? (
                <>They go public on DEV immediately.</>
              ) : (
                <>
                  Drafts appear at the top of{" "}
                  <a
                    href="https://dev.to/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    your DEV dashboard
                  </a>{" "}
                  — they have no public page until you hit Publish there.
                </>
              )}{" "}
              Your key is relayed once per article and never stored on the server.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

import { MAX_BATCH_URLS } from "@/lib/types";

const EXAMPLE_URL = "https://dev.to/devteam/for-empowering-community-2k6h";

export type ConvertPayload = { url: string } | { html: string; url?: string };

interface ConvertFormProps {
  onConvert: (payload: ConvertPayload) => void;
  onBatch: (urls: string[]) => void;
  loading: boolean;
}

type Mode = "url" | "html" | "batch";

function parseUrlList(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
}

export function ConvertForm({ onConvert, onBatch, loading }: ConvertFormProps) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [batchText, setBatchText] = useState("");

  const batchUrls = parseUrlList(batchText);

  const submit = () => {
    if (mode === "url") {
      const trimmed = url.trim();
      if (trimmed) onConvert({ url: trimmed });
    } else if (mode === "html") {
      const trimmed = html.trim();
      if (trimmed) onConvert({ html: trimmed, url: sourceUrl.trim() || undefined });
    } else if (batchUrls.length > 0 && batchUrls.length <= MAX_BATCH_URLS) {
      onBatch(batchUrls);
    }
  };

  const canSubmit =
    mode === "url"
      ? !!url.trim()
      : mode === "html"
        ? !!html.trim()
        : batchUrls.length > 0 && batchUrls.length <= MAX_BATCH_URLS;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div
        role="tablist"
        aria-label="Input mode"
        className="mx-auto flex rounded-lg border border-zinc-200 p-1 dark:border-zinc-800"
      >
        {(
          [
            ["url", "Blog URL"],
            ["html", "Paste HTML"],
            ["batch", "Batch"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              mode === value
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "url" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="url"
              inputMode="url"
              placeholder="https://medium.com/@author/my-article…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              aria-label="Blog URL"
              autoFocus
            />
            <div className="flex gap-3">
              <SubmitButton loading={loading} disabled={!canSubmit} />
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setUrl(EXAMPLE_URL);
                  onConvert({ url: EXAMPLE_URL });
                }}
              >
                Example URL
              </Button>
            </div>
          </div>
        ) : mode === "batch" ? (
          <>
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              disabled={loading}
              placeholder={`One URL per line, up to ${MAX_BATCH_URLS}…\nhttps://dev.to/user/post-1\nhttps://myblog.com/post-2`}
              aria-label="Blog URLs, one per line"
              spellCheck={false}
              className={cn(
                "h-44 w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs",
                "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                "dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500"
              )}
            />
            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-left text-xs",
                  batchUrls.length > MAX_BATCH_URLS
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "text-zinc-400 dark:text-zinc-500"
                )}
              >
                {batchUrls.length}/{MAX_BATCH_URLS} URLs
                {batchUrls.length > MAX_BATCH_URLS && " — remove some to continue"}
              </p>
              <SubmitButton loading={loading} disabled={!canSubmit} label="Convert all" />
            </div>
          </>
        ) : (
          <>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              disabled={loading}
              placeholder="Paste the full page HTML here (View Source → copy everything)…"
              aria-label="Page HTML"
              spellCheck={false}
              className={cn(
                "h-44 w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs",
                "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                "dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500"
              )}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="url"
                inputMode="url"
                placeholder="Original URL (optional, used for canonical link + images)"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={loading}
                aria-label="Original URL (optional)"
              />
              <SubmitButton loading={loading} disabled={!canSubmit} />
            </div>
            <p className="text-left text-xs text-zinc-400 dark:text-zinc-500">
              Tip: use this when a site blocks fetching (Medium, paywalled posts). Open the
              article in your browser, View Source, and paste the HTML.
            </p>
          </>
        )}
      </form>
    </div>
  );
}

function SubmitButton({
  loading,
  disabled,
  label = "Convert",
}: {
  loading: boolean;
  disabled: boolean;
  label?: string;
}) {
  return (
    <Button type="submit" size="lg" disabled={loading || disabled} className="flex-1 sm:flex-none">
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Converting…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

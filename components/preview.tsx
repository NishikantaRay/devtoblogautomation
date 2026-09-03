"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toolbar } from "@/components/toolbar";
import { PublishPanel } from "@/components/publish-panel";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import { loadDraft, saveDraft } from "@/lib/utils/session-store";
import { PLATFORM_LABELS, type ConversionResult } from "@/lib/types";

interface PreviewProps {
  result: ConversionResult;
  /** Called with the current (possibly edited) document when leaving the editor. */
  onReset: (editedFull: string) => void;
  resetLabel?: string;
  /** When set, in-progress edits are persisted so they survive a page refresh. */
  storageKey?: string;
}

export function Preview({ result, onReset, resetLabel, storageKey }: PreviewProps) {
  const { metadata, platform } = result;
  // The document is editable: edits flow into the rendered preview and exports.
  // A persisted draft (from before a refresh) takes precedence over the
  // original conversion.
  const [text, setTextState] = useState(
    () => (storageKey ? loadDraft(storageKey) : null) ?? result.full
  );
  const isEdited = text !== result.full;

  const setText = (value: string) => {
    setTextState(value);
    if (storageKey) saveDraft(storageKey, value === result.full ? null : value);
  };

  const { frontmatter, body } = useMemo(() => splitFrontmatter(text), [text]);
  const previewTitle = frontmatterValue(frontmatter, "title") ?? metadata.title;
  const previewCover = frontmatterValue(frontmatter, "cover_image") ?? metadata.coverImage;

  return (
    <div className="flex w-full flex-col gap-4">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300">
              {PLATFORM_LABELS[platform]}
            </Badge>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{previewTitle}</span>
            {metadata.author && <span>by {metadata.author}</span>}
            {metadata.publishedDate && <span>{metadata.publishedDate}</span>}
            {metadata.tags.slice(0, 4).map((tag) => (
              <Badge key={tag}>#{tag.toLowerCase().replace(/[^a-z0-9]/gi, "")}</Badge>
            ))}
          </div>
          <div className="mt-4">
            <Toolbar
              full={text}
              frontmatter={frontmatter}
              isEdited={isEdited}
              onRevert={() => setText(result.full)}
              onReset={() => onReset(text)}
              resetLabel={resetLabel}
            />
          </div>
          <div className="mt-3">
            <PublishPanel markdown={text} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
            <CardTitle>Markdown — editable</CardTitle>
            {isEdited && (
              <Badge className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                edited
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Markdown editor"
              className="h-[70vh] w-full resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-zinc-200 sm:p-5"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="border-b border-zinc-200 dark:border-zinc-800">
            <CardTitle>DEV Preview</CardTitle>
          </CardHeader>
          <CardContent className="h-[70vh] overflow-y-auto pt-4 sm:pt-5">
            {previewCover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewCover}
                alt=""
                className="mb-6 w-full rounded-lg object-cover"
              />
            )}
            <h1 className="mb-6 text-3xl font-extrabold leading-tight text-zinc-900 dark:text-zinc-50">
              {previewTitle}
            </h1>
            <article className="prose prose-zinc max-w-none break-words dark:prose-invert prose-pre:overflow-x-auto prose-img:rounded-lg">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </article>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ConvertForm, type ConvertPayload } from "@/components/convert-form";
import { ErrorBanner } from "@/components/error-banner";
import { Preview } from "@/components/preview";
import { BatchResults } from "@/components/batch-results";
import { Badge } from "@/components/ui/badge";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import {
  clearAllDrafts,
  loadSessionState,
  saveDraft,
  saveSessionState,
} from "@/lib/utils/session-store";
import { ERROR_MESSAGES, type BatchItem, type ConversionResult } from "@/lib/types";

const PLATFORMS = [
  "Medium",
  "Hashnode",
  "DEV.to",
  "WordPress",
  "Ghost",
  "Blogger",
  "Substack",
  "Any blog",
];

const emptySubscribe = () => () => {};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Restored synchronously from sessionStorage on the client so a refresh
  // returns to the same view (loadSessionState is a safe no-op on the server).
  const [result, setResult] = useState<ConversionResult | null>(
    () => loadSessionState()?.result ?? null
  );
  const [batch, setBatch] = useState<BatchItem[] | null>(
    () => loadSessionState()?.batch ?? null
  );
  const [editIndex, setEditIndex] = useState<number | null>(
    () => loadSessionState()?.editIndex ?? null
  );
  // False during SSR/hydration, true right after — the restored view renders
  // only on the client, so server and hydration markup always agree.
  const booted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (!booted) return;
    saveSessionState({ result, batch, editIndex });
  }, [booted, result, batch, editIndex]);

  // Persist edits made in the editor back into the batch item so the zip
  // download and publish use the edited version.
  const saveBatchEdit = (index: number, editedFull: string) => {
    setBatch(
      (prev) =>
        prev?.map((item, i) => {
          if (i !== index || !item.result) return item;
          const { frontmatter, body } = splitFrontmatter(editedFull);
          const title =
            frontmatterValue(frontmatter, "title") ?? item.result.metadata.title;
          return {
            ...item,
            result: {
              ...item.result,
              full: editedFull,
              frontmatter,
              markdown: body,
              metadata: { ...item.result.metadata, title },
            },
          };
        }) ?? prev
    );
    if (batch?.[index]) saveDraft(batch[index].url, null);
    setEditIndex(null);
  };

  const convert = async (payload: ConvertPayload) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error?.message ?? ERROR_MESSAGES.NETWORK);
        return;
      }
      setResult(data.result);
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setLoading(false);
    }
  };

  const convertBatch = async (urls: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error?.message ?? ERROR_MESSAGES.NETWORK);
        return;
      }
      setBatch(data.items);
    } catch {
      setError(ERROR_MESSAGES.NETWORK);
    } finally {
      setLoading(false);
    }
  };

  if (!booted) {
    return <main className="flex-1" aria-busy="true" />;
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center px-4 py-10 sm:px-6">
      {result ? (
        // Keyed so a fresh conversion always resets the editor state.
        <Preview
          key={result.full}
          result={result}
          storageKey="single"
          onReset={() => {
            saveDraft("single", null);
            setResult(null);
          }}
        />
      ) : batch && editIndex !== null && batch[editIndex]?.result ? (
        <Preview
          key={batch[editIndex].url}
          result={batch[editIndex].result}
          storageKey={batch[editIndex].url}
          resetLabel="← Back to batch"
          onReset={(edited) => saveBatchEdit(editIndex, edited)}
        />
      ) : batch ? (
        <BatchResults
          items={batch}
          onEdit={setEditIndex}
          onReset={() => {
            clearAllDrafts();
            setBatch(null);
            setEditIndex(null);
          }}
        />
      ) : (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Blog2DEV
            </p>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
              Convert Any Blog to DEV.to Markdown
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">
              Paste a Medium, Hashnode, Ghost, WordPress or any blog URL and instantly generate a
              clean DEV.to article — frontmatter included. No AI, fully deterministic.
            </p>
          </div>

          <ConvertForm onConvert={convert} onBatch={convertBatch} loading={loading} />
          {error && <ErrorBanner message={error} />}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {PLATFORMS.map((platform) => (
              <Badge key={platform}>{platform}</Badge>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

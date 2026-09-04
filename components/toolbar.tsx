"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { repairDocument } from "@/lib/devto/repair";

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ToolbarProps {
  /** Full document (frontmatter + body), including any user edits. */
  full: string;
  /** Frontmatter block only, derived from the current document. */
  frontmatter: string;
  isEdited: boolean;
  /** Replaces the document with a repaired version. */
  onChange?: (next: string) => void;
  onRevert: () => void;
  onReset: () => void;
  /** Label for the reset/back button (e.g. "← Back to batch"). */
  resetLabel?: string;
}

export function Toolbar({
  full,
  frontmatter,
  isEdited,
  onChange,
  onRevert,
  onReset,
  resetLabel = "← Convert another",
}: ToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [fixNote, setFixNote] = useState<string[] | null>(null);

  // Recomputed as the document changes, so the button can say whether there is
  // anything to fix before the user clicks it.
  const repair = useMemo(() => repairDocument(full), [full]);
  const needsFix = repair.fixes.length > 0;

  const applyFix = () => {
    if (!onChange) return;
    setFixNote(repair.fixes.length > 0 ? repair.fixes : ["Already valid — nothing to change"]);
    if (repair.fixes.length > 0) onChange(repair.document);
    setTimeout(() => setFixNote(null), 6000);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={copy}>
        {copied ? "Copied!" : "Copy Markdown"}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => download("article.md", full)}>
        Download .md
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!frontmatter}
        onClick={() => download("frontmatter.md", frontmatter)}
      >
        Download frontmatter
      </Button>
      {onChange && (
        <Button
          size="sm"
          variant={needsFix ? "default" : "secondary"}
          onClick={applyFix}
          title={
            needsFix
              ? `Fix ${repair.fixes.length} issue${repair.fixes.length === 1 ? "" : "s"} before publishing`
              : "Frontmatter and headings are already valid"
          }
        >
          {needsFix ? `Fix ${repair.fixes.length} issue${repair.fixes.length === 1 ? "" : "s"}` : "✓ Valid for DEV"}
        </Button>
      )}
      {isEdited && (
        <Button size="sm" variant="outline" onClick={onRevert}>
          Revert edits
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onReset} className="ml-auto">
        {resetLabel}
      </Button>

      {fixNote && (
        <ul className="w-full list-disc space-y-0.5 rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          {fixNote.map((fix) => (
            <li key={fix}>{fix}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

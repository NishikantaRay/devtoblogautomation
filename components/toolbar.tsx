"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  onRevert: () => void;
  onReset: () => void;
  /** Label for the reset/back button (e.g. "← Back to batch"). */
  resetLabel?: string;
}

export function Toolbar({
  full,
  frontmatter,
  isEdited,
  onRevert,
  onReset,
  resetLabel = "← Convert another",
}: ToolbarProps) {
  const [copied, setCopied] = useState(false);

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
      {isEdited && (
        <Button size="sm" variant="outline" onClick={onRevert}>
          Revert edits
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onReset} className="ml-auto">
        {resetLabel}
      </Button>
    </div>
  );
}

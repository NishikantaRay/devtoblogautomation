/**
 * Deterministic cleanup passes applied to Turndown output.
 * Order matters: structural fixes first, whitespace collapse last.
 */
export function postprocessMarkdown(markdown: string): string {
  let md = markdown;

  // Normalize line endings and strip trailing whitespace per line,
  // leaving fenced code blocks untouched.
  md = md.replace(/\r\n?/g, "\n");
  md = mapOutsideCodeFences(md, (segment) =>
    segment
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n")
  );

  md = mapOutsideCodeFences(md, (segment) => {
    let s = segment;

    // Decode entities Turndown may leave behind.
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&hellip;/g, "…")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–");

    // Unescape over-escaped characters inside words (my\_var → my_var).
    s = s.replace(/(\w)\\([_*])(\w)/g, "$1$2$3");
    // Unescape harmless escapes Turndown adds aggressively.
    s = s.replace(/\\([.\-+()#!])/g, "$1");

    // Remove empty emphasis/links left after cleanup.
    s = s.replace(/\*\*\s*\*\*/g, "").replace(/__\s*__/g, "").replace(/\[\s*\]\([^)]*\)/g, "");

    // Ensure a blank line before and after headings.
    s = s.replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2");
    s = s.replace(/^(#{1,6} .*)\n(?!\n)/gm, "$1\n\n");

    // Ensure a blank line before images that follow text directly.
    s = s.replace(/([^\n|])\n(!\[)/g, "$1\n\n$2");

    // Normalize Turndown's padded list markers ("-   item" → "- item").
    s = s.replace(/^(\s*)-\s{2,}/gm, "$1- ");
    s = s.replace(/^(\s*\d+\.)\s{2,}/gm, "$1 ");

    return s;
  });

  // Ensure blank lines around code fences: pad before opening fences and
  // after closing ones, never inside the block. Fence parity (even = about to
  // open, odd = about to close) decides which side we're on.
  const fencesBefore = (haystack: string, offset: number) =>
    (haystack.slice(0, offset).match(/^```/gm) ?? []).length;
  const beforePass = md;
  md = md.replace(/([^\n])\n(```)/g, (match, prev: string, fence, offset: number) =>
    fencesBefore(beforePass, offset + prev.length + 1) % 2 === 0
      ? `${prev}\n\n${fence}`
      : match
  );
  const afterPass = md;
  md = md.replace(/(```[^\n]*)\n(?!\n|```|$)/g, (match, fence: string, offset: number) =>
    fencesBefore(afterPass, offset) % 2 === 1 ? `${fence}\n\n` : match
  );

  // Collapse 3+ blank lines to a single blank line (outside code).
  md = mapOutsideCodeFences(md, (segment) => segment.replace(/\n{3,}/g, "\n\n"));

  return md.trim() + "\n";
}

/**
 * DEV renders the frontmatter title as the page H1, so body H1s compete with
 * it. When the body contains any H1, every heading shifts down one level
 * (h1→h2 … h5→h6; h6 stays) to preserve the hierarchy. Code fences untouched.
 */
export function demoteBodyHeadings(markdown: string): string {
  let hasH1 = false;
  mapOutsideCodeFences(markdown, (segment) => {
    if (/^# /m.test(segment)) hasH1 = true;
    return segment;
  });
  if (!hasH1) return markdown;
  return mapOutsideCodeFences(markdown, (segment) =>
    segment.replace(/^(#{1,5}) /gm, "$1# ")
  );
}

/** Applies fn to the segments of markdown that are outside ``` fenced code blocks. */
function mapOutsideCodeFences(markdown: string, fn: (segment: string) => string): string {
  const parts = markdown.split(/(^`{3,}[^\n]*\n[\s\S]*?^`{3,}\s*$)/m);
  return parts
    .map((part, i) => (i % 2 === 0 ? fn(part) : part))
    .join("");
}

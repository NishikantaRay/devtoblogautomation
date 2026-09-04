import type { ArticleMetadata } from "@/lib/types";

/** DEV.to allows at most 4 tags, lowercase alphanumeric. */
function devtoTags(tags: string[]): string[] {
  const normalized: string[] = [];
  for (const tag of tags) {
    const t = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (t && !normalized.includes(t)) normalized.push(t);
    if (normalized.length === 4) break;
  }
  return normalized;
}

export function yamlString(value: string): string {
  // Quote and escape for safe single-line YAML.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

export interface SplitDocument {
  /** The frontmatter block including its --- delimiters, or "" if none. */
  frontmatter: string;
  /** The markdown body without the frontmatter block. */
  body: string;
}

/**
 * A frontmatter delimiter line: three or more dashes, alone on the line.
 *
 * Accepts the typographic dashes (– —) that editors and phone keyboards
 * substitute for `---`, plus surrounding whitespace, because a delimiter that
 * looks right to the user but doesn't match leaves DEV with no title.
 */
const DELIMITER = /^[ \t]*[-\u2010-\u2015\u2212]{3,}[ \t]*$/;

/**
 * Splits an article document into its frontmatter block and markdown body.
 *
 * Deliberately forgiving about how the block is written: real documents
 * arrive with Windows line endings, a UTF-8 BOM, a stray leading blank line,
 * smart dashes, and trailing spaces on the delimiters. Any of those used to
 * make the block invisible, and an article with no visible frontmatter is
 * rejected by DEV with "Title can't be blank".
 */
export function splitFrontmatter(text: string): SplitDocument {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    // Non-breaking and other exotic spaces, which look identical to a space.
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .replace(/^\s*\n/, "");

  const lines = normalized.split("\n");
  if (lines.length === 0 || !DELIMITER.test(lines[0])) {
    return { frontmatter: "", body: normalized };
  }

  // Find the closing delimiter. Without one there is no frontmatter block —
  // treating the rest of the document as frontmatter would lose the body.
  const close = lines.findIndex((line, i) => i > 0 && DELIMITER.test(line));
  if (close === -1) return { frontmatter: "", body: normalized };

  const frontmatter = ["---", ...lines.slice(1, close), "---"].join("\n");
  const body = lines
    .slice(close + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return { frontmatter, body };
}

/** Reads a scalar value (e.g. title, cover_image) out of a frontmatter block. */
export function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  let value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value || undefined;
}

/** Generates DEV.to article frontmatter. */
export function generateFrontmatter(metadata: ArticleMetadata): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${yamlString(metadata.title || "Untitled")}`);
  lines.push("published: false");
  if (metadata.description) {
    lines.push(`description: ${yamlString(metadata.description.slice(0, 155))}`);
  }
  const tags = devtoTags(metadata.tags);
  if (tags.length > 0) {
    lines.push(`tags: ${tags.join(", ")}`);
  }
  if (metadata.canonicalUrl) {
    lines.push(`canonical_url: ${metadata.canonicalUrl}`);
  }
  if (metadata.coverImage) {
    lines.push(`cover_image: ${metadata.coverImage}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Returns the document with its frontmatter delimiters and line endings
 * normalized, ready to send to DEV. Returns the input unchanged when there is
 * no frontmatter to normalize.
 */
export function normalizeDocument(text: string): string {
  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) return text;
  return `${frontmatter}\n\n${body}`;
}

/**
 * Rewrites the frontmatter's `published` flag. DEV reads this field to decide
 * between a draft and a live article, so this is what makes a scheduled post
 * actually go live at its due time rather than sitting in drafts.
 */
export function setPublishedFlag(document: string, published: boolean): string {
  const { frontmatter, body } = splitFrontmatter(document);
  if (!frontmatter) return document;
  const value = `published: ${published}`;
  const updated = /^published:\s*.*$/m.test(frontmatter)
    ? frontmatter.replace(/^published:\s*.*$/m, value)
    : // No published key at all — insert just after the opening delimiter.
      frontmatter.replace(/^---\n/, `---\n${value}\n`);
  return `${updated}\n\n${body}`;
}


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

function yamlString(value: string): string {
  // Quote and escape for safe single-line YAML.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

export interface SplitDocument {
  /** The frontmatter block including its --- delimiters, or "" if none. */
  frontmatter: string;
  /** The markdown body without the frontmatter block. */
  body: string;
}

/** Splits an article document into its frontmatter block and markdown body. */
export function splitFrontmatter(text: string): SplitDocument {
  const match = text.match(/^---\n[\s\S]*?\n---(?:\n|$)/);
  if (!match) return { frontmatter: "", body: text };
  return {
    frontmatter: match[0].trimEnd(),
    body: text.slice(match[0].length).replace(/^\n+/, ""),
  };
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

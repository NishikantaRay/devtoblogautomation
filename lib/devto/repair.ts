import { splitFrontmatter, yamlString } from "@/lib/devto/frontmatter";
import { demoteBodyHeadings } from "@/lib/markdown/postprocess";

/**
 * Repairs an article document so DEV.to will accept it.
 *
 * Hand-edited frontmatter breaks in predictable ways — an unterminated quoted
 * string (DEV answers "found unexpected end of stream while scanning a quoted
 * scalar"), a missing title, smart quotes, more than four tags — and body H1s
 * compete with the title DEV renders from the frontmatter.
 *
 * Everything here is a repair, never a rewrite: the article's words are left
 * alone. Only the frontmatter's syntax and heading levels change.
 */

export interface RepairResult {
  /** The corrected document. */
  document: string;
  /** Human-readable description of each change made, in order. */
  fixes: string[];
}

/** A frontmatter key DEV understands, in the order DEV's docs list them. */
const KEY_ORDER = [
  "title",
  "published",
  "description",
  "tags",
  "series",
  "canonical_url",
  "cover_image",
];

/** Keys whose values must be emitted as quoted YAML strings. */
const QUOTED_KEYS = new Set(["title", "description", "series"]);

export function repairDocument(input: string): RepairResult {
  const fixes: string[] = [];
  const original = input;

  const { frontmatter, body: rawBody } = splitFrontmatter(input);

  // Straight quotes and dashes: invisible to the eye, fatal to a YAML parser.
  if (frontmatter && /[“”‘’]/.test(frontmatter)) {
    fixes.push("Replaced smart quotes in the frontmatter with straight quotes");
  }

  const fields = frontmatter ? parseFields(frontmatter) : new Map<string, string>();

  // Title is the one field DEV refuses to publish without.
  let title = fields.get("title");
  if (!title) {
    const fromHeading = firstHeading(rawBody);
    if (fromHeading) {
      title = fromHeading.text;
      fixes.push(`Set the title from the first heading: "${truncate(title, 60)}"`);
    } else {
      title = "Untitled";
      fixes.push('No title found — set it to "Untitled" (edit before publishing)');
    }
  }
  fields.set("title", title);

  // published must be a bare boolean, not a quoted string. Adding the key when
  // it's absent isn't worth reporting — the default is what the user expects.
  const rawPublished = fields.get("published");
  const publishedBool = rawPublished?.toLowerCase() === "true" ? "true" : "false";
  if (rawPublished !== undefined && rawPublished !== publishedBool) {
    fixes.push(`Normalized "published" to ${publishedBool}`);
  }
  fields.set("published", publishedBool);

  // DEV caps descriptions at 155 characters.
  const description = fields.get("description");
  if (description && description.length > 155) {
    fields.set("description", `${description.slice(0, 152).trimEnd()}...`);
    fixes.push("Trimmed the description to DEV's 155-character limit");
  }

  // DEV allows at most 4 lowercase alphanumeric tags.
  const rawTags = fields.get("tags");
  if (rawTags !== undefined) {
    const cleaned = normalizeTags(rawTags);
    if (cleaned.join(", ") !== rawTags.trim()) {
      fixes.push(`Cleaned tags to DEV's rules: ${cleaned.join(", ") || "(none)"}`);
    }
    if (cleaned.length > 0) fields.set("tags", cleaned.join(", "));
    else fields.delete("tags");
  }

  // Rebuild the block so every value is correctly quoted and escaped.
  const rebuilt = buildFrontmatter(fields);

  if (!frontmatter) {
    fixes.push("Added the frontmatter block DEV requires");
  } else if (rebuilt !== frontmatter) {
    // Only report a syntax repair when nothing more specific already covers it.
    if (!fixes.some((f) => f.startsWith("Set the title") || f.startsWith("No title"))) {
      fixes.push("Rewrote the frontmatter with valid YAML quoting");
    }
  }

  // A body H1 competes with the title DEV renders; shift headings down.
  let body = rawBody;
  if (hasBodyH1(body)) {
    body = demoteBodyHeadings(body);
    fixes.push("Demoted body headings so only the title is an H1 (# → ##)");
  }

  const document = `${rebuilt}\n\n${body.trim()}\n`;

  // Whitespace-only differences aren't worth reporting as a fix.
  if (fixes.length === 0 && document.trim() !== original.trim()) {
    fixes.push("Normalized spacing and line endings");
  }

  return { document, fixes };
}

/**
 * Reads `key: value` pairs from a frontmatter block, tolerating the broken
 * quoting this function exists to repair. Values are returned unquoted.
 */
function parseFields(frontmatter: string): Map<string, string> {
  const fields = new Map<string, string>();
  const lines = frontmatter.split("\n").slice(1, -1); // drop the --- delimiters

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields.set(key.toLowerCase(), unquote(rawValue));
  }
  return fields;
}

/** Strips surrounding quotes and unescapes, accepting unbalanced input. */
function unquote(raw: string): string {
  let value = raw.trim();
  // Normalize the smart quotes editors substitute, which YAML doesn't accept.
  value = value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const quote = value[0];
  if (quote === '"' || quote === "'") {
    value = value.slice(1);
    // Drop a matching closing quote if present; tolerate its absence, which is
    // exactly the "unterminated quoted scalar" case.
    if (value.endsWith(quote)) value = value.slice(0, -1);
    if (quote === '"') {
      value = value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  return value.trim();
}

function buildFrontmatter(fields: Map<string, string>): string {
  const lines = ["---"];
  const emitted = new Set<string>();

  const emit = (key: string) => {
    const value = fields.get(key);
    if (value === undefined || value === "") return;
    emitted.add(key);
    lines.push(`${key}: ${QUOTED_KEYS.has(key) ? yamlString(value) : value}`);
  };

  for (const key of KEY_ORDER) emit(key);
  // Preserve any unrecognized keys rather than silently dropping them.
  for (const key of fields.keys()) if (!emitted.has(key)) emit(key);

  lines.push("---");
  return lines.join("\n");
}

function normalizeTags(raw: string): string[] {
  const stripped = raw.replace(/^\[|\]$/g, ""); // accept [a, b] list syntax
  const seen: string[] = [];
  for (const part of stripped.split(",")) {
    const tag = part.trim().replace(/^["']|["']$/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tag && !seen.includes(tag)) seen.push(tag);
    if (seen.length === 4) break;
  }
  return seen;
}

/** The first ATX heading in the body, ignoring fenced code. */
function firstHeading(body: string): { text: string } | undefined {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^\s*#{1,3}\s+(.+?)\s*#*$/);
    if (match) return { text: match[1].trim() };
  }
  return undefined;
}

function hasBodyH1(body: string): boolean {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^# /.test(line)) return true;
  }
  return false;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

import {
  generateFrontmatter,
  splitFrontmatter,
  frontmatterValue,
} from "@/lib/devto/frontmatter";
import { demoteBodyHeadings, postprocessMarkdown } from "@/lib/markdown/postprocess";
import { ConversionError, type ArticleMetadata, type ConversionResult } from "@/lib/types";

const MIN_BODY_LENGTH = 40;

/** Words too common to be useful as DEV tags. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are",
  "was", "were", "but", "not", "have", "has", "had", "what", "when", "where",
  "which", "will", "would", "can", "could", "should", "them", "they", "there",
  "here", "into", "out", "about", "more", "most", "some", "any", "all", "how",
  "why", "who", "its", "one", "two", "get", "got", "new", "just", "like",
  "make", "made", "use", "using", "used", "than", "then", "over", "after",
  "before", "because", "been", "being", "their", "our", "his", "her", "each",
  "also", "very", "much", "many", "same", "other", "only", "even", "still",
  // Title filler: common in headlines, meaningless as a topic tag.
  "getting", "started", "understanding", "introduction", "guide", "tutorial",
  "part", "learn", "learning", "know", "knowing", "switched", "switching",
  "building", "build", "built", "writing", "write", "written", "why", "way",
  "ways", "things", "thing", "better", "best", "good", "great", "simple",
  "quick", "easy", "hard", "first", "last", "next", "every", "untitled",
]);

export interface TextInput {
  /** The article body — plain text or markdown. */
  text: string;
  /** Overrides the inferred title. */
  title?: string;
  /** Overrides the inferred description. */
  description?: string;
  /** Overrides the inferred tags. */
  tags?: string[];
  /** Optional original URL, published as canonical_url. */
  canonicalUrl?: string;
  /** Optional cover image URL. */
  coverImage?: string;
}

/**
 * Turns text written or pasted by the user into a DEV.to-ready article.
 *
 * Unlike the URL and HTML paths there is nothing to extract — the text *is*
 * the article. The work is inferring the metadata DEV needs (title,
 * description, tags) and normalizing the body, while letting the user
 * override anything inferred.
 *
 * Plain prose and markdown are both accepted: markdown passes through
 * untouched, and plain prose is already valid markdown.
 */
export function convertText(input: TextInput): ConversionResult {
  const raw = input.text ?? "";
  if (!raw.trim()) {
    throw new ConversionError("EXTRACT_EMPTY", "Write something first.");
  }

  // Text pasted from an existing article may already carry frontmatter;
  // treat that as metadata rather than as body content.
  const { frontmatter: existing, body: withoutFrontmatter } = splitFrontmatter(raw.trim());

  let body = postprocessMarkdown(withoutFrontmatter);

  const inferred = inferTitle(body);
  const title =
    firstNonEmpty(
      input.title,
      existing ? frontmatterValue(existing, "title") : undefined,
      inferred.title
    ) ?? "Untitled";

  // A heading that became the title shouldn't also open the body — DEV
  // renders the frontmatter title as the page H1.
  if (!input.title && inferred.consumedHeading) {
    body = inferred.rest;
  }

  // DEV renders the frontmatter title as the page H1, so any H1 left in the
  // body competes with it — DEV's own editor warns about exactly this. Shift
  // every heading down a level so the document has a single H1.
  body = demoteBodyHeadings(body);

  body = body.trim();
  if (body.length < MIN_BODY_LENGTH) {
    throw new ConversionError(
      "EXTRACT_EMPTY",
      `That's a bit short — write at least ${MIN_BODY_LENGTH} characters of body text.`
    );
  }

  const description = firstNonEmpty(
    input.description,
    existing ? frontmatterValue(existing, "description") : undefined,
    inferDescription(body)
  );

  const tags =
    input.tags && input.tags.length > 0
      ? input.tags
      : (parseTags(existing ? frontmatterValue(existing, "tags") : undefined) ??
        inferTags(title, body));

  const metadata: ArticleMetadata = {
    title,
    canonicalUrl: firstNonEmpty(
      input.canonicalUrl,
      existing ? frontmatterValue(existing, "canonical_url") : undefined
    ),
    coverImage: firstNonEmpty(
      input.coverImage,
      existing ? frontmatterValue(existing, "cover_image") : undefined
    ),
    tags,
    description,
  };

  const frontmatter = generateFrontmatter(metadata);
  return {
    platform: "text",
    metadata,
    markdown: body,
    frontmatter,
    full: `${frontmatter}\n\n${body}`,
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

interface InferredTitle {
  title?: string;
  /** The body with the title line removed, when one was consumed. */
  rest: string;
  consumedHeading: boolean;
}

/**
 * Title priority: a leading markdown heading, else the first line when it
 * reads like a title (short, no sentence-ending punctuation), else nothing.
 */
function inferTitle(body: string): InferredTitle {
  const lines = body.split("\n");
  const index = lines.findIndex((l) => l.trim() !== "");
  if (index === -1) return { rest: body, consumedHeading: false };

  const first = lines[index].trim();
  const rest = () =>
    lines
      .slice(index + 1)
      .join("\n")
      .replace(/^\n+/, "");

  const heading = first.match(/^#{1,3}\s+(.+?)\s*#*$/);
  if (heading) {
    return { title: heading[1].trim(), rest: rest(), consumedHeading: true };
  }

  // A short opening line with no terminal punctuation is almost always a
  // title someone typed without markdown syntax.
  const looksLikeTitle =
    first.length <= 100 && !/[.!?:;,]$/.test(first) && first.split(/\s+/).length <= 14;
  if (looksLikeTitle) {
    return { title: first, rest: rest(), consumedHeading: true };
  }

  return { rest: body, consumedHeading: false };
}

/** First real sentence of prose, trimmed to DEV's 155-character limit. */
function inferDescription(body: string): string | undefined {
  for (const block of body.split(/\n\s*\n/)) {
    const line = block.trim();
    // Skip anything that isn't prose.
    if (!line || /^[#>\-*+`|]/.test(line) || /^\d+\.\s/.test(line)) continue;

    const plain = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images → their text
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length < 20) continue;

    const sentence = plain.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? plain;
    return sentence.length > 155 ? `${sentence.slice(0, 152).trimEnd()}...` : sentence;
  }
  return undefined;
}

function parseTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const tags = value
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

/**
 * Picks up to 4 tags by weighted frequency.
 *
 * Weighting reflects how reliably each context names a topic: code fence
 * languages and title words are strong signals, inline code is moderate, and
 * body prose is weak — a word must recur in the prose to outrank them.
 * A word must also appear at least twice, or come from the title or a fence,
 * which keeps one-off nouns out of the tag list.
 */
function inferTags(title: string, body: string): string[] {
  const scores = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const strong = new Set<string>();

  const normalize = (word: string): string | undefined => {
    const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (w.length < 3 || w.length > 20) return undefined;
    if (STOP_WORDS.has(w)) return undefined;
    // Pure numbers, and tokens that merely start with digits ("2gb"), are
    // measurements rather than topics.
    if (/^\d/.test(w)) return undefined;
    return w;
  };

  const bump = (word: string, weight: number, isStrong: boolean) => {
    const w = normalize(word);
    if (!w) return;
    scores.set(w, (scores.get(w) ?? 0) + weight);
    occurrences.set(w, (occurrences.get(w) ?? 0) + 1);
    if (isStrong) strong.add(w);
  };

  for (const word of title.split(/[^A-Za-z0-9]+/)) bump(word, 10, true);
  for (const match of body.matchAll(/```(\w+)/g)) bump(match[1], 12, true);
  for (const match of body.matchAll(/`([^`\n]{2,30})`/g)) {
    for (const word of match[1].split(/[^A-Za-z0-9]+/)) bump(word, 4, false);
  }
  // Prose, with code spans already removed so they aren't counted twice.
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  for (const word of prose.split(/[^A-Za-z0-9]+/)) bump(word, 1, false);

  return [...scores.entries()]
    .filter(([word]) => strong.has(word) || (occurrences.get(word) ?? 0) >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word);
}

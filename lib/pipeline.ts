import * as cheerio from "cheerio";
import { fetchHtml } from "@/lib/fetcher";
import { detectPlatform } from "@/lib/detect";
import { getExtractor } from "@/lib/extractors";
import { genericExtractor } from "@/lib/extractors/generic";
import { cleanArticleHtml } from "@/lib/cleaner";
import { htmlToMarkdown } from "@/lib/markdown/convert";
import { demoteBodyHeadings, postprocessMarkdown } from "@/lib/markdown/postprocess";
import { generateFrontmatter } from "@/lib/devto/frontmatter";
import { validateUrl } from "@/lib/utils/url";
import { ConversionError, type ArticleMetadata, type ConversionResult } from "@/lib/types";

const MIN_MARKDOWN_LENGTH = 80;

/** Runs the full URL → DEV.to Markdown pipeline. Throws ConversionError on failure. */
export async function convertUrl(input: string): Promise<ConversionResult> {
  const url = validateUrl(input);
  const { html, finalUrl } = await fetchHtml(url);
  return convertDocument(html, finalUrl);
}

/**
 * Converts pasted HTML directly — the escape hatch for sites that block
 * server-side fetching (Medium, rate-limited Hashnode, paywalled pages).
 * `sourceUrl` is optional; when absent, the canonical URL embedded in the
 * HTML (or a placeholder) is used to resolve relative links.
 */
export function convertPastedHtml(html: string, sourceUrl?: string): ConversionResult {
  if (!html.trim() || !/<[a-z][\s\S]*>/i.test(html)) {
    throw new ConversionError("INVALID_HTML");
  }
  let base: string | undefined = sourceUrl?.trim()
    ? validateUrl(sourceUrl).toString()
    : undefined;
  if (!base) {
    try {
      const $probe = cheerio.load(html);
      base =
        $probe('link[rel="canonical"]').attr("href") ??
        $probe('meta[property="og:url"]').attr("content") ??
        undefined;
      if (base) base = validateUrl(base).toString();
    } catch {
      base = undefined;
    }
  }
  return convertDocument(html, base ?? PASTED_PLACEHOLDER);
}

/** Base URL used when pasted HTML has no known source; never shown to the user. */
const PASTED_PLACEHOLDER = "https://pasted.example/";

/** Shared core: HTML + URL → DEV.to Markdown. */
function convertDocument(html: string, finalUrl: string): ConversionResult {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    throw new ConversionError("INVALID_HTML");
  }

  detectPaywallPage($);

  const platform = detectPlatform(finalUrl, $);
  const extractor = getExtractor(platform);

  let extracted = extractor.extract($, finalUrl);
  // Platform extractor came up empty or grabbed a header-only fragment (custom
  // themes) — fall back to the generic strategy and keep the richer result.
  if (platform !== "generic" && textLength(extracted.contentHtml) < 600) {
    const generic = genericExtractor.extract(cheerio.load(html), finalUrl);
    if (textLength(generic.contentHtml) > textLength(extracted.contentHtml)) {
      extracted = { contentHtml: generic.contentHtml, metadata: extracted.metadata };
    }
  }
  if (!extracted.contentHtml.trim()) {
    throw new ConversionError("EXTRACT_EMPTY");
  }

  const cleaned = cleanArticleHtml(extracted.contentHtml, finalUrl);
  let markdown = postprocessMarkdown(htmlToMarkdown(cleaned));

  const rawCanonical = extracted.metadata.canonicalUrl ?? finalUrl;
  const metadata: ArticleMetadata = {
    title: extracted.metadata.title ?? "Untitled",
    author: extracted.metadata.author,
    publishedDate: extracted.metadata.publishedDate,
    canonicalUrl: rawCanonical.startsWith(PASTED_PLACEHOLDER) ? undefined : rawCanonical,
    coverImage: extracted.metadata.coverImage,
    tags: extracted.metadata.tags ?? [],
    description: extracted.metadata.description,
  };

  markdown = stripLeadingTitle(markdown, metadata.title);
  markdown = demoteBodyHeadings(markdown);

  if (markdown.trim().length < MIN_MARKDOWN_LENGTH) {
    throw new ConversionError("EXTRACT_EMPTY");
  }

  const frontmatter = generateFrontmatter(metadata);
  return {
    platform,
    metadata,
    markdown,
    frontmatter,
    full: `${frontmatter}\n\n${markdown}`,
  };
}

function textLength(html: string): number {
  if (!html.trim()) return 0;
  return cheerio.load(html).text().trim().length;
}

/** DEV renders the frontmatter title itself; drop a duplicated H1 at the top of the body. */
function stripLeadingTitle(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  const firstContent = lines.findIndex((l) => l.trim() !== "");
  if (firstContent === -1) return markdown;
  const first = lines[firstContent].trim();
  const heading = first.match(/^#{1,2}\s+(.*)$/);
  if (heading && similar(heading[1], title)) {
    return lines
      .slice(firstContent + 1)
      .join("\n")
      .replace(/^\n+/, "");
  }
  return markdown;
}

function similar(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = norm(a);
  const nb = norm(b);
  return na.length > 0 && (na === nb || na.startsWith(nb) || nb.startsWith(na));
}

/** Detects login walls / members-only pages that return 200 but hide content. */
function detectPaywallPage($: cheerio.CheerioAPI): void {
  const bodyText = $("body").text();
  if (bodyText.trim().length > 1500) return;
  if (
    /members[- ]only|sign in to read|subscribe to (read|continue)|this post is for (paid|paying) subscribers/i.test(
      bodyText
    )
  ) {
    throw new ConversionError("PRIVATE");
  }
}

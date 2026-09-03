import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ArticleMetadata } from "@/lib/types";
import {
  findJsonLdArticle,
  jsonLdAuthor,
  jsonLdImage,
  meta,
  metaAll,
} from "@/lib/utils/html";
import { absolutize } from "@/lib/utils/url";

/** Title priority: article h1 → og:title → <title>. */
export function extractTitle($: CheerioAPI): string | undefined {
  const h1 =
    $("article h1").first().text().trim() ||
    $("main h1").first().text().trim() ||
    $("h1").first().text().trim();
  if (h1) return h1;
  const og = meta($, "og:title");
  if (og) return og;
  const title = $("title").first().text().trim();
  // Strip trailing " | Site Name" / " – Site Name" from <title>.
  return title ? title.replace(/\s*[|–—-]\s*[^|–—-]{0,60}$/, "").trim() || title : undefined;
}

/** Metadata common to every platform: meta tags + JSON-LD + <time>. */
export function baseMetadata($: CheerioAPI, url: string): Partial<ArticleMetadata> {
  const jsonLd = findJsonLdArticle($);

  const canonical =
    absolutize($('link[rel="canonical"]').attr("href"), url) ??
    absolutize(meta($, "og:url"), url) ??
    url;

  const published =
    meta($, "article:published_time") ??
    jsonLd?.datePublished ??
    $("article time[datetime], time[datetime]").first().attr("datetime") ??
    undefined;

  const author =
    meta($, "author") ??
    jsonLdAuthor(jsonLd) ??
    ($('[rel="author"]').first().text().trim() || undefined);

  const cover =
    absolutize(meta($, "og:image") ?? jsonLdImage(jsonLd) ?? meta($, "twitter:image"), url) ??
    undefined;

  const tags = collectTags($, jsonLd?.keywords);

  return {
    title: extractTitle($) ?? jsonLd?.headline,
    author,
    publishedDate: published ? normalizeDate(published) : undefined,
    canonicalUrl: canonical,
    coverImage: cover,
    tags,
    description: meta($, "description") ?? meta($, "og:description") ?? jsonLd?.description,
  };
}

function collectTags($: CheerioAPI, keywords?: string | string[]): string[] {
  const raw = [
    ...metaAll($, "article:tag"),
    ...(Array.isArray(keywords) ? keywords : keywords ? keywords.split(",") : []),
  ];
  if (raw.length === 0) {
    const metaKeywords = meta($, "keywords");
    if (metaKeywords) raw.push(...metaKeywords.split(","));
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of raw) {
    const t = tag.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      tags.push(t);
    }
  }
  return tags;
}

function normalizeDate(value: string): string {
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

/** Returns outerHTML for the first matching selector with meaningful text, or undefined. */
export function firstWithText(
  $: CheerioAPI,
  selectors: string[],
  minLength = 200
): Cheerio<AnyNode> | undefined {
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length > 0 && el.text().trim().length >= minLength) return el;
  }
  // Relaxed pass: accept short articles rather than failing outright.
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length > 0 && el.text().trim().length > 0) return el;
  }
  return undefined;
}

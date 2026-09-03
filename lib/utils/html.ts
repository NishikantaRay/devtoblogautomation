import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

/** Removes every element matching any of the given selectors. */
export function removeAll($: CheerioAPI, root: Cheerio<AnyNode>, selectors: string[]): void {
  for (const selector of selectors) {
    root.find(selector).remove();
  }
}

/** Reads the content of the first matching <meta> tag (by property or name). */
export function meta($: CheerioAPI, key: string): string | undefined {
  const value =
    $(`meta[property="${key}"]`).attr("content") ?? $(`meta[name="${key}"]`).attr("content");
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** All values for a repeatable meta key (e.g. article:tag). */
export function metaAll($: CheerioAPI, key: string): string[] {
  const values: string[] = [];
  $(`meta[property="${key}"], meta[name="${key}"]`).each((_, el) => {
    const content = $(el).attr("content")?.trim();
    if (content) values.push(content);
  });
  return values;
}

interface JsonLdArticle {
  headline?: string;
  description?: string;
  datePublished?: string;
  keywords?: string | string[];
  image?: unknown;
  author?: unknown;
}

/** Finds the first Article/BlogPosting JSON-LD object on the page. */
export function findJsonLdArticle($: CheerioAPI): JsonLdArticle | undefined {
  let found: JsonLdArticle | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const parsed: unknown = JSON.parse($(el).text());
      const candidates: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "@graph" in parsed
          ? (parsed as { "@graph": unknown[] })["@graph"]
          : [parsed];
      for (const item of candidates) {
        if (!item || typeof item !== "object") continue;
        const type = (item as { "@type"?: string | string[] })["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.some((t) => t === "Article" || t === "BlogPosting" || t === "NewsArticle")) {
          found = item as JsonLdArticle;
          return;
        }
      }
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  });
  return found;
}

export function jsonLdAuthor(article: { author?: unknown } | undefined): string | undefined {
  if (!article?.author) return undefined;
  const author = Array.isArray(article.author) ? article.author[0] : article.author;
  if (typeof author === "string") return author;
  if (author && typeof author === "object" && "name" in author) {
    const name = (author as { name?: unknown }).name;
    if (typeof name === "string") return name.trim() || undefined;
  }
  return undefined;
}

export function jsonLdImage(article: { image?: unknown } | undefined): string | undefined {
  if (!article?.image) return undefined;
  const image = Array.isArray(article.image) ? article.image[0] : article.image;
  if (typeof image === "string") return image;
  if (image && typeof image === "object" && "url" in image) {
    const url = (image as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return undefined;
}

import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** Hashnode chrome: reactions, author cards, newsletter widgets, comments. */
const HASHNODE_JUNK = [
  '[data-testid="post-reactions"]',
  '[data-testid="article-reactions"]',
  '[data-testid="author-widget"]',
  '[data-testid="newsletter-widget"]',
  '[data-testid="comments-section"]',
  '[data-testid="post-comments"]',
  "#comments",
  ".blog-author-card",
  ".blog-subscription-form",
];

export const hashnodeExtractor: Extractor = {
  platform: "hashnode",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    const article = firstWithText($, [
      "#post-content-parent",
      '[data-testid="post-content"]',
      ".blog-post-details article",
      "article .prose",
      "article",
      "main",
    ]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, HASHNODE_JUNK);
    return { contentHtml: $.html(article), metadata };
  },
};

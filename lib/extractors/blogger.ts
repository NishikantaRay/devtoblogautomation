import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** Blogger template chrome. */
const BLOGGER_JUNK = [
  ".post-share-buttons",
  ".post-footer",
  ".blog-pager",
  ".comments",
  "#comments",
  ".sidebar",
  ".widget-content .PopularPosts",
  ".post-labels",
];

export const bloggerExtractor: Extractor = {
  platform: "blogger",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    // Blogger labels double as tags.
    if (!metadata.tags || metadata.tags.length === 0) {
      const labels: string[] = [];
      $('.post-labels a, a[rel="tag"]').each((_, el) => {
        const label = $(el).text().trim();
        if (label && !labels.includes(label)) labels.push(label);
      });
      if (labels.length > 0) metadata.tags = labels;
    }

    // Some Blogger templates (e.g. googleblog.com) ship the post body inside a
    // <script type="text/template"> and inject it client-side. Unwrap it first.
    $('.post-body script[type="text/template"], .post-content script[type="text/template"]').each(
      (_, el) => {
        const $script = $(el);
        const inner = $script.html() ?? "";
        if (inner.trim().length > 100) $script.replaceWith(inner);
      }
    );

    const article = firstWithText($, [
      ".post-body",
      ".entry-content",
      ".post",
      "article",
      "main",
    ]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, BLOGGER_JUNK);
    return { contentHtml: $.html(article), metadata };
  },
};

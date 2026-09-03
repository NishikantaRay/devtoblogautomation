import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** WordPress chrome across common themes: widgets, sidebars, share plugins, related posts. */
const WORDPRESS_JUNK = [
  ".widget",
  ".widget-area",
  ".sidebar",
  "#sidebar",
  ".sharedaddy",
  ".share-buttons",
  ".jp-relatedposts",
  ".yarpp-related",
  ".related-posts",
  ".post-navigation",
  ".nav-links",
  ".comments-area",
  "#comments",
  ".comment-respond",
  ".wp-block-comments",
  ".entry-meta",
  ".entry-footer",
  ".post-tags",
  ".author-bio",
  ".wp-block-latest-posts",
];

export const wordpressExtractor: Extractor = {
  platform: "wordpress",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    const article = firstWithText($, [
      ".entry-content",
      ".post-content",
      ".wp-block-post-content",
      "article .content",
      "article",
      "main",
    ]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, WORDPRESS_JUNK);
    return { contentHtml: $.html(article), metadata };
  },
};

import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** Substack chrome: subscribe embeds, share buttons, comments, paywall banners. */
const SUBSTACK_JUNK = [
  ".subscribe-widget",
  ".subscription-widget-wrap",
  ".subscription-widget",
  '[class*="subscribeButton"]',
  ".button-wrapper",
  ".share-dialog",
  ".post-footer",
  ".comments-section",
  ".paywall",
  ".paywall-jump",
  ".footer-wrap",
];

export const substackExtractor: Extractor = {
  platform: "substack",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    const article = firstWithText($, [
      ".available-content .body.markup",
      ".available-content",
      ".body.markup",
      "article .markup",
      "article",
      "main",
    ]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, SUBSTACK_JUNK);

    // Substack image wrappers link to a zoomed version; unwrap to plain images.
    article.find("a.image-link").each((_, el) => {
      const $a = $(el);
      const img = $a.find("img").first();
      if (img.length > 0) $a.replaceWith(img);
    });

    return { contentHtml: $.html(article), metadata };
  },
};

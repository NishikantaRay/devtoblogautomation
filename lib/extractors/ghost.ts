import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** Ghost chrome: membership/subscribe CTAs, comments, related posts. */
const GHOST_JUNK = [
  ".gh-post-upgrade-cta",
  ".gh-signup",
  ".gh-subscribe",
  ".gh-comments",
  ".gh-related",
  ".kg-signup-card",
  ".kg-cta-card",
  ".kg-paywall",
  ".subscribe-form",
  ".post-upgrade-cta",
];

export const ghostExtractor: Extractor = {
  platform: "ghost",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    const article = firstWithText($, [
      ".gh-content",
      ".post-content",
      ".post-full-content",
      "article .content",
      "article",
      "main",
    ]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, GHOST_JUNK);

    // Ghost bookmark cards → plain links.
    article.find(".kg-bookmark-card").each((_, el) => {
      const $card = $(el);
      const href = $card.find("a.kg-bookmark-container").attr("href");
      const title = $card.find(".kg-bookmark-title").text().trim();
      if (href) {
        $card.replaceWith(`<p><a href="${href}">${title || href}</a></p>`);
      }
    });

    return { contentHtml: $.html(article), metadata };
  },
};

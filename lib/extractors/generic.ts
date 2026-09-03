import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Extractor } from "./types";
import { baseMetadata } from "./shared";

/**
 * Fallback extractor: <article> → <main> → highest-scoring readable block.
 * Scoring favors text volume and penalizes link density (nav-heavy blocks).
 */
export const genericExtractor: Extractor = {
  platform: "generic",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    const article = pickBest($, "article") ?? pickBest($, "main");
    if (article) {
      return { contentHtml: $.html(article), metadata };
    }

    // Score candidate containers by readable-text volume minus link density.
    let bestHtml = "";
    let bestScore = 0;
    $("div, section, td").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (text.length < 250) return;
      const linkText = $el
        .find("a")
        .toArray()
        .reduce((sum, a) => sum + $(a).text().length, 0);
      const linkDensity = linkText / (text.length || 1);
      const paragraphs = $el.children("p").length + $el.find("> * > p").length;
      const score = text.length * (1 - linkDensity) + paragraphs * 50;
      if (score > bestScore) {
        bestScore = score;
        bestHtml = $.html($el);
      }
    });

    return { contentHtml: bestHtml || $("body").html() || "", metadata };  },
};

function pickBest($: CheerioAPI, selector: string): Cheerio<AnyNode> | undefined {
  let best: Cheerio<AnyNode> | undefined;
  let bestLength = 0;
  $(selector).each((_, el) => {
    const $el = $(el);
    const length = $el.text().trim().length;
    if (length > bestLength && length >= 200) {
      bestLength = length;
      best = $el;
    }
  });
  return best;
}

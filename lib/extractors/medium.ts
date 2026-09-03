import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

/** Medium chrome: claps, highlights, responses, recommendations, paywall, follow buttons. */
const MEDIUM_JUNK = [
  '[data-testid="headerClapButton"]',
  '[data-testid="footerClapButton"]',
  '[data-testid="audioPlayButton"]',
  '[data-testid="storyReadTime"]',
  '[data-testid="storyPublishDate"]',
  '[data-testid="authorName"]',
  '[data-testid="publicationName"]',
  '[data-testid="responsesSection"]',
  '[data-testid="recommendations"]',
  '[data-testid="paywall"]',
  '[aria-label="clap"]',
  '[aria-label="responses"]',
  ".pw-multi-vote-count",
  ".pw-multi-vote-icon",
  ".pw-responses",
  ".speechify-ignore",
  ".meteredContent-banner",
];

export const mediumExtractor: Extractor = {
  platform: "medium",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    // Medium wraps the story in <article>; sections inside hold the body.
    const article = firstWithText($, ["article section", "article", "main"]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, MEDIUM_JUNK);

    // Drop the member-only / paywall banners and follow CTAs by text.
    article.find("div, p, span").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (
        text === "follow" ||
        text === "member-only story" ||
        text.startsWith("get unlimited access") ||
        text.startsWith("sign up for") ||
        text.startsWith("this story is published in")
      ) {
        $(el).closest("div").remove();
      }
    });

    return { contentHtml: $.html(article), metadata };
  },
};

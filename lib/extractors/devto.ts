import type { CheerioAPI } from "cheerio";
import type { Extractor } from "./types";
import { baseMetadata, firstWithText } from "./shared";
import { removeAll } from "@/lib/utils/html";

export const devtoExtractor: Extractor = {
  platform: "devto",
  extract($: CheerioAPI, url: string) {
    const metadata = baseMetadata($, url);

    // DEV exposes its tags directly on the article page.
    const tags: string[] = [];
    $("a.crayons-tag, .spec__tags a").each((_, el) => {
      const tag = $(el).text().trim().replace(/^#/, "");
      if (tag && !tags.includes(tag)) tags.push(tag);
    });
    if (tags.length > 0) metadata.tags = tags;

    const article = firstWithText($, ["#article-body", ".crayons-article__main", "article", "main"]);
    if (!article) return { contentHtml: "", metadata };

    removeAll($, article, [
      ".ltag__link", // article-embed liquid tags render as cards; keep plain content
      ".article-actions",
      "#reaction-drawer",
      ".comments",
    ]);

    return { contentHtml: $.html(article), metadata };
  },
};

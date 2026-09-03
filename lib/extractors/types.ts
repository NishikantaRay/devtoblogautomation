import type { CheerioAPI } from "cheerio";
import type { ArticleMetadata, Platform } from "@/lib/types";

export interface ExtractedArticle {
  /** Raw HTML of the article body only (pre-clean). */
  contentHtml: string;
  metadata: Partial<ArticleMetadata>;
}

export interface Extractor {
  platform: Platform;
  extract($: CheerioAPI, url: string): ExtractedArticle;
}

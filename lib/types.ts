export type Platform =
  | "medium"
  | "hashnode"
  | "devto"
  | "wordpress"
  | "ghost"
  | "blogger"
  | "substack"
  | "generic";

export const PLATFORM_LABELS: Record<Platform, string> = {
  medium: "Medium",
  hashnode: "Hashnode",
  devto: "DEV.to",
  wordpress: "WordPress",
  ghost: "Ghost",
  blogger: "Blogger",
  substack: "Substack",
  generic: "Generic blog",
};

export interface ArticleMetadata {
  title: string;
  author?: string;
  publishedDate?: string;
  canonicalUrl?: string;
  coverImage?: string;
  tags: string[];
  description?: string;
}

export interface ConversionResult {
  platform: Platform;
  metadata: ArticleMetadata;
  markdown: string;
  frontmatter: string;
  /** Frontmatter + markdown, ready to save as article.md */
  full: string;
}

export const MAX_BATCH_URLS = 10;

export interface BatchItem {
  url: string;
  ok: boolean;
  result?: ConversionResult;
  error?: string;
}

export type ConversionErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "PRIVATE"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_HTML"
  | "EXTRACT_EMPTY"
  | "RATE_LIMITED";

export const ERROR_MESSAGES: Record<ConversionErrorCode, string> = {
  INVALID_URL: "That doesn't look like a valid blog URL. Please check it and try again.",
  NOT_FOUND: "Article not found — the page returned a 404.",
  PRIVATE: "This article appears to be private, members-only, or paywalled.",
  NETWORK: "Couldn't reach the site. It may be down or blocking requests.",
  TIMEOUT: "The site took too long to respond. Please try again.",
  INVALID_HTML: "The page didn't return readable HTML content.",
  EXTRACT_EMPTY: "Couldn't find readable article content on that page.",
  RATE_LIMITED: "Too many conversions in a short time — please wait a minute and try again.",
};

export class ConversionError extends Error {
  constructor(
    public code: ConversionErrorCode,
    message?: string
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "ConversionError";
  }
}

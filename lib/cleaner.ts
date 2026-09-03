import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { absolutize, largestFromSrcset } from "@/lib/utils/url";

/** Structural elements that never belong in article output. */
const STRUCTURAL_JUNK = [
  "script",
  "style",
  "noscript",
  "template",
  "nav",
  "aside",
  "footer",
  "header nav",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "svg",
  "canvas",
  "dialog",
];

/** Class/id keywords that indicate non-article chrome. */
const JUNK_KEYWORDS = [
  "cookie",
  "gdpr",
  "consent",
  "newsletter",
  "subscribe",
  "signup",
  "sign-up",
  "share",
  "social",
  "comments",
  "comment-section",
  "related",
  "recommended",
  "recommendation",
  "sidebar",
  "widget",
  "advert",
  "sponsor",
  "promo",
  "paywall",
  "popup",
  "modal",
  "banner",
  "breadcrumb",
  "pagination",
  "author-card",
  "author-box",
  "bio-box",
  "follow",
  "reaction",
  "clap",
  "like-button",
  "toolbar",
  "table-of-contents",
  "toc-",
];

/** Cleans extracted article HTML: strips chrome, normalizes images, embeds, and code blocks. */
export function cleanArticleHtml(contentHtml: string, baseUrl: string): string {
  const $ = cheerio.load(contentHtml);
  const root = $("body");

  for (const selector of STRUCTURAL_JUNK) {
    root.find(selector).remove();
  }

  // Keyword-based junk removal on class/id, but never remove elements that
  // contain most of the article (protects against over-broad matches).
  const totalText = root.text().length || 1;
  root.find("[class], [id]").each((_, el) => {
    const $el = $(el);
    const haystack = `${$el.attr("class") ?? ""} ${$el.attr("id") ?? ""}`.toLowerCase();
    if (!JUNK_KEYWORDS.some((k) => haystack.includes(k))) return;
    if ($el.find("pre, table").length > 0) return;
    if ($el.text().length > totalText * 0.5) return;
    $el.remove();
  });

  normalizeImages($, baseUrl);
  normalizeEmbeds($, baseUrl);
  normalizeLinks($, baseUrl);

  // Drop hidden elements.
  root.find('[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]').each(
    (_, el) => {
      const $el = $(el);
      // Keep aria-hidden wrappers that contain real images (common lazy-load pattern).
      if ($el.find("img").length === 0 && !$el.is("img")) $el.remove();
    }
  );

  return root.html() ?? "";
}

/** Resolves lazy-loading attributes, srcset, and <picture> into plain <img src alt>. */
function normalizeImages($: CheerioAPI, baseUrl: string): void {
  // <picture>: keep only the <img>, preferring the largest <source srcset>.
  $("picture").each((_, el) => {
    const $picture = $(el);
    const img = $picture.find("img").first();
    if (img.length === 0) {
      $picture.remove();
      return;
    }
    const sourceSet = $picture.find("source[srcset]").first().attr("srcset");
    if (sourceSet && !img.attr("src")) {
      const best = largestFromSrcset(sourceSet);
      if (best) img.attr("src", best);
    }
    $picture.replaceWith(img);
  });

  $("img").each((_, el) => {
    const $img = $(el);
    const lazySrc =
      $img.attr("data-src") ??
      $img.attr("data-lazy-src") ??
      $img.attr("data-original") ??
      $img.attr("data-actualsrc");
    const srcset = $img.attr("srcset") ?? $img.attr("data-srcset");

    let src = $img.attr("src");
    // Placeholder/pixel srcs get replaced by lazy or srcset candidates.
    const isPlaceholder =
      !src || src.startsWith("data:") || /\/(spacer|blank|pixel|placeholder)\./i.test(src);
    if (isPlaceholder) {
      src = lazySrc ?? (srcset ? largestFromSrcset(srcset) : undefined);
    } else if (srcset) {
      const best = largestFromSrcset(srcset);
      if (best) src = best;
    }

    // Next.js image optimizer wrappers (/_next/image?url=…) — unwrap to the
    // underlying CDN URL so the markdown doesn't depend on the origin site.
    if (src) {
      const nextImage = src.match(/\/_next\/image\?(?:.*&)?url=([^&]+)/);
      if (nextImage) {
        try {
          src = decodeURIComponent(nextImage[1]);
        } catch {
          // keep the wrapper URL
        }
      }
    }

    const resolved = absolutize(src, baseUrl);
    const width = parseInt($img.attr("width") ?? "", 10);
    const height = parseInt($img.attr("height") ?? "", 10);
    const isTrackingPixel = width === 1 && height === 1;

    if (!resolved || isTrackingPixel) {
      $img.remove();
      return;
    }

    const alt = $img.attr("alt") ?? "";
    $img.replaceWith(`<img src="${resolved}" alt="${alt.replace(/"/g, "&quot;")}">`);
  });
}

/**
 * Converts YouTube / Twitter / Gist embeds into DEV liquid tags
 * ({% youtube ID %} etc.), which DEV renders as real embeds. Anything else
 * becomes a plain link or is dropped.
 */
function normalizeEmbeds($: CheerioAPI, baseUrl: string): void {
  $("iframe").each((_, el) => {
    const $iframe = $(el);
    const src = absolutize($iframe.attr("src") ?? $iframe.attr("data-src"), baseUrl);
    if (!src) {
      $iframe.remove();
      return;
    }
    const youtube = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
    if (youtube) {
      $iframe.replaceWith(`<p>{% youtube ${youtube[1]} %}</p>`);
      return;
    }
    const gist = src.match(/gist\.github\.com\/[\w-]+\/[a-f0-9]+/);
    if (gist) {
      $iframe.replaceWith(`<p>{% gist https://${gist[0]} %}</p>`);
      return;
    }
    const tweet = src.match(/(?:twitter\.com|x\.com)\/(?:[\w]+\/)?status(?:es)?\/(\d+)/);
    if (tweet) {
      $iframe.replaceWith(`<p>{% twitter ${tweet[1]} %}</p>`);
      return;
    }
    if (/twitter\.com|x\.com|youtube/.test(src)) {
      $iframe.replaceWith(`<p><a href="${src}">${src}</a></p>`);
    } else {
      $iframe.remove();
    }
  });

  // Plain YouTube watch links on their own paragraph → liquid tag.
  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const watch = href.match(/youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/);
    if (!watch) return;
    const parent = $a.parent();
    // Only when the link is the paragraph's entire content (an intended embed).
    if (parent.is("p") && parent.text().trim() === $a.text().trim() && parent.children().length === 1) {
      parent.replaceWith(`<p>{% youtube ${watch[1] ?? watch[2]} %}</p>`);
    }
  });

  // Blockquote-style embeds (Twitter/X).
  $("blockquote.twitter-tweet").each((_, el) => {
    const $quote = $(el);
    const tweetLink =
      $quote.find('a[href*="twitter.com"], a[href*="x.com"]').last().attr("href") ?? "";
    const tweet = tweetLink.match(/status(?:es)?\/(\d+)/);
    if (tweet) {
      $quote.replaceWith(`<p>{% twitter ${tweet[1]} %}</p>`);
    } else if (tweetLink) {
      $quote.replaceWith(`<p><a href="${tweetLink}">${tweetLink}</a></p>`);
    }
  });

  // Gist script embeds.
  $('script[src*="gist.github.com"]').each((_, el) => {
    const src = $(el).attr("src")?.replace(/\.js(\?.*)?$/, "");
    if (src) $(el).replaceWith(`<p>{% gist ${src} %}</p>`);
  });
}

/** Absolutizes link hrefs and unwraps obvious tracking redirects. */
function normalizeLinks($: CheerioAPI, baseUrl: string): void {
  $("a").each((_, el) => {
    const $a = $(el);
    let href = $a.attr("href");
    if (!href || href.startsWith("javascript:")) {
      $a.replaceWith($a.text());
      return;
    }
    // Medium-style redirect wrappers.
    const redirect = href.match(/[?&](?:url|redirect|target)=(https?%3A[^&]+)/i);
    if (redirect) {
      try {
        href = decodeURIComponent(redirect[1]);
      } catch {
        // keep original href
      }
    }
    const resolved = absolutize(href, baseUrl);
    if (resolved) {
      $a.attr("href", resolved);
    } else {
      $a.replaceWith($a.text());
    }
  });
}

import type { CheerioAPI } from "cheerio";
import type { ExtractablePlatform } from "@/lib/types";
import { meta } from "@/lib/utils/html";

/** Determines the source platform from the URL host and HTML fingerprints. */
export function detectPlatform(url: string, $: CheerioAPI): ExtractablePlatform {
  const host = new URL(url).hostname.toLowerCase();

  if (host === "medium.com" || host.endsWith(".medium.com")) return "medium";
  if (host === "dev.to") return "devto";
  if (host.endsWith(".hashnode.dev")) return "hashnode";
  if (host.endsWith(".substack.com")) return "substack";
  if (host.endsWith(".blogspot.com")) return "blogger";

  const generator = meta($, "generator")?.toLowerCase() ?? "";
  if (generator.includes("wordpress")) return "wordpress";
  if (generator.includes("ghost")) return "ghost";
  if (generator.includes("blogger")) return "blogger";
  if (generator.includes("medium")) return "medium";

  // Custom-domain fingerprints.
  const head = $("head").html() ?? "";
  if (/substackcdn\.com|substack\.com\/embed/i.test(head)) return "substack";
  if ($('link[href*="wp-content"], link[href*="wp-includes"]').length > 0) return "wordpress";
  if ($('script[src*="wp-content"], script[src*="wp-includes"]').length > 0) return "wordpress";
  if ($(".gh-content, .gh-canvas").length > 0 || /ghost\.(io|org)/i.test(head)) return "ghost";
  if ($('meta[property="al:android:app_name"][content="Medium"]').length > 0) return "medium";
  if ($("#article-body").length > 0 && meta($, "forem:name")) return "devto";

  // Hashnode custom domains: legacy sites embed __NEXT_DATA__, current ones
  // reference cdn.hashnode.com assets and carry hashnode state markers.
  if ($("#__NEXT_DATA__").text().includes("hashnode")) return "hashnode";
  if (
    $('img[src*="cdn.hashnode.com"], link[href*="cdn.hashnode.com"], meta[content*="cdn.hashnode.com"]')
      .length > 0
  ) {
    return "hashnode";
  }

  return "generic";
}

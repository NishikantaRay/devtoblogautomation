import { generateFrontmatter } from "@/lib/devto/frontmatter";
import { demoteBodyHeadings } from "@/lib/markdown/postprocess";
import type { SeriesPost } from "./types";

/**
 * Renders a series post into a complete DEV.to article document.
 *
 * Frontmatter is produced by the same generator the URL converter uses, so
 * generated posts and converted posts are byte-identical in shape — the
 * scheduler and the review screen can't tell them apart.
 *
 * `published: false` is always emitted here; the worker flips it at publish
 * time based on the post's own publishLive flag.
 */
export function renderSeriesPost(post: SeriesPost): string {
  const frontmatter = generateFrontmatter({
    title: post.title,
    description: post.description,
    tags: post.tags,
  });
  // DEV renders the frontmatter title as the page H1 and warns about any H1
  // in the body, so shift headings down if a post ever introduces one.
  const body = demoteBodyHeadings(post.body.trim()).trim();
  return `${frontmatter}\n\n${body}\n`;
}

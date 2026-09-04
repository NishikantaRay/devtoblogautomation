/**
 * A generated blog series: long-form technical posts written from a project's
 * documentation, seeded into the schedule as drafts for day-by-day review.
 */
export interface SeriesPost {
  /** 1-based position in the reading order. */
  order: number;
  title: string;
  /** DEV.to description (<=155 chars, shown in listings and social cards). */
  description: string;
  /** Max 4, lowercase alphanumeric — DEV's rules. */
  tags: string[];
  /** The docs page this was written from, recorded for provenance. */
  source: string;
  /** Markdown body, without frontmatter. */
  body: string;
}

/** A named collection of posts that publish as one run. */
export interface Series {
  /** Stable slug, used for the schedule `source` prefix and CLI selection. */
  key: string;
  /** Human name, shown by the seeder and on the review screen. */
  name: string;
  posts: SeriesPost[];
}

/**
 * Scheduling layer: queue converted articles and publish them to DEV.to at a
 * chosen time. The article document (frontmatter + body) is stored verbatim,
 * so whatever the converter produced — including user edits — is what ships.
 */

/**
 * `draft` is the review gate: a post sits here until you approve it, and the
 * worker never claims it no matter what its publishAt says. Approving moves it
 * to `pending`, which is the only state that becomes eligible to publish.
 */
export type ScheduleStatus =
  | "draft"
  | "pending"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export interface ScheduledPost {
  id: string;
  /** Full article document: frontmatter + markdown body. */
  markdown: string;
  /** Title lifted from frontmatter, for listing without re-parsing. */
  title: string;
  /** ISO-8601 UTC instant at which the post becomes due. */
  publishAt: string;
  /**
   * When true the worker flips `published: true` in the frontmatter before
   * sending, so the post goes live rather than landing as a draft.
   */
  publishLive: boolean;
  status: ScheduleStatus;
  /** DEV article id, once created. Reused so a retry updates, not duplicates. */
  articleId?: number;
  /** Public DEV URL, once published. */
  url?: string;
  /** Failure reason from the last attempt. */
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  /** Where this post came from, e.g. a docs page it was generated from. */
  source?: string;
  /** Ordering hint for generated series, so review follows a sensible arc. */
  seriesOrder?: number;
}

/** Attempts a post gets before the worker gives up and marks it failed. */
export const MAX_ATTEMPTS = 3;

/** A post stuck in `publishing` longer than this is treated as abandoned. */
export const STALE_PUBLISHING_MS = 5 * 60_000;

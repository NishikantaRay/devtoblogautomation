import { publishToDev, PublishError } from "@/lib/devto/publish";
import { setPublishedFlag } from "@/lib/devto/frontmatter";
import { repairDocument } from "@/lib/devto/repair";
import { claimDuePosts, updatePost } from "./store";
import { MAX_ATTEMPTS, type ScheduledPost } from "./types";

export { setPublishedFlag };

export interface RunSummary {
  claimed: number;
  published: number;
  failed: number;
  retrying: number;
  results: Array<{ id: string; title: string; ok: boolean; url?: string; error?: string }>;
}

/**
 * Publishes every post that is due. Safe to call repeatedly: due posts are
 * claimed atomically before any network call, so overlapping runs won't
 * double-publish, and each post carries its DEV article id so a retry updates
 * the existing article instead of creating a duplicate.
 */
export async function runDuePosts(apiKey: string, now = new Date()): Promise<RunSummary> {
  const due = await claimDuePosts(now);
  const summary: RunSummary = {
    claimed: due.length,
    published: 0,
    failed: 0,
    retrying: 0,
    results: [],
  };

  for (const post of due) {
    const outcome = await publishOne(apiKey, post);
    summary.results.push(outcome);
    if (outcome.ok) summary.published += 1;
    else if (outcome.terminal) summary.failed += 1;
    else summary.retrying += 1;
  }

  return summary;
}

interface Outcome {
  id: string;
  title: string;
  ok: boolean;
  url?: string;
  error?: string;
  /** True when the post won't be retried again. */
  terminal?: boolean;
}

async function publishOne(apiKey: string, post: ScheduledPost): Promise<Outcome> {
  const attempts = post.attempts + 1;
  // Repair before sending: a scheduled post publishes unattended, so a
  // frontmatter problem would otherwise fail silently at 9am.
  const markdown = repairDocument(setPublishedFlag(post.markdown, post.publishLive)).document;

  try {
    const result = await publishToDev(apiKey, markdown, post.articleId);
    await updatePost(post.id, {
      status: "published",
      articleId: result.id,
      url: result.url,
      attempts,
      error: undefined,
    });
    return { id: post.id, title: post.title, ok: true, url: result.url };
  } catch (error) {
    const message = error instanceof PublishError ? error.message : "Publishing failed.";

    // A stale article id means the DEV draft was deleted. Drop the id so the
    // next attempt creates a fresh article rather than failing forever.
    const staleArticle = error instanceof PublishError && error.status === 404;

    // A rejected key or rejected content won't fix itself on a retry.
    const permanent =
      error instanceof PublishError && (error.status === 401 || error.status === 422);

    const exhausted = attempts >= MAX_ATTEMPTS;
    const terminal = permanent || exhausted;

    await updatePost(post.id, {
      // Back to pending so a later run picks it up again.
      status: terminal ? "failed" : "pending",
      attempts,
      error: message,
      articleId: staleArticle ? undefined : post.articleId,
    });

    return { id: post.id, title: post.title, ok: false, error: message, terminal };
  }
}

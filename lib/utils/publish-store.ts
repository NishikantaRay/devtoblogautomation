import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";

/**
 * Client-side memory of which DEV article each post maps to, keyed by
 * canonical URL (falling back to title). Lets re-publishing update the
 * existing draft instead of creating a duplicate. localStorage only.
 */
const STORE_KEY = "devto-published-articles";

/** Stable identity for an article document: canonical URL, else title. */
export function publishKey(markdown: string): string | undefined {
  const { frontmatter } = splitFrontmatter(markdown);
  return (
    frontmatterValue(frontmatter, "canonical_url") ??
    frontmatterValue(frontmatter, "title")
  );
}

function readStore(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getPublishedArticleId(markdown: string): number | undefined {
  const key = publishKey(markdown);
  if (!key) return undefined;
  const id = readStore()[key];
  return typeof id === "number" ? id : undefined;
}

export function rememberPublishedArticle(markdown: string, articleId: number): void {
  const key = publishKey(markdown);
  if (!key) return;
  const store = readStore();
  store[key] = articleId;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full/unavailable — republish will just create a new draft.
  }
}

export function forgetPublishedArticle(markdown: string): void {
  const key = publishKey(markdown);
  if (!key) return;
  const store = readStore();
  delete store[key];
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export interface PublishResponse {
  ok: boolean;
  url?: string;
  title?: string;
  updated?: boolean;
  message?: string;
}

/**
 * Publishes one article, transparently updating the known DEV draft when one
 * exists and falling back to create if that draft was deleted on DEV.
 */
export async function publishArticle(apiKey: string, markdown: string): Promise<PublishResponse> {
  const call = async (articleId?: number) => {
    const response = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, markdown, articleId }),
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    const knownId = getPublishedArticleId(markdown);
    let { status, data } = await call(knownId);

    // Stored draft was deleted on DEV — forget it and create a fresh one.
    if (knownId && status === 404) {
      forgetPublishedArticle(markdown);
      ({ status, data } = await call(undefined));
    }

    if (status >= 400 || data.error) {
      return { ok: false, message: data.error?.message ?? "Publishing failed." };
    }
    rememberPublishedArticle(markdown, data.result.id);
    return {
      ok: true,
      url: data.result.url,
      title: data.result.title,
      updated: Boolean(data.updated),
    };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Please try again." };
  }
}

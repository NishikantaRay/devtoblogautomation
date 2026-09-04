import axios, { AxiosError } from "axios";

/** Overridable so the scheduler can be exercised against a stub in tests. */
const DEV_API_URL = process.env.DEVTO_API_URL ?? "https://dev.to/api/articles";
const TIMEOUT_MS = 15_000;

export interface PublishResult {
  id: number;
  url: string;
  title: string;
}

export class PublishError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "PublishError";
  }
}

/**
 * Creates — or, when `articleId` is given, updates — an article on DEV.to via
 * the Forem API. The markdown must include frontmatter; DEV reads title/tags/
 * published/canonical from it, so with `published: false` this creates a
 * draft. The API key is relayed only — never stored or logged.
 */
export async function publishToDev(
  apiKey: string,
  markdown: string,
  articleId?: number
): Promise<PublishResult> {
  try {
    const config = {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/vnd.forem.api-v1+json",
      },
      timeout: TIMEOUT_MS,
    };
    const payload = { article: { body_markdown: markdown } };
    const response = articleId
      ? await axios.put(`${DEV_API_URL}/${articleId}`, payload, config)
      : await axios.post(DEV_API_URL, payload, config);
    const { id, url, title } = response.data ?? {};
    if (typeof id !== "number" || typeof url !== "string") {
      throw new PublishError(502, "DEV returned an unexpected response.");
    }
    return { id, url, title: typeof title === "string" ? title : "" };
  } catch (error) {
    if (error instanceof PublishError) throw error;
    const axiosError = error as AxiosError<{ error?: string }>;
    if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
      throw new PublishError(504, "DEV took too long to respond. Please try again.");
    }
    const status = axiosError.response?.status;
    const devMessage = axiosError.response?.data?.error;
    if (status === 401) {
      throw new PublishError(401, "DEV rejected the API key. Check it and try again.");
    }
    if (status === 404) {
      // Stale article id — the draft was deleted on DEV.
      throw new PublishError(404, "The previously created DEV article no longer exists.");
    }
    if (status === 422) {
      throw new PublishError(
        422,
        devMessage
          ? `DEV rejected the article: ${devMessage}`
          : "DEV rejected the article content."
      );
    }
    if (status === 429) {
      throw new PublishError(429, "DEV is rate-limiting requests. Wait a moment and retry.");
    }
    throw new PublishError(502, "Couldn't reach DEV. Please try again.");
  }
}

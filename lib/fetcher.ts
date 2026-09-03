import axios, { AxiosError } from "axios";
import { ConversionError } from "@/lib/types";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface FetchResult {
  html: string;
  /** Final URL after redirects. */
  finalUrl: string;
}

/** Downloads a page as HTML, following redirects. Throws typed ConversionError on failure. */
export async function fetchHtml(url: URL): Promise<FetchResult> {
  try {
    const response = await axios.get<string>(url.toString(), {
      headers: BROWSER_HEADERS,
      timeout: TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: MAX_BODY_BYTES,
      responseType: "text",
      // We map status codes to typed errors ourselves.
      validateStatus: () => true,
    });

    if (response.status === 404 || response.status === 410) {
      throw new ConversionError("NOT_FOUND");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ConversionError("PRIVATE");
    }
    if (response.status >= 400) {
      throw new ConversionError("NETWORK", `The site responded with status ${response.status}.`);
    }

    const contentType = String(response.headers["content-type"] ?? "");
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new ConversionError(
        "INVALID_HTML",
        `Expected an HTML page but got ${contentType.split(";")[0]}.`
      );
    }

    const html = response.data;
    if (typeof html !== "string" || !html.trim()) {
      throw new ConversionError("INVALID_HTML");
    }

    const finalUrl =
      (response.request?.res?.responseUrl as string | undefined) ?? url.toString();
    return { html, finalUrl };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    const axiosError = error as AxiosError;
    if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
      throw new ConversionError("TIMEOUT");
    }
    throw new ConversionError("NETWORK");
  }
}

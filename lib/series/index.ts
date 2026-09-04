import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Series, SeriesPost } from "./types";

/**
 * Series content is loaded from disk at runtime rather than statically
 * imported, because `lib/series/<key>/` is gitignored — the posts are local
 * content, not part of the repo. A clone with no content directories still
 * builds and runs; the seeder simply reports that nothing is available.
 *
 * Server-side only (the seeder script and the API). The browser never imports
 * this module.
 */

/** Display names for known series keys; unknown keys fall back to the key. */
const SERIES_NAMES: Record<string, string> = {
  insighttrack: "InsightTrack internals",
  duckdb: "DuckDB: basics to advanced",
};

/**
 * Preferred listing order. Directories are read alphabetically, so without
 * this the order would depend on folder names rather than intent. Anything
 * not listed sorts after these, alphabetically.
 */
const SERIES_ORDER = ["insighttrack", "duckdb"];

const CONTENT_ROOT = path.join(process.cwd(), "lib", "series");

/** Directories that are part of the module itself, never series content. */
const NOT_CONTENT = new Set(["node_modules"]);

function contentDirs(): string[] {
  try {
    return readdirSync(CONTENT_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !NOT_CONTENT.has(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => {
        const ia = SERIES_ORDER.indexOf(a);
        const ib = SERIES_ORDER.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });
  } catch {
    // No content at all — a fresh clone. Not an error.
    return [];
  }
}

async function loadSeries(key: string): Promise<Series | undefined> {
  const dir = path.join(CONTENT_ROOT, key);
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((name) => /\.ts$/.test(name) && !name.endsWith(".d.ts"))
      .sort();
  } catch {
    return undefined;
  }
  if (files.length === 0) return undefined;

  const posts: SeriesPost[] = [];
  for (const file of files) {
    // Absolute path via file:// URL. A bundler can't statically analyse this,
    // which is exactly right here: the content is gitignored and may be
    // absent, so it must be resolved at runtime rather than bundled.
    const specifier = pathToFileURL(path.join(dir, file)).href;
    const mod = (await import(/* webpackIgnore: true */ specifier)) as {
      post?: SeriesPost;
    };
    if (mod.post) posts.push(mod.post);
  }
  if (posts.length === 0) return undefined;

  return {
    key,
    name: SERIES_NAMES[key] ?? key,
    posts: posts.sort((a, b) => a.order - b.order),
  };
}

let cache: Series[] | undefined;

/** Every series with content present on disk, cached after the first read. */
export async function allSeries(): Promise<Series[]> {
  if (cache) return cache;
  const loaded: Series[] = [];
  for (const key of contentDirs()) {
    const series = await loadSeries(key);
    if (series) loaded.push(series);
  }
  cache = loaded;
  return loaded;
}

/** Looks up a series by key, e.g. from a --series flag. */
export async function findSeries(key: string): Promise<Series | undefined> {
  return (await allSeries()).find((s) => s.key === key);
}

/** A series' posts in reading order. */
export function orderedPosts(series: Series): SeriesPost[] {
  return [...series.posts].sort((a, b) => a.order - b.order);
}

export type { Series, SeriesPost };

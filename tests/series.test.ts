import { beforeAll, describe, expect, it } from "vitest";
import { allSeries, findSeries, orderedPosts, type Series } from "@/lib/series";
import { renderSeriesPost } from "@/lib/series/render";
import { relativeWhen } from "@/lib/schedule/status";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";
import { setPublishedFlag } from "@/lib/schedule/runner";

/**
 * Series content lives in gitignored directories, so a fresh clone has none.
 * These tests validate whatever is present and skip cleanly when nothing is —
 * they must not fail CI just because the content isn't checked in.
 */
let series: Series[] = [];

beforeAll(async () => {
  series = await allSeries();
});

describe("series registry", () => {
  it("loads without throwing when content is absent", () => {
    expect(Array.isArray(series)).toBe(true);
  });

  it("gives every loaded series a unique key and at least one post", () => {
    expect(new Set(series.map((s) => s.key)).size).toBe(series.length);
    for (const s of series) expect(s.posts.length, s.key).toBeGreaterThan(0);
  });

  it("numbers each series 1..n with no gaps", () => {
    for (const s of series) {
      expect(orderedPosts(s).map((p) => p.order), s.key).toEqual(
        Array.from({ length: s.posts.length }, (_, i) => i + 1)
      );
    }
  });

  it("finds a loaded series by key and rejects unknown ones", async () => {
    expect(await findSeries("definitely-not-a-series")).toBeUndefined();
    for (const s of series) {
      expect((await findSeries(s.key))?.key).toBe(s.key);
    }
  });
});

describe("series content", () => {
  it("keeps descriptions within DEV's 155-char limit", () => {
    for (const s of series) {
      for (const post of s.posts) {
        expect(post.description.length, post.title).toBeLessThanOrEqual(155);
      }
    }
  });

  it("uses at most 4 unique lowercase alphanumeric tags", () => {
    for (const s of series) {
      for (const post of s.posts) {
        expect(post.tags.length, post.title).toBeLessThanOrEqual(4);
        expect(new Set(post.tags).size, post.title).toBe(post.tags.length);
        for (const tag of post.tags) expect(tag, post.title).toMatch(/^[a-z0-9]+$/);
      }
    }
  });

  it("has unique titles within a series and substantial bodies", () => {
    for (const s of series) {
      expect(new Set(s.posts.map((p) => p.title)).size, s.key).toBe(s.posts.length);
      for (const post of s.posts) {
        expect(post.body.length, post.title).toBeGreaterThan(2000);
      }
    }
  });

  it("balances code fences", () => {
    for (const s of series) {
      for (const post of s.posts) {
        const fences = post.body.match(/```/g)?.length ?? 0;
        expect(fences % 2, `${post.title} has unbalanced fences`).toBe(0);
      }
    }
  });

  it("renders to a valid, never-live DEV document", () => {
    for (const s of series) {
      for (const post of s.posts) {
        const doc = renderSeriesPost(post);
        const { frontmatter, body } = splitFrontmatter(doc);
        expect(frontmatter, post.title).not.toBe("");
        expect(frontmatterValue(frontmatter, "title")).toBe(post.title);
        // The worker flips this at publish time; rendering never does.
        expect(doc, post.title).toContain("published: false");
        expect(body.length).toBeGreaterThan(1000);
      }
    }
  });

  it("renders no H1 in the body — DEV's title is the page H1", () => {
    for (const s of series) {
      for (const post of s.posts) {
        const { body } = splitFrontmatter(renderSeriesPost(post));
        // Ignore "#" lines inside fenced code, which are comments.
        const outsideFences = body
          .split(/^`{3,}[^\n]*\n[\s\S]*?^`{3,}\s*$/m)
          .filter((_, i) => i % 2 === 0)
          .join("\n");
        expect(outsideFences.split("\n").some((l) => /^# /.test(l)), post.title).toBe(
          false
        );
      }
    }
  });

  it("can be flipped live by the worker", () => {
    const post = series[0]?.posts[0];
    if (!post) return;
    const live = setPublishedFlag(renderSeriesPost(post), true);
    expect(live).toContain("published: true");
    expect(live).toContain(post.title);
  });
});

describe("relativeWhen", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("picks sensible units in both directions", () => {
    expect(relativeWhen(at(5 * 60_000), now)).toBe("in 5 minutes");
    expect(relativeWhen(at(90 * 60_000), now)).toBe("in 2 hours");
    expect(relativeWhen(at(2 * 86_400_000), now)).toBe("in 2 days");
    expect(relativeWhen(at(-2 * 3_600_000), now)).toBe("2 hours ago");
    expect(relativeWhen(at(-3 * 86_400_000), now)).toBe("3 days ago");
  });
});

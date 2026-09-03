import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { detectPlatform } from "@/lib/detect";
import { convertPastedHtml } from "@/lib/pipeline";
import type { Platform } from "@/lib/types";

interface Fixture {
  file: string;
  url: string;
  platform: Platform;
  titleContains: string;
  minMarkdown: number;
  author?: string;
}

/** Real pages captured from each platform (see README dev utilities). */
const FIXTURES: Fixture[] = [
  {
    file: "devto.html",
    url: "https://dev.to/tykok/the-new-http-method-query-2bec",
    platform: "devto",
    titleContains: "QUERY",
    minMarkdown: 3000,
  },
  {
    file: "ghost.html",
    url: "https://www.troyhunt.com/its-a-new-blog/",
    platform: "ghost",
    titleContains: "new blog",
    minMarkdown: 5000,
    author: "Troy Hunt",
  },
  {
    file: "wordpress.html",
    url: "https://wordpress.org/news/2026/07/wordpress-7-0-2-release/",
    platform: "wordpress",
    titleContains: "WordPress 7.0.2",
    minMarkdown: 1500,
  },
  {
    file: "blogger.html",
    url: "https://blogger.googleblog.com/2016/04/an-update-to-blogger-post-editor-to.html",
    platform: "blogger",
    titleContains: "Blogger post editor",
    minMarkdown: 800,
  },
  {
    file: "hashnode.html",
    url: "https://townhall.hashnode.com/8-features-on-hashnode-you-didnt-know-about",
    platform: "hashnode",
    titleContains: "8 Features",
    minMarkdown: 1500,
    author: "Milica Maksimović",
  },
  {
    file: "medium.html",
    url: "https://medium.com/blog-asodesk-com/5-life-hacks-on-app-optimization-on-app-store-and-google-play-997868449e63",
    platform: "medium",
    titleContains: "5 life hacks",
    minMarkdown: 2000,
    author: "Katerina Belohvostova",
  },
  {
    file: "substack.html",
    url: "https://astralcodexten.substack.com/p/the-media-very-rarely-lies",
    platform: "substack",
    titleContains: "Media Very Rarely Lies",
    minMarkdown: 5000,
    author: "Scott Alexander",
  },
];

function loadFixture(file: string): string {
  return readFileSync(path.join(__dirname, "fixtures", file), "utf8");
}

describe.each(FIXTURES)("$platform fixture", (fixture) => {
  const html = loadFixture(fixture.file);
  const $ = cheerio.load(html);

  it("detects the platform", () => {
    expect(detectPlatform(fixture.url, $)).toBe(fixture.platform);
  });

  it("extracts title, metadata, and a substantial markdown body", () => {
    // Full pipeline (including the generic fallback for header-only articles).
    const result = convertPastedHtml(html, fixture.url);
    expect(result.platform).toBe(fixture.platform);
    expect(result.metadata.title).toContain(fixture.titleContains);
    if (fixture.author) {
      expect(result.metadata.author).toBe(fixture.author);
    }
    expect(result.markdown.length).toBeGreaterThan(fixture.minMarkdown);
    // No script/style residue should survive conversion.
    expect(result.markdown).not.toMatch(/<script|<style/i);
  });
});

describe("convertPastedHtml", () => {
  it("converts pasted HTML end-to-end and picks up the embedded canonical URL", () => {
    const result = convertPastedHtml(loadFixture("devto.html"));
    expect(result.platform).toBe("devto");
    expect(result.metadata.canonicalUrl).toContain("dev.to");
    expect(result.markdown.length).toBeGreaterThan(3000);
    expect(result.full.startsWith("---\n")).toBe(true);
  });

  it("omits canonical_url when the source is unknown", () => {
    const html = `<html><head><title>Hello</title></head><body><article><h1>Hello</h1>${"<p>Some paragraph content here.</p>".repeat(
      20
    )}</article></body></html>`;
    const result = convertPastedHtml(html);
    expect(result.metadata.canonicalUrl).toBeUndefined();
    expect(result.frontmatter).not.toContain("canonical_url");
  });

  it("rejects non-HTML input", () => {
    expect(() => convertPastedHtml("just plain text")).toThrow();
  });
});

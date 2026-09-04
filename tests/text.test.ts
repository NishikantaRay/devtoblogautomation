import { describe, expect, it } from "vitest";
import { convertText } from "@/lib/text/convert";
import { ConversionError } from "@/lib/types";
import { splitFrontmatter, frontmatterValue } from "@/lib/devto/frontmatter";

const LONG = "This paragraph exists purely to clear the minimum body length rule.";

describe("convertText — titles", () => {
  it("takes a leading markdown heading and removes it from the body", () => {
    const r = convertText({ text: `# My Great Post\n\n${LONG}` });
    expect(r.metadata.title).toBe("My Great Post");
    expect(r.markdown).not.toContain("# My Great Post");
    expect(r.markdown).toContain("This paragraph exists");
  });

  it("treats a short unpunctuated first line as the title", () => {
    const r = convertText({ text: `Getting Started with Rust\n\n${LONG}` });
    expect(r.metadata.title).toBe("Getting Started with Rust");
    expect(r.markdown).not.toContain("Getting Started with Rust");
  });

  it("keeps a sentence-like first line in the body", () => {
    const text = `This is a full sentence that opens the article, and it ends with a period.\n\n${LONG}`;
    const r = convertText({ text });
    expect(r.metadata.title).toBe("Untitled");
    expect(r.markdown).toContain("This is a full sentence");
  });

  it("prefers an explicit title and leaves the body untouched", () => {
    const r = convertText({ text: `# Inferred\n\n${LONG}`, title: "Explicit" });
    expect(r.metadata.title).toBe("Explicit");
    // The heading was not consumed, since it did not become the title.
    expect(r.markdown).toContain("# Inferred");
  });
});

describe("convertText — existing frontmatter", () => {
  const doc = [
    "---",
    'title: "From Frontmatter"',
    "tags: react, hooks",
    'description: "A stored description"',
    "canonical_url: https://example.com/post",
    "---",
    "",
    LONG,
  ].join("\n");

  it("reuses title, tags, description and canonical url", () => {
    const r = convertText({ text: doc });
    expect(r.metadata.title).toBe("From Frontmatter");
    expect(r.metadata.tags).toEqual(["react", "hooks"]);
    expect(r.metadata.description).toBe("A stored description");
    expect(r.metadata.canonicalUrl).toBe("https://example.com/post");
  });

  it("does not duplicate the frontmatter into the body", () => {
    const r = convertText({ text: doc });
    expect(r.markdown).not.toContain("---");
    expect(r.markdown).not.toContain("title:");
  });

  it("lets explicit input win over stored frontmatter", () => {
    const r = convertText({ text: doc, title: "Override", tags: ["custom"] });
    expect(r.metadata.title).toBe("Override");
    expect(r.metadata.tags).toEqual(["custom"]);
  });
});

describe("convertText — heading levels", () => {
  // DEV renders the frontmatter title as the page H1 and warns about any H1
  // left in the body, so the body must never contain one.
  it("demotes body H1s so only the frontmatter title is an H1", () => {
    const r = convertText({
      text: [
        "# The Article Title",
        "",
        "Opening prose long enough to clear the minimum body length rule.",
        "",
        "# 1. First Section",
        "",
        "Body text for the first section goes here.",
        "",
        "# 2. Second Section",
        "",
        "Body text for the second section goes here.",
      ].join("\n"),
    });
    expect(r.metadata.title).toBe("The Article Title");
    expect(r.markdown).toContain("## 1. First Section");
    expect(r.markdown).toContain("## 2. Second Section");
    expect(r.markdown.split("\n").some((l) => /^# /.test(l))).toBe(false);
  });

  it("preserves relative hierarchy when demoting", () => {
    const r = convertText({
      text: `# Title\n\n${LONG}\n\n# Section\n\nText.\n\n## Subsection\n\nMore text here.`,
    });
    expect(r.markdown).toContain("## Section");
    expect(r.markdown).toContain("### Subsection");
  });

  it("leaves comments inside code fences alone", () => {
    const r = convertText({
      text: [
        "# Title",
        "",
        LONG,
        "",
        "# Section",
        "",
        "```bash",
        "# a shell comment, not a heading",
        "echo hi",
        "```",
      ].join("\n"),
    });
    expect(r.markdown).toContain("# a shell comment, not a heading");
    expect(r.markdown).toContain("## Section");
  });

  it("does not demote when the body has no H1", () => {
    const r = convertText({
      text: `# Title\n\n${LONG}\n\n## Already H2\n\nText.`,
    });
    expect(r.markdown).toContain("## Already H2");
    expect(r.markdown).not.toContain("### Already H2");
  });
});

describe("convertText — description", () => {
  it("uses the first prose sentence", () => {
    const r = convertText({
      text: "# Title\n\nDuckDB is an embedded analytical database. It runs in your process.",
    });
    expect(r.metadata.description).toBe("DuckDB is an embedded analytical database.");
  });

  it("skips headings, lists and code when looking for prose", () => {
    const text = [
      "# Title",
      "",
      "## A subheading",
      "",
      "- a list item that is quite long but still a list item",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "The real opening sentence of the article lives here.",
    ].join("\n");
    expect(convertText({ text }).metadata.description).toBe(
      "The real opening sentence of the article lives here."
    );
  });

  it("stays within DEV's 155-character limit", () => {
    const long = `${"word ".repeat(80)}end.`;
    const r = convertText({ text: `# Title\n\n${long}` });
    expect(r.metadata.description!.length).toBeLessThanOrEqual(155);
  });
});

describe("convertText — tags", () => {
  it("favours code fence languages and title words over prose", () => {
    const r = convertText({
      text:
        "# Why I Switched to DuckDB\n\nI had a large CSV and a question about it. " +
        "DuckDB answered it in one line.\n\n```sql\nSELECT 1;\n```",
    });
    expect(r.metadata.tags).toContain("duckdb");
    expect(r.metadata.tags).toContain("sql");
  });

  it("never exceeds 4 tags and keeps them DEV-safe", () => {
    const r = convertText({
      text: "# React Hooks Redux Testing Webpack Babel\n\n" + LONG,
    });
    expect(r.metadata.tags.length).toBeLessThanOrEqual(4);
    for (const tag of r.metadata.tags) expect(tag).toMatch(/^[a-z0-9]+$/);
  });

  it("drops filler words and measurements rather than tagging them", () => {
    const r = convertText({
      text: `# Getting Started: A Guide to 2GB Files\n\n${LONG}`,
    });
    for (const noise of ["getting", "started", "guide", "2gb"]) {
      expect(r.metadata.tags).not.toContain(noise);
    }
  });
});

describe("convertText — output shape", () => {
  it("produces a document the rest of the app can consume", () => {
    const r = convertText({ text: `# Hello World\n\n${LONG}` });
    expect(r.platform).toBe("text");
    expect(r.full).toBe(`${r.frontmatter}\n\n${r.markdown}`);

    const { frontmatter, body } = splitFrontmatter(r.full);
    expect(frontmatterValue(frontmatter, "title")).toBe("Hello World");
    // Always a draft on creation; publishing flips this.
    expect(frontmatter).toContain("published: false");
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it("carries through canonical url and cover image", () => {
    const r = convertText({
      text: `# Title\n\n${LONG}`,
      canonicalUrl: "https://example.com/x",
      coverImage: "https://example.com/c.png",
    });
    expect(r.frontmatter).toContain("canonical_url: https://example.com/x");
    expect(r.frontmatter).toContain("cover_image: https://example.com/c.png");
  });
});

describe("convertText — rejections", () => {
  it("rejects empty input", () => {
    expect(() => convertText({ text: "   " })).toThrow(ConversionError);
  });

  it("rejects text too short to be an article", () => {
    expect(() => convertText({ text: "# Title\n\ntoo short" })).toThrow(ConversionError);
  });
});

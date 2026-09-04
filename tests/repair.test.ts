import { describe, expect, it } from "vitest";
import { repairDocument } from "@/lib/devto/repair";
import {
  splitFrontmatter,
  frontmatterValue,
  setPublishedFlag,
} from "@/lib/devto/frontmatter";

const title = (doc: string) => {
  const { frontmatter } = splitFrontmatter(doc);
  return frontmatterValue(frontmatter, "title");
};

describe("repairDocument — the YAML errors DEV reports", () => {
  it("closes an unterminated quoted title", () => {
    // DEV: "found unexpected end of stream while scanning a quoted scalar"
    const broken = '---\ntitle: "AI Skills Are Not Just Prompts\n---\n\nBody text here.';
    const { document } = repairDocument(broken);
    expect(title(document)).toBe("AI Skills Are Not Just Prompts");
    expect(document).toContain('title: "AI Skills Are Not Just Prompts"');
  });

  it("escapes inner quotes rather than leaving them to break YAML", () => {
    const { document } = repairDocument('---\ntitle: "He said "hello" loudly"\n---\n\nBody.');
    expect(title(document)).toContain("hello");
    // Every inner quote must be escaped for the value to be one scalar.
    const line = document.split("\n").find((l) => l.startsWith("title:"))!;
    expect(line.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it("converts smart quotes to straight ones", () => {
    const { document, fixes } = repairDocument("---\ntitle: \u201CMy Post\u201D\n---\n\nBody.");
    expect(title(document)).toBe("My Post");
    expect(fixes.join(" ")).toContain("smart quotes");
  });

  it("handles a title ending in a backslash", () => {
    const { document } = repairDocument('---\ntitle: "Path C:\\\\"\n---\n\nBody.');
    expect(title(document)).toBeTruthy();
  });
});

describe("repairDocument — titles", () => {
  it("takes the title from the first heading when frontmatter is absent", () => {
    const { document, fixes } = repairDocument("# My Great Post\n\nBody content here.");
    expect(title(document)).toBe("My Great Post");
    expect(fixes.join(" ")).toContain("first heading");
  });

  it("falls back to Untitled when there is nothing to use", () => {
    const { document, fixes } = repairDocument("Just some body prose with no heading.");
    expect(title(document)).toBe("Untitled");
    expect(fixes.join(" ")).toContain("Untitled");
  });

  it("ignores headings inside code fences", () => {
    const doc = "```bash\n# not a title\n```\n\n# Real Title\n\nBody.";
    expect(title(repairDocument(doc).document)).toBe("Real Title");
  });
});

describe("repairDocument — DEV field rules", () => {
  it("caps tags at 4 and normalizes them", () => {
    const { document } = repairDocument(
      '---\ntitle: "T"\ntags: Machine Learning, AI-Ops, web dev, four, five\n---\n\nBody.'
    );
    const tags = frontmatterValue(splitFrontmatter(document).frontmatter, "tags")!;
    const list = tags.split(",").map((t) => t.trim());
    expect(list).toHaveLength(4);
    for (const tag of list) expect(tag).toMatch(/^[a-z0-9]+$/);
  });

  it("accepts list-syntax tags", () => {
    const { document } = repairDocument('---\ntitle: "T"\ntags: [react, hooks]\n---\n\nBody.');
    expect(frontmatterValue(splitFrontmatter(document).frontmatter, "tags")).toBe("react, hooks");
  });

  it("emits published as a bare boolean", () => {
    const { document } = repairDocument('---\ntitle: "T"\npublished: "true"\n---\n\nBody.');
    expect(document).toContain("published: true");
    expect(document).not.toContain('published: "true"');
  });

  it("trims an over-long description", () => {
    const long = "x".repeat(300);
    const { document } = repairDocument(`---\ntitle: "T"\ndescription: "${long}"\n---\n\nBody.`);
    const desc = frontmatterValue(splitFrontmatter(document).frontmatter, "description")!;
    expect(desc.length).toBeLessThanOrEqual(155);
  });

  it("keeps keys it does not recognize", () => {
    const { document } = repairDocument('---\ntitle: "T"\ncustom_key: value\n---\n\nBody.');
    expect(document).toContain("custom_key: value");
  });
});

describe("repairDocument — headings and body", () => {
  it("demotes body H1s so only the title is an H1", () => {
    const doc = '---\ntitle: "T"\n---\n\n# Section One\n\nText.\n\n## Sub\n\nMore.';
    const { document, fixes } = repairDocument(doc);
    expect(document).toContain("## Section One");
    expect(document).toContain("### Sub");
    expect(fixes.join(" ")).toContain("Demoted");
  });

  it("never alters the article's words", () => {
    const body = "The body text must survive verbatim, including `code` and [links](http://x).";
    const { document } = repairDocument(`---\ntitle: "Broken\n---\n\n${body}`);
    expect(document).toContain(body);
  });

  it("reports no fixes for an already-valid document", () => {
    const good = '---\ntitle: "Good Post"\npublished: false\ntags: react\n---\n\nBody content.\n';
    expect(repairDocument(good).fixes).toEqual([]);
  });

  it("is idempotent — repairing twice changes nothing further", () => {
    const once = repairDocument('---\ntitle: "Broken\n---\n\n# H1\n\nBody.').document;
    const twice = repairDocument(once);
    expect(twice.document).toBe(once);
    expect(twice.fixes).toEqual([]);
  });
});

describe("publishing live vs draft", () => {
  const doc = '---\ntitle: "T"\npublished: false\n---\n\nBody content.';

  it("sets published: true when going live", () => {
    const out = repairDocument(setPublishedFlag(doc, true)).document;
    expect(out).toContain("published: true");
    expect(out).not.toContain("published: false");
  });

  it("keeps published: false for a draft", () => {
    expect(repairDocument(setPublishedFlag(doc, false)).document).toContain(
      "published: false"
    );
  });

  it("survives repair of a broken document", () => {
    // The live choice must not be lost when the frontmatter also needs fixing.
    const broken = '---\ntitle: "Broken\n---\n\nBody content.';
    const out = repairDocument(setPublishedFlag(broken, true)).document;
    expect(out).toContain("published: true");
    expect(frontmatterValue(splitFrontmatter(out).frontmatter, "title")).toBe("Broken");
  });
});

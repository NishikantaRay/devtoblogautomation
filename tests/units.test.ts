import { describe, expect, it } from "vitest";
import { demoteBodyHeadings, postprocessMarkdown } from "@/lib/markdown/postprocess";
import { cleanArticleHtml } from "@/lib/cleaner";
import { htmlToMarkdown } from "@/lib/markdown/convert";
import {
  generateFrontmatter,
  splitFrontmatter,
  frontmatterValue,
  normalizeDocument,
} from "@/lib/devto/frontmatter";
import { validateUrl, largestFromSrcset } from "@/lib/utils/url";
import { isRateLimited } from "@/lib/utils/rate-limit";

describe("postprocessMarkdown", () => {
  it("collapses runs of blank lines", () => {
    expect(postprocessMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb\n");
  });

  it("decodes html entities outside code", () => {
    expect(postprocessMarkdown("a &amp; b &nbsp;c")).toBe("a & b  c\n");
  });

  it("leaves code fences untouched", () => {
    const input = "```js\nconst a = 1;\n\n\n\nconst b = 2; &amp;\n```";
    expect(postprocessMarkdown(input)).toContain("const b = 2; &amp;");
  });

  it("unescapes underscores inside words", () => {
    expect(postprocessMarkdown("my\\_variable\\_name")).toBe("my_variable_name\n");
  });

  it("pads around headings", () => {
    expect(postprocessMarkdown("text\n## Heading\nmore")).toBe(
      "text\n\n## Heading\n\nmore\n"
    );
  });

  it("normalizes padded list markers", () => {
    expect(postprocessMarkdown("-   item one\n-   item two")).toBe(
      "- item one\n- item two\n"
    );
  });

  it("does not insert a blank line before a closing fence", () => {
    const result = postprocessMarkdown("intro\n```ts\ncode();\n```\noutro");
    expect(result).toBe("intro\n\n```ts\ncode();\n```\n\noutro\n");
  });
});

describe("splitFrontmatter — real-world documents", () => {
  // A document whose frontmatter fails to parse reaches DEV with no title and
  // is rejected with "Title can't be blank", so these inputs must all work.
  const expectParsed = (doc: string) => {
    const { frontmatter, body } = splitFrontmatter(doc);
    expect(frontmatter).not.toBe("");
    expect(frontmatterValue(frontmatter, "title")).toBe("My Post");
    expect(body.trim()).toBe("Body.");
  };

  it("parses Windows CRLF line endings", () => {
    expectParsed('---\r\ntitle: "My Post"\r\npublished: false\r\n---\r\n\r\nBody.');
  });

  it("parses old-Mac CR line endings", () => {
    expectParsed('---\rtitle: "My Post"\r---\r\rBody.');
  });

  it("tolerates a UTF-8 BOM", () => {
    expectParsed('\uFEFF---\ntitle: "My Post"\n---\n\nBody.');
  });

  it("tolerates a blank line before the opening delimiter", () => {
    expectParsed('\n---\ntitle: "My Post"\n---\n\nBody.');
    expectParsed('   \n---\ntitle: "My Post"\n---\n\nBody.');
  });

  it("still reports no frontmatter when there is none", () => {
    const { frontmatter, body } = splitFrontmatter("Just a body.");
    expect(frontmatter).toBe("");
    expect(body).toBe("Just a body.");
  });

  it("does not treat a mid-document --- as frontmatter", () => {
    const { frontmatter } = splitFrontmatter("Body text.\n\n---\n\nMore body.");
    expect(frontmatter).toBe("");
  });

  it("accepts smart dashes that editors substitute for ---", () => {
    // macOS autocorrect and rich-text editors turn --- into an em dash.
    expectParsed('\u2014\u2014\u2014\ntitle: "My Post"\n\u2014\u2014\u2014\n\nBody.');
    expectParsed('\u2013\u2013\u2013\ntitle: "My Post"\n\u2013\u2013\u2013\n\nBody.');
  });

  it("accepts extra dashes and trailing whitespace on delimiters", () => {
    expectParsed('----\ntitle: "My Post"\n----\n\nBody.');
    expectParsed('---   \ntitle: "My Post"\n---   \n\nBody.');
    expectParsed('\t---\ntitle: "My Post"\n---\n\nBody.');
  });

  it("keeps the body when there is no closing delimiter", () => {
    // Better to publish an untitled article than to silently eat the body.
    const { frontmatter, body } = splitFrontmatter('---\ntitle: "T"\n\nBody text.');
    expect(frontmatter).toBe("");
    expect(body).toContain("Body text.");
  });
});

describe("normalizeDocument", () => {
  it("rewrites smart delimiters and CRLF into what DEV expects", () => {
    const messy = '\u2014\u2014\u2014\r\ntitle: "My Post"\r\n\u2014\u2014\u2014\r\n\r\nBody.';
    const out = normalizeDocument(messy);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain('title: "My Post"');
    expect(out).not.toContain("\r");
    expect(out).not.toContain("\u2014");
    expect(out.trimEnd().endsWith("Body.")).toBe(true);
  });

  it("leaves a document without frontmatter alone", () => {
    expect(normalizeDocument("Just a body.")).toBe("Just a body.");
  });
});

describe("demoteBodyHeadings", () => {
  it("shifts all headings down when the body has an H1", () => {
    expect(demoteBodyHeadings("# A\n\n## B\n\ntext")).toBe("## A\n\n### B\n\ntext");
  });

  it("leaves headings alone when there is no body H1", () => {
    expect(demoteBodyHeadings("## A\n\n### B")).toBe("## A\n\n### B");
  });

  it("caps at h6 and ignores comments inside code fences", () => {
    const md = "# A\n\n###### Deep\n\n```sh\n# not a heading\n```";
    expect(demoteBodyHeadings(md)).toBe("## A\n\n###### Deep\n\n```sh\n# not a heading\n```");
  });
});

describe("embeds → DEV liquid tags", () => {
  it("converts youtube iframes", () => {
    const html = '<p>intro</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    expect(cleanArticleHtml(html, "https://x.test/")).toContain("{% youtube dQw4w9WgXcQ %}");
  });

  it("converts twitter blockquote embeds", () => {
    const html =
      '<blockquote class="twitter-tweet"><a href="https://twitter.com/user/status/12345">tweet</a></blockquote>';
    expect(cleanArticleHtml(html, "https://x.test/")).toContain("{% twitter 12345 %}");
  });

  it("converts standalone youtube links", () => {
    const html = '<p><a href="https://www.youtube.com/watch?v=abc123XYZ_-">Watch</a></p>';
    expect(cleanArticleHtml(html, "https://x.test/")).toContain("{% youtube abc123XYZ_- %}");
  });

  it("unwraps next/image optimizer URLs", () => {
    const html =
      '<img src="/_next/image?url=https%3A%2F%2Fcdn.hashnode.com%2Fa.png&w=3840&q=75" alt="a">';
    expect(cleanArticleHtml(html, "https://blog.example.com/")).toContain(
      'src="https://cdn.hashnode.com/a.png"'
    );
  });
});

describe("htmlToMarkdown", () => {
  it("converts code blocks with language", () => {
    const md = htmlToMarkdown('<pre><code class="language-ts">const x = 1;</code></pre>');
    expect(md).toContain("```ts\nconst x = 1;\n```");
  });

  it("converts tables to GFM", () => {
    const md = htmlToMarkdown(
      "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"
    );
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("renders figures with captions", () => {
    const md = htmlToMarkdown(
      '<figure><img src="https://x.test/a.png" alt="Alt"><figcaption>Cap</figcaption></figure>'
    );
    expect(md).toContain("![Alt](https://x.test/a.png)");
    expect(md).toContain("_Cap_");
  });
});

describe("generateFrontmatter", () => {
  it("normalizes tags to DEV rules (max 4, alphanumeric, lowercase)", () => {
    const fm = generateFrontmatter({
      title: "Hi",
      tags: ["Java Script", "C++", "react", "vue", "extra-fifth"],
    });
    expect(fm).toContain("tags: javascript, c, react, vue");
    expect(fm).not.toContain("extra");
  });

  it("escapes quotes in titles", () => {
    const fm = generateFrontmatter({ title: 'He said "hi"', tags: [] });
    expect(fm).toContain('title: "He said \\"hi\\""');
  });

  it("always sets published false and wraps in ---", () => {
    const fm = generateFrontmatter({ title: "T", tags: [] });
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.endsWith("\n---")).toBe(true);
    expect(fm).toContain("published: false");
  });
});

describe("splitFrontmatter / frontmatterValue", () => {
  const doc = '---\ntitle: "My \\"Post\\""\npublished: false\ncover_image: https://x.test/c.png\n---\n\n# Body\n\ntext';

  it("splits frontmatter block from body", () => {
    const { frontmatter, body } = splitFrontmatter(doc);
    expect(frontmatter.startsWith("---\n")).toBe(true);
    expect(frontmatter.endsWith("---")).toBe(true);
    expect(body).toBe("# Body\n\ntext");
  });

  it("handles documents without frontmatter", () => {
    expect(splitFrontmatter("# Just body")).toEqual({
      frontmatter: "",
      body: "# Just body",
    });
  });

  it("round-trips: generateFrontmatter output is recognized", () => {
    const fm = generateFrontmatter({ title: "T", tags: ["a"] });
    const { frontmatter, body } = splitFrontmatter(`${fm}\n\nbody here`);
    expect(frontmatter).toBe(fm);
    expect(body).toBe("body here");
  });

  it("reads scalar values, unquoting and unescaping", () => {
    const { frontmatter } = splitFrontmatter(doc);
    expect(frontmatterValue(frontmatter, "title")).toBe('My "Post"');
    expect(frontmatterValue(frontmatter, "cover_image")).toBe("https://x.test/c.png");
    expect(frontmatterValue(frontmatter, "missing")).toBeUndefined();
  });
});

describe("validateUrl", () => {
  it("accepts normal blog urls", () => {
    expect(validateUrl("https://example.com/post").hostname).toBe("example.com");
  });

  it("rejects non-http protocols, garbage, and private hosts", () => {
    for (const bad of [
      "ftp://example.com/x",
      "not a url",
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://192.168.1.5/x",
      "http://10.0.0.1/x",
    ]) {
      expect(() => validateUrl(bad), bad).toThrow();
    }
  });

  it("strips tracking params and hash", () => {
    const url = validateUrl("https://a.com/p?utm_source=x&ref=y&id=1#frag");
    expect(url.toString()).toBe("https://a.com/p?id=1");
  });
});

describe("largestFromSrcset", () => {
  it("picks the largest candidate", () => {
    expect(largestFromSrcset("a.jpg 320w, b.jpg 1280w, c.jpg 640w")).toBe("b.jpg");
  });
});

describe("isRateLimited", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
    expect(isRateLimited(key)).toBe(true);
  });

  it("honors a custom limit", () => {
    const key = `test-${Math.random()}`;
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(true);
  });
});

describe("slugify", () => {
  it("makes filesystem-safe names", async () => {
    const { slugify } = await import("@/lib/utils/slug");
    expect(slugify("Hello, World! — Ep. 2")).toBe("hello-world-ep-2");
    expect(slugify("")).toBe("article");
    expect(slugify("!!!", "fallback")).toBe("fallback");
  });
});

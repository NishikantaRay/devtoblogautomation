# Blog2DEV — Implementation Plan

Universal Blog → DEV.to Markdown converter. **No AI** — fully deterministic pipeline built on HTML parsing (Cheerio), Markdown conversion (Turndown), and platform-specific cleanup rules.

---

## 1. Goals

- Paste any public blog URL → get clean, DEV.to-ready Markdown with frontmatter.
- Supported platforms: Medium, Hashnode, DEV.to (re-import), WordPress, Ghost, Blogger, Substack (public), generic HTML fallback.
- Preview side-by-side (raw Markdown + rendered DEV-style preview).
- Export: copy to clipboard, download `article.md` (with frontmatter), download frontmatter alone.
- No database. No auth. Single-user, stateless MVP.

## 2. Tech Stack

| Layer      | Choice                                   |
| ---------- | ---------------------------------------- |
| Framework  | Next.js (App Router) + TypeScript        |
| Styling    | Tailwind CSS + shadcn-style UI components|
| Fetching   | axios (server-side, via API route)       |
| HTML parse | cheerio                                  |
| HTML → MD  | turndown + custom rules (tables, embeds) |
| Validation | zod                                      |
| Preview    | react-markdown + remark-gfm (client)     |

## 3. Architecture

```
URL
 ↓
Fetcher            lib/fetcher.ts        — axios, redirects, timeout, UA header, content-type check
 ↓
Platform Detector  lib/detect.ts         — URL host + HTML fingerprints → Platform enum
 ↓
Extractor          lib/extractors/*.ts   — per-platform article isolation + metadata
 ↓
Cleaner            lib/cleaner.ts        — strip nav/ads/footers/CTAs, normalize images & embeds
 ↓
MD Converter       lib/markdown/convert.ts — Turndown + GFM rules
 ↓
Postprocessor      lib/markdown/postprocess.ts — blank lines, entities, escapes, spacing
 ↓
DEV Formatter      lib/devto/frontmatter.ts — YAML frontmatter generation
 ↓
API response       app/api/convert/route.ts (zod-validated)
 ↓
Preview + Export   app/page.tsx + components/
```

## 4. Folder Structure

```
app/
  page.tsx                 # Landing + converter UI
  layout.tsx
  globals.css
  api/convert/route.ts     # POST { url } → ConversionResult
components/
  ui/                      # button, input, card, badge, textarea (shadcn-style)
  url-form.tsx             # hero input + Convert / Example buttons
  preview.tsx              # split layout: markdown editor (read-only) + rendered preview
  toolbar.tsx              # copy / download .md / download frontmatter
  error-banner.tsx
lib/
  fetcher.ts
  detect.ts
  pipeline.ts              # orchestrates the full conversion
  cleaner.ts
  extractors/
    types.ts               # Extractor interface
    medium.ts
    hashnode.ts
    devto.ts
    wordpress.ts
    ghost.ts
    blogger.ts
    substack.ts
    generic.ts
    index.ts               # registry: Platform → Extractor
  markdown/
    convert.ts             # Turndown config + custom rules
    postprocess.ts         # cleanup passes
  devto/
    frontmatter.ts
  types.ts                 # ArticleMetadata, ConversionResult, Platform, errors
  utils/
    url.ts                 # validation, normalization, absolutize
    html.ts                # shared DOM helpers (removeAll, meta lookup)
    slug.ts
```

## 5. Pipeline Detail

### Step 1 — Validate URL
- zod schema: must be `http(s)`, valid hostname, no localhost/private IPs (SSRF guard).
- Normalize: strip tracking params (`utm_*`, `ref`, `source`).

### Step 2 — Fetch
- axios GET, follow redirects (max 5), 15 s timeout, browser-like User-Agent + Accept headers.
- Reject non-HTML content types and bodies > 5 MB.
- Map failures → typed errors: `NETWORK`, `TIMEOUT`, `NOT_FOUND`, `PRIVATE` (401/403/paywall), `INVALID_HTML`.

### Step 3 — Detect Platform
- Host rules: `medium.com`/`*.medium.com`, `*.hashnode.dev`, `dev.to`, `*.substack.com`, `*.blogspot.com`.
- HTML fingerprints: `meta[name=generator]` (WordPress, Ghost, Blogger), Ghost `ghost` class markers, Hashnode `__NEXT_DATA__` markers, WP `wp-content` asset paths.
- Fallback → `generic`.

### Step 4 — Extract
Common contract per extractor:

```ts
interface Extractor {
  platform: Platform;
  extract($: CheerioAPI, url: string): { contentHtml: string; metadata: Partial<ArticleMetadata> };
}
```

- **Title priority:** `article h1` → `og:title` → `<title>`.
- **Metadata:** author (`meta[name=author]`, JSON-LD), published date (`article:published_time`, JSON-LD, `<time>`), canonical (`link[rel=canonical]` → og:url → input URL), cover (`og:image`), tags (`article:tag`, keywords, platform tag lists).
- **JSON-LD** (`application/ld+json`, type Article/BlogPosting) parsed once in shared helper.

Platform-specific removals:
- **Medium:** claps, highlights, responses, recommendations, paywall banners, follow buttons; unwrap tracking links.
- **Hashnode:** reactions, author cards, newsletter widgets, comments.
- **WordPress:** `.entry-content`/`.post-content` body; strip widgets, sidebars, share plugins, "related posts".
- **Ghost:** `.gh-content`/`article` body; strip membership/subscribe CTAs.
- **Blogger:** `.post-body`; ignore template chrome.
- **Substack:** `.available-content`/`.body.markup`; strip subscribe embeds, share buttons.
- **DEV.to:** `#article-body`; strip reaction/comment chrome; reuse existing tags.
- **Generic:** `<article>` → `<main>` → largest readable text block (scored by text length minus link density).

### Step 5 — Clean (shared)
- Remove: `nav, aside, footer, form, iframe-ads, script, style, noscript`, cookie banners, share/newsletter/comment sections (class/id keyword lists).
- Images: resolve `data-src`, `data-lazy-src`, `srcset` (largest candidate), unwrap `<picture>`/`<figure>`, keep alt text, absolutize URLs, drop tracking pixels (1×1).
- Embeds: YouTube / Twitter/X / Gist iframes & blockquote embeds → plain links.
- Code: normalize `<pre><code class="language-x">`; infer language from class names (`language-*`, `lang-*`, highlight.js classes).

### Step 6 — HTML → Markdown (Turndown)
- ATX headings, `-` bullets, fenced code blocks with language, `**`/`_` emphasis.
- Custom rules: GFM tables, `<figure>/<figcaption>` → image + caption line, `<br>` handling, strikethrough, task lists.

### Step 7 — Postprocess
- Collapse 3+ blank lines → 1; ensure blank line around headings/code fences.
- Fix over-escaped characters (`\_`, `\*` inside words), decode HTML entities.
- Fix nested-list indentation (2-space), drop empty links/images, trim trailing whitespace.

### Step 8 — Frontmatter
```yaml
---
title: "My Article"
published: false
description: "…"
tags: javascript, react
canonical_url: https://original-site.com/post
cover_image: https://…
---
```
- Max 4 tags, lowercased, alphanumeric (DEV rules); escape YAML strings.

## 6. UI

- **Landing:** hero title/subtitle, URL input, `Convert` + `Example URL` buttons, platform badges.
- **Preview (same page, post-conversion):** split layout — left read-only Markdown, right rendered DEV-style preview (react-markdown + remark-gfm); metadata card (platform, title, author, date, tags); toolbar (Copy Markdown, Download .md, Download frontmatter); "Convert another" resets.
- Responsive: split stacks vertically on mobile.
- Friendly error banner per typed error code.

## 7. Error Handling

| Code           | User message                                   |
| -------------- | ---------------------------------------------- |
| INVALID_URL    | That doesn't look like a valid blog URL.       |
| NOT_FOUND      | Article not found (404).                       |
| PRIVATE        | This article appears to be private/paywalled.  |
| NETWORK        | Couldn't reach the site.                       |
| TIMEOUT        | The site took too long to respond.             |
| INVALID_HTML   | Couldn't parse the page content.               |
| EXTRACT_EMPTY  | Couldn't find readable article content.        |

## 8. Build Order

1. Scaffold Next.js + Tailwind + deps.
2. `lib/types.ts`, `utils/`, fetcher, detector.
3. Turndown converter + postprocessor (core value, test early).
4. Generic extractor + cleaner → end-to-end works for any blog.
5. Platform extractors (Medium, Hashnode, WordPress, Ghost, Blogger, Substack, DEV.to).
6. API route with zod + typed errors.
7. UI: landing → preview → toolbar → errors.
8. Unit tests for postprocessor/detector/frontmatter; manual E2E against live URLs.

## 9. Out of Scope (future)

DEV.to API publishing, batch/RSS import, migrations, all AI features, cover generation, CLI, browser extension.

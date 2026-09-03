# Blog2DEV — Universal Blog → DEV.to Converter

Paste any blog URL and get a clean, **DEV.to-ready Markdown article** with frontmatter — ready to preview, edit, download, or publish straight to DEV.to as a draft.

Everything is **deterministic**: HTML parsing (Cheerio), Markdown conversion (Turndown), and platform-specific cleanup rules. **No AI. No database.**

![Landing page](docs/screenshots/landing-light.png)

---

## Table of contents

- [What it does](#what-it-does)
- [Supported platforms](#supported-platforms)
- [Quick start](#quick-start)
- [Features & how to use them](#features--how-to-use-them)
  - [1. Convert a single blog URL](#1-convert-a-single-blog-url)
  - [2. Edit the output live](#2-edit-the-output-live)
  - [3. Copy & download](#3-copy--download)
  - [4. Publish to DEV.to](#4-publish-to-devto)
  - [5. Paste HTML (for sites that block fetching)](#5-paste-html-for-sites-that-block-fetching)
  - [6. Batch mode — up to 10 posts at once](#6-batch-mode--up-to-10-posts-at-once)
  - [7. Dark / light mode](#7-dark--light-mode)
  - [8. Refresh-safe session](#8-refresh-safe-session)
- [How the conversion pipeline works](#how-the-conversion-pipeline-works)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Development](#development)
- [FAQ / notes](#faq--notes)
- [Out of scope](#out-of-scope)

---

## What it does

1. You paste a blog URL (or raw HTML, or a list of up to 10 URLs).
2. Blog2DEV fetches the page, detects the platform, extracts the article, strips all the chrome (nav, ads, share buttons, newsletter forms, comments…), and converts it to clean GitHub-flavored Markdown.
3. It generates DEV.to frontmatter (title, tags, canonical URL, cover image) and shows a **live split preview**.
4. You edit if needed, then **copy**, **download** (`article.md` / `.zip`), or **publish to DEV.to as a draft** — with one click.

---

## Supported platforms

| Platform | Detection | Notes |
| --- | --- | --- |
| **Medium** | host + fingerprints | Blocks server-side fetching — use [Paste HTML](#5-paste-html-for-sites-that-block-fetching) |
| **Hashnode** | host, `cdn.hashnode.com` assets, `__NEXT_DATA__` | Works on custom domains (e.g. `blog.yoursite.com`) |
| **DEV.to** | host | Re-import an existing DEV article; reuses its tags |
| **WordPress** | `meta[generator]`, `wp-content` paths | Common themes supported |
| **Ghost** | `meta[generator]`, `.gh-content` | Strips membership/subscribe CTAs |
| **Blogger** | host, `meta[generator]` | Handles `<script type="text/template">` bodies |
| **Substack** | host, CDN markers | Public posts; paywalled content → use Paste HTML |
| **Any HTML blog** | fallback | Scores blocks by text density vs. link density |

---

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:3000**, paste a blog URL, and hit **Convert**.

```bash
npm run build && npm start   # production build
npm test                     # Vitest: unit + extractor regression tests
npm run lint                 # ESLint
npm run screenshots          # regenerate docs screenshots (needs app on :3799)
```

---

## Features & how to use them

### 1. Convert a single blog URL

On the **Blog URL** tab, paste a link and click **Convert** (or **Example URL** to try a sample). Blog2DEV fetches the page, auto-detects the platform, and produces the article.

The result view opens with a metadata bar (platform badge, title, author, date, tags), a toolbar, and the editor/preview split:

![Preview and editor](docs/screenshots/preview-editor-light.png)

**What you get:** headings, bold/italic, blockquotes, ordered & unordered lists, links, tables, fenced code blocks (with language detection), inline code, images (with alt text), and horizontal rules — all cleaned and normalized.

### 2. Edit the output live

The left pane (**"Markdown — editable"**) is a full editor. As you type:

- the right pane (**DEV Preview**) re-renders instantly, exactly as DEV.to would show it;
- editing the frontmatter `title:` or `cover_image:` updates the preview heading and cover;
- an **"edited"** badge appears, and a **Revert edits** button restores the original conversion.

Everything you do here flows into copy, download, and publish — so you can fix up an article before it ever leaves the page.

![Preview and editor — dark mode](docs/screenshots/preview-editor-dark.png)

### 3. Copy & download

From the toolbar:

- **Copy Markdown** — full document (frontmatter + body) to clipboard.
- **Download .md** — saves `article.md`.
- **Download frontmatter** — just the frontmatter block.

The generated frontmatter looks like:

```yaml
---
title: "My Article"
published: false
description: "A short summary pulled from the post…"
tags: javascript, react, webdev
canonical_url: https://original-site.com/my-article
cover_image: https://original-site.com/cover.png
---
```

`published: false` means anything you publish lands as a **draft**, never a live post. Tags are normalized to DEV rules (max 4, lowercase, alphanumeric).

### 4. Publish to DEV.to

Click **Publish to DEV** to expand the publish panel:

![Publish panel](docs/screenshots/publish-panel.png)

1. Get an API key from [dev.to/settings/extensions](https://dev.to/settings/extensions).
2. Paste it in and click **Create draft** (optionally tick "Remember this key on this device").
3. The article is created on DEV.to **as a draft**, and you get a link to **your DEV dashboard** where the draft is waiting.

> **Why the dashboard link?** DEV.to drafts have no public page until you hit Publish there — their provisional URL (`…-temp-slug-######`) 404s for anyone who isn't the signed-in author. So Blog2DEV sends you to your dashboard, where the draft always appears at the top.

**Re-publishing updates, it doesn't duplicate.** After a successful publish, Blog2DEV remembers the DEV article ID in your browser (keyed by canonical URL). Publishing the same post again **updates** that existing draft instead of creating a copy. If you deleted the draft on DEV, it detects that and cleanly creates a fresh one.

**Your key is never stored server-side** — it's relayed to DEV once per request and never logged.

### 5. Paste HTML (for sites that block fetching)

Some sites (notably **Medium**, and paywalled **Substack** posts) block automated fetching. Use the **Paste HTML** tab instead:

![Paste HTML tab](docs/screenshots/paste-html.png)

1. Open the article in your browser → **View Source** → copy the whole HTML.
2. Paste it into the box.
3. Optionally add the **original URL** (used for the canonical link and to resolve relative image paths — if you skip it, Blog2DEV reads the canonical URL embedded in the HTML).
4. Click **Convert**.

The full pipeline runs on the pasted HTML exactly as it would on a fetched page.

### 6. Batch mode — up to 10 posts at once

The **Batch** tab converts many URLs in one go — paste up to **10 URLs, one per line**:

![Batch input](docs/screenshots/batch-input.png)

A live counter shows how many URLs you've entered and flags if you exceed 10. Click **Convert all** — every URL converts **in parallel**, and you get a results list:

![Batch results](docs/screenshots/batch-results-light.png)

For each row:

- ✅ / ❌ status, with a specific error message for any failure (one bad URL never sinks the rest);
- a **checkbox** (all successful conversions start selected) — checkboxes control what gets zipped and published;
- an **Edit** button that opens the full editor for that article (your edits are saved back into the batch);
- a **.md** button to download that single article.

Then, for the **selected** articles:

- **Download N (.zip)** — bundles the selected articles as individual `.md` files (named by slugified title, with collision handling).
- **Create N drafts** — publishes the selected articles to DEV.to sequentially (spaced out to respect DEV's rate limits), with per-row progress and dashboard links. Same safety rules as single publish: always drafts, key never stored.

### 7. Dark / light mode

Toggle with the ☀️ / 🌙 button in the header. It follows your system preference by default, remembers your choice, and applies before first paint (no flash). Every view is fully themed:

![Landing page — dark mode](docs/screenshots/landing-dark.png)

### 8. Refresh-safe session

The current view — single result, batch results, which item you're editing, and any in-progress edits — is persisted to `sessionStorage`. **Refreshing the page keeps you exactly where you were** instead of dropping back to the landing page. (Scoped to the browser tab; cleared when you choose "Convert another" or close the tab.)

---

## How the conversion pipeline works

```
URL ─▶ Fetcher ─▶ Platform Detector ─▶ Extractor ─▶ Cleaner ─▶ Markdown Converter ─▶ Postprocessor ─▶ DEV Formatter ─▶ Preview
```

| Stage | File | What it does |
| --- | --- | --- |
| **Validate** | `lib/utils/url.ts` | http(s) only, blocks private/localhost hosts (SSRF guard), strips tracking params |
| **Fetch** | `lib/fetcher.ts` | axios GET, browser headers, redirects, 15 s timeout, 5 MB cap, typed errors |
| **Detect** | `lib/detect.ts` | URL host rules + HTML fingerprints (`meta[generator]`, CDN/asset markers) |
| **Extract** | `lib/extractors/*` | one isolated module per platform; shared metadata helpers (JSON-LD, OpenGraph, `<time>`) |
| **Clean** | `lib/cleaner.ts` | strips nav/ads/CTAs/comments; resolves lazy images, `srcset`, `<picture>`, `/_next/image`; embeds → DEV liquid tags |
| **Convert** | `lib/markdown/convert.ts` | Turndown + custom rules: GFM tables, fenced code w/ language, figures & captions |
| **Postprocess** | `lib/markdown/postprocess.ts` | entity decoding, escape fixes, blank-line normalization, heading demotion |
| **Frontmatter** | `lib/devto/frontmatter.ts` | title, tags (max 4, normalized), canonical URL, cover image |
| **Orchestrate** | `lib/pipeline.ts` | runs the whole thing; falls back to the generic extractor for thin/header-only results |

**Notable cleanups:**

- **Embeds → DEV liquid tags.** YouTube / Twitter / Gist embeds become `{% youtube ID %}`, `{% twitter ID %}`, `{% gist url %}` so DEV renders real embeds.
- **Heading demotion.** DEV renders the frontmatter title as the page `<h1>`, so if the body also has an `<h1>`, all headings shift down one level to avoid competing H1s.
- **Images.** Original image URLs are kept and absolutized; DEV's CDN proxies and caches them on render. Lazy-loading attributes, `srcset`, `<picture>`, and Next.js `/_next/image` optimizer wrappers are all resolved to real URLs.

---

## API reference

All endpoints are `POST`, JSON in / JSON out, zod-validated, and rate-limited per IP (in-memory).

### `POST /api/convert`

```jsonc
// Body (one of):
{ "url": "https://example.com/post" }
{ "html": "<html>…</html>", "url": "https://example.com/post" }  // url optional

// Success → { "result": ConversionResult }
// Error   → { "error": { "code": ConversionErrorCode, "message": string } }
```

### `POST /api/batch`

```jsonc
{ "urls": ["https://a.com/1", "https://b.com/2"] }   // max 10

// → { "items": [{ "url", "ok", "result"?, "error"? }, …] }
```

### `POST /api/publish`

```jsonc
{ "apiKey": "DEV_API_KEY", "markdown": "---\ntitle:…\n---\n…", "articleId": 123 }  // articleId optional

// → { "result": { "id", "url", "title" }, "updated": boolean }
```

**Error codes:** `INVALID_URL`, `NOT_FOUND`, `PRIVATE`, `NETWORK`, `TIMEOUT`, `INVALID_HTML`, `EXTRACT_EMPTY`, `RATE_LIMITED` — each mapped to a friendly message in the UI.

**Rate limits:** convert & publish 10/min per IP; batch 3/min per IP.

---

## Project structure

```
app/
  page.tsx                 # Landing + result/batch views, session persistence
  layout.tsx               # Header, theme init script
  api/convert/route.ts     # Single URL / paste-HTML conversion
  api/batch/route.ts       # Up to 10 URLs, parallel
  api/publish/route.ts     # Create / update a DEV.to draft
components/
  convert-form.tsx         # Blog URL / Paste HTML / Batch tabs
  preview.tsx              # Split editor + live DEV preview
  toolbar.tsx              # Copy / download / revert
  publish-panel.tsx        # DEV publish UI
  batch-results.tsx        # Batch list: select, edit, zip, publish-all
  theme-toggle.tsx         # Dark / light toggle
  error-banner.tsx
  ui/                      # button, input, card, badge
lib/
  fetcher.ts  detect.ts  cleaner.ts  pipeline.ts  types.ts
  extractors/              # medium, hashnode, devto, wordpress, ghost, blogger, substack, generic
  markdown/                # convert (Turndown) + postprocess
  devto/                   # frontmatter + publish
  utils/                   # url, html, slug, rate-limit, session-store, publish-store, cn
scripts/
  screenshots.mjs          # Playwright doc screenshots
  debug-convert.ts         # run pipeline on a saved HTML file
  debug-url.ts             # run full pipeline on a live URL
tests/
  units.test.ts            # postprocess, converter, frontmatter, url, rate-limit, slug, embeds
  extractors.test.ts       # full pipeline vs. real HTML fixtures (all platforms)
  fixtures/                # captured HTML per platform
docs/screenshots/          # README images
```

---

## Development

```bash
npm run dev        # dev server (http://localhost:3000)
npm test           # Vitest — unit + extractor regression tests
npm run lint       # ESLint
npm run build      # production build
```

**Debug harnesses** (handy when adding/adjusting extractors):

```bash
# Run the extraction pipeline against a saved HTML file
npx tsx scripts/debug-convert.ts page.html https://original-url/

# Run the full pipeline (fetch included) against a live URL
npx tsx scripts/debug-url.ts https://example.com/post
```

**Regenerating screenshots:** start the app on port 3799, then run the Playwright script.

```bash
npm run build && (npm start -- -p 3799 &)
npm run screenshots          # writes to docs/screenshots/
```

**Testing approach:** `tests/units.test.ts` covers the pure functions (Markdown postprocessing, Turndown rules, frontmatter generation, URL validation, rate limiting, embed→liquid-tag conversion). `tests/extractors.test.ts` runs the **full pipeline against real captured HTML** from every platform (`tests/fixtures/`), asserting platform detection, titles, authors, and output — so a selector tweak can't silently break another platform.

---

## FAQ / notes

**Will my images transfer to DEV?** You don't need to transfer them. When your article renders on DEV, remote image URLs are automatically proxied and cached through DEV's image CDN, so images from your original blog display fine. Caveat: the origin must stay online — if you delete the source blog, the URLs eventually break. There's no public DEV API to upload images programmatically, so for a true migrate-then-delete, re-host images yourself (a bucket / Cloudinary / a repo) and rewrite the URLs, or drag-drop the key images into DEV's editor.

**Medium / Hashnode give me a PRIVATE or NETWORK error.** These platforms aggressively block or rate-limit non-browser traffic. Use the **Paste HTML** tab: View Source in your browser and paste the HTML — the conversion is identical.

**My custom-domain blog shows as "Generic".** Detection uses hosts and HTML fingerprints. If a platform isn't recognized on a custom domain, the generic extractor still produces good output (it scores content blocks by text density). If you know the platform, open an issue / add a fingerprint in `lib/detect.ts`.

**Is the rate limiter production-ready?** It's in-memory (per instance), which is fine for a single server. On serverless (e.g. Vercel), each instance has its own counter — swap in Redis/Upstash before relying on it at scale.

---

## Out of scope

Intentionally not built (yet): RSS feed import, and all AI features (rewriting, tag/SEO generation, cover-image generation). See [PLAN.md](PLAN.md) for the original design document.

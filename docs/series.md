# Blog series

A **series** is a set of long-form posts seeded into the schedule as drafts and
reviewed one per day. This document covers where series content lives, the
format, and how to add your own.

---

## Why the content is gitignored

Series posts live in `lib/series/<key>/`, and `.gitignore` contains:

```
/lib/series/*/
```

The posts are **local content, not part of the repo**. Only the module itself —
`index.ts` (the loader), `types.ts`, and `render.ts` — is tracked.

To make that work, series are **loaded from disk at runtime** rather than
statically imported. A clone with no content directories still typechecks,
builds, and passes tests; `npm run seed:series` simply reports that nothing is
available.

If you'd rather keep your posts in version control, delete the
`/lib/series/*/` line from `.gitignore`. Nothing else needs to change.

---

## Layout

```
lib/series/
  index.ts             # loader: scans directories, imports posts   (tracked)
  types.ts             # SeriesPost + Series interfaces             (tracked)
  render.ts            # post → DEV.to document                     (tracked)
  <key>/               # one directory per series                (gitignored)
    01-first-post.ts
    02-second-post.ts
```

The directory name is the **series key** — what `--series=<key>` takes. Files
are loaded in filename order, so zero-pad them (`01-`, `02-`, … `10-`) or the
tenth post sorts before the second.

Each file must export a `post` const. A file that doesn't is skipped.

---

## Post format

```ts
import type { SeriesPost } from "../types";

export const post: SeriesPost = {
  order: 1,
  title: "Your Post Title",
  description: "Shown in DEV listings and social cards. Max 155 characters.",
  tags: ["duckdb", "sql", "database", "beginners"],
  source: "where-this-came-from.md",
  body: `Markdown body, without frontmatter.

## A heading

Regular markdown. Mermaid diagrams render natively on DEV.to:

\`\`\`mermaid
flowchart LR
    A[Input] --> B[Output]
\`\`\`
`,
};
```

| Field | Rule |
| --- | --- |
| `order` | 1-based position. Must run `1..n` with no gaps. |
| `title` | Unique within the series. |
| `description` | **≤155 characters** — longer is silently truncated by DEV. |
| `tags` | **Max 4**, lowercase alphanumeric only, no duplicates. |
| `source` | Free-text provenance note. Recorded, not published. |
| `body` | Markdown without frontmatter. Frontmatter is generated. |

Because `body` is a template literal, escape any backticks and `${` it
contains — code fences inside the body need `\`\`\``.

### Registering the display name

`lib/series/index.ts` maps keys to display names and pins listing order:

```ts
const SERIES_NAMES: Record<string, string> = {
  insighttrack: "InsightTrack internals",
  duckdb: "DuckDB: basics to advanced",
};

const SERIES_ORDER = ["insighttrack", "duckdb"];
```

An unregistered key still works — it falls back to the directory name and
sorts alphabetically after the listed ones.

The review UI has its own copy of the labels in
`components/review-board.tsx` (`SERIES_LABELS`), since it runs in the browser
and can't read the filesystem.

---

## Seeding

```bash
npm run seed:series -- --list            # what's available locally
npm run seed:series                      # every series, back to back
npm run seed:series -- --series=duckdb   # one series
npm run seed:series -- --time=14:30      # time of day (default 09:00)
npm run seed:series -- --start=2026-09-10  # first publish date
npm run seed:series -- --dry-run         # preview the plan, write nothing
npm run seed:series -- --replace         # clear prior drafts, reseed
```

Posts are scheduled **one per day** starting tomorrow by default, so the first
post gets a full day of review. Day offsets run continuously across series, so
seeding several never collides on a slot.

Seeded posts carry `source: "series:<key>"`, which is how `--replace` finds
what to clear and how the review UI groups them.

---

## The review gate

Everything seeded lands with status **`draft`**. The scheduler's
`claimDuePosts` only ever matches `pending`, so **a draft is never published**,
however overdue it is. This is enforced structurally, not by convention, and is
covered by a test.

```
draft ──approve──> pending ──scheduler──> published
  ▲                   │
  └────unapprove──────┘
```

Approve at `/review`. Editing a post there updates the stored copy only — it
does **not** write back to the file under `lib/series/`. To change the source,
edit the file and reseed with `--replace`.

---

## Tests

`tests/series.test.ts` validates whatever content is present and skips cleanly
when there is none, so it never fails CI on a clone. It checks:

- orders run `1..n` with no gaps; keys are unique
- descriptions ≤155 chars; tags ≤4, unique, lowercase alphanumeric
- titles unique within a series; bodies substantial
- code fences balanced (an odd count means a broken post)
- every post renders to a valid document that is **never** `published: true`

Run with `npm test`.

---

## Adding a series

1. `mkdir lib/series/my-series`
2. Add `01-intro.ts` exporting a `post` (format above)
3. Optionally register a name and order in `lib/series/index.ts`, and a label
   in `components/review-board.tsx`
4. `npm run seed:series -- --series=my-series --dry-run` to preview
5. Drop `--dry-run` to seed, then review at `/review`

/**
 * Captures documentation screenshots of every Blog2DEV view in light and dark
 * mode. Requires the app running on http://localhost:3799.
 *
 * Usage: node scripts/screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import path from "path";

const BASE = "http://localhost:3799";
const OUT = path.resolve("docs/screenshots");
mkdirSync(OUT, { recursive: true });

// Fast, reliably-fetchable article (Ghost) for the single preview + batch.
const ARTICLE_URL = "https://www.troyhunt.com/its-a-new-blog/";
const HASHNODE_HTML = readFileSync(
  path.resolve("tests/fixtures/hashnode.html"),
  "utf8"
);

const BATCH_URLS = [
  "https://www.troyhunt.com/its-a-new-blog/",
  "https://dev.to/tykok/the-new-http-method-query-2bec",
  "https://not-a-real-site-xyz.example/broken-post",
];

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
  }, theme);
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log("captured", name);
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      console.log("  ! API", r.status(), r.url());
    }
  });

  // ---- Landing (light + dark) ----
  await page.goto(BASE, { waitUntil: "networkidle" });
  await setTheme(page, "light");
  await page.reload({ waitUntil: "networkidle" });
  await shot(page, "landing-light");

  await setTheme(page, "dark");
  await page.reload({ waitUntil: "networkidle" });
  await shot(page, "landing-dark");

  // ---- Paste HTML tab (with real fixture content pasted) ----
  await setTheme(page, "light");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Paste HTML" }).click();
  await page.getByLabel("Page HTML").fill(HASHNODE_HTML.slice(0, 4000) + "\n…");
  await page
    .getByLabel("Original URL (optional)")
    .fill("https://townhall.hashnode.com/8-features-on-hashnode-you-didnt-know-about");
  await shot(page, "paste-html");

  // ---- Batch tab (with URLs typed in) ----
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByLabel("Blog URLs, one per line").fill(BATCH_URLS.join("\n"));
  await shot(page, "batch-input");

  // ---- Single conversion: preview + editor ----
  await page.getByRole("tab", { name: "Blog URL" }).click();
  await page.getByLabel("Blog URL").fill(ARTICLE_URL);
  await page.getByRole("button", { name: "Convert", exact: true }).first().click();
  await page.getByLabel("Markdown editor").waitFor({ state: "visible", timeout: 45000 });
  await page.waitForTimeout(1200);
  await shot(page, "preview-editor-light");

  await setTheme(page, "dark");
  await page.waitForTimeout(400);
  await shot(page, "preview-editor-dark");

  // ---- Publish panel expanded ----
  await setTheme(page, "light");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Publish to DEV" }).click();
  await page.waitForTimeout(400);
  await shot(page, "publish-panel");

  // ---- Batch results (real conversions, incl. one failure) ----
  await page.getByRole("button", { name: /Convert another/ }).click();
  await page.getByRole("tab", { name: "Batch" }).click();
  await page.getByLabel("Blog URLs, one per line").fill(BATCH_URLS.join("\n"));
  await page.getByRole("button", { name: "Convert all" }).click();
  await page.getByText(/succeeded/).waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, "batch-results-light");

  await setTheme(page, "dark");
  await page.waitForTimeout(400);
  await shot(page, "batch-results-dark");

  await browser.close();
  console.log("done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

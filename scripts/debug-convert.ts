/**
 * Dev helper: run the extraction pipeline against a saved HTML file.
 * Usage: npx tsx scripts/debug-convert.ts <file.html> <original-url>
 */
import { readFileSync } from "fs";
import * as cheerio from "cheerio";
import { detectPlatform } from "@/lib/detect";
import { getExtractor } from "@/lib/extractors";
import { cleanArticleHtml } from "@/lib/cleaner";
import { htmlToMarkdown } from "@/lib/markdown/convert";
import { postprocessMarkdown } from "@/lib/markdown/postprocess";

const [file, url] = process.argv.slice(2);
const html = readFileSync(file, "utf8");
const $ = cheerio.load(html);
const platform = detectPlatform(url, $);
console.log("platform:", platform);
const extracted = getExtractor(platform).extract($, url);
console.log("extracted html len:", extracted.contentHtml.length);
console.log("metadata:", JSON.stringify(extracted.metadata, null, 1).slice(0, 500));
const cleaned = cleanArticleHtml(extracted.contentHtml, url);
console.log("cleaned len:", cleaned.length);
const md = postprocessMarkdown(htmlToMarkdown(cleaned));
console.log("md len:", md.length);
console.log(md.slice(0, 600));

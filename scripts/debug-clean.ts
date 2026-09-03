import { readFileSync } from "fs";
import * as cheerio from "cheerio";
import { detectPlatform } from "@/lib/detect";
import { getExtractor } from "@/lib/extractors";

const [file, url] = process.argv.slice(2);
const html = readFileSync(file, "utf8");
const $doc = cheerio.load(html);
const platform = detectPlatform(url, $doc);
const extracted = getExtractor(platform).extract($doc, url);

const $ = cheerio.load(extracted.contentHtml);
const root = $("body");
const total = root.text().length;
console.log("total text:", total);

const JUNK = ["cookie","gdpr","consent","newsletter","subscribe","signup","sign-up","share","social","comments","comment-section","related","recommended","recommendation","sidebar","widget","advert","sponsor","promo","paywall","popup","modal","banner","breadcrumb","pagination","author-card","author-box","bio-box","follow","reaction","clap","like-button","toolbar","table-of-contents","toc-"];
root.find("[class], [id]").each((_, el) => {
  const $el = $(el);
  const hay = `${$el.attr("class") ?? ""} ${$el.attr("id") ?? ""}`.toLowerCase();
  const hit = JUNK.filter((k) => hay.includes(k));
  if (hit.length) console.log("JUNK HIT", hit.join(","), "| class:", hay.slice(0,70), "| textlen:", $el.text().length);
});

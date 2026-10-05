#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const BRANCHES = [
  { name: "pamulang", latlng: "-6.3440737,106.7300880" },
  { name: "cinere", latlng: "-6.3197929,106.7861210" },
  { name: "tebet", latlng: "-6.2306458,106.8534749" },
  { name: "petukangan", latlng: "-6.2332002,106.7450603" },
  { name: "ciledug", latlng: "-6.2398489,106.7164343" },
  { name: "bekasi", latlng: "-6.2548368,106.9681690" },
  { name: "binus", latlng: "-6.2024725,106.7827245" },
];

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars", "--window-size=1280,900"],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  const page = await context.newPage();

  await page.goto("https://food.grab.com/id/en", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const results = {};
  for (const b of BRANCHES) {
    const r = await context.request.post("https://portal.grab.com/foodweb/guest/v2/search", {
      data: { latlng: b.latlng, keyword: "sky pasta", offset: 0, pageSize: 32, countryCode: "ID" },
      headers: { "content-type": "application/json" },
    });
    let json = null;
    try { json = await r.json(); } catch {}
    let merchants = [];
    if (json && json.searchResult && json.searchResult.searchMerchants) {
      merchants = json.searchResult.searchMerchants.map((m) => ({
        id: m.id,
        name: m.address?.name,
        slug: m.urlSegments,
        cuisine: m.merchantBrief?.cuisine,
        rating: m.merchantBrief?.rating,
        vote_count: m.merchantBrief?.vote_count,
        distance: m.merchantBrief?.distanceInKm,
        priceTag: m.merchantBrief?.priceTag,
      }));
    }
    results[b.name] = { latlng: b.latlng, status: r.status(), totalCount: json?.searchResult?.totalCount, merchants };
    console.log(`\n=== ${b.name} (${b.latlng}) ===`);
    for (const m of merchants) console.log(" ", m.id, "|", m.name, "| r=", m.rating, "v=", m.vote_count, "| slug=", JSON.stringify(m.slug));
  }
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_search_all_branches.json"), JSON.stringify(results, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
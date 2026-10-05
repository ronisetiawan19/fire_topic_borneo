#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

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

  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Perform searches from within the page context (same-origin, carries cookies)
  const BRANCHES = [
    { name: "pamulang", latlng: "-6.3440737,106.7300880" },
    { name: "cinere", latlng: "-6.3197929,106.7861210" },
    { name: "tebet", latlng: "-6.2306458,106.8534749" },
    { name: "petukangan", latlng: "-6.2332002,106.7450603" },
    { name: "ciledug", latlng: "-6.2398489,106.7164343" },
    { name: "bekasi", latlng: "-6.2548368,106.9681690" },
    { name: "binus", latlng: "-6.2024725,106.7827245" },
  ];

  const results = {};
  for (const b of BRANCHES) {
    await sleep(4000);
    try {
      const out = await page.evaluate(async (latlng) => {
        const r = await fetch("https://portal.grab.com/foodweb/guest/v2/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ latlng, keyword: "sky pasta", offset: 0, pageSize: 32, countryCode: "ID" }),
        });
        const json = await r.json().catch(() => null);
        const merchants = json?.searchResult?.searchMerchants || [];
        return {
          status: r.status,
          totalCount: json?.searchResult?.totalCount,
          merchants: merchants.map((m) => ({
            id: m.id,
            name: m.address?.name,
            urlSegments: m.urlSegments ?? m.urlSegment ?? null,
            status: m.status,
            rating: m.merchantBrief?.rating,
            vote_count: m.merchantBrief?.vote_count,
            distanceKm: m.merchantBrief?.distanceInKm,
            full: m,
          })),
        };
      }, b.latlng);
      results[b.name] = out;
      console.log(`\n=== ${b.name} === total=${out.totalCount}`);
      for (const m of out.merchants.filter((x) => /sky pasta/i.test(x.name || ""))) {
        console.log("  ", m.id, "|", m.name, "| r=", m.rating, "v=", m.vote_count, "| seg=", JSON.stringify(m.urlSegments));
      }
    } catch (e) {
      console.log(b.name, "ERR", e.message.slice(0, 120));
    }
  }

  // merchant details probe from page context
  const ids = {
    pamulang: "IDGFSTI00000w7t",
    cinere: "6-CYNYJ2JBE6CKGT",
    tebet: "6-C6ADTJNYJFTKWA",
    petukangan: "6-C2BDENKVLYN2A2",
    ciledug: "6-CZMBUFTATB5HNN",
    binus_palmerah: "6-C3A3AFNUBBEDL6",
    bekasi: results.bekasi?.merchants?.find((m) => /sky pasta/i.test(m.name || ""))?.id || "N/A",
  };
  const details = {};
  for (const [branch, id] of Object.entries(ids)) {
    if (id === "N/A") continue;
    await sleep(3000);
    try {
      const json = await page.evaluate(async (mid) => {
        const r = await fetch(`https://portal.grab.com/foodweb/guest/v2/merchants/${mid}?latlng=-6.1767352,106.826504`);
        return await r.json().catch(() => null);
      }, id);
      details[branch] = { id, keys: json ? Object.keys(json) : [], name: json?.name || json?.address?.name, urlSegments: json?.urlSegments ?? json?.slug ?? null, status: json?.status };
      console.log(`\n[detail ${branch}] ${id}`);
      console.log("  keys:", (json ? Object.keys(json) : []).join(","));
      if (json) {
        if (json.url || json.webUrl || json.shortUrl) console.log("  url:", JSON.stringify(json.url ?? json.webUrl ?? json.shortUrl));
        console.log("  urlSegments:", JSON.stringify(json.urlSegments ?? json.slug ?? null));
      }
    } catch (e) {
      details[branch] = { id, err: e.message.slice(0, 100) };
    }
  }

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_details3.json"), JSON.stringify({ results, details }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
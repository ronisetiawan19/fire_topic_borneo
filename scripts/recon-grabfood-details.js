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

  // load home to establish session/cookies
  await page.goto("https://food.grab.com/id/en", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  // capture search headers once (in-page)
  const captured = [];
  page.on("request", (req) => {
    if (/\/foodweb\/guest\/v2\/search$/.test(req.url())) captured.push({ url: req.url(), headers: req.headers() });
  });
  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  const sess = captured[0];
  if (!sess) { console.log("no captured session"); process.exit(1); }
  const { url, headers } = sess;
  const hip = ["x-hydra-jwt", "x-grab-web-app-version", "x-gfc-country", "x-country-code", "content-type", "accept", "origin", "referer", "user-agent"];
  const reduced = {};
  for (const k of hip) if (headers[k]) reduced[k] = headers[k];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Retry bekasi with backoff
  console.log("=== bekasi retry ===");
  let bekasi = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(8000 * (attempt + 1));
    const r = await context.request.post(url, {
      data: { latlng: "-6.2548368,106.9681690", keyword: "sky pasta", offset: 0, pageSize: 32, countryCode: "ID" },
      headers: reduced,
    });
    console.log("attempt", attempt, "status", r.status());
    if (r.status() === 200) { try { bekasi = await r.json(); } catch {} break; }
  }

  // merchant details for each branch id
  const ids = {
    pamulang: "IDGFSTI00000w7t",
    cinere: "6-CYNYJ2JBE6CKGT",
    tebet: "6-C6ADTJNYJFTKWA",
    petukangan: "6-C2BDENKVLYN2A2",
    ciledug: "6-CZMBUFTATB5HNN",
    binus_palmerah: "6-C3A3AFNUBBEDL6",
  };
  const details = {};
  for (const [branch, id] of Object.entries(ids)) {
    await sleep(3000);
    const r = await context.request.get(
      `https://portal.grab.com/foodweb/guest/v2/merchants/${id}?latlng=-6.1767352,106.826504`,
      { headers: reduced }
    );
    let json = null;
    try { json = await r.json(); } catch {}
    const keys = json ? Object.keys(json) : [];
    console.log(`\n[${branch}] ${id} status=${r.status()} keys=${keys.join(",")}`);
    if (json) {
      const cand = json.name || json.merchantName || (json.address && json.address.name) || "";
      const segs = json.urlSegments || json.slug || (json.address && json.address.urlSegments) || null;
      console.log("  name:", JSON.stringify(cand), "slug:", JSON.stringify(segs));
      // dump top-level summary only
      for (const k of ["name", "urlSegments", "slug", "status", "allowReview", "rating", "ratingCount", "vote_count", "cuisine", "displayAddress"]) {
        if (json[k] !== undefined) console.log(`  ${k} =`, JSON.stringify(json[k]).slice(0, 200));
      }
      if (json.address) console.log("  address =", JSON.stringify(json.address).slice(0, 300));
    }
    details[branch] = { id, status: r.status(), merchant: json };
  }

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_details.json"), JSON.stringify({ bekasi, details }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
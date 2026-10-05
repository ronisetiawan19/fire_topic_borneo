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

  const captured = [];
  page.on("request", async (req) => {
    if (/\/foodweb\/guest\/v2\/search$/.test(req.url()) && !req.headers()["x-replayed"]) {
      captured.push({
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        headers: req.headers(),
      });
    }
  });

  // trigger in-page search by navigating to the search URL (fires the fetch)
  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta&support-deeplink=true&searchParameter=sky%20pasta", {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.waitForTimeout(10000);

  // Now replay with exact headers via context.request
  const sess = captured[0];
  console.log("captured search request:", !!sess, sess?.method, sess?.url.slice(0, 80));
  const replayResults = {};
  if (sess) {
    const { url, postData, headers } = sess;
    delete headers["x-replayed"];
    delete headers["content-length"];
    // cookies come from context automatically
    const hip = ["x-hydra-jwt", "x-grab-web-app-version", "x-gfc-country", "x-country-code", "content-type", "accept", "origin", "referer", "user-agent"];
    const reduced = {};
    for (const k of hip) if (headers[k]) reduced[k] = headers[k];

    for (const b of [
      { name: "pamulang", latlng: "-6.3440737,106.7300880" },
      { name: "cinere", latlng: "-6.3197929,106.7861210" },
      { name: "tebet", latlng: "-6.2306458,106.8534749" },
      { name: "petukangan", latlng: "-6.2332002,106.7450603" },
      { name: "ciledug", latlng: "-6.2398489,106.7164343" },
      { name: "bekasi", latlng: "-6.2548368,106.9681690" },
      { name: "binus", latlng: "-6.2024725,106.7827245" },
    ]) {
      let body;
      try {
        body = JSON.parse(postData);
      } catch {
        body = { latlng: b.latlng, keyword: "sky pasta", offset: 0, pageSize: 32, countryCode: "ID" };
      }
      body.latlng = b.latlng;
      const r = await context.request.post(url, { data: body, headers: reduced });
      let json = null;
      try { json = await r.json(); } catch {}
      const merchants = json?.searchResult?.searchMerchants || [];
      const kept = merchants.map((m) => ({
        id: m.id,
        name: m.address?.name,
        urlSegments: m.urlSegments,
        status: m.status,
        rating: m.merchantBrief?.rating,
        vote_count: m.merchantBrief?.vote_count,
        distanceKm: m.merchantBrief?.distanceInKm,
      }));
      replayResults[b.name] = { latlng: b.latlng, status: r.status(), totalCount: json?.searchResult?.totalCount, merchants: kept };
      console.log(`\n=== ${b.name} === status=${r.status()} total=${json?.searchResult?.totalCount}`);
      for (const m of kept) console.log("  ", m.id, "|", m.name, "|", m.urlSegments, "| r=", m.rating, "v=", m.vote_count);
    }
  }
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_search_headers.json"), JSON.stringify({ captHeaders: sess?.headers, replayResults }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
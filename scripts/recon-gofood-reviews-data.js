#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const TEBET = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842";

async function capture(baseUrl, label) {
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

  const dataCalls = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/reviews\.json|reviews-overview|reviews\?|review/i.test(u) && /gofood|gojekapi|gojek\.com/.test(u)) {
      dataCalls.push({ method: req.method(), url: u, post: req.postData() });
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 75000 });
  await page.waitForTimeout(8000);

  const data = await page.evaluate(() => {
    const nextData = document.getElementById("__NEXT_DATA__");
    let nd = null;
    try { nd = JSON.parse(nextData && nextData.textContent || "null"); } catch {}
    const pp = nd?.props?.pageProps || {};
    return {
      buildId: nd?.buildId,
      reviewsData: pp.reviewsData,
      outlet: pp.outlet,
      isReviewsPage: pp.isReviewsPage,
      nextDataRaw: nextData ? nextData.textContent.slice(0, 100) : null,
    };
  });

  console.log(`\n=== ${label}: ${baseUrl}`);
  console.log("buildId:", data.buildId);
  const rd = data.reviewsData;
  if (!rd) { console.log("NO reviewsData"); }
  else {
    console.log("reviewsData keys:", Object.keys(rd).join(","));
    const reviews = rd.reviews || rd.items || rd.data || [];
    console.log("reviews count:", reviews.length);
    const first = reviews[0];
    if (first) {
      console.log("first review keys:", Object.keys(first).join(","));
      console.log("first review:", JSON.stringify(Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 160) : v])), null, 1).slice(0, 1200));
    }
    for (const k of Object.keys(rd)) {
      if (k !== "reviews" && k !== "items" && k !== "data" && rd[k] !== null && typeof rd[k] !== "object") {
        console.log(`  meta ${k} =`, JSON.stringify(rd[k]).slice(0, 200));
      }
    }
  }
  console.log("review-related API calls:", dataCalls.length);
  for (const c of dataCalls) console.log("   ", c.method, c.url.slice(0, 170));

  writeFileSync(path.join(OUT_DIR, `recon_gofood_reviews_${label}.json`), JSON.stringify(data, null, 2), "utf-8");
  await browser.close();
}

async function main() {
  await capture(TEBET + "/reviews", "tebet");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
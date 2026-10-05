#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const BODIES = [];

async function captureBody(page, pattern, { max = 6, tag } = {}) {
  let count = { n: 0 };
  page.on("response", async (response) => {
    const url = response.url();
    if (!pattern.test(url)) return;
    if (count.n >= max) return;
    count.n += 1;
    try {
      const body = await response.text();
      BODIES.push({ tag, url, status: response.status(), body: body.slice(0, 40000) });
    } catch {
      BODIES.push({ tag, url, status: response.status(), body: "<unreadable>" });
    }
  });
  return count;
}

async function goto(page, url, waitMs = 6000) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (err) {
    console.log(`  goto error: ${err.message}`);
  }
  await page.waitForTimeout(waitMs);
}

async function getRestaurantLinks(page, label) {
  const links = await page.evaluate(() =>
    [...new Set(
      Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
        .map((a) => a.getAttribute("href"))
        .filter(Boolean)
        .map((h) => h.split("?")[0]),
    )],
  );
  console.log(`\n[${label}] ${links.length} unique restaurant links`);
  for (const u of links.slice(0, 15)) console.log("   ", u);
  return links;
}

async function clickInlineText(page, regex) {
  return page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, "i");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const own = Array.from(node.childNodes)
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => c.textContent)
        .join(" ")
        .trim();
      if (own && re.test(own) && own.length < 60) {
        node.click();
        return own;
      }
    }
    return null;
  }, regex.source);
}

async function extractReviewCards(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => /ulasan|review/i.test(l));
    return {
      hasReviews: /ulasan|review/i.test(text),
      around: idx >= 0 ? lines.slice(idx, idx + 120) : [],
      hasLoadMore: /(selengkapnya|load more|lihat lebih|tampilkan lebih)/i.test(text),
      pageTextLen: text.length,
    };
  });
}

async function main() {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  const reviewsCounter = await captureBody(page, /_next\/data\/.*\/reviews\.json/, {
    max: 12,
    tag: "reviews_json",
  });
  const overviewCounter = await captureBody(page, /api\/outlets\/[^/]+\/reviews-overview/, {
    max: 4,
    tag: "reviews_overview",
  });
  const dealsCounter = await captureBody(page, /gofood\/web\/v2\/deals\/profile/, {
    max: 4,
    tag: "deals_profile",
  });
  const searchCounter = await captureBody(page, /_next\/data\/.*\/(restaurants|restaurant)\//, {
    max: 4,
    tag: "ssr_data",
  });

  console.log("[1] Search 'sky pasta' in jakarta");
  await goto(page, "https://gofood.co.id/jakarta/restaurants?search=sky%20pasta", 8000);
  let links = await getRestaurantLinks(page, "search");

  const target = links.find((l) => /sky/i.test(l)) || links[0];
  if (!target) {
    console.log("no restaurant link found - abort");
    await browser.close();
    return;
  }
  let full = target;
  if (full.startsWith("/")) full = "https://gofood.co.id" + full;
  console.log("\n[2] Opening:", full);
  await goto(page, full, 10000);

  console.log("\n[3] Navigating to /reviews page");
  const reviewsUrl = `${full.replace(/\.co\.id\/([a-z]{2}\/)?/, ".co.id/")}reviews`.includes("reviews")
    ? `${full.replace(/\/restaurant\//, "/restaurant/")}/reviews`
    : full;
  const reviewsPath = `${full.split("?")[0]}/reviews`;
  await goto(page, reviewsPath, 10000);

  let cards = await extractReviewCards(page);
  console.log("reviews page has reviews?:", cards.hasReviews, "| loadMore visible?:", cards.hasLoadMore);

  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(400);
  }

  const clicked = await clickInlineText(page, /(selengkapnya|load more|lihat lebih|tampilkan lebih)/);
  console.log("load-more click:", clicked);
  if (clicked) await page.waitForTimeout(5000);

  cards = await extractReviewCards(page);
  console.log("after scroll+click — hasReviews:", cards.hasReviews, "| len:", cards.pageTextLen);

  const allBodies = BODIES.map((b) => ({
    tag: b.tag,
    status: b.status,
    url: b.url.slice(0, 250),
    body_preview: b.body.slice(0, 120),
    body_len: b.body.length,
  }));

  const report = {
    scraped_at: new Date().toISOString(),
    restaurant_url: full,
    reviews_url: reviewsPath,
    captured_endpoints: allBodies,
    review_cards_snapshot: cards,
    full_bodies: BODIES,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "recon_gofood.json"), JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== CAPTURED ENDPOINTS ===");
  for (const b of allBodies) {
    console.log(`[${b.tag}] ${b.status} ${b.url}\n   ${b.body_preview}… (${b.body_len} chars)`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
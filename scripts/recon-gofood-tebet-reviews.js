#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const TEBET = {
  url: "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842",
  uuid: "594d2e42-b1fd-44f2-83a9-da53b2210842",
  slug: "sky-pasta-tebet",
};

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

  const calls = [];
  page.on("request", (req) => {
    const u = req.url();
    if (/gofood\.co\.id\/_next\/data/.test(u) || /\/gofood\/web|gojekapi|_next\/data/.test(u)) {
      calls.push({ method: req.method(), url: u, post: req.postData() });
    }
  });

  try {
    await page.goto(`${TEBET.url}/reviews`, { waitUntil: "domcontentloaded", timeout: 75000 });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: path.join(OUT_DIR, "gofood_tebet_reviews.png"), fullPage: false });

    const dom = await page.evaluate((slug) => {
      const nextData = document.getElementById("__NEXT_DATA__");
      let nd = null;
      try { nd = JSON.parse(nextData && nextData.textContent || "null"); } catch {}

      // find buildId in scripts or next data
      const buildId = nd?.buildId || null;
      const pageProps = nd?.props?.pageProps || {};
      const reviewNodes = document.querySelectorAll('[class*="review"], [class*="Review"], [data-testid*="review"], [data-testid*="Review"]').length;

      return {
        title: document.title,
        url: location.href,
        buildId,
        reviewNodes,
        reviewHeaderText: [...document.querySelectorAll("h1,h2,h3,h4")].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 20),
        pagePropsKeys: Object.keys(pageProps),
      };
    }, TEBET.slug);
    console.log("URL:", dom.url);
    console.log("TITLE:", dom.title);
    console.log("buildId:", dom.buildId);
    console.log("reviewNodes:", dom.reviewNodes);
    console.log("headings:", JSON.stringify(dom.reviewHeaderText));
    console.log("pageProps keys:", JSON.stringify(dom.pagePropsKeys));

    console.log("\nAPI CALLS during /reviews load:");
    for (const c of calls) console.log(" ", c.method, c.url.slice(0, 190));

    writeFileSync(path.join(OUT_DIR, "recon_gofood_tebet_reviews.json"), JSON.stringify({ dom, calls }, null, 2), "utf-8");
  } catch (e) {
    console.error("ERR:", e.message.slice(0, 200));
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
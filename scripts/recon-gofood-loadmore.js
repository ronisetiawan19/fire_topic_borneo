#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842/reviews";

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
    if (!/google-analytics|cdn-apac\.onetrust|lens-fc\.golabs|gojekapi\/darkroom|\.css|\.png|\.jpg|\.webp|\.woff|onerror-stats/.test(u)) {
      calls.push({ method: req.method(), url: u, post: req.postData()?.slice(0, 300) || null, res: null });
    }
  });
  page.on("response", async (res) => {
    const rec = calls.find((c) => c.url === res.url());
    if (rec) rec.res = res.status();
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 75000 });
  await page.waitForTimeout(5000);

  const btn = page.getByText("Muat lebih banyak").first();
  const visible = await btn.isVisible().catch(() => false);
  console.log("load-more visible:", visible);
  if (visible) {
    await btn.click();
    await page.waitForTimeout(8000);
  }

  console.log("\nCALLS AFTER LOAD MORE:");
  for (const c of calls) console.log("  ", c.method, c.res, c.url.slice(0, 230));

  const state = await page.evaluate(() => {
    const nd = document.getElementById("__NEXT_DATA__");
    let pp = null;
    try { pp = JSON.parse(nd && nd.textContent || "null")?.props?.pageProps; } catch {}
    const rv = pp?.reviewsData?.reviews;
    return { url: location.href, count: rv?.data?.length ?? 0, next: rv?.next_page, firstCreated: rv?.data?.[0]?.createdAt, lastCreated: rv?.data?.[rv.data.length-1]?.createdAt };
  });
  console.log("\nstate:", JSON.stringify(state));

  writeFileSync(path.join(OUT_DIR, "recon_gofood_loadmore_call.json"), JSON.stringify({ calls, state }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
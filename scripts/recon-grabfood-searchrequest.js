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

  const searchCalls = [];
  page.on("request", (req) => {
    if (/\/foodweb\/guest\/v2\/search$/.test(req.url())) {
      searchCalls.push({ method: req.method(), url: req.url(), postData: req.postData() });
    }
  });

  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);

  console.log("SEARCH REQUESTS:");
  for (const c of searchCalls) console.log(c.method, c.url, c.postData ? "POST:" + c.postData : "");
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_search_request.json"), JSON.stringify({ searchCalls }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
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

  const apiCalls = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (/\/foodweb\//.test(u)) {
      let body = "";
      try { body = (await res.text()).slice(0, 4000); } catch {}
      apiCalls.push({ url: u, status: res.status(), contentType: res.headers()["content-type"], body });
    }
  });

  // search results page for "sky pasta"
  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta&support-deeplink=true&searchParameter=sky%20pasta", {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT_DIR, "search_skypasta.png"), fullPage: false });

  const dom = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 500),
  }));
  console.log("URL:", dom.url);
  console.log("TITLE:", dom.title);
  console.log("TEXT:", JSON.stringify(dom.bodyText));

  console.log("\nFOODWEB API CALLS:");
  for (const c of apiCalls) {
    console.log(`\n[${c.status}] ${c.url.slice(0, 200)}`);
    console.log("  ", c.body.replace(/\n+/g, " ").slice(0, 1200));
  }
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_search_page.json"), JSON.stringify({ dom, apiCalls }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
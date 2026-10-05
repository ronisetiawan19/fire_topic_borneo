#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const RESULT = {};

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  const urls = [
    "https://gofood.co.id/jakarta/depok-restaurants?search=sky%20pasta",
    "https://gofood.co.id/jakarta/jakarta-selatan-restaurants?search=sky%20pasta",
    "https://gofood.co.id/jakarta/kodya-tangerang-restaurants?search=sky%20pasta",
    "https://gofood.co.id/jakarta/kodya-bekasi-restaurants?search=sky%20pasta",
    "https://gofood.co.id/jakarta/jakarta-barat-restaurants?search=sky%20pasta",
    "https://gofood.co.id/jakarta/restaurants?search=sky",
  ];

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      console.log("goto err:", e.message);
    }
    await page.waitForTimeout(6000);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(400);
    }
    const links = await page.evaluate(() =>
      [...new Set(
        Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
          .map((a) => a.getAttribute("href"))
          .filter(Boolean)
          .map((h) => h.split("?")[0].replace(/\/id\//, "/")),
      )],
    );
    RESULT[url] = links;
    const sky = links.filter((l) => /sky/i.test(l));
    console.log(`\n${url}`);
    console.log(`  total restaurant links: ${links.length}`);
    if (sky.length) {
      console.log("  SKY LINKS:");
      for (const s of sky) console.log("   ***", s);
    } else {
      console.log("  (no sky links; sample:)");
      for (const l of links.slice(0, 5)) console.log("   ", l);
    }
  }

  writeFileSync(path.join(OUT_DIR, "recon_gofood_localities.json"), JSON.stringify(RESULT, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
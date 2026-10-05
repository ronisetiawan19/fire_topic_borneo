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

  const seed = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842";
  try {
    await page.goto(seed, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    console.log("goto err:", e.message);
  }
  await page.waitForTimeout(8000);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);

  const links = await page.evaluate(() =>
    [...new Set(
      Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
        .map((a) => a.getAttribute("href"))
        .filter(Boolean)
        .map((h) => h.split("?")[0].replace(/\/id\//, "/")),
    )],
  );

  const text = await page.evaluate(() => document.body?.innerText || "");
  const idx = text.toLowerCase().indexOf("tempat lainnya");
  const around = idx >= 0 ? text.slice(idx, idx + 800) : "(no 'Tempat lainnya')";
  console.log("=== all restaurant links on tebet page ===");
  for (const l of links) console.log("  ", l);
  console.log("\n=== 'Tempat lainnya' context ===");
  console.log(around.replace(/\n+/g, " | "));

  writeFileSync(
    path.join(OUT_DIR, "recon_gofood_tebet.json"),
    JSON.stringify({ links, around, page_text_head: text.slice(0, 600) }, null, 2),
    "utf-8",
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
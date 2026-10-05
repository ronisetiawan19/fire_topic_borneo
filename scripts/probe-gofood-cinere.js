#!/usr/bin/env bun
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars"],
  });
  const context = await browser.newContext({ userAgent: ua, locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();

  const targets = [
    ["cinere", "https://gofood.link/u/OjRp"],
    ["pamulang", "https://gofood.link/u/51zOQ"],
  ];

  for (const [name, url] of targets) {
    let finalUrl = url;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      finalUrl = page.url();
    } catch (e) {
      console.log(`${name}: goto err ${e.message}`);
    }
    await page.waitForTimeout(6000);
    const final = page.url();
    console.log(`${name}: ${url} -> ${final}`);
    if (/gofood\.co\.id\//.test(final)) {
      console.log(`${name}: *** GOT IT: ${final}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
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
  await page.goto("https://food.grab.com/id/en", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);

  const cookies = await context.cookies();
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const candidates = [
    `https://portal.grab.com/foodweb/guest/v2/merchants?latlng=-6.2394301,106.725286&keyword=sky%20pasta`,
    `https://portal.grab.com/foodweb/guest/v2/merchants?latlng=-6.2394301,106.725286&q=sky%20pasta`,
    `https://portal.grab.com/foodweb/guest/v2/search?latlng=-6.2394301,106.725286&keyword=sky%20pasta`,
    `https://portal.grab.com/foodweb/guest/v2/dishes?latlng=-6.2394301,106.725286&keyword=sky%20pasta`,
    `https://portal.grab.com/foodweb/v1/merchants/search?latlng=-6.2394301,106.725286&q=sky%20pasta`,
  ];

  const results = [];
  for (const url of candidates) {
    try {
      const r = await context.request.get(url, {
        headers: { cookie: cookieStr, accept: "application/json" },
        timeout: 20000,
      });
      let text = "";
      try { text = await r.text(); } catch {}
      const ct = r.headers()["content-type"] || "";
      console.log(`\n[${r.status()}] ${ct.split(";")[0]} ${url.slice(0, 160)}`);
      if (r.status() === 200) {
        const data = JSON.parse(text);
        const keys = Object.keys(data);
        console.log("   keys:", keys.join(", "));
        console.log("   ", text.slice(0, 1200).replace(/\n/g, " "));
      } else {
        console.log("   body:", text.slice(0, 200));
      }
      results.push({ url, status: r.status(), ct, bodyLength: text.length });
    } catch (e) {
      console.log(`   ERR ${url.slice(0, 140)} :: ${e.message.slice(0, 100)}`);
    }
  }
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_searchapi.json"), JSON.stringify(results, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
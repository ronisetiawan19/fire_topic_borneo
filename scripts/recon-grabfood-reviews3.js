#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const MERCHANT_ID = "6-CZMBUFTATB5HNN";
const LATLNG = "-6.1767352,106.826504";

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

  let merchantHeaders = null;
  page.on("request", (req) => {
    if (/foodweb\/guest\/v2\/merchants\/6-CZMBUFTATB5HNN/.test(req.url())) {
      merchantHeaders = req.headers();
    }
  });

  await page.goto(`https://food.grab.com/id/en/restaurant/sky-pasta-paninggilan-utara-delivery/${MERCHANT_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(9000);

  const extra = {};
  if (merchantHeaders) {
    for (const [k, v] of Object.entries(merchantHeaders)) {
      if (/x-|accept|origin|referer/i.test(k)) extra[k] = v;
    }
  }

  const hosts = ["https://p.grabtaxi.com", "https://grab.com", "https://api.grab.com"];
  const paths = [
    `/api/passenger/v2/food/merchants/${MERCHANT_ID}/reviews?merchantID=${MERCHANT_ID}&latlng=${LATLNG}&offset=0&limit=20`,
    `/api/passenger/v2/food-service/merchants/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
    `/api/passenger/v4/food/merchants/${MERCHANT_ID}/reviews`,
    `/foodservice/v1/merchants/${MERCHANT_ID}/reviews`,
    `/api/grab-food/merchants/${MERCHANT_ID}/reviews`,
    `/food-web/guest/v2/merchants/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
    `/foodweb/guest/v2/merchants/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
  ];

  console.log("probing p.grabtaxi.com / grab.com / api.grab.com review paths via context.request...");
  for (const host of hosts) {
    for (const p of paths) {
      const url = host + p;
      try {
        const r = await context.request.get(url, { headers: extra, timeout: 20000 });
        const ct = r.headers()["content-type"] || "";
        const text = await r.text().catch(() => "");
        const ok = r.status() === 200;
        console.log(`\n[${r.status()}] ${ct.split(";")[0]} ${url.slice(0, 150)}`);
        if (ok) {
          console.log("   BODY:", text.slice(0, 500).replace(/\n/g, " "));
        } else {
          console.log("   body:", text.slice(0, 120).replace(/\n/g, " "));
        }
      } catch (e) {
        console.log(`   ERR ${url.slice(0, 140)} :: ${e.message.slice(0, 120)}`);
      }
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
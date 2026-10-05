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

  const url = `https://food.grab.com/id/en/restaurant/sky-pasta-paninggilan-utara-delivery/${MERCHANT_ID}`;
  console.log("[1] goto", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);

  console.log("[2] replaying API calls via context.request with real cookies+headers");
  const cookies = await context.cookies();
  console.log("cookies:", cookies.map((c) => c.name).join(", "));

  const extra = {};
  if (merchantHeaders) {
    for (const [k, v] of Object.entries(merchantHeaders)) {
      if (/x-|cookie|accept|origin|referer/i.test(k)) {
        extra[k] = v;
      }
    }
  }

  const base = `https://portal.grab.com/foodweb/guest/v2/merchants/${MERCHANT_ID}`;
  const candidates = [
    `${base}/reviews?latlng=${LATLNG}`,
    `${base}/ratings?latlng=${LATLNG}`,
    `${base}/feedbacks?latlng=${LATLNG}`,
    `${base}?latlng=${LATLNG}`,
    `https://portal.grab.com/foodweb/guest/v2/restaurant/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
    `https://food.grab.com/api/merchants/${MERCHANT_ID}/reviews`,
  ];

  for (const cand of candidates) {
    try {
      const r = await context.request.get(cand, { headers: extra });
      const ct = r.headers()["content-type"] || "";
      let text = "";
      try { text = await r.text(); } catch {}
      const isJson = ct.includes("json");
      console.log(`\n[${r.status()}] ${ct} ${cand.slice(0, 160)}`);
      if (isJson) {
        const o = JSON.parse(text);
        console.log("   keys:", Object.keys(o).join(", "));
        console.log("   ", text.slice(0, 900).replace(/\n/g, " "));
      } else {
        console.log("   ", text.slice(0, 200));
      }
    } catch (e) {
      console.log(`   THROW ${cand.slice(0, 120)} :: ${e.message.slice(0, 140)}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
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

  let merchantReqHeaders = null;
  let merchantRespHeaders = null;
  page.on("request", (req) => {
    if (/foodweb\/guest\/v2\/merchants\/6-CZMBUFTATB5HNN/.test(req.url())) {
      merchantReqHeaders = req.headers();
    }
  });
  page.on("response", (resp) => {
    if (/foodweb\/guest\/v2\/merchants\/6-CZMBUFTATB5HNN/.test(resp.url())) {
      merchantRespHeaders = resp.headers();
    }
  });

  const url = `https://food.grab.com/id/en/restaurant/sky-pasta-paninggilan-utara-delivery/${MERCHANT_ID}`;
  console.log("[1] goto", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);

  console.log("[2] merchant request headers captured:", !!merchantReqHeaders);
  if (merchantReqHeaders) {
    for (const [k, v] of Object.entries(merchantReqHeaders)) {
      if (/gid|auth|token|cookie|key|x-|country|geo/i.test(k)) {
        console.log(`   ${k}: ${String(v).slice(0, 140)}`);
      }
    }
  }

  const candidates = [
    `https://portal.grab.com/foodweb/guest/v2/merchants/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
    `https://portal.grab.com/foodweb/guest/v2/merchants/${MERCHANT_ID}/ratings?latlng=${LATLNG}`,
    `https://portal.grab.com/foodweb/merchant/v2/reviews?latlng=${LATLNG}&merchantID=${MERCHANT_ID}`,
    `https://portal.grab.com/foodweb/restaurant/v2/${MERCHANT_ID}/reviews?latlng=${LATLNG}`,
    `https://p.grabtaxi.com/food/v1/merchants/${MERCHANT_ID}/reviews`,
    `https://p.grabtaxi.com/api/passenger/v4/food/merchants/${MERCHANT_ID}/reviews`,
    `https://dineout.grab.com/api/reviews?merchant_id=${MERCHANT_ID}`,
  ];

  console.log("\n[3] probing candidate review endpoints with page.fetch (same cookies/context)");
  const results = [];
  for (const cand of candidates) {
    try {
      const r = await page.evaluate(async (u) => {
        try {
          const res = await fetch(u, { credentials: "include" });
          const text = await res.text();
          return { status: res.status, ct: res.headers.get("content-type"), len: text.length, text: text.slice(0, 4000) };
        } catch (e) {
          return { err: String(e).slice(0, 200) };
        }
      }, cand);
      const ok = r.status === 200;
      console.log(`\n   ${r.status ?? "ERR"} ${cand.slice(0, 150)} len=${r.len}`);
      if (ok && r.text) {
        console.log("   ", r.text.slice(0, 600).replace(/\n/g, " "));
      } else if (r.err) {
        console.log("   err:", r.err);
      } else {
        console.log("   body:", (r.text || "").slice(0, 200));
      }
      results.push({ url: cand, ...r });
    } catch (e) {
      console.log("   throw:", cand, e.message.slice(0, 120));
      results.push({ url: cand, throw: String(e).slice(0, 200) });
    }
  }

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_reviews.json"), JSON.stringify({
    merchantRequestHeaders: merchantReqHeaders,
    merchantResponseHeaders: merchantRespHeaders,
    results,
  }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
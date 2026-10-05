#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const MERCHANT_ID = "6-CZMBUFTATB5HNN";

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

  await page.goto(`https://food.grab.com/id/en/restaurant/sky-pasta-paninggilan-utara-delivery/${MERCHANT_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(8000);

  const scriptSrcs = await page.evaluate(() =>
    [...document.querySelectorAll("script[src]")].map((s) => s.src).filter((s) => /\/_next\/static\/chunks\/.+\.js/.test(s))
  );
  console.log("chunks:", scriptSrcs.length);

  const hits = [];
  for (const src of scriptSrcs) {
    try {
      const r = await context.request.get(src, { timeout: 20000 });
      if (r.status() !== 200) continue;
      const text = await r.text();
      const kws = ["reviews", "feedback", "ratings", "merchant_review", "ulasan"];
      for (const kw of kws) {
        let idx = text.indexOf(kw);
        while (idx !== -1) {
          const seg = text.slice(Math.max(0, idx - 100), idx + 150).replace(/[^ -~]/g, " ");
          hits.push({ kw, src: src.split("/").pop(), seg });
          idx = text.indexOf(kw, idx + 1);
          if (hits.length > 200) break;
        }
      }
    } catch {}
  }

  console.log("\ntotal hits:", hits.length);
  const interesting = hits.filter((h) => /guest|v2|v3|v4|api|restaurant|merchant/i.test(h.seg));
  for (const h of interesting.slice(0, 60)) {
    console.log(`\n[${h.kw}] ${h.src}\n  ${h.seg}`);
  }
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_bundle_review_hits.json"), JSON.stringify(hits, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
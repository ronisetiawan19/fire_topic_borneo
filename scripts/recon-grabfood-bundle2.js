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
      const re = /["']([a-z0-9][a-z0-9/._-]*(?:search|suggest|keyword|merchants|dishes|category)[a-z0-9/._-]*)["']/gi;
      let m;
      while ((m = re.exec(text))) {
        const seg = text.slice(Math.max(0, m.index - 120), m.index + 180).replace(/[^ -~]/g, " ");
        hits.push({ src: src.split("/").pop(), match: m[1], seg });
        if (hits.length > 400) break;
      }
    } catch {}
  }

  console.log("hits:", hits.length);
  const uniq = [...new Map(hits.map((h) => [h.match.toLowerCase(), h])).values()];
  for (const h of uniq.slice(0, 80)) console.log(`\n[${h.match}] ${h.src}\n  ${h.seg}`);
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_bundle_search_hits.json"), JSON.stringify(uniq, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
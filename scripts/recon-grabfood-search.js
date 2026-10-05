#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const URLS = [];

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

  const bodies = new Map();
  page.on("response", async (resp) => {
    const url = resp.url();
    const ct = resp.headers()["content-type"] || "";
    if (ct.includes("json") && !/\.js\b/.test(url) && !/analytics|doubleclick|facebook|google/i.test(url)) {
      URLS.push({ status: resp.status(), url, ct });
      if (resp.status() === 200) {
        try { bodies.set(url, await resp.text()); } catch {}
      }
    }
  });

  console.log("[1] search 'sky pasta'");
  await page.goto("https://food.grab.com/id/en/search?q=sky%20pasta", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(12000);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(500); }
  await page.waitForTimeout(2000);

  const apiUrls = URLS.filter((u) => /portal\.grab\.com|grabtaxi|p\.grab/i.test(u.url)).map((u) => u.url);
  console.log("API calls so far:", apiUrls.length);
  for (const u of apiUrls.slice(0, 40)) console.log("  ", u.slice(0, 220));

  const searchBody = [...bodies.entries()].find(([u]) => /search/i.test(u));
  if (searchBody) console.log("\nSEARCH BODY len:", searchBody[1].length, "\n", searchBody[1].slice(0, 1800));

  const links = await page
    .evaluate(() => {
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.getAttribute("href") || "";
        if (/merchant|restaurant|skuSearchResult/i.test(h) && !seen.has(h)) {
          seen.add(h);
          out.push({ href: h, text: (a.innerText || "").trim().slice(0, 60) });
        }
      }
      return out;
    })
    .catch(() => []);
  console.log("\nrestaurant links:", links.length);
  for (const l of links.slice(0, 25)) console.log("  ", l.href, "|", l.text);

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_urls.json"), JSON.stringify({ apiUrls, searchBody: searchBody?.[1]?.slice(0, 3000), links }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const MERCHANT_ID = "6-CZMBUFTATB5HNN";
  const MERCHANT_PATH = "sky-pasta-paninggilan-utara-delivery";

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

  const EVENTS = [];
  const BODIES = new Map();
  const ALL_HOSTS = new Map();
  page.on("response", (resp) => {
    const u = resp.url();
    try {
      const host = new URL(u).host;
      ALL_HOSTS.set(host, (ALL_HOSTS.get(host) || 0) + 1);
    } catch {}
    if (/portal\.grab\.com|p\.grab|grabtaxi|\.grab\.com\/(api|foodweb|restaurant|v\d)/i.test(u)) {
      const ct = resp.headers()["content-type"] || "";
      EVENTS.push({ status: resp.status(), url: u, ct });
      if (resp.status() === 200 && (ct.includes("json") || /portal\.grab\.com/.test(u))) {
        (async () => {
          try { BODIES.set(u, await resp.text()); } catch {}
        })();
      }
    }
  });

  const url = `https://food.grab.com/id/en/restaurant/${MERCHANT_PATH}/${MERCHANT_ID}`;
  console.log("[1] goto", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(600); }
  await page.waitForTimeout(2500);

  console.log("final url:", page.url());
  console.log("events:", EVENTS.length);
  for (const e of EVENTS) console.log(`  [${e.status}]`, e.ct, e.url.slice(0, 250));

  const hits = [...BODIES.entries()];
  console.log("json bodies:", hits.length);
  for (const [u, b] of hits) {
    console.log("---", u.slice(0, 160), "::", b.length, "bytes");
    if (/review|rating/i.test(u)) console.log(b.slice(0, 1500));
  }

  const html = await page.content();
  const hasReviews = /Ulasan|Review|rating|ulat/i.test(html);
  console.log("page mentions review/ulasan:", hasReviews);

  const nextData = await page.evaluate(() => {
    const el = document.getElementById("__NEXT_DATA__");
    return el ? el.textContent : null;
  }).catch(() => null);
  if (nextData) {
    console.log("__NEXT_DATA__ len:", nextData.length);
    writeFileSync(path.join(OUT_DIR, "recon_grabfood_nextdata.json"), nextData, "utf-8");
    const idx = nextData.indexOf("review");
    if (idx >= 0) console.log("first 'review' mention near:", nextData.slice(nextData.lastIndexOf("{", idx) - 200 > 0 ? nextData.lastIndexOf("{", idx) - 200 : 0, idx + 800).slice(0, 1200));
    console.log("all hosts:", [...ALL_HOSTS.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([h, n]) => `${h}x${n}`).join(" "));
  } else {
    console.log("no __NEXT_DATA__");
  }

  const name = await page.title().catch(() => "");
  console.log("title:", name);

writeFileSync(path.join(OUT_DIR, "recon_grabfood_merchant.json"), JSON.stringify({
    merchant: MERCHANT_ID, url: page.url(), title: name, events: EVENTS,
    bodies: Object.fromEntries(hits.map(([u, b]) => [u, b])),
  }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
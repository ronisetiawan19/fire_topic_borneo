#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const EVENTS = [];

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

  page.on("request", (req) => {
    const u = req.url();
    if (/portal\.grab\.com|p\.grab|grabtaxi/i.test(u)) {
      EVENTS.push({ kind: "req", method: req.method(), url: u, post: req.postData()?.slice(0, 500) });
    }
  });
  page.on("response", (resp) => {
    const u = resp.url();
    if (/portal\.grab\.com|p\.grab|grabtaxi/i.test(u)) {
      EVENTS.push({ kind: "resp", status: resp.status(), url: u, ct: resp.headers()["content-type"] || "" });
    }
  });

  console.log("[1] goto home");
  await page.goto("https://food.grab.com/id/en/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log("events after home:", EVENTS.length);

  console.log("[2] type into search box + Enter");
  const input = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Cari"], input[aria-label*="earch"], input[aria-label*="ari"]').first();
  await input.waitFor({ state: "visible", timeout: 15000 }).catch(() => console.log("  no search input found"));
  await input.click();
  await input.fill("sky pasta");
  await page.waitForTimeout(1500);
  await input.press("Enter");
  await page.waitForTimeout(8000);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(500); }
  await page.waitForTimeout(2000);

  console.log("events after search:", EVENTS.length);
  for (const e of EVENTS) {
    console.log(`  [${e.kind}]`, e.method ? `${e.method} ` : "", e.status ? `${e.status} ` : "", e.url.slice(0, 240));
    if (e.post) console.log("       POST:", e.post.slice(0, 240));
  }

  const html = await page.content();
  const skyHits = (html.match(/[Ss]ky\s?[Pp]asta/g) || []).length;
  console.log("page html len:", html.length, "| 'Sky Pasta' occurrences:", skyHits);
  console.log("page url:", page.url());

  const links = await page.evaluate(() => {
    const out = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (/restaurant|merchant/i.test(h)) out.add(`${h}  |  ${(a.innerText || "").trim().slice(0, 40)}`);
    }
    return [...out];
  });
  console.log("merchant/restaurant links:", links.length);
  for (const l of links.slice(0, 30)) console.log("  ", l);

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_events.json"), JSON.stringify({ events: EVENTS, skyHits, url: page.url(), links: [...links] }, null, 2), "utf-8");
  writeFileSync(path.join(OUT_DIR, "recon_grabfood_page.html"), html, "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
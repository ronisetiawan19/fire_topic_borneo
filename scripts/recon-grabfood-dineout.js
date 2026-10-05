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

  const EVENTS = [];
  const BODIES = new Map();
  page.on("response", async (resp) => {
    const u = resp.url();
    if (/portal\.grab\.com|p\.grab|dineout\.grab|foodweb/i.test(u)) {
      const ct = resp.headers()["content-type"] || "";
      EVENTS.push({ status: resp.status(), url: u, ct });
      if (resp.status() === 200 && ct.includes("json")) {
        try { BODIES.set(u, await resp.text()); } catch {}
      }
    }
  });

  console.log("[1] dineout.grab.com page");
  const urls = [
    `https://dineout.grab.com/id/id/restaurants/sky-pasta-paninggilan-utara--${MERCHANT_ID}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) { console.log("  goto err", e.message.slice(0, 80)); }
    await page.waitForTimeout(7000);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(600); }
    await page.waitForTimeout(1500);
    console.log("  final url:", page.url());
    const t = await page.title().catch(() => "");
    console.log("  title:", t);
    const html = await page.content();
    const idx = html.search(/[Uu]lasan|[Rr]eview/i);
    console.log("  html len:", html.length, "review idx:", idx);
    if (idx >= 0) console.log("  near:", html.slice(Math.max(0, idx - 150), idx + 250).replace(/\s+/g, " "));
    const links = await page.evaluate(() => {
      const out = new Set();
      for (const a of document.querySelectorAll("a[href]")) {
        const h = a.getAttribute("href") || "";
        if (/review|merchant|restaurant/i.test(h)) out.add(`${h} | ${(a.innerText || "").trim().slice(0, 40)}`);
      }
      return [...out];
    });
    console.log("  links:", links.length);
    for (const l of links.slice(0, 20)) console.log("   ", l);
  }

  console.log("\nevents:", EVENTS.length);
  for (const e of EVENTS) console.log("  [" + e.status + "]", e.ct, e.url.slice(0, 220));
  console.log("json bodies:", BODIES.size);
  for (const [u, b] of BODIES) {
    console.log("  === " + u.slice(0, 180) + " :: " + b.length + " bytes");
    if (/review|rating|feedback/i.test(u)) console.log(b.slice(0, 2500));
  }

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_dineout.json"), JSON.stringify({
    events: EVENTS,
    bodies: Object.fromEntries([...BODIES.entries()].map(([u, b]) => [u.slice(0, 200), b.slice(0, 30000)])),
  }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
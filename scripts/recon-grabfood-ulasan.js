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
  page.on("response", (resp) => {
    const u = resp.url();
    if (/portal\.grab\.com|p\.grab|grabtaxi|dineout/i.test(u)) {
      const ct = resp.headers()["content-type"] || "";
      EVENTS.push({ status: resp.status(), url: u, ct });
    }
  });

  const url = `https://food.grab.com/id/en/restaurant/sky-pasta-paninggilan-utara-delivery/${MERCHANT_ID}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);

  const domInfo = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const out = { hasRating: /rating|\d+(\.\d+)?[\s\S]{0,30}(out of 5|dari 5|bintang)/i.test(text), ulasan: /[Uu]lasan|[Rr]eview/.test(text) };
    const els = [...document.querySelectorAll("*")].filter((e) => {
      const t = (e.childNodes.length === 0 ? (e.innerText || "") : "").trim();
      return /[Uu]lasan|[Rr]eview/i.test(t) && t.length < 40;
    });
    out.reviewNodeCount = els.length;
    out.reviewNodes = els.slice(0, 15).map((e) => ({
      tag: e.tagName,
      text: (e.innerText || "").trim().slice(0, 50),
      cls: (e.className || "").toString().slice(0, 80),
    }));
    const starEls = [...document.querySelectorAll("*")].filter((e) => e.className && /star/i.test(e.className.toString()) && e.innerText && /^\s*\d(\.\d)?\s*$/.test(e.innerText));
    out.starCounts = starEls.slice(0, 10).map((e) => e.innerText.trim());
    return out;
  });
  console.log("hasRating:", domInfo.hasRating, "| has ulasan:", domInfo.ulasan);
  console.log("review nodes:", domInfo.reviewNodeCount, JSON.stringify(domInfo.reviewNodes, null, 1));
  console.log("star counts:", JSON.stringify(domInfo.starCounts));

  const clicked = await page
    .evaluate(() => {
      const candidates = [...document.querySelectorAll("button, [role=button], a, div")].filter((e) => {
        const t = ((e.innerText || "") + " " + (e.getAttribute("aria-label") || "")).trim();
        return /[Uu]lasan|[Rr]eview|[Bb]intang/i.test(t) && t.length < 60;
      });
      if (candidates.length === 0) return null;
      const el = candidates[0];
      el.click();
      return { tag: el.tagName, text: el.innerText || el.getAttribute("aria-label"), html: el.outerHTML.slice(0, 200) };
    })
    .catch((e) => ({ err: e.message.slice(0, 200) }));
  console.log("clicked:", JSON.stringify(clicked));

  await page.waitForTimeout(5000);
  console.log("\nevts after click:");
  for (const e of EVENTS) console.log("  [" + e.status + "]", e.ct, e.url.slice(0, 240));

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_ul intercept.json"), JSON.stringify({ domInfo, clicked, events: EVENTS }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
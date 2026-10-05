#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842/reviews";

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

  const allCalls = [];
  page.on("request", (req) => {
    const u = req.url();
    if (!/google-analytics|gojekapi\/darkroom|\.css|\.png|\.jpg|\.webp|\.woff/.test(u)) {
      allCalls.push({ method: req.method(), url: u, post: req.postData() });
    }
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 75000 });
  await page.waitForTimeout(6000);

  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll("a, button, [role=button]")]
      .map((e) => ({ tag: e.tagName, text: (e.innerText || "").trim().slice(0, 40), href: e.getAttribute("href"), cls: (e.className || "").toString().slice(0, 80) }))
      .filter((b) => /next|selanjutnya|2|arrow|chevron|\u203a|›|chevron-right/i.test(b.text + b.cls));
  });
  console.log("pagination candidates:", JSON.stringify(buttons.slice(0, 10)));

  // click candidate with 'next' hint
  let clicked = null;
  for (const hint of ["Selanjutnya", "Next", "NextPage", "›", "chevron"]) {
    const loc = page.locator(`text=${hint}`).first();
    if (await loc.count()) {
      try { await loc.click({ timeout: 4000 }); clicked = hint; break; } catch {}
    }
  }
  if (!clicked) {
    // try generic last pagination link
    try {
      const links = page.locator("a");
      const n = await links.count();
      for (let i = n - 1; i >= 0; i--) {
        const txt = (await links.nth(i).innerText().catch(() => "")).trim();
        if (/^\d+$/.test(txt) || txt === "›") { await links.nth(i).click({ timeout: 3000 }); clicked = txt; break; }
      }
    } catch {}
  }
  console.log("clicked:", clicked);
  await page.waitForTimeout(6000);

  console.log("\nPOST-CLICK CALLS:");
  for (const c of allCalls.slice(-25)) console.log("  ", c.method, c.url.slice(0, 220), c.post ? "POST:" + c.post.slice(0, 120) : "");

  const state = await page.evaluate(() => {
    const nd = document.getElementById("__NEXT_DATA__");
    let pp = null;
    try { pp = JSON.parse(nd && nd.textContent || "null")?.props?.pageProps; } catch {}
    return { url: location.href, reviewsCount: pp?.reviewsData?.reviews?.data?.length, next: pp?.reviewsData?.reviews?.next_page, firstCreated: pp?.reviewsData?.reviews?.data?.[0]?.createdAt };
  });
  console.log("\nstate:", JSON.stringify(state));

  writeFileSync(path.join(OUT_DIR, "recon_gofood_tebet_pagination_call.json"), JSON.stringify({ buttons, clicked, calls: allCalls.slice(0, 60), state }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
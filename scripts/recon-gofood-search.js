#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const API_CALLS = [];
const PAGE_LINKS = new Set();
const consoleMsgs = [];

async function main() {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  page.on("response", async (response) => {
    const url = response.url();
    if (/api\//.test(url) && response.request().resourceType() !== "image") {
      let body = "";
      try {
        body = (await response.text().catch(() => "")).slice(0, 20000);
      } catch {}
      API_CALLS.push({ status: response.status(), url, body });
    }
    if (/\/restaurant\//.test(url) && response.request().resourceType() === "document") {
      PAGE_LINKS.add(url);
    }
  });
  page.on("console", (m) => consoleMsgs.push(`${m.type()}: ${m.text()}`.slice(0, 300)));

  async function goto(url, wait = 6000) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      console.log("  goto err:", e.message);
    }
    await page.waitForTimeout(wait);
  }

  console.log("[1] Home");
  await goto("https://gofood.co.id/", 7000);

  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input, [contenteditable='true'], textarea")).map(
      (el, i) => ({
        i,
        tag: el.tagName,
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        aria: el.getAttribute("aria-label"),
        name: el.getAttribute("name"),
      }),
    ),
  );
  console.log("inputs:", JSON.stringify(inputs, null, 2));

  const target = inputs.find((i) => /makan|makanan/i.test(`${i.placeholder} ${i.aria}`));
  const targetIdx = target ? target.i : inputs[0]?.i;
  console.log("using input index:", targetIdx, target);

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  if (targetIdx !== undefined) {
    const search = async (q) => {
      await page.evaluate((idx) => {
        const el =
          document.querySelectorAll("input, [contenteditable='true'], textarea")[idx];
        el?.focus();
        el?.click();
      }, targetIdx);
      await page.waitForTimeout(800);
      await page.keyboard.type(q, { delay: 120 });
      await page.waitForTimeout(3500);

      const suggestions = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll('a[href*="/restaurant/"], [data-testid*="uggest"], li a'),
        );
        return [...new Set(els.map((a) => a.getAttribute("href") || "").filter((h) => h))]
          .slice(0, 20);
      });
      console.log("   suggestions while typing:", JSON.stringify(suggestions, null, 2));

      await page.keyboard.press("Enter");
      await page.waitForTimeout(6000);
    };

    console.log("\n[2] typing 'sky pasta'…");
    await search("sky pasta");

    const links = await page.evaluate(() =>
      [...new Set(
        Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
          .map((a) => a.getAttribute("href"))
          .filter(Boolean)
          .map((h) => h.split("?")[0].replace(/\/id\//, "/")),
      )],
    );
    console.log("restaurant links after typing search:");
    for (const l of links) console.log("   ", l);

    // try branch-specific keywords for the missing ones
    for (const kw of ["sky pasta cinere", "sky pasta petukangan"]) {
      console.log(`\n[3] typing '${kw}'…`);
      await search(kw);
      const l2 = await page.evaluate(() =>
        [...new Set(
          Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
            .map((a) => a.getAttribute("href"))
            .filter(Boolean)
            .map((h) => h.split("?")[0].replace(/\/id\//, "/")),
        )],
      );
      console.log("links for", kw, ":");
      for (const l of l2) console.log("   ", l);
    }
  }

  writeFileSync(
    path.join(OUT_DIR, "recon_gofood_search.json"),
    JSON.stringify(
      {
        scraped_at: new Date().toISOString(),
        api_calls: API_CALLS.slice(0, 80).map((a) => ({ ...a, body: a.body.slice(0, 1500) })),
        page_links: [...PAGE_LINKS],
        console: consoleMsgs.slice(-40),
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log("\n=== API CALLS ===");
  for (const a of API_CALLS.slice(0, 80)) {
    console.log(`[${a.status}] ${a.url}  body=${a.body.slice(0, 150)}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
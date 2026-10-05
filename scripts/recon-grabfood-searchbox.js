#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const portalCalls = [];

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
    if (/portal\.grab\.com|foodweb|grabtaxi/i.test(u)) {
      portalCalls.push({ method: req.method(), url: u });
    }
  });

  await page.goto("https://food.grab.com/id/en", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);

  const all = await page.evaluate(() => {
    const els = [...document.querySelectorAll("input, [role=combobox], [role=searchbox], textarea, button")];
    return els.map((e) => ({
      tag: e.tagName,
      type: e.getAttribute("type"),
      role: e.getAttribute("role"),
      placeholder: e.getAttribute("placeholder"),
      aria: e.getAttribute("aria-label"),
      id: e.id,
      disabled: e.disabled,
      text: (e.innerText || "").trim().slice(0, 60),
      cls: (e.className || "").toString().slice(0, 120),
    }));
  });
  console.log("all input/button-like elements:");
  for (const i of all) console.log(" ", JSON.stringify(i));

  // try clicking the search box area and typing "sky pasta"
  const searchResult = await page.evaluate(() => {
    const els = [...document.querySelectorAll("input, [role=combobox], [role=searchbox], textarea")];
    const el = els.find((e) => !e.disabled) || els[0];
    if (!el) return null;
    return { tag: el.tagName, placeholder: el.getAttribute("placeholder"), disabled: el.disabled, id: el.id, outer: el.outerHTML.slice(0, 300) };
  });
  console.log("\nsearch target:", JSON.stringify(searchResult));

  // click and type
  try {
    const el = page.locator("input:not([disabled]), [role=combobox]:not([disabled]), textarea");
    if ((await el.count()) > 0) {
      await el.first().click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      await page.keyboard.type("sky pasta", { delay: 120 });
      await page.waitForTimeout(3000);
      console.log("typed 'sky pasta', waiting for suggest popup...");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(6000);
    } else {
      console.log("no enabled input found");
    }
  } catch (e) {
    console.log("interaction err:", e.message.slice(0, 150));
  }

  console.log("\nportal calls during interaction:");
  for (const c of portalCalls.slice(-20)) console.log(" ", c.method, c.url.slice(0, 220));

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_search_interact.json"), JSON.stringify({ elements: all, searchTarget: searchResult, calls: portalCalls }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
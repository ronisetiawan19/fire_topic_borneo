#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const EVENTS = [];
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
    if (/portal\.grab\.com|grabtaxi|grab\.com\/api|foodweb|foodweb-api/i.test(u)) {
      portalCalls.push({ method: req.method(), url: u, hasGid: !!req.headers()["x-gid"] });
    }
  });
  page.on("response", (resp) => {
    const u = resp.url();
    if (/portal\.grab\.com|grabtaxi/i.test(u)) {
      EVENTS.push({ status: resp.status(), ct: (resp.headers()["content-type"] || "").split(";")[0], url: u });
    }
  });

  const url = "https://food.grab.com/id/en";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);

  const inputs = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("input, [role=searchbox], [role=combobox], textarea, [contenteditable=true]")) {
      out.push({
        tag: el.tagName,
        type: el.getAttribute("type"),
        role: el.getAttribute("role"),
        placeholder: el.getAttribute("placeholder"),
        aria: el.getAttribute("aria-label"),
        id: el.id,
        name: el.name,
        cls: (el.className || "").toString().slice(0, 100),
      });
    }
    return out;
  });
  console.log("search-related elements on home:");
  for (const i of inputs) console.log("  ", JSON.stringify(i));

  console.log("\nall portal.grab.com request URLs:");
  for (const c of portalCalls) console.log("  ", c.method, c.url.slice(0, 220), "gid:", c.hasGid);
  console.log("\nall portal.grab.com response events:");
  for (const e of EVENTS) console.log("  [" + e.status + "]", e.ct, e.url.slice(0, 220));

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_home_inputs.json"), JSON.stringify({ inputs, requests: portalCalls, events: EVENTS }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
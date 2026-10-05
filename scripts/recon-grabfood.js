#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const CAPTURE = [];
const CONSOLE_MSGS = [];

async function installNetworkSpy(page) {
  await page.addInitScript(() => {
    if (window.__grabReconInstalled) return;
    window.__grabReconInstalled = true;
    window.__grabRecon = [];

    const record = (url, body) => {
      window.__grabRecon.push({ url, body, time: Date.now() });
    };

    const shouldCapture = (url) =>
      /grab|grabtaxi|food\.grab/i.test(url) ||
      (window.location.origin && url.startsWith(window.location.origin));

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const resp = await origFetch(...args);
      if (resp && resp.ok && shouldCapture(url)) {
        const clone = resp.clone();
        record(url, async () => {
          try {
            return await clone.text();
          } catch {
            return null;
          }
        });
      }
      return resp;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__grabUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          const url = this.__grabUrl || "";
          if (!shouldCapture(url)) return;
          record(url, async () => {
            try {
              return this.responseText || null;
            } catch {
              return null;
            }
          });
        }
      });
      return origSend.apply(this, args);
    };
  });

  page.on("response", (response) => {
    const url = response.url();
    if (/grab|grabtaxi|food\.grab/i.test(url)) {
      CAPTURE.push({
        status: response.status(),
        url,
        type: response.request().resourceType(),
        headers: Object.fromEntries(
          ["x-gid", "authorization", "x-gojek-client-id", "x-session-id"]
            .filter((k) => response.request().headers()[k])
            .map((k) => [k, response.request().headers()[k]]),
        ),
      });
    }
  });

  page.on("console", (msg) => {
    CONSOLE_MSGS.push({ type: msg.type(), text: msg.text().slice(0, 500) });
  });
}

async function drain(page, pattern) {
  return page.evaluate((pat) => {
    const entries = window.__grabRecon || [];
    const re = new RegExp(pat);
    const matches = entries.filter((e) => re.test(e.url));
    const rest = entries.filter((e) => !re.test(e.url));
    window.__grabRecon = rest;
    return matches;
  }, pattern.source ?? pattern);
}

function summarize(entries) {
  const out = {
    endpoint_counts: {},
    deals_search: [],
    deals_reviews: [],
    deals_token: [],
    deals_merchant: [],
    sample_review: null,
    sample_token: null,
  };
  for (const e of entries) {
    if (typeof e.body !== "string" || !e.body) continue;
    const urlKey = e.url.split("?")[0].replace(/\d+/g, "N");
    out.endpoint_counts[urlKey] = (out.endpoint_counts[urlKey] || 0) + 1;

    if (/(search|autocomplete|query)/i.test(e.url)) out.deals_search.push(e);
    if (/(review|rating|ulasan|comment)/i.test(e.url)) out.deals_reviews.push(e);
    if (/(token|guest|gid|session|config)/i.test(e.url)) out.deals_token.push(e);
    if (/(merchant|restaurant)/i.test(e.url)) out.deals_merchant.push(e);

    if (!out.sample_review && /review/i.test(e.body.slice(0, 200))) {
      out.sample_review = { url: e.url, body: e.body.slice(0, 5000) };
    }
    if (!out.sample_token && /token|gid/i.test(e.body.slice(0, 200))) {
      out.sample_token = { url: e.url, body: e.body.slice(0, 2000) };
    }
  }
  return out;
}

async function main() {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
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
  await installNetworkSpy(page);

  console.log("\n[1/4] Opening food.grab.com…");
  try {
    await page.goto("https://food.grab.com/id/en", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(5000);
  } catch (err) {
    console.log(`goto error: ${err.message}`);
  }
  const pageText = (
    await page.evaluate(() => document.body?.innerText || "").catch(() => "")
  ).slice(0, 800);
  console.log("PAGE:\n", pageText);

  const gotCaptcha = await page
    .evaluate(() =>
      /captcha|verify|robot|cf-|challenge|denied/i.test(
        document.body?.innerText || "",
      ),
    )
    .catch(() => false);
  console.log("CAPTCHA keyword?:", gotCaptcha);

  console.log("\n[2/4] Draining token/config requests…");
  await page.waitForTimeout(3000);
  const tokenEntries = await drain(page, /token|guest|config|gid|session/i);
  console.log("Token/config entries:", tokenEntries.length);
  for (const t of tokenEntries.slice(0, 5)) {
    console.log("  ", t.url.slice(0, 120));
    console.log("  ", String(t.body).slice(0, 250));
  }

  console.log("\n[3/4] Searching 'sky pasta' branches…");
  const branches = [
    "sky pasta pamulang",
    "sky pasta tebet",
    "sky pasta cinere",
    "sky pasta ciledug",
    "sky pasta petukangan",
    "sky pasta binus jakarta",
    "sky pasta galaxy bekasi",
  ];
  for (const searchQuery of branches) {
    try {
      await page.goto(
        `https://food.grab.com/id/en/search?q=${encodeURIComponent(searchQuery)}`,
        { waitUntil: "domcontentloaded", timeout: 35000 },
      );
      await page.waitForTimeout(4000);
    } catch (err) {
      console.log(`goto error: ${err.message}`);
    }
    await page.waitForTimeout(1500);
    const searchEntries = await drain(page, /search|restaurant|merchant/i);
    console.log(
      `Search "${searchQuery}": ${searchEntries.length} captured.`,
    );
    if (searchEntries.length > 0) {
      console.log("  FIRST URL:", searchEntries[0].url.slice(0, 160));
      console.log("  FIRST BODY:", String(searchEntries[0].body).slice(0, 400));
    }
  }

  console.log("\n[4/4] Collecting all remaining…");
  await page.waitForTimeout(2000);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(600);
  }
  const all = await drain(page, /./);
  console.log(`Final drain: ${all.length} remaining entries.`);
  const summary = summarize(all);

  const links = await page
    .evaluate(() =>
      Array.from(
        document.querySelectorAll('a[href*="merchant"], a[href*="restaurant"]'),
      )
        .map((a) => a.getAttribute("href"))
        .slice(0, 5),
    )
    .catch(() => []);
  console.log("Restaurant links:", links);

  if (links.length > 0) {
    let link = links[0];
    if (link.startsWith("/")) link = "https://food.grab.com" + link;
    try {
      await page.goto(link, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(5000);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(700);
      }
    } catch (err) {
      console.log(`goto error: ${err.message}`);
    }
  }

  const finalDrain = await drain(page, /./);
  const finalSummary = summarize(finalDrain);

  const report = {
    scraped_at: new Date().toISOString(),
    captcha_seen: gotCaptcha,
    console_messages: CONSOLE_MSGS.slice(-30),
    network_page_events: CAPTURE.slice(-200),
    initial_endpoint_counts: summary.endpoint_counts,
    final_endpoint_counts: finalSummary.endpoint_counts,
    token_entries: tokenEntries.slice(0, 3).map((e) => ({
      url: e.url.slice(0, 200),
      body: String(e.body).slice(0, 1500),
    })),
    search_entries: summary.deals_search.slice(0, 10).map((e) => ({
      url: e.url.slice(0, 200),
      body: String(e.body).slice(0, 1500),
    })),
    review_entries: [...summary.deals_reviews, ...finalSummary.deals_reviews]
      .slice(0, 10)
      .map((e) => ({
        url: e.url.slice(0, 200),
        body: String(e.body).slice(0, 3000),
      })),
    merchant_entries: summary.deals_merchant.slice(0, 10).map((e) => ({
      url: e.url.slice(0, 200),
      body: String(e.body).slice(0, 1500),
    })),
    sample_review: summary.sample_review || finalSummary.sample_review,
    sample_token: summary.sample_token || finalSummary.sample_token,
  };

  const filepath = path.join(OUT_DIR, "recon_grabfood.json");
  writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport written → ${filepath}`);

  console.log("\n=== ENDPOINT COUNTS ===");
  console.log("Initial:", JSON.stringify(summary.endpoint_counts, null, 2));
  console.log("Final:", JSON.stringify(finalSummary.endpoint_counts, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
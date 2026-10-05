#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

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

  const searchCalls = [];
  page.on("request", (req) => {
    if (/\/foodweb\/guest\/v2\/search$/.test(req.url())) searchCalls.push({ url: req.url(), headers: req.headers(), postData: req.postData() });
  });

  // First and only navigation to search page — this fires the in-page search fetch.
  await page.goto("https://food.grab.com/id/en/restaurants?search=sky%20pasta&support-deeplink=true&searchParameter=sky%20pasta", {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.waitForTimeout(9000);
  console.log("captured search calls:", searchCalls.length);

  const sess = searchCalls[0];
  if (!sess) { console.log("FATAL no captured session"); await browser.close(); process.exit(1); }
  const { url, headers } = sess;
  const hip = ["x-hydra-jwt", "x-grab-web-app-version", "x-gfc-country", "x-country-code", "content-type", "accept", "origin", "referer", "user-agent"];
  const reduced = {};
  for (const k of hip) if (headers[k]) reduced[k] = headers[k];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const out = {};
  // 1) Bekasi retry only (other 6 already captured in searchreplay run)
  console.log("=== bekasi ===");
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(9000 * (attempt + 1));
    const r = await context.request.post(url, {
      data: { latlng: "-6.2548368,106.9681690", keyword: "sky pasta", offset: 0, pageSize: 32, countryCode: "ID" },
      headers: reduced,
    });
    let json = null; try { json = await r.json(); } catch {}
    const ms = (json?.searchResult?.searchMerchants || []).filter((m) => /sky pasta/i.test(m.address?.name || ""));
    console.log("attempt", attempt, "status", r.status(), "sky matches:", ms.length);
    if (ms.length) {
      out.bekasi = { status: r.status(), total: json.searchResult.totalCount, matches: ms };
      for (const m of ms) console.log("  ", m.id, "|", m.address?.name, "| r=", m.merchantBrief?.rating, "v=", m.merchantBrief?.vote_count, JSON.stringify(m.urlSegments));
      break;
    }
    if (r.status() === 200) break;
  }

  // 2) merchant detail for slug discovery
  const ids = {
    pamulang: "IDGFSTI00000w7t",
    cinere: "6-CYNYJ2JBE6CKGT",
    tebet: "6-C6ADTJNYJFTKWA",
    petukangan: "6-C2BDENKVLYN2A2",
    ciledug: "6-CZMBUFTATB5HNN",
    binus_palmerah: "6-C3A3AFNUBBEDL6",
  };
  out.details = {};
  for (const [branch, id] of Object.entries(ids)) {
    await sleep(3500);
    const r = await context.request.get(`https://portal.grab.com/foodweb/guest/v2/merchants/${id}?latlng=-6.1767352,106.826504`, { headers: reduced });
    let json = null; try { json = await r.json(); } catch {}
    console.log(`\n[detail ${branch}] status=${r.status()} keys=${json ? Object.keys(json).join(",") : "NONE"}`);
    out.details[branch] = { id, status: r.status(), keys: json ? Object.keys(json) : [], merchant: json };
    if (json) {
      if (json.url || json.webUrl || json.shortUrl || json.dineoutUrl) console.log("  url:", JSON.stringify(json.url ?? json.webUrl ?? json.shortUrl ?? json.dineoutUrl));
      if (json.urlSegments || json.slug) console.log("  urlSegments:", JSON.stringify(json.urlSegments ?? json.slug));
      console.log("  name:", JSON.stringify(json.name || json.address?.name));
    }
  }

  writeFileSync(path.join(OUT_DIR, "recon_grabfood_details4.json"), JSON.stringify(out, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
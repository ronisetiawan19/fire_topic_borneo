#!/usr/bin/env bun
import { program } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { createBrowser } from "./browser.js";
import { loadCookies } from "./cookies.js";
import { installGmHook } from "./googlemaps/capture.js";
import { searchPlacesBrowser } from "./googlemaps/search.js";
import { gmGoto, collectPlacesFromDom, scrollFeed, detectBlockedOnPage } from "./googlemaps/parse.js";
import { getPlaceReviewsBrowser, resolveGoogleMapsShortLink } from "./googlemaps/reviews.js";
import { parsePlaceIdFromUrl } from "./utils.js";
import { exportJson, buildOutputPath } from "./exporter.js";
import { log, randomDelay, sanitizeFilename, todayStamp } from "./utils.js";
import { collectUrlInputs } from "./batch/inputs.js";
import { classifyInput } from "./googlemaps/inputs-extract.js";

function banner() {
  console.log(`
  ╭───────────────────────────────────────────╮
  │          Google Maps Scraper              │
  │              Bun · Playwright             │
  ╰───────────────────────────────────────────╯
  `);
}

function resolveRange(since, until, defaultDays = CONFIG.gm.sinceDefaultDays) {
  const parse = (s) => {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };
  let sinceDate = parse(since);
  if (!sinceDate && defaultDays > 0) {
    sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - defaultDays);
  }
  let untilDate = null;
  const parsedUntil = parse(until);
  if (until && parsedUntil) {
    untilDate = parsedUntil;
    untilDate.setHours(23, 59, 59, 999);
  }
  return { sinceDate, untilDate };
}

function formatRange(sinceDate, untilDate) {
  const from = sinceDate ? sinceDate.toISOString().slice(0, 10) : "all time";
  const to = untilDate ? untilDate.toISOString().slice(0, 10) : "now";
  return `${from} → ${to}`;
}

function filterByRange(reviews, sinceDate, untilDate) {
  const sinceT = sinceDate ? Math.floor(sinceDate.getTime() / 1000) : null;
  const untilT = untilDate ? Math.floor(untilDate.getTime() / 1000) : null;
  const kept = [];
  let skipped = 0;
  let unknown = 0;
  for (const r of reviews) {
    if (!r.time) {
      unknown += 1;
      kept.push({ ...r, date_flag: "unknown" });
      continue;
    }
    if (sinceT && r.time < sinceT) {
      skipped += 1;
      continue;
    }
    if (untilT && r.time > untilT) {
      skipped += 1;
      continue;
    }
    kept.push(r);
  }
  return { kept, skipped, unknown };
}

function getBaseName(inputs, type, hhmm) {
  if (type === "url") {
    if (inputs.length > 1) {
      const h = hhmm || (new Date().getHours().toString().padStart(2, "0") + new Date().getMinutes().toString().padStart(2, "0"));
      return `gm_places_${todayStamp()}_${h}`;
    }
    const id = parsePlaceIdFromUrl(inputs[0]);
    return `gm_place_${(id || "single").replace(":", "_")}`;
  }
  if (inputs.length > 1) return "gm_search_multi";
  const name = sanitizeFilename(String(inputs[0]).replace(/\s+/g, "_")).toLowerCase();
  return `gm_${name || "search"}`;
}

async function withBrowserPage(fn) {
  const cookiePath = CONFIG.gm.cookieFile;
  const cookieCheck = loadCookies(cookiePath);
  if (cookieCheck.ok && cookieCheck.cookies.length > 0) {
    log("Using optional Google cookie…", "info");
  } else {
    log(`Cookie "${cookiePath}" not found/empty — continuing without cookie.`, "warn");
  }

  const { browser, page } = await createBrowser({ cookieFile: CONFIG.gm.cookieFile });
  try {
    await installGmHook(page);
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}

async function readPlaceMeta(page) {
  try {
    return await page.evaluate(() => {
      const nameEl = document.querySelector('[class*="DUwDvf"]') || document.querySelector("h1");
      const name = nameEl?.textContent?.trim() || "";
      const addrEl = document.querySelector('[class*="Io6YTe"], [class*="W4Efsd"]');
      const address = addrEl?.textContent?.trim() || "";
      const ratingEl = document.querySelector('span[aria-hidden="true"]:not([class*="VfPpkd"])') || document.querySelector('[class*="MW4etd"], [class*="Aq14fc"]');
      const rating = parseFloat(ratingEl?.textContent?.trim() || "0") || 0;
      const countEl = document.querySelector('[aria-label*="ulasan"], [class*="DkEaL"]') || document.querySelector('[class*="UY7F9"]');
      const reviews_count = parseInt(countEl?.textContent?.replace(/\D/g, "") || "0") || 0;
      const pidEl = document.querySelector('a[href*="place_id="]');
      const hrefPid = pidEl?.href || "";
      const m = hrefPid.match(/place_id=([^&]+)/);
      const place_id = m ? m[1] : "";
      return { name, address, rating, reviews_count, place_id };
    });
  } catch {
    return { name: "", address: "", rating: 0, reviews_count: 0, place_id: "" };
  }
}
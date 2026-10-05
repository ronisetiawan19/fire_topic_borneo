#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CONFIG, USER_AGENTS } from "../src/config.js";
import { loadCookies } from "../src/cookies.js";
import { createBrowser } from "../src/browser.js";
import { installGmHook, drainGmCapture } from "../src/googlemaps/capture.js";
import {
  gmGoto,
  collectPlacesFromDom,
  scrollFeed,
  detectBlockedOnPage,
} from "../src/googlemaps/parse.js";
import { log, randomDelay } from "../src/utils.js";
import { searchPlacesBrowser } from "../src/googlemaps/search.js";

const DEBUG_DIR = path.resolve("output/debug");
mkdirSync(DEBUG_DIR, { recursive: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--headless");
  const headless = i === -1 ? true : args[i + 1] !== "false";
  const exact = args.includes("--exact");
  const prod = args.includes("--prod");
  const uaIdx = args.indexOf("--ua");
  const ua = uaIdx === -1 ? null : args[uaIdx + 1];
  const query = args.find((a) => !a.startsWith("--")) || "pasta pamulang";
  return { query, headless, exact, prod, ua };
}

async function createBrowserPinned(ua, headless) {
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: CONFIG.defaultLocale,
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["id-ID", "id", "en"],
    });
  });
  const cookieResult = loadCookies(CONFIG.gm.cookieFile);
  if (cookieResult.ok && cookieResult.cookies.length > 0) {
    await context.addCookies(cookieResult.cookies);
  }
  const page = await context.newPage();
  return { browser, context, page };
}

async function collectStats(page) {
  return page
    .evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      const base = { hasFeed: !!feed };
      if (!feed) return base;

      const children = Array.from(feed.children);
      const items = children.filter(
        (it) => it.matches("a") || it.querySelector('a[href*="/maps/place/"]'),
      );
      const placeIdOf = (url) => {
        if (!url) return null;
        const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
        if (m) return m[1];
        const p = url.match(
          /(?:^|[^0-9a-fA-F])(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})(?:[^0-9a-fA-F]|$)/,
        );
        return p ? p[1] : null;
      };
      let withId = 0;
      const linkSamples = [];
      for (const it of items) {
        const a = it.matches("a") ? it : it.querySelector('a[href*="/maps/place/"]');
        const href = a?.getAttribute("href") || "";
        if (placeIdOf(href)) withId += 1;
        if (linkSamples.length < 3) linkSamples.push(href.slice(0, 220));
      }

      const chain = [feed];
      for (let p = feed.parentElement; p && chain.length < 4; p = p.parentElement)
        chain.push(p);
      const scrollables = chain.map((el) => ({
        tag: `${el.tagName}.${String(el.className || "").toString().slice(0, 50)}`,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      }));

      const panels = Array.from(document.querySelectorAll('div[class*="m6QErb"]'))
        .filter((p) => p.clientHeight > 200)
        .map((p) => ({
          clientHeight: p.clientHeight,
          scrollHeight: p.scrollHeight,
          scrollTop: p.scrollTop,
          children: p.children.length,
        }));

      return {
        ...base,
        feedChildren: children.length,
        feedItems: items.length,
        feedWithId: withId,
        linkSamples,
        scrollables,
        panelCount: panels.length,
        panels: panels.slice(0, 4),
        bodyHeight: document.body.scrollHeight,
      };
    })
    .catch((e) => ({ error: String(e) }));
}

function extractPlaceIdsFromCapture(capture) {
  const ids = new Set();
  for (const c of capture || []) {
    const s = JSON.stringify(c.body || {});
    const m = s.match(/0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,}/g);
    if (m) m.forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

async function main() {
  const { query, headless, exact, prod, ua } = parseArgs();
  const limit = 10;
  const lang = CONFIG.gm.defaultLang;
  const q = encodeURIComponent(query.trim());
  const searchUrl = `${CONFIG.gm.searchUrl}/${q}`;

  const { browser, page } = ua
    ? await createBrowserPinned(ua, headless)
    : await createBrowser({ headless, cookieFile: CONFIG.gm.cookieFile });
  try {
    await installGmHook(page);
    log(`DEBUG START query="${query}" limit=${limit} headless=${headless}`, "highlight");

    if (prod) {
      const res = await searchPlacesBrowser(page, query, { limit, lang });
      log(
        `[prod-fn] ok=${res.ok} results=${res.results?.length} reason=${res.reason || "none"}`,
        "success",
      );
      return;
    }

    const blocked = await gmGoto(page, searchUrl, lang);
    log(
      `blocked=${blocked.blocked}${blocked.reason ? ` reason=${blocked.reason}` : ""}`,
      "info",
    );
    if (blocked.blocked) return;

    await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => {});
    const afterWait = await detectBlockedOnPage(page);
    log(`afterWait blocked=${afterWait.blocked}`, "info");

    if (exact) {
      let places = await collectPlacesFromDom(page);
      let emptyRounds = 0;
      const maxRounds = Math.max(4, Math.ceil(limit / 2));
      log(
        `[exact] initial official=${places.length} maxRounds=${maxRounds} limit=${limit}`,
        "info",
      );
      for (let round = 1; round <= maxRounds; round++) {
        if (limit > 0 && places.length >= limit) break;
        const before = places.length;
        await scrollFeed(page);
        const stats = await collectStats(page);
        const next = await collectPlacesFromDom(page);
        const grew = next.length !== before;
        if (!grew) emptyRounds += 1;
        else emptyRounds = 0;
        log(
          `[exact round ${round}] official ${before}->${next.length} children=${stats.feedChildren} items=${stats.feedItems} withId=${stats.feedWithId} emptyRounds=${emptyRounds}${!grew ? " <- NO GROWTH" : ""}`,
          grew ? "success" : "warn",
        );
        places = next;
        if (emptyRounds >= 2) break;
        await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
      }
      log(`[exact final] official=${places.length}`, "success");
      return;
    }

    for (let round = 1; round <= 10; round++) {
      const stats = await collectStats(page);
      const official = await collectPlacesFromDom(page);
      log(
        `[round ${round}] children=${stats.feedChildren} items=${stats.feedItems} withId=${stats.feedWithId} official=${official.length} scrollTop=${stats.scrollables?.[0]?.scrollTop}/${stats.scrollables?.[0]?.scrollHeight} panels=${stats.panelCount}`,
        "info",
      );

      if (round === 1 && (stats.feedChildren || 0) > 0) {
        const html = await page
          .$eval('div[role="feed"]', (el) =>
            Array.from(el.children)
              .slice(0, 2)
              .map((c, i) => ({ i, html: c.outerHTML.slice(0, 4000) })),
          )
          .catch(() => []);
        for (const item of html) {
          const file = path.join(DEBUG_DIR, `gm_feed_round1_item${item.i}.html`);
          writeFileSync(file, item.html, "utf-8");
          log(`  dumped item ${item.i} -> ${file}`, "info");
        }
      }

      if (stats.hasFeed && official.length >= limit) break;
      if (round >= 1) await scrollFeed(page);
    }

    const capture = await drainGmCapture(page, /batchexecute|rpcs/);
    const netIds = extractPlaceIdsFromCapture(capture);
    log(
      `network batchexecute/rpcs captured=${capture.length} uniquePlaceIdsInResponses=${netIds.length}`,
      "info",
    );
    if (capture.length) {
      const file = path.join(DEBUG_DIR, "gm_network_capture.json");
      writeFileSync(file, JSON.stringify(capture, null, 2), "utf-8");
      log(`network capture -> ${file}`, "info");
    }

    const probe = async (tag) => {
      const before = await collectPlacesFromDom(page);
      const beforeStats = await page
        .evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          return feed ? feed.children.length : 0;
        })
        .catch(() => 0);
      await page.keyboard.press("End");
      await page.waitForTimeout(1200);
      await scrollFeed(page);
      await scrollFeed(page);
      const after = await collectPlacesFromDom(page);
      const afterStats = await page
        .evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          return feed ? feed.children.length : 0;
        })
        .catch(() => 0);
      log(
        `[probe:${tag}] official ${before.length}->${after.length}, children ${beforeStats}->${afterStats}`,
        "info",
      );
      return after.length;
    };

    await probe("End+3x aggressive scroll");

    const finals = await collectStats(page);
    log(
      `FINAL children=${finals.feedChildren} items=${finals.feedItems} withId=${finals.feedWithId} feedScrollTop=${finals.scrollables?.[0]?.scrollTop}/${finals.scrollables?.[0]?.scrollHeight} bodyHeight=${finals.bodyHeight}`,
      "success",
    );
    log(`linkSamples=${JSON.stringify(finals.linkSamples)}`, "info");
  } catch (e) {
    log(`DEBUG FAILED: ${e.message}`, "error");
    if (e.stack) log(e.stack.slice(0, 1500), "error");
  } finally {
    await browser.close();
  }
}

await main();
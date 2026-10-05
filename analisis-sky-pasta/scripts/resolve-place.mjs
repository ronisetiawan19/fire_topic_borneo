import { writeFileSync, mkdirSync } from "node:fs";
import { CONFIG } from "../config.js";
import { createBrowser, gotoGm, log, randomDelay } from "../lib/http.js";
import { collectPlacesFromDom, parseCoordsFromLink, scrollFeed } from "../lib/parse.js";

const QUERIES = ["Sky Pasta Pamulang", "Sky Pasta", "SKY PASTA"];

async function collectFallback(page) {
  return await page.evaluate(() => {
    const seen = new Map();
    for (const a of Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))) {
      const href = a.getAttribute("href") || "";
      const abs = href.startsWith("http") ? href : `https://www.google.com/maps${href.replace(/^\./, "")}`;
      if (seen.has(abs)) continue;
      const card = a.closest("div")?.parentElement?.parentElement || a;
      const name = (a.getAttribute("aria-label") || a.querySelector("h3, [class*='qBF1Pd'], [class*='fontHeadlineSmall']")?.textContent || "").trim();
      if (!name) continue;
      seen.set(abs, { name, link: abs, rating: 0, reviews_count: 0, detail: (card.textContent || "").slice(0, 300) });
    }
    return Array.from(seen.values());
  });
}

async function searchTry(page, query) {
  const url = `${CONFIG.gm.searchUrl}/${encodeURIComponent(query)}/@-6.27,106.72,11z`;
  log(`  [query] "${query}"`, "highlight");
  const blocked = await gotoGm(page, url);
  if (blocked.blocked) {
    log(`  BLOCKED — ${blocked.reason}`, "error");
    return { places: [], text: "" };
  }
  await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"]', { timeout: 15000 }).catch(() => {});
  for (let r = 0; r < 3; r++) {
    const f = await collectPlacesFromDom(page);
    const g = await collectFallback(page);
    const merged = new Map();
    for (const p of [...f, ...g]) {
      if (!merged.has(p.link)) merged.set(p.link, p);
    }
    if (merged.size) return { places: Array.from(merged.values()), text: "" };
    await scrollFeed(page);
  }
  await randomDelay(600, 1200);
  const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 500));
  return { places: [], text };
}

async function main() {
  const { browser, page } = await createBrowser({ headless: true });
  try {
    const all = new Map();
    let dump = "";
    for (const q of QUERIES) {
      const { places, text } = await searchTry(page, q);
      for (const p of places) if (!all.has(p.link)) all.set(p.link, p);
      if (text) dump = text;
    }

    const withCoords = Array.from(all.values())
      .map((p) => ({ ...p, coords: parseCoordsFromLink(p.link) }))
      .filter((p) => p.coords);

    log(`${withCoords.length} hasil unik berkoordinat`, "info");
    for (const p of withCoords.slice(0, 10)) {
      console.log(
        `${String(p.name).padEnd(34)} | r=${p.rating} n=${p.reviews_count} | ${p.coords.lat},${p.coords.lon}`,
      );
    }
    if (!withCoords.length && dump) {
      log("Dump halaman:", "warn");
      console.log(dump.split("\n").slice(0, 12).join("\n"));
    }

    const dir = CONFIG.pamulang.outDir;
    mkdirSync(dir, { recursive: true });
    const file = CONFIG.pamulang.placeFile;
    writeFileSync(
      file,
      JSON.stringify(
        { query: QUERIES, resolvedAt: new Date().toISOString(), results: withCoords.slice(0, 15), dump },
        null,
        2,
      ),
      "utf-8",
    );
    log(`Tersimpan: ${file}`, "success");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`, "error");
  process.exit(1);
});
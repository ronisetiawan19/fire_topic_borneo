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

function banner() {
  console.log(`
  ╭───────────────────────────────────────────╮
  │          Google Maps Scraper              │
  │              Bun · Playwright             │
  ╰───────────────────────────────────────────╯
  `);
}

/**
 * @param {number} defaultDaysAmbt cutoff default bila --since tidak diberikan.
 *   > 0 -> mundur defaultDaysAmbt hari (dipakai command `search`).
 *   = 0 -> tanpa batas bawah, yaitu semua ulasan (dipakai command `url`).
 */
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

function getBaseName(inputs, type) {
  if (type === "url") {
    if (inputs.length > 1) return "gm_places";
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
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function searchFlow({ queries, output, outputFormat, limit, maxReviews, since, until, sort }) {
  banner();
  const { sinceDate, untilDate } = resolveRange(since, until);
  log(`Date range (default 1yr): ${formatRange(sinceDate, untilDate)}`, "info");

  return withBrowserPage(async (page) => {
    const allPlaces = [];

    for (const q of queries) {
      const res = await searchPlacesBrowser(page, q, { limit });
      if (!res.ok) {
        log(`Search failed for "${q}": ${res.reason || "unknown"}`, "error");
        continue;
      }
      const places = [];
      let totalReviews = 0;
      for (const p of res.results) {
        const r = await getPlaceReviewsBrowser(page, p, { maxReviews, sort });
        if (r.ok) {
          const filtered = filterByRange(r.results, sinceDate, untilDate);
          if (filtered.skipped > 0)
            log(`    ${filtered.skipped} reviews outside range skipped.`, "info");
          const meta = await readPlaceMeta(page);
          const enriched = {
            ...p,
            name: meta.name || p.name,
            rating: meta.rating || p.rating,
            reviews_count: meta.reviews_count || p.reviews_count,
            address: meta.address || p.detail || "",
          };
          places.push({ ...enriched, reviews: filtered.kept });
          totalReviews += filtered.kept.length;
        } else {
          log(`    Reviews failed for ${p.name}: ${r.reason || r.error || "unknown"}`, "error");
        }
        await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
      }
      log(`"${q}" → ${places.length} places, ${totalReviews} reviews (in range)`, "success");
      allPlaces.push(...places);
    }

    if (!allPlaces.length) {
      log("No places collected.", "warn");
      return;
    }

    const baseName = getBaseName(queries, "search");
    writeOutputs({
      baseName,
      places: allPlaces,
      query: queries,
      since: sinceDate.toISOString().slice(0, 10),
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      sort,
      output,
      outputFormat,
    });
  });
}

async function urlFlow({ urls, output, outputFormat, maxReviews, since, until, sort }) {
  banner();
  // Default 0 = tanpa batas bawah: ambil SEMUA ulasan, kecuali user memberi
  // --since/--until. Inilah yang membuat `url` berbeda dari `search`.
  const { sinceDate, untilDate } = resolveRange(since, until, 0);
  log(
    sinceDate || untilDate
      ? `Date range: ${formatRange(sinceDate, untilDate)}`
      : "Date range: all time (no --since/--until) — semua ulasan akan diambil.",
    "info",
  );

  return withBrowserPage(async (page) => {
    const allPlaces = [];

    for (const u of urls) {
      let placeUrl = u;
      let placeId = parsePlaceIdFromUrl(u);
      if (!placeId && /goo\.gl|redirect/i.test(u)) {
        log(`Resolving short link ${u}...`, "highlight");
        const resolved = await resolveGoogleMapsShortLink(page, u);
        if (!resolved.ok) {
          log(`Could not resolve short link: ${resolved.reason}`, "error");
          continue;
        }
        placeUrl = resolved.url;
        placeId = parsePlaceIdFromUrl(resolved.url);
      }
      if (!placeId) {
        log(`Could not extract place ID from: ${u}`, "error");
        continue;
      }

      const place = { place_id: placeId, name: placeId, link: placeUrl };
      const r = await getPlaceReviewsBrowser(page, place, { maxReviews, sort });
      if (!r.ok) {
        log(`Reviews failed: ${r.reason || r.error || "unknown"}`, "error");
        continue;
      }
      const filtered = filterByRange(r.results, sinceDate, untilDate);
      const meta = await readPlaceMeta(page);
      allPlaces.push({
        place_id: meta.place_id || placeId,
        name: meta.name || placeId,
        address: meta.address,
        rating: meta.rating,
        reviews_count: meta.reviews_count,
        link: placeUrl,
        reviews: filtered.kept,
      });
      log(`URL → ${filtered.kept.length} reviews (${filtered.skipped} skipped, ${filtered.unknown} unknown date)`, "success");
      await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
    }

    if (!allPlaces.length) {
      log("No places collected.", "warn");
      return;
    }

    const baseName = getBaseName(urls, "url");
    writeOutputs({
      baseName,
      places: allPlaces,
      query: urls,
      since: sinceDate ? sinceDate.toISOString().slice(0, 10) : null,
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      sort,
      output,
      outputFormat,
    });
  });
}

async function readPlaceMeta(page) {
  try {
    return await page.evaluate(() => {
      const nameEl = document.querySelector('[class*="DUwDvf"]') || document.querySelector("h1");
      const name = nameEl?.textContent?.trim() || "";
      const addrEl = document.querySelector('[class*="Io6YTe"], [class*="W4Efsd"]');
      const address = addrEl?.textContent?.trim() || "";
      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      const absHref = anchors[0]?.getAttribute("href") || "";
      const place_id =
        absHref.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/)?.[1] || "";
      let rating = 0;
      const ratingHolder =
        document.querySelector('[class*="F7nice "]')?.parentElement ||
        document.querySelector('[class*="DUwDvf"]')?.parentElement;
      if (ratingHolder) {
        const m = ratingHolder.getAttribute("aria-label")?.match(/(\d(?:[.,]\d)?)/);
        rating = m ? parseFloat(m[1].replace(",", ".")) || 0 : 0;
      }
      if (!rating) {
        const img = document.querySelector('[aria-hidden="true"] span[aria-hidden="true"]');
        if (img) {
          rating = parseFloat((img.textContent || "").replace(",", ".")) || 0;
        }
      }
      let reviews_count = 0;
      const list = document.querySelector('[class*="F7nice "]')?.parentElement;
      if (list) {
        const m = (list.parentElement?.innerText || "").match(/([\d.,]+)\s*(ulasan|reviews?)/i);
        reviews_count = m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0 : 0;
      }
      if (!reviews_count) {
        const m = (document.body.innerText || "").match(
          /([\d.,]+)\s*(ulasan|reviews?)/i,
        );
        reviews_count = m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0 : 0;
      }
      return { place_id, name, address, rating, reviews_count };
    });
  } catch {
    return { place_id: "", name: "", address: "", rating: 0, reviews_count: 0 };
  }
}

function extractLatLon(link) {
  if (!link) return { lat: null, lon: null };
  const m = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  const a = link.match(/@(-?\d+\.\d+(?:,\d+)?),(-?\d+\.\d+(?:,\d+)?)/);
  if (a) return { lat: parseFloat(a[1]), lon: parseFloat(a[2]) };
  return { lat: null, lon: null };
}

async function geocodeFlow({ queries, output, outputFormat, limit }) {
  banner();
  log("Geocode mode: coordinate + address only, no reviews.", "info");

  return withBrowserPage(async (page) => {
    const results = [];

    for (const q of queries) {
      const l = CONFIG.gm.defaultLang;
      const url = `${CONFIG.gm.searchUrl}/${encodeURIComponent(String(q).trim())}`;
      log(`Geocoding "${q}"…`, "highlight");

      const blocked = await gmGoto(page, url, l);
      if (blocked.blocked) {
        log(`Search blocked for "${q}": ${blocked.reason || "unknown"}`, "error");
        results.push({ query: q, ok: false, reason: blocked.reason || "blocked", places: [] });
        continue;
      }

      await page.waitForSelector('div[role="feed"]', { timeout: 12000 }).catch(() => {});
      const blockedDetect = await detectBlockedOnPage(page);
      if (blockedDetect.blocked) {
        log(`Search blocked for "${q}" (detected on page).`, "error");
        results.push({ query: q, ok: false, reason: blockedDetect.reason || "blocked", places: [] });
        continue;
      }

      let places = await collectPlacesFromDom(page);
      let emptyRounds = 0;
      const maxRounds = Math.max(4, Math.ceil((limit || CONFIG.gm.maxPlaces) / 2));
      for (let round = 1; round <= maxRounds; round++) {
        if (limit > 0 && places.length >= limit) break;
        const before = places.length;
        await scrollFeed(page);
        places = await collectPlacesFromDom(page);
        if (places.length === before) emptyRounds += 1;
        else emptyRounds = 0;
        if (emptyRounds >= 2) break;
      }

      const hit = (limit > 0 ? places.slice(0, limit) : places).map((p) => ({
        query: q,
        name: p.name || "",
        place_id: p.place_id || "",
        address: p.detail || "",
        ...extractLatLon(p.link),
        link: p.link || "",
        rating: p.rating || 0,
        reviews_count: p.reviews_count || 0,
      }));

      if (!hit.length) {
        const meta = await readPlaceMeta(page);
        const single = extractLatLon(page.url());
        if (meta.address || meta.name || single.lat !== null) {
          hit.push({
            query: q,
            name: meta.name || "?",
            place_id: meta.place_id || "",
            address: meta.address || "",
            lat: single.lat,
            lon: single.lon,
            link: page.url(),
            rating: meta.rating || 0,
            reviews_count: meta.reviews_count || 0,
          });
        }
      }

      log(`"${q}" → ${hit.length} place(s)`, hit.length ? "success" : "warn");
      results.push({ query: q, ok: hit.length > 0, places: hit });
      await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
    }

    const all = results.flatMap((r) => r.places);
    if (!all.length) {
      log("No coordinates collected.", "warn");
      return;
    }

    const baseName = "gm_geocode";
    const jsonPath = buildOutputPath(baseName, "json", output);
    const data = {
      mode: "geocode",
      scraped_at: new Date().toISOString(),
      total_queries: queries.length,
      total_places: all.length,
      results,
    };
    exportJson(data, jsonPath);
    log(`JSON saved → ${jsonPath}`, "success");

    if (outputFormat === "csv" || outputFormat === "both") {
      const csvPath = buildOutputPath(baseName, "csv", output);
      exportCsvGeocode(all, csvPath);
      log(`CSV saved → ${csvPath}`, "success");
    }
  });
}

function exportCsvGeocode(rows, filepath) {
  const headers = [
    "query",
    "name",
    "place_id",
    "address",
    "lat",
    "lon",
    "link",
    "rating",
    "reviews_count",
  ];
  mkdirSync(path.dirname(filepath), { recursive: true });
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ];
  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
  return filepath;
}

function writeOutputs({ baseName, places, query, since, until, sort, output, outputFormat }) {
  const totalReviews = places.reduce((acc, p) => acc + p.reviews.length, 0);
  const data = {
    query,
    mode: "browser",
    date_range: { since, until },
    sort: sort || "relevant",
    scraped_at: new Date().toISOString(),
    total_places: places.length,
    total_reviews: totalReviews,
    places,
  };

  const jsonPath = buildOutputPath(baseName, "json", output);
  exportJson(data, jsonPath);
  log(`JSON saved → ${jsonPath}`, "success");

  if (outputFormat === "csv" || outputFormat === "both") {
    const csvPath = buildOutputPath(baseName, "csv", output);
    exportCsvGm(places, csvPath);
    log(`CSV saved → ${csvPath}`, "success");
  }
}

function exportCsvGm(places, filepath) {
  const headers = [
    "place_name",
    "place_id",
    "place_address",
    "place_rating",
    "place_total_reviews",
    "review_author",
    "review_rating",
    "review_text",
    "review_time_label",
    "review_time",
  ];
  mkdirSync(path.dirname(filepath), { recursive: true });
  const rows = [];
  for (const p of places) {
    if (!p.reviews.length) {
      rows.push([
        p.name,
        p.place_id,
        p.address || "",
        p.rating,
        p.reviews_count,
        "",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const r of p.reviews) {
      rows.push([
        p.name,
        p.place_id,
        p.address || "",
        p.rating,
        p.reviews_count,
        r.author,
        r.rating,
        r.text,
        r.time_label,
        r.time || "",
      ]);
    }
  }
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
  return filepath;
}

program
  .name("googlemaps-scraper")
  .description("Google Maps scraper — search places and collect reviews (dataset)")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.googlemaps)
  .option("-f, --format <format>", "output format: json, csv, both", "json")
  .option("--headless <bool>", "headless mode", (v) => v !== "false", true);

/** Cetak ringkasan input batch supaya pengguna bisa sanity-check sebelum scraping. */
function reportInputs(loaded, total) {
  for (const s of loaded.sources) {
    log(`  ${s.label} → ${s.count} URL(s)`, "info");
  }
  if (loaded.duplicates.length) {
    log(`  ${loaded.duplicates.length} duplicate(s) removed.`, "info");
  }
  const { blank, comment } = loaded.skipped;
  if (blank || comment) {
    log(`  ${blank} blank line(s) and ${comment} comment line(s) skipped.`, "info");
  }
  if (loaded.suspicious.length) {
    log(`  ${loaded.suspicious.length} line(s) do not look like Google Maps URLs:`, "warn");
    for (const u of loaded.suspicious.slice(0, 5)) log(`    ${u}`, "warn");
    if (loaded.suspicious.length > 5) {
      log(`    …and ${loaded.suspicious.length - 5} more`, "warn");
    }
    log("  They will be reported and skipped by the scraper.", "warn");
  }
  log(`Total ${total} URL(s) queued.`, "success");
}

program
  .command("search")
  .description("Search places by keyword and collect their reviews")
  .argument("<queries...>", "one or more search queries (e.g. 'klinik gigi jakarta')")
  .option("-l, --limit <n>", "max places per query", (v) => parseInt(v, 10), CONFIG.gm.maxPlaces)
  .option("--max-reviews <n>", "max reviews per place (0 = unlimited, but capped by date range)", (v) => parseInt(v, 10), CONFIG.gm.maxReviews)
  .option("--since <YYYY-MM-DD>", "only reviews after this date (default: 1 year ago)")
  .option("--until <YYYY-MM-DD>", "only reviews before this date (default: now)")
  .option("--sort <sort>", "review sort order: relevant, newest", "relevant")
  .action(async (queries, opts) => {
    const options = program.opts();
    await searchFlow({
      queries,
      output: options.output,
      outputFormat: options.format,
      limit: opts.limit,
      maxReviews: opts.maxReviews,
      since: opts.since,
      until: opts.until,
      sort: opts.sort,
      headless: options.headless,
    });
  });

program
  .command("geocode")
  .description("Search places and extract coordinates+address (no reviews)")
  .argument("<queries...>", "one or more search queries (e.g. 'Jl. Sultan Agung, Way Halim')")
  .option("-l, --limit <n>", "max places per query", (v) => parseInt(v, 10), CONFIG.gm.maxPlaces)
  .action(async (queries, opts) => {
    const options = program.opts();
    await geocodeFlow({
      queries,
      output: options.output,
      outputFormat: options.format,
      limit: opts.limit,
    });
  });

program
  .command("url")
  .description("Collect reviews from one or more Google Maps place URLs (all reviews by default)")
  .argument(
    "[urls...]",
    "google maps place URLs, @file.txt, or - to read from stdin (supports goo.gl short links)",
  )
  .option("--file <path>", "read URLs from a text file, one per line (# comments allowed)")
  .option("--max-reviews <n>", "max reviews per place (0 = unlimited)", (v) => parseInt(v, 10), CONFIG.gm.maxReviews)
  .option("--since <YYYY-MM-DD>", "only reviews after this date (default: no limit, all time)")
  .option("--until <YYYY-MM-DD>", "only reviews before this date (default: now)")
  .option("--sort <sort>", "review sort order: relevant, newest", "relevant")
  .action(async (urls, opts) => {
    const options = program.opts();

    let loaded;
    try {
      loaded = collectUrlInputs({ positional: urls || [], file: opts.file || null });
    } catch (err) {
      log(err.message, "error");
      process.exitCode = 1;
      return;
    }

    const allUrls = loaded.urls;
    if (!allUrls.length) {
      log("No Google Maps URL found.", "error");
      log(
        "Usage: googlemaps-scraper url <urls...> | --file links.txt | @links.txt | -",
        "info",
      );
      process.exitCode = 1;
      return;
    }

    reportInputs(loaded, allUrls.length);
    await urlFlow({
      urls: allUrls,
      output: options.output,
      outputFormat: options.format,
      maxReviews: opts.maxReviews,
      since: opts.since,
      until: opts.until,
      sort: opts.sort,
      headless: options.headless,
    });
  });

program.parse();
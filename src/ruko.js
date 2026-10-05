#!/usr/bin/env bun
import { program } from "commander";
import path from "node:path";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { loadAll, findTitik } from "./ruko/datasets.js";
import { createPlatformBrowser, crawlTitik } from "./ruko/platforms/shared.js";
import * as rumah123 from "./ruko/platforms/rumah123.js";
import * as lamudi from "./ruko/platforms/lamudi.js";
import { writeOutputs } from "./ruko/export.js";
import { generateDemoListings } from "./ruko/demo.js";
import { runShortlist, writeShortlistCsv, writeShortlistJson } from "./ruko/shortlist.js";
import { log, randomDelay, todayStamp } from "./utils.js";

const PLATFORM_MODULES = { rumah123, lamudi };
const PLATFORMS = (CONFIG.ruko.platforms || ["rumah123", "lamudi"])
  .map((p) => PLATFORM_MODULES[p])
  .filter(Boolean);

function banner() {
  console.log(`
  ╭──────────────────────────────────────────────────╮
  │          Ruko Sewa Scraper (Rumah123)            │
  │           Bun · Playwright · 18 titik            │
  ╰──────────────────────────────────────────────────╯
  `);
}

function printTitikList() {
  const { titik } = loadAll();
  banner();
  console.log("");
  console.log("  Daftar titik kandidat (18):");
  for (const t of titik) {
    const warn = t.catatan_cakupan ? " ⚠" : "";
    const komp = `A:${t.count_A} B:${t.count_B} C:${t.count_C}`;
    console.log(
      `  ${String(t.index).padStart(2, "0")}. ${t.nama.padEnd(30)} ${t.kota.padEnd(18)} site=${String(
        t.skor_site,
      ).padStart(5)} komp=${String(t.skor_kompetisi).padStart(3)} (${komp})${warn}`,
    );
  }
  console.log("");
  console.log('  Gunakan: bun src/ruko.js search <nama|nomor|all>');
}

function resolveTitiks(selector, { all }) {
  const { titik } = loadAll();
  if (all || selector === "all") return titik;
  const found = findTitik(selector);
  if (!found) {
    log(`Titik "${selector}" tidak ditemukan.`, "error");
    printTitikList();
    process.exit(1);
  }
  return [found];
}

async function runSearch(titiks, opts) {
  const { browser } = await createPlatformBrowser({ headless: opts.headless, forceHttp1: opts.http1 });
  const results = [];
  try {
    for (const [i, t] of titiks.entries()) {
      log(`[${i + 1}/${titiks.length}] ${t.nama} (${t.kota})`, "highlight");
      const perPlatform = {};
      const allListings = [];
      let rawTotal = 0;
      let semuTotal = 0;
      let anyBlocked = false;
      for (const plat of PLATFORMS) {
        const res = await crawlTitik(plat, t, { browser, limit: opts.limit, force: opts.force });
        perPlatform[plat.name] = res.blocked
          ? `blocked(${res.blocked})`
          : `${res.listings.length}/${res.total_semua}`;
        if (res.blocked) anyBlocked = true;
        rawTotal += res.total_raw;
        semuTotal += res.total_semua;
        allListings.push(...(res.listings || []));
      }
      const seen = new Set();
      const deduped = allListings.filter((l) => {
        if (!l.link) return true;
        if (seen.has(l.link)) return false;
        seen.add(l.link);
        return true;
      });
      deduped.sort((a, b) => b.quality - a.quality);
      const top = deduped.slice(0, opts.limit);
      results.push({
        ...t,
        titik: t.nama,
        kota: t.kota,
        scraper: "multi_platform",
        platform_results: perPlatform,
        blocked: anyBlocked,
        ok: !anyBlocked,
        total_raw: rawTotal,
        total_semua: semuTotal,
        listings: top,
        scraped_at: new Date().toISOString(),
      });
      if (anyBlocked) log(`  sebagian platform diblokir — hasil bisa tidak lengkap`, "warn");
      else log(`  ${top.length} listing terbaik digabung dari ${semuTotal} ditemukan`, "success");
      if (i < titiks.length - 1) await randomDelay(CONFIG.ruko.delayMin, CONFIG.ruko.delayMax);
    }
  } finally {
    await browser.close();
  }
  return results;
}

program
  .name("ruko-scraper")
  .description("Scraper sewa ruko per titik kandidat ekspansi (Rumah123) + scoring gabungan")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.ruko)
  .option("-f, --format <format>", "output format: json, csv, both", "both")
  .option("--headless <bool>", "headless mode", (v) => v !== "false", true);

program
  .command("list")
  .description("Tampilkan 18 titik kandidat + skor awal (tanpa scraping)")
  .action(() => {
    printTitikList();
  });

program
  .command("search")
  .description("Scrape listing sewa ruko untuk titik tertentu (nama, nomor, atau 'all')")
  .argument("<titik>", "nama titik, nomor titik, atau 'all'")
  .option("-l, --limit <n>", "jumlah listing terbaik per titik", parseInt, CONFIG.ruko.maxListings)
  .option("-r, --radius-km <n>", "radius referensi titik (km)", parseFloat, CONFIG.ruko.radiusKm)
  .option("--force", "abaikan checkpoint dan scrape ulang", false)
  .option("--http1", "paksa HTTP/1.1 (fallback untuk HTTP/2 yang gagal)", false)
  .action(async (titik, opts) => {
    const options = program.opts();
    const titiks = resolveTitiks(titik, { all: titik === "all" });
    banner();
    log(`${titiks.length} titik akan di-scrape (limit ${opts.limit}/titik, radius ${opts.radiusKm} km)`, "info");
    log(`Platform: ${PLATFORMS.map((p) => p.name).join(", ")}`, "info");
    const results = await runSearch(titiks, { ...opts, headless: options.headless });
    const { jsonPath, csvPath } = writeOutputs({
      titikResults: results,
      radiusKm: opts.radiusKm,
      limit: opts.limit,
      output: options.output,
      outputFormat: options.format,
    });
    log(`JSON saved → ${jsonPath}`, "success");
    if (csvPath) log(`CSV saved → ${csvPath}`, "success");
  });

program
  .command("shortlist")
  .description("Lengkapi kandidat dari pool lama dgn koordinat LDP/SRP + alamat OSM (8 titik deck)")
  .option("--deck <file>", "file koordinat deck 8 titik", "plan-fitur/8_titik_deck.csv")
  .option("--pool <file>", "file pool lista lama (hasil search)", "output/ruko/ruko_2026-09-14.json")
  .option("--min-tanah <n>", "min luas tanah (m²) utk jadi kandidat utama", parseInt, 300)
  .option("--max-per-titik <n>", "max kandidat per titik", parseInt, 8)
  .option("--include-tanah", "ikutkan fallback SRP /tanah/ utk koordinat", false)
  .action(async (opts) => {
    banner();
    const options = program.opts();
    log(
      `Shortlist: deck=${opts.deck} pool=${opts.pool} minTanah=${opts.minTanah} maxPerTitik=${opts.maxPerTitik}`,
      "info",
    );
    const rows = await runShortlist({
      deckFile: opts.deck,
      poolFile: opts.pool,
      minTanah: opts.minTanah,
      maxPerTitik: opts.maxPerTitik,
      includeTanah: opts.includeTanah,
    });
    const stamp = todayStamp();
    const jsonPath = path.join(options.output, `shortlist_300m2_real_${stamp}.json`);
    writeShortlistJson(rows, jsonPath);
    log(`JSON saved → ${jsonPath}`, "success");
    const csvPath = path.join(options.output, `shortlist_300m2_real_${stamp}.csv`);
    writeShortlistCsv(rows, csvPath);
    log(`CSV saved → ${csvPath}`, "success");
  });

program
  .command("demo")
  .description("Jalankan pipeline scoring + export dengan data contoh (tanpa internet)")
  .option("-o, --output <dir>", "output directory", "output/ruko_demo")
  .option("-f, --format <format>", "output format: json, csv, both", "both")
  .action(async (opts) => {
    banner();
    const options = program.opts();
    const { titik } = loadAll();
    log(`Demo penggolongan + ranking ${titik.length} titik (data sintetis)`, "info");
    const results = titik.map((t) => ({ ...t, ...generateDemoListings(t) }));
    const { jsonPath, csvPath } = writeOutputs({
      titikResults: results,
      radiusKm: CONFIG.ruko.radiusKm,
      limit: CONFIG.ruko.maxListings,
      output: opts.output || options.output,
      outputFormat: opts.format || options.format,
    });
    log(`JSON saved → ${jsonPath}`, "success");
    if (csvPath) log(`CSV saved → ${csvPath}`, "success");
  });

program
  .command("url")
  .description("Scrape halaman hasil pencarian dari URL langsung (Rumah123 atau Lamudi)")
  .argument("<url>", "URL halaman hasil pencarian properti")
  .option("-l, --limit <n>", "jumlah listing terbaik", parseInt, CONFIG.ruko.maxListings)
  .option("--force", "abaikan checkpoint dan scrape ulang", false)
  .option("--http1", "paksa HTTP/1.1", false)
  .option("--platform <name>", "paksa platform (rumah123 atau lamudi)")
  .action(async (url, opts) => {
    banner();
    const options = program.opts();

    let platformName = opts.platform;
    if (!platformName) {
      if (/rumah123\.com/.test(url)) platformName = "rumah123";
      else if (/lamudi\.co\.id/.test(url)) platformName = "lamudi";
      else {
        log("Tidak bisa deteksi platform dari URL. Gunakan --platform rumah123 atau --platform lamudi", "error");
        process.exit(1);
      }
    }
    const base = PLATFORM_MODULES[platformName];
    if (!base) {
      log(`Platform "${platformName}" tidak dikenal. Pilihan: ${Object.keys(PLATFORM_MODULES).join(", ")}`, "error");
      process.exit(1);
    }

    const variant = /\/komersial\/ruko|\/ruko/.test(url) ? "ruko"
      : /\/rumah/.test(url) ? "rumah"
        : null;

    const adapter = {
      ...base,
      name: `${base.name}_url`,
      searchUrlsFor: () => [{ url, variant }],
    };

    const pathLabel = new URL(url).pathname.slice(0, 50);
    const titik = {
      nama: `URL: ${base.name} ${pathLabel}`,
      kota: "",
      index: 0,
      skor_site: 0,
      skor_kompetisi: 0,
      count_A: 0,
      count_B: 0,
      count_C: 0,
      wilayah: "URL",
      catatan_cakupan: "URL langsung",
    };

    log(`Scrape: ${url}`, "info");
    log(`Platform: ${base.name} | Variant: ${variant || "(auto-detect)"}`, "info");

    const { browser } = await createPlatformBrowser({ headless: options.headless !== false, forceHttp1: opts.http1 });
    try {
      const res = await crawlTitik(adapter, titik, { browser, limit: opts.limit, force: opts.force });
      if (res.blocked) log(`  Diblokir: ${res.blocked}`, "error");
      else log(`  ${res.listings.length} listing dari ${res.total_semua} ditemukan`, "success");

      const { jsonPath, csvPath } = writeOutputs({
        titikResults: [{ ...titik, ...res }],
        radiusKm: CONFIG.ruko.radiusKm,
        limit: opts.limit,
        output: options.output,
        outputFormat: options.format,
      });
      log(`JSON saved → ${jsonPath}`, "success");
      if (csvPath) log(`CSV saved → ${csvPath}`, "success");
    } finally {
      await browser.close();
    }
  });

program.parse();
#!/usr/bin/env bun
import { program } from "commander";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { createGoFoodBrowser, crawlBranchReviews } from "./gofood/capture.js";
import { SKY_PASTA_BRANCHES, findBranch, uuidFromSlug } from "./data/sky_pasta_branches.js";
import { exportJson } from "./exporter.js";
import { log, randomDelay, sanitizeFilename, todayStamp } from "./utils.js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function banner() {
  console.log(`
  ╭───────────────────────────────────────────╮
  │            GoFood Scraper                 │
  │              Bun · Playwright             │
  ╰───────────────────────────────────────────╯
  `);
}

function resolveRange(since, until) {
  const parse = (s) => {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };
  let sinceDate = parse(since);
  if (!sinceDate) {
    sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - CONFIG.gofood.sinceDefaultDays);
  }
  let untilDate = null;
  const parsedUntil = parse(until);
  if (until && parsedUntil) {
    untilDate = parsedUntil;
    untilDate.setHours(23, 59, 59, 999);
  }
  return { sinceDate, untilDate };
}

function writeOutputs({ branches, since, until, output, outputFormat }) {
  const merged = branches.map((b) => ({
    ...b,
    branch: typeof b.branch === "string" ? b.branch : b.branch?.branch || b.branch?.slug || "",
  }));
  const totalReviews = merged.reduce((a, b) => a + (b.kept?.length || 0), 0);
  const totalAvailable = merged.reduce((a, b) => a + (b.total || 0), 0);

  const byYear = {};
  for (const b of merged) {
    for (const [year, s] of Object.entries(b.by_year || {})) {
      if (!byYear[year]) byYear[year] = { count: 0, rating_sum: 0 };
      byYear[year].count += s.count;
      byYear[year].rating_sum += s.count * s.avg_rating;
    }
  }
  const by_year_summary = {};
  for (const [year, s] of Object.entries(byYear)) {
    by_year_summary[year] = {
      count: s.count,
      avg_rating: s.count ? Math.round((s.rating_sum / s.count) * 100) / 100 : null,
    };
  }

  const data = {
    platform: "gofood",
    brand: "Sky Pasta",
    scrape_mode: "api",
    date_range: { since, until },
    scraped_at: new Date().toISOString(),
    total_branches: merged.length,
    total_reviews_kept: totalReviews,
    total_reviews_available: totalAvailable,
    by_year_summary,
    branches: merged,
  };

  const jsonPath = path.join(output, `gofood_sky_pasta_${todayStamp()}.json`);
  exportJson(data, jsonPath);
  log(`JSON saved → ${jsonPath}`, "success");

  if (outputFormat === "csv" || outputFormat === "both") {
    const csvPath = path.join(output, `gofood_sky_pasta_${todayStamp()}.csv`);
    exportCsvGoFood(merged, csvPath);
    log(`CSV saved → ${csvPath}`, "success");
  }
}

function exportCsvGoFood(branches, filepath) {
  const headers = [
    "branch",
    "outlet_url",
    "outlet_uuid",
    "review_id",
    "author",
    "rating",
    "text",
    "tags",
    "created_at",
    "ordered_at",
    "items",
  ];
  mkdirSync(path.dirname(filepath), { recursive: true });
  const rows = [];
  for (const b of branches) {
    if (!b.kept?.length) {
      rows.push([b.branch, b.url || "", b.uuid || "", "", "", "", "", "", "", "", ""]);
      continue;
    }
    for (const r of b.kept) {
      rows.push([
        b.branch,
        b.url || "",
        b.uuid || "",
        r.review_id,
        r.author,
        r.rating,
        r.text,
        (r.tags || []).join(" | "),
        r.created_at,
        r.ordered_at,
        (r.items || []).join(" | "),
      ]);
    }
  }
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(","), ...rows.map((row) => row.map(escape).join(","))];
  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
}

async function crawlBranches(branches, options) {
  const { sinceDate, untilDate } = resolveRange(options.since, options.until);
  log(
    `Rentang tanggal (default 1 tahun): ${sinceDate.toISOString().slice(0, 10)} → ${
      untilDate ? untilDate.toISOString().slice(0, 10) : "sekarang"
    }`,
    "info",
  );

  const { browser } = await createGoFoodBrowser({ headless: options.headless === false ? false : CONFIG.headless });
  const results = [];
  try {
    for (const branch of branches) {
      log(`${branch.branch} (${branch.slug})`, "highlight");
      const res = await crawlBranchReviews({
        browser,
        branch: { ...branch, uuid: uuidFromSlug(branch.slug) },
        sinceT: sinceDate.getTime(),
        untilT: untilDate ? untilDate.getTime() : null,
        onPage: (page, n) => log(`    page ${page}: +${n} review`, "info"),
      });
      results.push(res);
      log(
        res.ok
          ? `  ${res.kept.length} review dalam rentang (${res.skipped} skip, ${res.unknown} tanpa tanggal, total ${res.total})`
          : `  GAGAL: ${res.error}`,
        res.ok ? "success" : "error",
      );
      await randomDelay(CONFIG.gofood.delayMin, CONFIG.gofood.delayMax);
    }
  } finally {
    await browser.close();
  }
  return { results, sinceDate, untilDate };
}

program
  .name("gofood-scraper")
  .description("GoFood scraper — kumpulkan review & filter per branch (dataset Sky Pasta)")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.gofood)
  .option("-f, --format <format>", "output format: json, csv, both", "json")
  .option("--headless <bool>", "headless mode", (v) => v !== "false", false);

program
  .command("branches")
  .description("Crawl semua branch Sky Pasta (default) atau filter per branch tertentu")
  .option("-b, --branch <name>", "hanya satu branch (contoh: 'tebet' atau 'Binus Jakbar')")
  .option("--since <YYYY-MM-DD>", "hanya review setelah tanggal ini (default: 1 tahun lalu)")
  .option("--until <YYYY-MM-DD>", "hanya review sebelum tanggal ini (default: sekarang)")
  .action(async (opts) => {
    banner();
    const options = program.opts();
    let branches = SKY_PASTA_BRANCHES;
    if (opts.branch) {
      const found = findBranch(opts.branch);
      if (!found) {
        log(`Branch "${opts.branch}" tidak ditemukan. Pilihan: ${SKY_PASTA_BRANCHES.map((b) => b.branch).join(", ")}`, "error");
        process.exit(1);
      }
      branches = [found];
    }
    const { results, sinceDate, untilDate } = await crawlBranches(branches, {
      since: opts.since,
      until: opts.until,
      headless: options.headless,
    });
    writeOutputs({
      branches: results,
      since: sinceDate.toISOString().slice(0, 10),
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      output: options.output,
      outputFormat: options.format,
    });
  });

program
  .command("url")
  .description("Crawl satu toko GoFood dari URL /reviews-nya")
  .argument("<url>", "URL halaman review GoFood (contoh: https://gofood.co.id/jakarta/restaurant/.../reviews)")
  .option("--since <YYYY-MM-DD>", "hanya review setelah tanggal ini")
  .option("--until <YYYY-MM-DD>", "hanya review sebelum tanggal ini")
  .action(async (url, opts) => {
    banner();
    const options = program.opts();
    const m = url.match(/gofood\.co\.id\/([^/]+)\/restaurant\/([^/]+)/);
    if (!m) {
      log(`Tidak bisa mengekstrak area/slug dari: ${url}`, "error");
      process.exit(1);
    }
    const [, area, slug] = m;
    const branch = { branch: slug, area, slug, altUuid: null };
    const { results, sinceDate, untilDate } = await crawlBranches([branch], {
      since: opts.since,
      until: opts.until,
      headless: options.headless,
    });
    writeOutputs({
      branches: results.map((r) => ({ ...r, branch: r.branch })),
      since: sinceDate.toISOString().slice(0, 10),
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      output: options.output,
      outputFormat: options.format,
    });
  });

program.parse();
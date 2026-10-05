import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { log, createBrowser, todayStamp, parseCsvObjects, sanitizeFilename } from "../lib/http.js";
import { loadTitik, findTitik, scanTitik, hasilTitikBersih } from "../lib/scan.js";
import { writeReports, toCsv, CSV_COLUMNS } from "../lib/report.js";

const args = process.argv.slice(2);

function takeValue(flag, def = undefined) {
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  return def;
}

const hasFlag = (flag) => args.includes(flag);

function parseTargets() {
  const titikList = loadTitik();

  const queriesOverride = takeValue("--queries");
  if (queriesOverride) {
    CONFIG.scan.queries.defaults = queriesOverride
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    log(`Query override: ${CONFIG.scan.queries.defaults.join(", ")}`, "warn");
  }

  if (hasFlag("--pilot")) {
    const out = [];
    for (const nameOrIdx of CONFIG.scan.pilot) {
      const t = findTitik(nameOrIdx, titikList);
      if (t) out.push(t);
      else log(`Pilot "${nameOrIdx}" tidak ditemukan di CSV.`, "warn");
    }
    return out;
  }

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--queries" || a === "=queries") {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    positional.push(a);
  }
  const joined = positional.filter((a) => a !== "all").join(" ");
  if (joined.trim()) {
    const t = findTitik(joined, titikList);
    if (t) return [t];
    log(`Titik "${joined}" tidak ditemukan.`, "error");
    return [];
  }
  return titikList;
}

function loadPamulangTitik() {
  const file = CONFIG.pamulang.placeFile;
  if (!existsSync(file)) {
    log(`Place file pamulang tidak ada: ${file} — jalankan dulu: bun scripts/resolve-place.mjs`, "error");
    return null;
  }
  const data = JSON.parse(readFileSync(file, "utf-8"));
  const hit =
    data.results.find((r) => /pamulang/i.test(r.name)) ||
    data.results.find((r) => /sky pasta/i.test(r.name)) ||
    data.results[0];
  if (!hit) {
    log("Tidak ada hasil berkoordinat di place file pamulang.", "error");
    return null;
  }
  return {
    index: 0,
    nama: CONFIG.pamulang.nama,
    kota: CONFIG.pamulang.kota,
    wilayah: CONFIG.pamulang.wilayah,
    lat: hit.coords.lat,
    lon: hit.coords.lon,
    sourcePlace: hit,
  };
}

function latestCombinedPath() {
  const dir = CONFIG.scan.outputDir;
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => /^kompetitor_\d{4}-\d{2}-\d{2}\.csv$/.test(f))
    .sort()
    .reverse()
    .map((f) => path.join(dir, f))[0] || null;
}

function buildCrossref(rows, titikNama) {
  const latest = latestCombinedPath();
  const map = new Map();
  if (latest) {
    const existing = parseCsvObjects(readFileSync(latest, "utf-8").replace(/^\uFEFF/, ""));
    for (const e of existing) {
      if (!e.place_id) continue;
      if (!map.has(e.place_id)) map.set(e.place_id, new Set());
      map.get(e.place_id).add(e.titik);
    }
  }
  return rows.map((r) => {
    const others = Array.from(map.get(r.place_id) || []).filter((t) => t !== titikNama);
    return { ...r, n_titik_lain: others.length, di_titik_lain: others.join("; ") };
  });
}

function buildPamulangMd(titik, rows, home) {
  const date = todayStamp();
  const md = [];
  md.push(`# Kompetitor Home Base \u2014 ${titik.nama} (${date})`);
  md.push("");
  md.push(`Home base: **${home.spec.name}** (${titik.lat}, ${titik.lon}) \u00b7 radius scan ${CONFIG.pamulang.radiusKm} km`);
  md.push("");
  md.push(`Query: ${CONFIG.pamulang.queries.join(", ")}`);
  md.push("");
  const ya = rows.filter((r) => r.apple_to_apple === "Ya" && !r.own_brand).length;
  const cek = rows.filter((r) => r.kelas === "TBD" && !r.own_brand).length;
  const branded = rows.filter((r) => r.own_brand).length;
  md.push(`Kompetitor unik: **${ya} Ya** \u00b7 Cek Manual: ${cek} \u00b7 Tidak: ${rows.length - ya - cek - branded} \u00b7 gerai sendiri (own brand): ${branded}`);
  md.push("");
  md.push("| # | Kompetitor | Objek | Rating | Review | Jarak | Harga | Ya? | OwnBrand | Muncul di titik lain |");
  md.push("|---|------------|-------|--------|--------|-------|-------|-----|----------|---------------------|");
  for (const r of rows) {
    const marker = r.apple_to_apple === "Ya" ? "**Ya**" : r.apple_to_apple;
    const jarak = r.jarak_km !== "" && r.jarak_km !== null && r.jarak_km !== undefined ? `${r.jarak_km} km` : "-";
    const harga = r.harga_label || r.price_level || (r.harga_tbd ? "?(belum tertera)" : "-");
    const lainnya = r.n_titik_lain > 0 ? `${r.n_titik_lain}: ${r.di_titik_lain}` : "-";
    md.push(
      `| ${r.index} | ${r.kompetitor.replace(/\|/g, "\\|")} | ${(r.objek || "-").replace(/\|/g, "\\|")} | ${r.rating || "-"} | ${r.n_reviews || 0} | ${jarak} | ${(harga || "-").replace(/\|/g, "\\|")} | ${marker} | ${r.own_brand ? "ya" : ""} | ${(lainnya || "").replace(/\|/g, "\\|")} |`,
    );
  }
  md.push("");
  return md.join("\n");
}

async function pamulangMain() {
  const titik = loadPamulangTitik();
  if (!titik) return false;
  const force = hasFlag("--force");
  log(`>>> HOME BASE: ${titik.nama} [${titik.lat},${titik.lon}]`, "highlight");

  const { browser, page } = await createBrowser({ headless: true });
  let hasil;
  try {
    hasil = await scanTitik(page, titik, {
      force,
      queries: CONFIG.pamulang.queries,
      radiusKm: CONFIG.pamulang.radiusKm,
    });
  } finally {
    await browser.close();
  }

  let bersih = hasilTitikBersih(titik, hasil);
  bersih = bersih.map((r) => ({
    ...r,
    own_brand: CONFIG.klasifikasi.ownBrandName.test(r.kompetitor) ? "ya" : "",
  }));
  bersih = buildCrossref(bersih, titik.nama);

  const date = todayStamp();
  const outDir = CONFIG.pamulang.outDir;
  mkdirSync(outDir, { recursive: true });

  const csvPath = path.join(outDir, `kompetitor_pamulang_${date}.csv`);
  const cols = [...CSV_COLUMNS, "own_brand", "n_titik_lain", "di_titik_lain"];
  writeFileSync(csvPath, toCsv(bersih, cols), "utf-8");
  log(`CSV pamulang: ${csvPath} (${bersih.length} baris)`, "success");

  const mdPath = path.join(outDir, `report_pamulang_${date}.md`);
  writeFileSync(mdPath, buildPamulangMd(titik, bersih, { spec: titik.sourcePlace }), "utf-8");
  log(`Report pamulang: ${mdPath}`, "success");

  const ya = bersih.filter((r) => r.apple_to_apple === "Ya" && !r.own_brand);
  log(`Selesai: ${ya.length} Ya (tanpa own brand) dari ${bersih.length} baris`, "success");
  return true;
}

async function main() {
  if (hasFlag("--pamulang")) {
    await pamulangMain();
    return;
  }

  const targets = parseTargets();
  if (!targets.length) {
    log("Tidak ada titik untuk discan. Gunakan: scan.mjs --pilot | all | <nama titik atau nomor> | --pamulang [--force]", "warn");
    return;
  }

  const force = hasFlag("--force");
  const headlessVal = takeValue("--headless");
  const headless = headlessVal !== undefined ? headlessVal !== "false" : CONFIG.headless;
  log(`Mode: headless=${headless} force=${force} titik=${targets.length}`, "highlight");

  const { browser, page } = await createBrowser({ headless });
  const resultsByTitik = {};

  try {
    for (const titik of targets) {
      log(`>>> ${titik.index}. ${titik.nama} (${titik.kota}) [${titik.lat},${titik.lon}]`, "highlight");
      const hasil = await scanTitik(page, titik, { force });
      const bersih = hasilTitikBersih(titik, hasil);
      resultsByTitik[titik.nama] = bersih;
      const ya = bersih.filter((r) => r.apple_to_apple === "Ya").length;
      log(`Selesai "${titik.nama}": ${bersih.length} kompetitor (${ya} Ya)`, "success");
    }
  } finally {
    await browser.close();
  }

  const csvPath = writeReports(resultsByTitik);
  log("Selesai. Buka CSV utama:", "success");
  log(`  ${csvPath}`, "highlight");
}

main().catch((e) => {
  log(`FATAL: ${e.stack || e.message}`, "error");
  process.exit(1);
});
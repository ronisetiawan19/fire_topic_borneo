import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { log, sanitizeFilename, todayStamp } from "./http.js";

export const CSV_COLUMNS = [
  "titik",
  "kota",
  "index",
  "kompetitor",
  "objek",
  "alamat",
  "rating",
  "n_reviews",
  "harga_label",
  "price_level",
  "jarak_km",
  "apple_to_apple",
  "kelas",
  "alasan_kelas",
  "review_rendah",
  "harga_tbd",
  "go_maps_url",
  "place_id",
];

const DOC_COLUMNS = ["index", "kompetitor", "objek", "rating", "jarak_km", "apple_to_apple", "alasan_kelas"];

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows, columns = CSV_COLUMNS) {
  const lines = [columns.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(r[c])).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}

function fmtRating(r) {
  return (r.rating || 0) > 0 ? String(r.rating) : "-";
}

function fmtJarak(r) {
  return r.jarak_km !== null && r.jarak_km !== undefined && r.jarak_km !== "" ? `${r.jarak_km} km` : "-";
}

function fmtObjek(r) {
  const parts = [];
  if (r.objek) parts.push(r.objek);
  if (r.price_level) parts.push(r.price_level);
  return parts.join(" \u00b7 ");
}

export function writeReports(resultsByTitik) {
  const date = todayStamp();
  const outDir = CONFIG.scan.outputDir;
  const perTitikDir = path.join(outDir, "per_titik");
  mkdirSync(perTitikDir, { recursive: true });

  const allRows = [];
  for (const titik of Object.keys(resultsByTitik)) {
    const rows = resultsByTitik[titik];
    allRows.push(...rows);
    const safe = sanitizeFilename(titik);
    writeFileSync(
      path.join(perTitikDir, `${safe}_${date}.csv`),
      toCsv(rows),
      "utf-8",
    );
    log(`CSV per titik: per_titik/${safe}_${date}.csv (${rows.length} baris)`, "success");
  }

  writeFileSync(path.join(outDir, `kompetitor_${date}.csv`), toCsv(allRows), "utf-8");
  log(`CSV gabungan: kompetitor_${date}.csv (${allRows.length} baris)`, "success");

  writeFileSync(
    path.join(outDir, `report_${date}.md`),
    buildMarkdown(resultsByTitik),
    "utf-8",
  );
  log(`Report Markdown: report_${date}.md`, "success");
  return path.join(outDir, `kompetitor_${date}.csv`);
}

function buildMarkdown(resultsByTitik) {
  const date = todayStamp();
  const md = [];
  md.push(`# Scan Kompetitor Sky Pasta \u2014 ${date}`);
  md.push("");
  md.push(
    "Aturan Apple-to-Apple (dari dokumen ekspansi): **Ya** = objek spesialis pasta/Italian casual **DAN** harga setara benchmark Sky Pasta Pamulang (Rp 20\u201350rb / price level 2). **Cek Manual** = spesialis pasta/Italian tapi harga belum tertera di Maps \u2014 belum dihitung sebagai head-to-head sampai diverifikasi. **Tidak** = objek melebar (pizza/steak/caf\u00e9/Italian umum) dan/atau harga di luar range.",
  );
  md.push("");

  for (const titik of Object.keys(resultsByTitik)) {
    const rows = resultsByTitik[titik];
    const ya = rows.filter((r) => r.apple_to_apple === "Ya").length;
    const cek = rows.filter((r) => r.kelas === "TBD").length;
    const tidak = rows.length - ya - cek;
    const first = rows[0];
    md.push(`## ${titik}${first ? ` (${first.kota})` : ""}`);
    md.push("");
    md.push(`Radius scan: ${CONFIG.scan.radiusKm} km \u00b7 **Ya: ${ya}** \u00b7 Cek Manual: ${cek} \u00b7 Tidak: ${tidak}`);
    md.push("");
    md.push("| # | Kompetitor | Objek | Rating | Jarak | Apple-to-Apple? | Alasan |");
    md.push("|---|------------|-------|--------|-------|-----------------|--------|");
    for (const r of rows) {
      const marker =
        r.apple_to_apple === "Ya" ? "**Ya**" : r.kelas === "TBD" ? "Cek Manual" : "Tidak";
      const alasan = (r.alasan_kelas || "").replace(/\|/g, "\\|");
      md.push(
        `| ${r.index} | ${r.kompetitor.replace(/\|/g, "\\|")} | ${fmtObjek(r).replace(/\|/g, "\\|")} | ${fmtRating(r)} | ${fmtJarak(r)} | ${marker} | ${alasan} |`,
      );
    }
    md.push("");
  }

  const allYa = Object.values(resultsByTitik).flat().filter((r) => r.apple_to_apple === "Ya");
  if (allYa.length) {
    md.push("## Ringkasan Kompetitor Langsung (Ya)");
    md.push("");
    md.push("| Titik | Kompetitor | Objek | Rating | Review | Alasan |");
    md.push("|-------|------------|-------|--------|--------|--------|");
    for (const r of allYa) {
      md.push(
        `| ${r.titik.replace(/\|/g, "\\|")} | ${r.kompetitor.replace(/\|/g, "\\|")} | ${fmtObjek(r).replace(/\|/g, "\\|")} | ${fmtRating(r)} | ${r.n_reviews || 0} | ${(r.alasan_kelas || "").replace(/\|/g, "\\|")} |`,
      );
    }
    md.push("");
  }
  return md.join("\n");
}
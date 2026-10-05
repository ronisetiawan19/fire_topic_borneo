// Buat Excel dari CSV hasil ekspor: sheet Ringkasan + Ulasan.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "output", "ulasan");
const IN_SUM = path.join(OUT_DIR, "ringkasan_ulasan_2026-09-30.csv");
const IN_REV = path.join(OUT_DIR, "ulasan_2026-09-30.csv");
const OUT_XLSX = path.join(OUT_DIR, "ulasan_2026-09-30.xlsx");

for (const f of [IN_SUM, IN_REV]) {
  if (!existsSync(f)) {
    console.log(`File belum ada: ${f}\nJalankan ekspor-ulasan.mjs lebih dulu.`);
    process.exit(1);
  }
}

// Parser CSV RFC4180 (field ber-koma di dalam tanda kutip).
const parseCsvLine = (line) => {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const readCsv = (file) => {
  const lines = readFileSync(file, "utf-8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const c = parseCsvLine(l);
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ""]));
  });
};

const sumRows = readCsv(IN_SUM);
const revRows = readCsv(IN_REV);
const lama = revRows.filter((r) => r.dalam_1_tahun === "tidak");

const wb = new ExcelJS.Workbook();
wb.creator = "scraper-google-maps";

const headerStyle = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  row.alignment = { vertical: "middle" };
  row.height = 20;
};

const addSheet = (name, rows, widths) => {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  ws.columns = cols.map((c, i) => ({ header: c, key: c, width: widths[i] || 18 }));
  headerStyle(ws.getRow(1));
  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { vertical: "top", wrapText: cols.includes("ulasan") || cols.includes("status") };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return rows.length;
};

const nSum = addSheet("Ringkasan", sumRows, [24, 38, 34, 15, 14, 12, 20]);
const nRev = addSheet("Ulasan", revRows, [24, 30, 20, 7, 12, 18, 90, 30, 14]);
let nLama = 0;
if (lama.length) nLama = addSheet("Di luar 1 tahun", lama, [24, 30, 20, 7, 12, 18, 90, 30, 14]);

await wb.xlsx.writeFile(OUT_XLSX);
console.log(`Excel    -> ${OUT_XLSX}`);
console.log(`  sheet Ringkasan        : ${nSum} kompetitor`);
console.log(`  sheet Ulasan           : ${nRev} baris`);
if (nLama) console.log(`  sheet Di luar 1 tahun  : ${nLama} baris`);

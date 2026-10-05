import ExcelJS from "file:///D:/PROJECT/my-scraping-tools-js/node_modules/exceljs/excel.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SENT_DIR = path.join(ROOT, "output", "sentimen");

function latestFile(dir, match) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => match.test(f))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

const csvFile = latestFile(SENT_DIR, /^sentimen_.*\.csv$/);
const dumpFile = latestFile(SENT_DIR, /^review_dump_.*\.json$/);

if (!csvFile) {
  console.log("Tidak ada CSV sentimen di output/sentimen — jalankan scripts/sentimen.mjs dulu.");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const rows = parseCsv(readFileSync(csvFile, "utf-8"));
const header = rows[0].map((h) => h.trim());
const objects = rows.slice(1).map((r) => {
  const o = {};
  header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
  return o;
});

const dump = dumpFile ? JSON.parse(readFileSync(dumpFile, "utf-8")) : [];

const wb = new ExcelJS.Workbook();
wb.creator = "Sky Pasta — Analisis Sentimen GM";
wb.created = new Date();

const styleHeader = (ws) => {
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FF3B2F2F" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2E9D8" } };
  hr.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  hr.height = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];
};

const autoWidth = (ws, { min = 10, max = 55 } = {}) => {
  ws.columns.forEach((col) => {
    let len = 0;
    if (col.values) {
      for (const v of col.values) {
        if (v != null) {
          const s = String(v);
          if (s.length > len) len = s.length;
        }
      }
    }
    col.width = Math.min(Math.max(len + 2, min), max);
  });
};

// ── Sheet 1: Ringkasan per kompetitor ──────────────────────────────
const ws1 = wb.addWorksheet("Ringkasan", { views: [{ state: "frozen", ySplit: 1 }] });
ws1.columns = [
  { header: "Titik", key: "titik", width: 24 },
  { header: "Kompetitor", key: "kompetitor", width: 42 },
  { header: "Review Total (Maps)", key: "n_total", width: 16 },
  { header: "Sampled 1 Thn", key: "n_sampled", width: 14 },
  { header: "Label Sentimen", key: "label_sentimen", width: 16 },
  { header: "Score", key: "score", width: 9 },
  { header: "% Positif", key: "pct_positif", width: 10 },
  { header: "% Negatif", key: "pct_negatif", width: 10 },
  { header: "% Netral", key: "pct_netral", width: 10 },
  { header: "Catatan", key: "catatan", width: 34 },
];
for (const o of objects) {
  const noData = o.label_sentimen === "TIDAK ADA DATA";
  ws1.addRow({
    titik: o.titik,
    kompetitor: o.kompetitor,
    n_total: Number(o.n_total || 0),
    n_sampled: Number(o.n_sampled || 0),
    label_sentimen: o.label_sentimen,
    score: Number(o.score || 0),
    pct_positif: Number(o.pct_positif || 0) / 100,
    pct_negatif: Number(o.pct_negatif || 0) / 100,
    pct_netral: Number(o.pct_netral || 0) / 100,
    catatan: noData
      ? Number(o.n_total || 0) === 0
        ? "Tidak ada review di Google Maps"
        : "Semua review >1 tahun"
      : "",
  });
}
styleHeader(ws1);
ws1.getColumn("pct_positif").numFmt = "0%";
ws1.getColumn("pct_negatif").numFmt = "0%";
ws1.getColumn("pct_netral").numFmt = "0%";
ws1.getColumn("score").numFmt = "0.000";
ws1.getColumn("n_total").numFmt = "#,##0";
ws1.getColumn("n_sampled").numFmt = "#,##0";

const labelColors = {
  POSITIF: "FFC6EFCE",
  CAMPURAN: "FFFFEB9C",
  NEGATIF: "FFFFC7CE",
  "TIDAK ADA DATA": "FFE0E0E0",
};
ws1.eachRow((row, n) => {
  if (n === 1) return;
  const c = row.getCell("label_sentimen");
  const fill = labelColors[c.value];
  if (fill) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    c.font = { bold: true };
    c.alignment = { horizontal: "center" };
  }
  row.getCell("n_total").numFmt = "#,##0";
  row.getCell("n_sampled").numFmt = "#,##0";
  row.getCell("score").numFmt = "0.000";
  row.alignment = { vertical: "top" };
  if (c.value === "TIDAK ADA DATA") row.getCell("catatan").font = { italic: true, color: { argb: "FF888888" } };
});

// ── Sheet 2: Agregat per titik ─────────────────────────────────────
const ws2 = wb.addWorksheet("Per Titik");
ws2.columns = [
  { header: "Titik", key: "titik", width: 26 },
  { header: "Jml Kompetitor", key: "jml", width: 14 },
  { header: "Punya Data", key: "punya", width: 12 },
  { header: "TIDAK ADA DATA", key: "nodata", width: 15 },
  { header: "Rata-rata Score", key: "avg", width: 15 },
  { header: "% Positif", key: "pos", width: 11 },
  { header: "% Negatif", key: "neg", width: 11 },
  { header: "Top Kompetitor", key: "top", width: 40 },
];
const byTitik = new Map();
for (const o of objects) {
  const arr = byTitik.get(o.titik) || [];
  arr.push(o);
  byTitik.set(o.titik, arr);
}
for (const [titik, arr] of byTitik) {
  const withData = arr.filter((o) => o.label_sentimen !== "TIDAK ADA DATA");
  const avg = withData.length
    ? withData.reduce((a, o) => a + Number(o.score || 0), 0) / withData.length
    : 0;
  const pos = withData.length
    ? withData.reduce((a, o) => a + Number(o.pct_positif || 0), 0) / withData.length / 100
    : 0;
  const neg = withData.length
    ? withData.reduce((a, o) => a + Number(o.pct_negatif || 0), 0) / withData.length / 100
    : 0;
  const top = withData.length
    ? withData.sort((a, b) => Number(b.score) - Number(a.score))[0].kompetitor
    : "-";
  ws2.addRow({
    titik,
    jml: arr.length,
    punya: withData.length,
    nodata: arr.length - withData.length,
    avg: +avg.toFixed(3),
    pos,
    neg,
    top,
  });
}
styleHeader(ws2);
ws2.getColumn("avg").numFmt = "0.000";
ws2.getColumn("pos").numFmt = "0%";
ws2.getColumn("neg").numFmt = "0%";
ws2.eachRow((row, n) => {
  if (n === 1) return;
  row.getCell("avg").numFmt = "0.000";
  row.getCell("pos").numFmt = "0%";
  row.getCell("neg").numFmt = "0%";
  row.alignment = { vertical: "top" };
});

// ── Sheet 3: Detail review (per kompetitor, blok) ──────────────────
const ws3 = wb.addWorksheet("Review Detail");
ws3.columns = [
  { header: "Kompetitor", key: "komp", width: 34 },
  { header: "Titik", key: "titik", width: 22 },
  { header: "Tgl", key: "tgl", width: 12 },
  { header: "Bintang", key: "bintang", width: 9 },
  { header: "Sentimen", key: "sent", width: 11 },
  { header: "Skor", key: "skor", width: 8 },
  { header: "Review", key: "teks", width: 90 },
  { header: "Kata Kunci Negatif", key: "kw", width: 30 },
];
ws3.getRow(1).values = ["Kompetitor", "Titik", "Tgl", "Bintang", "Sentimen", "Skor", "Review", "Kata Kunci Negatif"];
styleHeader(ws3);
let currentKomp = null;
for (const p of dump) {
  for (const r of p.reviews || []) {
    const tgl = r.time ? new Date(r.time * 1000).toISOString().slice(0, 10) : "";
    const isNew = p.nama !== currentKomp;
    currentKomp = p.nama;
    const row = ws3.addRow({
      komp: p.nama,
      titik: p.titik,
      tgl,
      bintang: r.rating ?? "",
      sent: r.label,
      skor: r.score,
      teks: (r.text || "").replace(/\s+/g, " ").trim(),
      kw: (r.matchedNeg || []).join(", "),
    });
    if (r.label === "negatif") {
      row.getCell("sent").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
      row.getCell("sent").font = { color: { argb: "FF9C0006" }, bold: true };
    } else if (r.label === "positif") {
      row.getCell("sent").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      row.getCell("sent").font = { color: { argb: "FF006100" } };
    }
    row.getCell("tgl").numFmt = "yyyy-mm-dd";
    row.getCell("teks").alignment = { wrapText: true, vertical: "top" };
    row.getCell("skor").alignment = { horizontal: "center" };
    row.getCell("bintang").alignment = { horizontal: "center" };
    row.getCell("sent").alignment = { horizontal: "center" };
    if (isNew) {
      row.eachCell((cell) => {
        cell.font = { ...(cell.font || {}), bold: true };
        cell.border = { top: { style: "medium", color: { argb: "FF999999" } } };
      });
    }
  }
}
ws3.autoFilter = { from: "A1", to: "H1" };

// ── Simpan ─────────────────────────────────────────────────────────
const stamp = (csvFile.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "terbaru";
const outFile = path.join(SENT_DIR, `sentimen_analisis_${stamp}.xlsx`);
await wb.xlsx.writeFile(outFile);

const verify = new ExcelJS.Workbook();
await verify.xlsx.readFile(outFile);
console.log(
  JSON.stringify(
    {
      output: outFile,
      sheets: verify.worksheets.map((w) => `${w.name}(${w.rowCount} baris)`),
    },
    null,
    2,
  ),
);

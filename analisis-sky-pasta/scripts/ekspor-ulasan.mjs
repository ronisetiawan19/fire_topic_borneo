// Ekspor ulasan mentah per review (satu baris per ulasan), bukan agregat.
// Sumber: checkpoint hasil scraping. Kolom tanggal asli Google ikut disimpan
// karena label relatif ("sebulan lalu") berubah arti seiring waktu.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CP_DIR = path.join(ROOT, "checkpoints", "sentimen");
const IN_CSV = path.join(ROOT, "output", "kompetitor_2026-09-23_manual.csv");
const OUT_DIR = path.join(ROOT, "output", "ulasan");
const OUT_CSV = path.join(OUT_DIR, "ulasan_2026-09-30.csv");

const SINCE = Date.now() / 1000 - 365 * 24 * 3600;
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Cakupan yang dianalisis = 2 titik yang sama seperti sentimen.mjs.
const TARGET_TITIK = ["BSD City Sektor 3", "Bogor Nirwana Residence"];

// Nama + kompetitor + titik dari CSV master.
// Field CSV berisi koma di dalam tanda kutip, jadi不能用 split(",") biasa.
const meta = new Map();
const txt = readFileSync(IN_CSV, "utf-8").replace(/^\uFEFF/, "");
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
const head = parseCsvLine(txt.split(/\r?\n/)[0]);
const iT = head.indexOf("titik");
const iK = head.indexOf("kompetitor");
const iP = head.indexOf("place_id");
for (const line of txt.split(/\r?\n/).slice(1)) {
  if (!line.trim()) continue;
  const c = parseCsvLine(line);
  const key = c[iP];
  if (!key) continue;
  if (!meta.has(key)) {
    if (!TARGET_TITIK.includes(c[iT])) continue;
    meta.set(key, { tempat: c[iT], kompetitor: c[iK], place_id: key });
  }
}

const rows = [];
const summary = [];
const files = existsSync(CP_DIR) ? readdirSync(CP_DIR).filter((f) => f.endsWith(".json")) : [];

// Kumpulkan semua place_id yang punya checkpoint.
const seen = new Set();
for (const f of files) {
  const cp = JSON.parse(readFileSync(path.join(CP_DIR, f), "utf-8"));
  const id = (cp.place_id || f.replace(/\.json$/, "").replace(/_/g, ":")).trim();
  const m = meta.get(id) || { tempat: cp.name, kompetitor: cp.name, place_id: id };
  const raw = cp.raw || [];
  seen.add(id);
  const dalam1tahun = raw.filter((r) => !r.time || r.time >= SINCE);
  summary.push({ ...m, total: raw.length, dalam_1_tahun: dalam1tahun.length, teks_ada: raw.filter((r) => r.text && r.text.trim()).length });
  for (const r of raw) {
    const d = r.time ? new Date(r.time * 1000).toISOString().slice(0, 10) : "";
    rows.push({
      tempat: m.tempat,
      kompetitor: m.kompetitor,
      author: r.author || "",
      rating: r.rating ?? "",
      tanggal: d,
      tanggal_asli: (r.time_label || "").replace(/\s+/g, " ").trim(),
      ulasan: (r.text || "").replace(/\s+/g, " ").trim(),
      review_id: r.review_id || "",
      dalam_1_tahun: !r.time || r.time >= SINCE ? "ya" : "tidak",
    });
  }
}

// Kompetitor dari CSV master tanpa checkpoint tetap harus muncul di ringkasan.
for (const [id, m] of meta) {
  if (!seen.has(id)) summary.push({ ...m, total: 0, dalam_1_tahun: 0, teks_ada: 0 });
}

rows.sort((a, b) => String(a.kompetitor).localeCompare(String(b.kompetitor)) || String(b.tanggal).localeCompare(String(a.tanggal)));

const cols = ["tempat","kompetitor","author","rating","tanggal","tanggal_asli","ulasan","review_id","dalam_1_tahun"];
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
writeFileSync(OUT_CSV, csv, "utf-8");

// Sheet ringkasan: satu baris per kompetitor (15), termasuk yang 0 review.
const sumCols = ["tempat","kompetitor","place_id","total_collected","dalam_1_tahun","dengan_teks","status"];
const sumRows = summary
  .sort((a, b) => String(a.kompetitor).localeCompare(String(b.kompetitor)))
  .map((s) => ({
    ...s,
    status: s.total === 0 ? "TIDAK ADA DATA" : `${((s.dalam_1_tahun / s.total) * 100).toFixed(0)}% dalam 1 thn`,
  }));
const sumCsv = [sumCols.join(","), ...sumRows.map((r) => sumCols.map((c) => esc(r[c])).join(","))].join("\n");
const OUT_SUM = path.join(OUT_DIR, "ringkasan_ulasan_2026-09-30.csv");
writeFileSync(OUT_SUM, sumCsv, "utf-8");

console.log(`Ulasan   -> ${OUT_CSV}`);
console.log(`Ringkasan-> ${OUT_SUM}`);
console.log(`  ${rows.length} baris | dalam 1 tahun: ${rows.filter((r) => r.dalam_1_tahun === "ya").length} | dengan teks: ${rows.filter((r) => r.ulasan).length}`);
console.log(`\nRingkasan ${sumRows.length} kompetitor:`);
for (const s of sumRows) {
  console.log(`  ${String(s.kompetitor).slice(0, 34).padEnd(36)} total=${String(s.total).padStart(5)} 1thn=${String(s.dalam_1_tahun).padStart(4)} teks=${String(s.teks_ada).padStart(5)}  ${s.status}`);
}
const zero = sumRows.filter((s) => s.total === 0);
if (zero.length) console.log(`\nTIDAK ADA DATA (${zero.length}): ${zero.map((z) => z.kompetitor).join(", ")}`);

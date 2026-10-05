import {
  log,
  randomDelay,
  createBrowser,
  parseCsvObjects,
  todayStamp,
} from "../lib/http.js";
import { getPlaceReviewsBrowser } from "../../src/googlemaps/reviews.js";
import { scoreReview, aggregate } from "../lib/sentiment.js";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const CSV = "output/kompetitor_2026-09-23_manual.csv";
const OUT_DIR = "output/sentimen";
const CP_DIR = "checkpoints/sentimen";
const SINCE_CUTOFF = Date.now() / 1000 - 365 * 24 * 3600;

const args = process.argv.slice(2);
const sinceArg = args.indexOf("--since");
const since = sinceArg >= 0 && args[sinceArg + 1]
  ? Math.floor(new Date(`${args[sinceArg + 1]}T00:00:00`).getTime() / 1000)
  : SINCE_CUTOFF;
const limitArg = args.indexOf("--limit");
const limitPlaces = limitArg >= 0 && args[limitArg + 1] ? parseInt(args[limitArg + 1], 10) : 0;
const onlyArg = args.indexOf("--only");
const onlyPlaceId = onlyArg >= 0 ? args[onlyArg + 1] : null;
const maxReviewsArg = args.indexOf("--max-reviews");
const maxReviews = maxReviewsArg >= 0 ? parseInt(args[maxReviewsArg + 1], 10) : 0;
const force = args.includes("--force");
const noSort = args.includes("--no-sort");
const TARGET_TITIK = ["BSD City Sektor 3", "Bogor Nirwana Residence"];

mkdirSync(path.resolve(import.meta.dirname, "..", OUT_DIR), { recursive: true });
mkdirSync(path.resolve(import.meta.dirname, "..", CP_DIR), { recursive: true });

const csvText = await Bun.file(
  path.resolve(import.meta.dirname, "..", CSV),
).text();
const rows = parseCsvObjects(csvText);

const byPlace = new Map();
for (const row of rows) {
  if (!TARGET_TITIK.includes(row.titik || "")) continue;
  const pid = (row.place_id || "").trim();
  const nReviews = parseInt(row.n_reviews || "0", 10);
  if (!pid || !row.go_maps_url) continue;
  const entry = byPlace.get(pid) || {
    place_id: pid,
    link: row.go_maps_url,
    name: row.kompetitor,
    titik: new Set(),
    nReviewsRaw: nReviews,
  };
  entry.titik.add(row.titik);
  byPlace.set(pid, entry);
}

const places = [...byPlace.values()]
  .filter((p) => p.nReviewsRaw > 0)
  .filter((p) => !onlyPlaceId || p.place_id === onlyPlaceId)
  .sort((a, b) => b.nReviewsRaw - a.nReviewsRaw)
  .slice(0, limitPlaces || undefined);

log(`${rows.length} baris CSV, ${byPlace.size} tempat unik, ${places.length} dengan review > 0.`, "info");

const collected = [];
let blocked = false;

const { browser, page } = await createBrowser({ headless: true });
try {
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    log(`[${i + 1}/${places.length}] ${p.name} (${p.titik.size}x titik, ${p.nReviewsRaw} review)`, "highlight");

    const cpFile = path.resolve(import.meta.dirname, "..", CP_DIR, `${p.place_id.replace(/:/g, "_")}.json`);
    const prev = existsSync(cpFile)
      ? JSON.parse(readFileSync(cpFile, "utf-8"))
      : null;

    if (prev && !force) {
      log(`  Checkpoint ditemukan — skip (${prev.kept?.length || 0} review tersimpan)`, "warn");
      collected.push({ ...p, ...prev });
      continue;
    }

    log(prev ? "  --force: crawl ulang, gabung dengan data lama." : "  Crawl baru.", "warn");

    const r = await getPlaceReviewsBrowser(
      page,
      { place_id: p.place_id, name: p.name, link: p.link },
      { maxReviews, sort: noSort ? "relevant" : "newest", stopBeforeTs: noSort ? 0 : since },
    );
    if (!r.ok) {
      log(`  GAGAL: ${r.reason || r.error}`, "error");
      if (r.reason === "blocked" || r.reason === "captcha") {
        blocked = true;
        break;
      }
      if (prev) collected.push({ ...p, ...prev });
      continue;
    }

    // Gabungkan hasil baru dengan data lama (dedup per review_id).
    const merged = new Map();
    for (const rv of [...(prev?.raw || []), ...(r.results || [])]) {
      const key = rv.review_id || `${rv.author}|${rv.time_label}|${(rv.text || "").slice(0, 80)}`;
      if (!merged.has(key)) merged.set(key, rv);
    }
    const raw = [...merged.values()];
    const kept = raw.filter((rv) => !rv.time || rv.time >= since);
    const skipped = raw.length - kept.length;
    log(
      `  OK: ${kept.length} review (1 tahun), ${skipped} dilewati, ${raw.filter((rv) => !rv.time).length} tanpa tanggal` +
        (prev ? ` | gabungan dgn lama: ${prev.raw?.length || 0} -> ${raw.length}` : ""),
      "success",
    );

    const record = {
      place_id: p.place_id,
      name: p.name,
      titik: [...p.titik],
      nReviewsRaw: p.nReviewsRaw,
      since: new Date(since * 1000).toISOString().slice(0, 10),
      collectedAt: new Date().toISOString(),
      rawCount: raw.length,
      raw,
      kept,
      skipped,
    };
    writeFileSync(cpFile, JSON.stringify(record, null, 2), "utf-8");
    collected.push({ ...p, ...record });

    await randomDelay(2000, 4000);
  }
} finally {
  await browser.close();
}

if (blocked) {
  log("CAPTCHA/blocked → berhenti. Export cookie GM baru lalu ulangi.", "error");
  process.exit(1);
}

log(`${collected.length}/${places.length} tempat berhasil dikumpulkan.`, "success");

const scored = collected.map((p) => {
  const agg = aggregate(p.kept);
  return {
    place_id: p.place_id,
    nama: p.name,
    titik: p.titik.join(" & "),
    n_total: p.nReviewsRaw,
    n_sampled: agg.n,
    n_skipped_batustanggal: p.skipped,
    n_tanpa_tanggal: p.kept.filter((r) => !r.time).length,
    label: agg.label,
    score: agg.avgScore,
    pct_positif: agg.pctPositif,
    pct_negatif: agg.pctNegatif,
    pct_netral: agg.pctNetral,
    ...agg,
  };
});

const zeroPlaces = [...byPlace.values()].filter((p) => p.nReviewsRaw === 0);
const zeroRows = zeroPlaces.map((p) => ({
  place_id: p.place_id,
  nama: p.name,
  titik: [...p.titik].join(" & "),
  n_total: 0,
  n_sampled: 0,
  n_skipped_batustanggal: 0,
  n_tanpa_tanggal: 0,
  label: "TIDAK ADA DATA",
  score: 0,
  pct_positif: 0,
  pct_negatif: 0,
  pct_netral: 0,
  scored: [],
}));

const allScored = [...scored, ...zeroRows];
allScored.sort((a, b) => a.titik.localeCompare(b.titik) || b.score - a.score);

const stamp = todayStamp();
const outBase = path.resolve(import.meta.dirname, "..", OUT_DIR);
const rowsOut = allScored.map((s) => ({
  titik: s.titik,
  kompetitor: s.nama,
  n_total: s.n_total,
  n_sampled: s.n_sampled,
  n_skipped_batustanggal: s.n_skipped_batustanggal,
  n_tanpa_tanggal: s.n_tanpa_tanggal,
  label_sentimen: s.label,
  score: s.score,
  pct_positif: s.pct_positif,
  pct_negatif: s.pct_negatif,
  pct_netral: s.pct_netral,
  place_id: s.place_id,
}));

const header = Object.keys(rowsOut[0] || {});
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLines = [header.join(","), ...rowsOut.map((r) => header.map((h) => esc(r[h])).join(","))];
const csvFile = path.join(outBase, `sentimen_${stamp}.csv`);
writeFileSync(csvFile, "\uFEFF" + csvLines.join("\n"), "utf-8");
log(`CSV → ${csvFile}`, "success");

const mdLines = [
  `# Analisis Sentimen Google Maps — Kompetitor Sky Pasta`,
  ``,
  `> Jendela: 1 tahun terakhir (sejak ${new Date(since * 1000).toISOString().slice(0, 10)}). Sumber: Google Maps via scraper GM (${stamp}).`,
  ``,
  `| Titik | Kompetitor | n_total | n_sampled | Label | Score | Positif | Negatif |`,
  `|---|---|---|---|---|---|---|---|`,
  ...allScored.map((s) =>
    `| ${s.titik} | ${s.nama} | ${s.n_total || "-"} | ${s.n_sampled} | ${s.label} | ${s.score} | ${s.pct_positif}% | ${s.pct_negatif}% |`,
  ),
  ``,
  `> **Catatan:** kompetitor dengan \`n_total=0\` tidak di-scrape (tidak ada review di Maps) → **TIDAK ADA DATA** untuk sentimen. Kompetitor dengan `+"`n_sampled=0`"+` (semua review >1 tahun) juga berlabel **TIDAK ADA DATA**.`,
  ``,
  `## Detail per kompetitor`,
  ``,
];

for (const s of scored) {
  mdLines.push(
    `### ${s.nama} (${s.titik})`,
    ``,
    `- Review total di Maps: **${s.n_total || "-"}** | Tersampling 1 tahun: **${s.n_sampled}**`,
    `- Sentimen: **${s.label}** (score ${s.score}) — ${s.pct_positif}% positif / ${s.pct_negatif}% negatif / ${s.pct_netral}% netral`,
    ``,
    `**Contoh review positif:**`,
  );
  const posSamples = (s.scored || []).filter((r) => r.label === "positif").slice(0, 3);
  for (const r of posSamples) mdLines.push(`- "${(r.text || "").slice(0, 160)}"`);
  mdLines.push(`**Contoh review negatif:**`);
  const negSamples = (s.scored || []).filter((r) => r.label === "negatif").slice(0, 3);
  for (const r of negSamples) mdLines.push(`- "${(r.text || "").slice(0, 160)}"`);
  mdLines.push(``);
}

const mdFile = path.join(outBase, `report_sentimen_${stamp}.md`);
writeFileSync(mdFile, mdLines.join("\n"), "utf-8");
log(`Report → ${mdFile}`, "success");

const rawFile = path.join(outBase, `review_dump_${stamp}.json`);
writeFileSync(
  rawFile,
  JSON.stringify(
    scored.map((s) => ({
      place_id: s.place_id,
      nama: s.nama,
      titik: s.titik,
      n_total: s.n_total,
      n_sampled: s.n_sampled,
      label: s.label,
      reviews: (s.scored || []).map((r) => ({
        text: r.text,
        rating: r.rating,
        time: r.time,
        score: r.score,
        label: r.label,
        matchedPos: r.matchedPos,
        matchedNeg: r.matchedNeg,
      })),
    })),
    null,
    2,
  ),
  "utf-8",
);
log(`Dump review → ${rawFile}`, "success");
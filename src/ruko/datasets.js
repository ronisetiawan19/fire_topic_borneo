import { readFileSync } from "node:fs";
import { CONFIG } from "../config.js";
import { csvToObjects } from "./utils.js";

export const TOP_LEVEL_SCORE_COLS = [
  "skor_cafe_resto",
  "skor_kampus_univ",
  "skor_sekolah",
  "skor_mall_belanja",
  "skor_sport_gym",
  "skor_rumah_sakit",
  "skor_kantor",
  "skor_twin",
  "skor_perumahan",
];

function readCsvFile(rel) {
  return readFileSync(rel, "utf-8");
}

export function loadTitikKandidat() {
  const obj = csvToObjects(readCsvFile(CONFIG.ruko.files.titik));
  return obj
    .map((r, i) => ({
      index: i + 1,
      wilayah: r.wilayah,
      kota: r.kota,
      nama: r.nama_titik,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      status: r.status,
      sumber: r.sumber,
    }))
    .filter((t) => !isNaN(t.lat) && !isNaN(t.lon));
}

export function loadKompetitor() {
  const obj = csvToObjects(readCsvFile(CONFIG.ruko.files.kompetitor));
  const byTitik = {};
  for (const r of obj) {
    const kelas = (r.kelas || "").trim().toUpperCase();
    const item = {
      kompetitor: r.kompetitor,
      alamat: r.alamat,
      rating: r.rating ? parseFloat(r.rating) : null,
      n_reviews: r.n_reviews ? parseInt(r.n_reviews, 10) || null : null,
      harga_range: r.harga_range,
      kelas,
      sentimen: r.sentimen_absa || "",
      gofood_url: r.gofood_url === "-" || r.gofood_url === "belum ditemukan" ? "" : r.gofood_url,
      maps_url: r.google_maps_url === "-" ? "" : r.google_maps_url,
    };
    (byTitik[r.titik] = byTitik[r.titik] || []).push(item);
  }
  const agg = {};
  for (const [titik, list] of Object.entries(byTitik)) {
    const count_A = list.filter((k) => k.kelas === "A").length;
    const count_B = list.filter((k) => k.kelas === "B").length;
    const count_C = list.filter((k) => k.kelas === "C").length;
    agg[titik] = {
      list,
      count_A,
      count_B,
      count_C,
      bobot: count_A * 3 + count_B * 2 + count_C * 1,
    };
  }
  return agg;
}

export function loadSiteScores() {
  const obj = csvToObjects(readCsvFile(CONFIG.ruko.files.siteScores));
  const map = {};
  for (const r of obj) {
    const sc = {};
    for (const col of Object.keys(r)) {
      if (col.startsWith("skor_") && r[col] !== "") {
        const n = parseFloat(r[col]);
        sc[col] = isNaN(n) ? null : n;
      }
    }
    map[r.nama] = { ...sc, catatan_cakupan: r.catatan_cakupan || "" };
  }
  return map;
}

export function compositeScore(site) {
  if (!site) return null;
  const vals = TOP_LEVEL_SCORE_COLS
    .map((c) => site[c])
    .filter((v) => v !== undefined && v !== null && !isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function loadAll() {
  const titik = loadTitikKandidat();
  const komp = loadKompetitor();
  const sites = loadSiteScores();
  const bobots = Object.values(komp).map((k) => k.bobot);
  const maxBobot = bobots.length ? Math.max(...bobots) : 0;
  const enriched = titik.map((t) => {
    const k = komp[t.nama] || { list: [], count_A: 0, count_B: 0, count_C: 0, bobot: 0 };
    const s = sites[t.nama] || null;
    const skor_kompetisi = maxBobot > 0 ? Math.round(100 * (1 - k.bobot / maxBobot)) : 100;
    return {
      ...t,
      kompetitor: k.list,
      count_A: k.count_A,
      count_B: k.count_B,
      count_C: k.count_C,
      bobot_kompetisi: k.bobot,
      skor_kompetisi,
      site: s,
      skor_site: compositeScore(s),
      catatan_cakupan: s?.catatan_cakupan || "",
      peringatan_kompetitif: k.count_A > 0,
    };
  });
  return { titik: enriched, komp, sites, maxBobot };
}

export function findTitik(namaOrIndex) {
  const { titik } = loadAll();
  const q = String(namaOrIndex).trim().toLowerCase();
  if (/^\d+$/.test(q)) {
    const idx = parseInt(q, 10);
    const hit = titik.find((t) => t.index === idx);
    if (hit) return hit;
  }
  return titik.find(
    (t) => t.nama.toLowerCase() === q || t.nama.toLowerCase().includes(q),
  );
}
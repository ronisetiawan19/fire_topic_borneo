import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exportJson } from "../exporter.js";
import { todayStamp } from "../utils.js";
import { CONFIG } from "../config.js";
import { scoreAllTitik } from "./scoring.js";

const LISTING_HEADERS = [
  "ranking_titik",
  "skor_rekomendasi",
  "skor_site",
  "skor_kompetisi",
  "listing_health",
  "titik",
  "kota",
  "wilayah",
  "radius_km",
  "jumlah_listing",
  "peringatan_kompetitif",
  "kompetitor_A",
  "kompetitor_B",
  "kompetitor_C",
  "catatan_cakupan",
  "judul",
  "tipe_properti",
  "sumber",
  "harga",
  "harga_raw",
  "satuan_harga",
  "luas_tanah",
  "luas_bangunan",
  "lantai",
  "alamat",
  "radius_match",
  "tanggal_listing",
  "link",
];

function escapeCsv(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function writeOutputs({ titikResults, radiusKm, output, outputFormat, limit }) {
  const normalized = titikResults.map((t) => ({
    ...t,
    titik: t.titik ?? t.nama ?? "",
    kota: t.kota ?? "",
  }));
  const scored = scoreAllTitik(normalized, limit);
  const totalListings = scored.reduce((a, t) => a + t.jumlah_listing, 0);

  const data = {
    platform: "ruko",
    brand: "Sky Pasta",
    scrape_mode: (CONFIG.ruko.platforms || ["rumah123"]).join("+"),
    scraper: (CONFIG.ruko.platforms || ["rumah123"]).join("+"),
    radius_km: radiusKm,
    scraped_at: new Date().toISOString(),
    total_titik: scored.length,
    total_listing: totalListings,
    summary_titik: scored.map((t) => ({
      ranking: t.ranking,
      titik: t.titik,
      kota: t.kota,
      wilayah: t.wilayah,
      skor_site: t.skor_site,
      skor_kompetisi: t.skor_kompetisi,
      listing_health: t.listing_health,
      skor_rekomendasi: t.skor_rekomendasi,
      jumlah_listing: t.jumlah_listing,
      jumlah_ruko: (t.listings || []).filter((l) => l.tipe_properti === "ruko").length,
      jumlah_rumah: (t.listings || []).filter((l) => l.tipe_properti === "rumah").length,
      jumlah_rumah123: (t.listings || []).filter((l) => l.sumber === "rumah123").length,
      jumlah_lamudi: (t.listings || []).filter((l) => l.sumber === "lamudi").length,
      platform_results: t.platform_results || null,
      kompetitor_A: t.count_A,
      kompetitor_B: t.count_B,
      kompetitor_C: t.count_C,
      peringatan_kompetitif: t.peringatan_kompetitif,
      catatan_cakupan: t.catatan_cakupan,
    })),
    titik: scored,
  };

  const stamp = todayStamp();
  const jsonPath = path.join(output, `ruko_${stamp}.json`);
  exportJson(data, jsonPath);

  if (outputFormat === "csv" || outputFormat === "both") {
    const csvPath = path.join(output, `ruko_${stamp}.csv`);
    mkdirSync(path.dirname(csvPath), { recursive: true });
    const rows = [];
    for (const t of scored) {
      if (!t.listings?.length) {
        rows.push(
          LISTING_HEADERS.map((h) =>
            h === "titik" ? t.titik
              : h === "kota" ? t.kota
                : h === "wilayah" ? t.wilayah
                  : h === "ranking_titik" ? t.ranking
                    : h === "skor_rekomendasi" ? t.skor_rekomendasi
                      : h === "skor_site" ? t.skor_site
                        : h === "skor_kompetisi" ? t.skor_kompetisi
                          : "",
          ),
        );
        continue;
      }
      for (const l of t.listings) {
        rows.push([
          t.ranking,
          t.skor_rekomendasi,
          t.skor_site,
          t.skor_kompetisi,
          t.listing_health,
          t.titik,
          t.kota,
          t.wilayah,
          radiusKm,
          t.jumlah_listing,
          t.peringatan_kompetitif ? "Y" : "",
          t.count_A,
          t.count_B,
          t.count_C,
          t.catatan_cakupan,
          l.judul,
          l.tipe_properti ?? "",
          l.sumber ?? "",
          l.harga ?? "",
          l.harga_raw,
          l.harga_satuan,
          l.luas_tanah ?? "",
          l.luas_bangunan ?? "",
          l.lantai ?? "",
          l.alamat,
          l.radius_match ? "Y" : "N",
          l.tanggal_listing,
          l.link,
        ]);
      }
    }
    const lines = [LISTING_HEADERS.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))];
    writeFileSync(csvPath, "\uFEFF" + lines.join("\n"), "utf-8");
    return { jsonPath, csvPath };
  }
  return { jsonPath, csvPath: null };
}
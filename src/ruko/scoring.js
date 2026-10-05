import { CONFIG } from "../config.js";

export function scoreTitikResults(titik, limit) {
  const target = limit ?? CONFIG.ruko.maxListings;
  const n = Array.isArray(titik.listings) ? titik.listings.length : 0;
  const listingHealth = target ? Math.min(n / target, 1) * 100 : 0;
  const skor_site = titik.skor_site ?? 0;
  const skor_kompetisi = titik.skor_kompetisi ?? 0;
  const skor_rekomendasi = Math.round(
    0.4 * skor_site + 0.4 * skor_kompetisi + 0.2 * listingHealth,
  );
  return {
    ...titik,
    listing_health: Math.round(listingHealth * 10) / 10,
    jumlah_listing: n,
    skor_rekomendasi,
  };
}

export function scoreAllTitik(titikResults, limit) {
  const scored = titikResults.map((t) => scoreTitikResults(t, limit));
  scored.sort((a, b) => b.skor_rekomendasi - a.skor_rekomendasi || b.jumlah_listing - a.jumlah_listing);
  scored.forEach((t, i) => {
    t.ranking = i + 1;
  });
  return scored;
}
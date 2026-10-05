import { cleanTitle } from "./utils.js";

const SAMPLE_TITLES = [
  "Ruko 2 Lantai Strategis di Posisi Depan",
  "Ruko Disewakan LT 72 LB 144 Audit Jasper",
  "Ruko 3 Lantai Hoek, Cocok Untuk Restoran",
  "Ruko Baru 2 Lantai, Bisa Usaha Kuliner",
  "Ruko Rukoan Cluster, Depan Jalan Raya",
  "Ruko Disewakan Dekat Kampus",
  "Ruko 2 Lantai Full Furnish, Jadi Dapur Operasional",
  "Ruko 4 Lantai Bagus Untuk FnB & Resto",
  "Ruko Hook Minimalis di Kawasan Komersial",
  "Rumah Mewah 3 Lantai dekat Pusat Kuliner",
  "Rumah Hook Sangat Strategis untuk Usaha",
  "Rumah Ruko Jalan Raya, Depan Minimarket",
  "Rumah Tipe 70 Lantai 2, LB Luas",
];

function detectDemoTipe(title) {
  return /rumah/.test(title) ? "rumah" : "ruko";
}

const SAMPLE_PRICES = [85000000, 120000000, 75000000, 95000000, 60000000, 50000000, 140000000, 100000000, 80000000];

export function generateDemoListings(titik) {
  const namaLower = titik.nama.toLowerCase();
  const count = 3 + ((titik.index * 7) % 8);
  const listings = [];
  for (let i = 0; i < count; i++) {
    const title = cleanTitle(SAMPLE_TITLES[(titik.index + i) % SAMPLE_TITLES.length]);
    const lt = 60 + ((titik.index * 11 + i * 17) % 120);
    const lb = lt * ((i % 2) + 1);
    listings.push({
      judul: title,
      tipe_properti: detectDemoTipe(title),
      sumber: "demo",
      harga_raw: `Rp ${SAMPLE_PRICES[(titik.index + i) % SAMPLE_PRICES.length].toLocaleString("id-ID")}`,
      harga: SAMPLE_PRICES[(titik.index + i) % SAMPLE_PRICES.length],
      harga_satuan: "per tahun",
      luas_tanah: lt,
      luas_bangunan: lb,
      lantai: (i % 3) + 1,
      alamat: `${titik.nama}, ${titik.kota}`,
      radius_keywords: [titik.nama.toLowerCase()],
      radius_match: true,
      quality: 5,
      link: `https://demo.local/item/${titik.index}-${i}`,
      tanggal_listing: `2026-0${(i % 9) + 1}-10`,
      _demo: true,
      raw_text: `${title} | Rp ${SAMPLE_PRICES[(titik.index + i) % SAMPLE_PRICES.length].toLocaleString("id-ID")} | LT ${lt} LB ${lb} | ${titik.nama}, ${titik.kota} | hari ini`,
    });
  }
  return { ok: true, total_raw: count, total_semua: count, listings, blocked: null, scraped_at: new Date().toISOString() };
}
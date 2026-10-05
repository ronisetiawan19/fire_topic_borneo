import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { log } from "../utils.js";
import { csvToObjects, haversineKm } from "./utils.js";
import { newPlatformContext } from "./platforms/shared.js";
import * as rumah123 from "./platforms/rumah123.js";

const TITIK_MAP = {
  kedaton: "Kedaton",
  "way halim": "Way Halim",
  "bogor nirwana": "Bogor Nirwana Residence",
  "bogor nirwana residence": "Bogor Nirwana Residence",
  dago: "Dago - Ciumbuleuit",
  sukarame: "Sukarame - Unila",
  setiabudi: "Setiabudi - UNPAD",
  "sindang barang": "Sindang Barang - Bogor Timur",
  gejayan: "Gejayan - Kaliurang",
};

function mapPoolTitik(deckTitik) {
  const key = deckTitik.trim().toLowerCase();
  return TITIK_MAP[key] || null;
}

function radiusLadderKm(km) {
  if (km <= 1) return 1;
  if (km <= 1.5) return 1.5;
  if (km <= 2) return 2;
  if (km <= 3) return 3;
  return null;
}

export async function reverseGeocodeOsm(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&accept-language=id&zoom=18`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "my-scraping-tools-js/1.0 (research; local)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return { ok: false, reason: `http ${res.status}` };
  const j = await res.json();
  if (j.error) return { ok: false, reason: j.error };
  return {
    ok: true,
    display_name: j.display_name || "",
    road: j.address?.road || j.address?.pedestrian || "",
    neighbourhood: j.address?.neighbourhood || j.address?.suburb || j.address?.village || "",
    city: j.address?.city || j.address?.town || j.address?.county || "",
    province: j.address?.state || j.address?.province || "",
    postcode: j.address?.postcode || "",
  };
}

export async function searchGeocodeNom(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query,
  )}&format=jsonv2&accept-language=id&limit=1&countrycodes=id`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "my-scraping-tools-js/1.0 (research; local)",
      Accept: "application/json",
    },
  });
  if (!res.ok) return { ok: false, reason: `http ${res.status}` };
  const j = await res.json();
  if (!Array.isArray(j) || !j.length) return { ok: false, reason: "no result" };
  const top = j[0];
  return {
    ok: true,
    display_name: top.display_name || "",
    lat: Number(top.lat),
    lon: Number(top.lon),
    type: top.type || "",
    class: top.class || "",
  };
}

async function createBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  return { browser };
}

async function processTitik(page, { deck, poolName, pool }, { minTanah, maxPerTitik, includeTanah }) {
  const dl = Number(deck.lat);
  const dlo = Number(deck.lon);
  log(`\n▶ ${poolName || deck.titik} (deck ${dl},${dlo})`, "highlight");
  if (!pool) {
    log(`  Tidak ada pool lama untuk "${deck.titik}"`, "warn");
    return [];
  }

  const luasan = (pool.listings || []).filter((l) => {
    if (!l.link) return false;
    const lt = Number(l.luas_tanah);
    return !Number.isNaN(lt) && lt >= minTanah;
  });
  const fallbackList = (pool.listings || []).filter((l) => !luasan.includes(l));
  const primary = luasan.length ? luasan : fallbackList;

  const targetCodes = primary
    .map((l) => rumah123.listingCode(l.link))
    .filter(Boolean);
  const pinMap = await rumah123.extractLocationPinFromSrp(
    page,
    { kota: deck.kota, nama: deck.titik },
    targetCodes,
    { includeTanah },
  );

  const rows = [];
  for (const l of primary.slice(0, maxPerTitik)) {
    const code = rumah123.listingCode(l.link);
    log(`  • ${(l.judul || "").slice(0, 55)} (LT ${l.luas_tanah ?? "?"})`, "info");
    const detail = await rumah123.extractListingDetail(page, l.link);
    const detailGeo = detail.geo && rumah123.geoValid(detail.geo) ? detail.geo : null;
    const pinGeo = code && pinMap[code] && rumah123.geoValid(pinMap[code]) ? pinMap[code] : null;
    let usedLat = detailGeo?.lat ?? null;
    let usedLon = detailGeo?.lon ?? null;
    let src = detailGeo ? "LDP" : null;
    if ((!usedLat || !usedLon) && pinGeo) {
      usedLat = pinGeo.lat;
      usedLon = pinGeo.lon;
      src = "SRP";
    }
    const nomQuery =
      detail.address ||
      (pinMap[code]?.location_text ?? null) ||
      l.alamat ||
      `${deck.titik}, ${deck.kota}`;
    if (!usedLat && nomQuery) {
      const g = await searchGeocodeNom(nomQuery);
      await new Promise((r) => setTimeout(r, 1100));
      if (g.ok) {
        usedLat = g.lat;
        usedLon = g.lon;
        src = "nominatim-search";
      }
    }

    let address = { ok: false };
    if (usedLat) {
      address = await reverseGeocodeOsm(usedLat, usedLon);
      await new Promise((r) => setTimeout(r, 1100));
    }

    const jarak = usedLat ? haversineKm(dl, dlo, usedLat, usedLon) : null;
    rows.push({
      titik: deck.titik,
      kota: deck.kota,
      skor_deck: deck.skor_site,
      status_presisi_deck: deck.status_presisi,
      judul: l.judul,
      jenis: l.tipe_properti,
      luas_tanah_m2: l.luas_tanah,
      luas_bangunan_m2: l.luas_bangunan,
      lantai: l.lantai,
      harga: l.harga,
      harga_satuan: l.harga_satuan,
      alamat_listing: detail.address || l.alamat || "",
      alamat_osm: address.ok ? address.display_name : "",
      jalan: address.ok ? address.road : "",
      lokasi_nominatim: src === "nominatim-search" ? nomQuery : "",
      lat_gedung: usedLat,
      lon_gedung: usedLon,
      jarak_ke_deck_km: jarak ? Number(jarak.toFixed(3)) : null,
      radius_efektif: jarak ? radiusLadderKm(jarak) : null,
      sumber_koordinat: src || "",
      sumber_alamat: address.ok ? "osm" : detail.address ? "ldp" : l.alamat ? "listing" : "",
      agen: detail.agent || "",
      link: l.link,
    });
  }

  rows.sort((a, b) => {
    const ra = a.radius_efektif ?? 99;
    const rb = b.radius_efektif ?? 99;
    return ra - rb;
  });
  const near = rows.filter((r) => r.jarak_ke_deck_km !== null && r.radius_efektif !== null);
  const ldpCount = rows.filter((r) => r.sumber_koordinat === "LDP").length;
  log(
    `  → ${rows.length} kandidat | ${ldpCount} koordinat LDP | ${near.length} dalam ≤3 km`,
    "success",
  );
  return rows;
}

export async function runShortlist({ deckFile, poolFile, minTanah, maxPerTitik, includeTanah }) {
  const deck = csvToObjects(readFileSync(deckFile, "utf-8"));
  const poolRaw = JSON.parse(readFileSync(poolFile, "utf-8"));
  const poolByName = new Map((poolRaw.titik || []).map((t) => [t.nama, t]));

  log(`Deck: ${deck.length} titik | Pool lama: ${poolRaw.total_titik} titik`, "info");

  const walls = deck.map((d) => {
    const poolName = mapPoolTitik(d.titik);
    return { deck: d, poolName, pool: poolName ? poolByName.get(poolName) || null : null };
  });

  const allRows = [];
  const { browser } = await createBrowser();
  try {
    const context = await newPlatformContext(browser, {
      cookieFile: null,
      cookieDomain: ".rumah123.com",
    });
    const page = await context.newPage();
    for (const w of walls) {
      const rows = await processTitik(page, w, { minTanah, maxPerTitik, includeTanah });
      allRows.push(...rows);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return allRows;
}

export function writeShortlistCsv(rows, filepath) {
  const headers = [
    "titik", "kota", "skor_deck", "status_presisi_deck", "judul", "jenis",
    "luas_tanah_m2", "luas_bangunan_m2", "lantai", "harga", "harga_satuan",
    "alamat_listing", "alamat_osm", "jalan", "lokasi_nominatim", "lat_gedung", "lon_gedung",
    "jarak_ke_deck_km", "radius_efektif", "sumber_koordinat", "sumber_alamat",
    "agen", "link",
  ];
  mkdirSync(path.dirname(filepath), { recursive: true });
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ];
  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
  return filepath;
}

export function writeShortlistJson(rows, filepath) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(
    filepath,
    JSON.stringify(
      { scraped_at: new Date().toISOString(), total_rows: rows.length, rows },
      null,
      2,
    ),
    "utf-8",
  );
  return filepath;
}
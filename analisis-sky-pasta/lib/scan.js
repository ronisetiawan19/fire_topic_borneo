import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { log, parseCsvObjects, sanitizeFilename, todayStamp, gotoGm } from "./http.js";
import { collectPlacesFromDom, scrollFeed, parseDetailText, readPlaceDetailMeta, parseCoordsFromLink } from "./parse.js";
import { classifyCompetitor, isSpecialistByName } from "./classify.js";

export function riwayatQueryForTitik(titik) {
  const set = new Set(CONFIG.scan.queries.defaults);
  const extra = CONFIG.scan.queries.daerah?.[titik.wilayah];
  if (extra) for (const q of extra) set.add(q);
  return Array.from(set);
}

export function loadTitik() {
  const obj = parseCsvObjects(readFileSync(CONFIG.scan.titikFile, "utf-8"));
  return obj
    .map((r, i) => ({
      index: i + 1,
      wilayah: r.wilayah,
      kota: r.kota,
      nama: r.nama_titik,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      status: r.status,
    }))
    .filter((t) => !isNaN(t.lat) && !isNaN(t.lon));
}

export function findTitik(q, list) {
  const qq = String(q).trim().toLowerCase();
  if (/^\d+$/.test(qq)) {
    const idx = parseInt(qq, 10);
    const hit = list.find((t) => t.index === idx);
    if (hit) return hit;
  }
  return list.find((t) => t.nama.toLowerCase() === qq || t.nama.toLowerCase().includes(qq));
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(2));
}

function allowlistKategoriOk(category, name) {
  if (isSpecialistByName(name)) return true;
  if (!category) return false;
  return CONFIG.klasifikasi.kategoriAllowlist.some((re) => re.test(category));
}

function checkpointPath(titik) {
  return path.join(CONFIG.scan.checkpointDir, `${sanitizeFilename(titik.nama)}.json`);
}

export function loadCheckpoint(titik) {
  const p = checkpointPath(titik);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function saveCheckpoint(titik, results) {
  const p = checkpointPath(titik);
  mkdirSync(path.dirname(p), { recursive: true });
  const data = {
    titik: { nama: titik.nama, kota: titik.kota, lat: titik.lat, lon: titik.lon },
    updated: new Date().toISOString(),
    radiusKm: CONFIG.scan.radiusKm,
    results,
  };
  writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  log(`Checkpoint disimpan: ${p}`, "success");
}

async function queryPoint(page, query, titik) {
  const q = encodeURIComponent(query);
  const url = `${CONFIG.gm.searchUrl}/${q}/@${titik.lat},${titik.lon},${CONFIG.scan.zoom}z`;
  log(`  [query] "${query}" @ ${titik.lat},${titik.lon} (${CONFIG.scan.zoom}z)`, "highlight");
  const blocked = await gotoGm(page, url);
  if (blocked.blocked) {
    log(`  BLOCKED saat query "${query}" — ${blocked.reason}`, "error");
    return [];
  }
  await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => {});
  const afterWait = await page.evaluate(async () => {
    const text = document.body?.innerText?.toLowerCase() || "";
    return /verify|unusual traffic|captcha/i.test(text);
  });
  if (afterWait) {
    log("  Blocked setelah render feed.", "error");
    return [];
  }

  let places = await collectPlacesFromDom(page);
  let emptyRounds = 0;
  const maxRounds = Math.max(3, CONFIG.scan.maxScrollRounds);
  for (let round = 1; round <= maxRounds; round++) {
    if (places.length >= CONFIG.scan.resultsPerQuery) break;
    const before = places.length;
    await scrollFeed(page);
    places = await collectPlacesFromDom(page);
    if (places.length === before) emptyRounds += 1;
    else emptyRounds = 0;
    if (emptyRounds >= CONFIG.scan.emptyRoundsStop) break;
  }
  const capped = places.slice(0, CONFIG.scan.resultsPerQuery);
  log(`  -> ${capped.length} tempat mentah`, "info");
  return capped;
}

function normalizeRow(titik, row) {
  const d = parseDetailText(row.detail);
  const kmFeed = d.distanceKm;
  const coords = parseCoordsFromLink(row.link);
  let n_reviews = row.reviews_count || 0;
  if (!n_reviews && row.detail) {
    const pm = String(row.detail).match(/\(\s*([\d.,]+)\s*\)/);
    if (pm) {
      const v = parseFloat(pm[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(v) && v > 0 && v < 1e7) n_reviews = Math.round(v);
    }
  }
  const jarakKm = kmFeed !== null && kmFeed !== undefined ? kmFeed : null;
  return {
    place_id: row.place_id,
    name: row.name,
    link: row.link,
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    rating: row.rating || 0,
    n_reviews,
    kategori: d.category,
    alamat: (d.address || "").replace(/^Alamat:\s*/i, ""),
    harga_label: d.priceLabel,
    price_level: d.priceLevel,
    jarak_km: jarakKm,
    detail_raw: d.raw,
    detectedAt: new Date().toISOString(),
    review_rendah: (row.rating || 0) === 0,
  };
}

export async function enrichPlace(page, row) {
  const need = !row.kategori || (!row.price_level && !row.harga_label);
  if (!need) return row;
  try {
    await page.goto(row.link, { waitUntil: "domcontentloaded", timeout: CONFIG.gm.navTimeout });
    await page.waitForTimeout(4000);
    const meta = await readPlaceDetailMeta(page);
    const kategoriJunk =
      !row.kategori ||
      /^\d/.test(row.kategori) ||
      /ulasan|nilai/i.test(row.kategori);
    if (meta.category && kategoriJunk) row.kategori = meta.category;
    if (!row.price_level && meta.priceLevel) row.price_level = meta.priceLevel;
    if (!row.harga_label && meta.priceLabel) row.harga_label = meta.priceLabel;
    if (!row.alamat && meta.address) row.alamat = meta.address;
    log(`  enrich: ${row.name} -> objek="${row.kategori}" harga="${row.harga_label || row.price_level}"`, "info");
  } catch (e) {
    log(`  enrich gagal ${row.name}: ${e.message.split("\n")[0]}`, "warn");
  }
  return row;
}

export async function scanTitik(page, titik, { force = false, enrich = true, queries, radiusKm } = {}) {
  const cache = loadCheckpoint(titik);
  if (cache && !force) {
    log(`Titik "${titik.nama}" sudah ada di checkpoint (${cache.results.length} hasil) — skip.`, "warn");
    return cache.results;
  }

  const queriesList = queries ?? riwayatQueryForTitik(titik);
  const scanRadius = radiusKm ?? CONFIG.scan.radiusKm;

  const rawResults = [];
  for (const query of queriesList) {
    const rows = await queryPoint(page, query, titik);
    for (const r of rows) {
      const allowed = allowlistKategoriOk(r.detail ? parseDetailText(r.detail).category : "", r.name);
      if (allowed) rawResults.push({ ...normalizeRow(titik, r), query });
    }
  }

  const dedup = new Map();
  for (const r of rawResults) {
    const key = r.place_id || r.name;
    if (!key) continue;
    const cur = dedup.get(key);
    if (!cur || r.n_reviews >= cur.n_reviews) dedup.set(key, r);
  }
  let out = Array.from(dedup.values());

  const sebelumRadius = out.length;
  const withDist = out.map((r) => {
    const dCoord =
      r.lat !== null && r.lat !== undefined && r.lon !== null && r.lon !== undefined
        ? haversineKm(titik.lat, titik.lon, r.lat, r.lon)
        : null;
    const jarak =
      dCoord !== null && dCoord !== undefined
        ? dCoord
        : r.jarak_km !== null && r.jarak_km !== undefined
          ? r.jarak_km
          : null;
    return { ...r, jarak_km: jarak };
  });
  out = withDist.filter((r) => r.jarak_km !== null && r.jarak_km <= scanRadius);
  if (out.length !== sebelumRadius) {
    log(`  Radius filter ${scanRadius}km: ${sebelumRadius - out.length} tempat di luar jangkauan/tanpa lokasi dibuang.`, "warn");
  }

  if (enrich) {
    const missing = out.filter((r) => !r.kategori || !r.price_level || !r.harga_label);
    log(`Titik "${titik.nama}": enrich ${missing.length} tempat kurang kategori/harga...`, "info");
    for (const r of missing) {
      await enrichPlace(page, r);
    }
  }

  out = out.map((r) => {
    const cls = classifyCompetitor({
      name: r.name,
      category: r.kategori,
      priceLabel: r.harga_label,
      priceLevel: r.price_level,
    });
    return { ...r, ...cls };
  });

  const classified = out
    .filter((r) => r.label)
    .sort((a, b) => {
      const rankMap = { A: 0, TBD: 1, B: 2, C: 3 };
      const ka = rankMap[a.kelas] ?? 3;
      const kb = rankMap[b.kelas] ?? 3;
      if (ka !== kb) return ka - kb;
      return (b.n_reviews || 0) - (a.n_reviews || 0);
    })
    .map((r, i) => ({ ...r, index: i + 1 }));

  saveCheckpoint(titik, classified);
  return classified;
}

export function hasilTitikBersih(titik, results) {
  return results.map((r) => ({
    titik: titik.nama,
    kota: titik.kota,
    index: r.index,
    kompetitor: r.name,
    objek: /^[A-Za-z]/.test(r.kategori || "") && !/[()]/.test(r.kategori || "") ? r.kategori : "",
    alamat: (r.alamat || "").replace(/^Alamat:\s*/i, ""),
    rating: r.rating || 0,
    n_reviews: r.n_reviews || 0,
    harga_label: r.harga_label || "",
    price_level: r.price_level || "",
    jarak_km: r.jarak_km ?? "",
    apple_to_apple: r.label,
    kelas: r.kelas,
    alasan_kelas: r.alasan,
    review_rendah: r.review_rendah ? "ya" : "",
    harga_tbd: r.priceOk === null ? "ya" : "",
    go_maps_url: r.link || "",
    place_id: r.place_id || "",
  }));
}

export { todayStamp };
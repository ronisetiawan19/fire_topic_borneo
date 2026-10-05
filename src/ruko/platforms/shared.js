import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { detectBlocked, scrollPage } from "../../browser.js";
import { log, randomDelay, sanitizeFilename } from "../../utils.js";
import { parsePrice, parseAreaLt, parseAreaLb, parseAreaGeneric, parseLantai, cleanTitle } from "../utils.js";
import { CONFIG, USER_AGENTS } from "../../config.js";

export async function createPlatformBrowser({ headless = CONFIG.headless, forceHttp1 = false } = {}) {
  const args = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--window-size=1280,900",
  ];
  if (forceHttp1) args.push("--disable-http2");
  const browser = await chromium.launch({ headless, args });
  return { browser };
}

const STOP_RADIUS_TOKENS = new Set([
  "ruko", "rumah", "disewakan", "sewa", "di", "dan", "yang", "jual", "dijual", "area",
]);

export function normalizeSiteCookie(c, defaultDomain) {
  const domain = c.domain || defaultDomain;
  const expires = c.expirationDate ?? c.expires ?? c.expiry ?? null;
  return {
    name: c.name,
    value: c.value,
    domain,
    path: c.path || "/",
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: c.sameSite && c.sameSite !== "unspecified" ? c.sameSite : "Lax",
    ...(expires && expires > 0 ? { expires } : {}),
  };
}

export function loadSiteCookies(cookieFile, defaultDomain) {
  const cookiePath = path.resolve(cookieFile);
  if (!existsSync(cookiePath)) {
    return { ok: false, error: `Cookie file tidak ditemukan: ${cookiePath}`, cookies: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(cookiePath, "utf-8"));
    if (!Array.isArray(raw)) {
      return { ok: false, error: "File cookie harus JSON array", cookies: [] };
    }
    const cookies = raw
      .filter((c) => c && c.name && c.value !== undefined)
      .map((c) => normalizeSiteCookie(c, defaultDomain));
    return { ok: true, cookies, error: null };
  } catch (err) {
    return { ok: false, error: `Gagal parse cookie: ${err.message}`, cookies: [] };
  }
}

function detectTipeProperti(text) {
  const t = text.toLowerCase();
  if (/ruko|rukan|kios|toko|shophouse|komersial|gedung|kantor/.test(t)) return "ruko";
  if (/rumah|villa|apartemen|apartement|twin/.test(t)) return "rumah";
  return "lainnya";
}

function detectSatuan(priceText, title) {
  const t = `${priceText} ${title}`.toLowerCase();
  if (/(per\s*(tahun|tahunan|thn|th)|\/th\b|\/tahun)/.test(t)) return "per tahun";
  if (/(per\s*(bulan|bulanan|bln)|\/bln\b|\/bulan)/.test(t)) return "per bulan";
  if (/(per\s*(minggu|mg)|\/mg\b)/.test(t)) return "per minggu";
  return "";
}

export function radiusHits(titik, address, title) {
  const text = `${address} ${title}`.toLowerCase();
  const kota = (titik.kota || "").toLowerCase();
  const namaBits = titik.nama
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP_RADIUS_TOKENS.has(w));
  const hits = [];
  if (kota && text.includes(kota)) hits.push(kota);
  for (const b of namaBits) {
    if (text.includes(b) && !hits.includes(b)) hits.push(b);
  }
  return hits;
}

export function buildListing(raw, titik, extra) {
  const allText = raw.lines.join(" ");
  const title = raw.title ? cleanTitle(raw.title) : "";
  const address = raw.address ? cleanTitle(raw.address) : "";
  const hits = radiusHits(titik, address, title);
  const kval = hits.length
    ? 3 + Math.min(hits.length, 3)
    : /ruko|rumah|kios|toko|komersial|gedung|kantor/.test(title)
      ? 1
      : 0;
  const luasTanah = parseAreaLt(allText);
  const luasBangunan = parseAreaLb(allText);
  return {
    judul: title,
    tipe_properti: raw.tipe_properti || detectTipeProperti(allText),
    sumber: extra.platform,
    harga_raw: raw.price || "",
    harga: raw.price ? parsePrice(raw.price) : null,
    harga_satuan: raw.satuan || detectSatuan(raw.price || "", title),
    luas_tanah: luasTanah ?? (luasBangunan ? null : parseAreaGeneric(allText)),
    luas_bangunan: luasBangunan,
    lantai: raw.lantai ?? parseLantai(allText),
    alamat: address,
    tanggal_listing: raw.date || "",
    radius_keywords: hits,
    radius_match: hits.length > 0,
    quality: kval,
    link: raw.href,
  };
}

export async function newPlatformContext(browser, { cookieFile, cookieDomain }) {
  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["id-ID", "id", "en"] });
  });

  if (cookieFile && existsSync(cookieFile)) {
    const cookieRes = loadSiteCookies(cookieFile, cookieDomain);
    if (cookieRes.ok && cookieRes.cookies.length) {
      await context.addCookies(cookieRes.cookies);
      log(`  Cookie dimuat (${cookieRes.cookies.length})`, "success");
    } else {
      log(`  Cookie tidak dimuat: ${cookieRes.error || "kosong"}`, "warn");
    }
  }
  return context;
}

export function checkpointPathFor(platformName, titik) {
  const safe = sanitizeFilename(`${platformName}_${titik.nama}`);
  return path.join(CONFIG.ruko.checkpointDir, `${safe}.json`);
}

function loadCheckpoint(platformName, titik) {
  const file = checkpointPathFor(platformName, titik);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveCheckpoint(platformName, titik, data) {
  const file = checkpointPathFor(platformName, titik);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function crawlTitik(platform, titik, { browser, limit, force } = {}) {
  const existing = force ? null : loadCheckpoint(platform.name, titik);
  if (existing?.ok && existing?.listings?.length) {
    log(`  [${platform.name}] checkpoint ditemukan (${existing.listings.length} listing) — pakai cache`, "warn");
    return existing;
  }

  const context = await newPlatformContext(browser, {
    cookieFile: platform.cookieFile,
    cookieDomain: platform.cookieDomain,
  });
  const page = await context.newPage();
  const rawCards = [];
  let blocked = null;
  let navOk = false;
  let navAttempts = 0;
  try {
    for (const entry of platform.searchUrlsFor(titik)) {
      navAttempts++;
      const url = typeof entry === "string" ? entry : entry.url;
      const variant = typeof entry === "string" ? null : entry.variant || null;
      log(`  [${platform.name}] GET ${url}`, "info");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: CONFIG.ruko.navTimeout });
        navOk = true;
      } catch (e) {
        log(`  nav: ${e.message.split("\n")[0]}`, "warn");
      }
      await page.waitForTimeout(CONFIG.ruko.waitAfterNav);

      const status = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 400) : ""));
      if (/the request could not be satisfied|cloudfront|unable to connect/i.test(status)) {
        blocked = "firewall";
        log(`  [${platform.name}] diblokir firewall/CDN (403/CloudFront)`, "error");
        if (platform.name === "lamudi") {
          log(`  Tip: simpan cookie browser anda ke cookies/lamudi_cookies.json lalu jalankan lagi`, "warn");
        }
        break;
      }

      const blk = await detectBlocked(page);
      if (blk.blocked) {
        blocked = blk.reason;
        log(`  [${platform.name}] diblokir (${blk.reason})`, "error");
        break;
      }
      await scrollPage(page, CONFIG.ruko.maxPageScrolls, CONFIG.ruko.delayMin, CONFIG.ruko.delayMax);
      const cards = await platform.extractCards(page, variant);
      log(`  ${cards.length} kartu ditemukan`, "info");
      rawCards.push(...cards);
      if (rawCards.length >= limit * 4) break;
      await randomDelay(CONFIG.ruko.delayMin, CONFIG.ruko.delayMax);
    }
  } finally {
    await context.close();
  }

  if (!blocked && !navOk && navAttempts > 0 && rawCards.length === 0) {
    blocked = "network";
    log(`  [${platform.name}] semua URL gagal terjangkau — situs memblokir IP ini`, "error");
  }

  const seen = new Set();
  const listings = [];
  for (const raw of rawCards) {
    if (seen.has(raw.href)) continue;
    seen.add(raw.href);
    const l = buildListing(raw, titik, { platform: platform.name });
    if (!l.judul) continue;
    listings.push(l);
  }
  listings.sort((a, b) => b.quality - a.quality);
  const top = listings.slice(0, limit);

  const result = {
    titik: titik.nama,
    kota: titik.kota,
    sumber: platform.name,
    blocked,
    ok: !blocked,
    total_raw: rawCards.length,
    total_semua: listings.length,
    listings: top,
    scraped_at: new Date().toISOString(),
  };
  if (!blocked) saveCheckpoint(platform.name, titik, result);
  else log(`  [${platform.name}] hasil tidak disimpan ke checkpoint (hindari menimpa data lama yang bagus)`, "warn");
  return result;
}
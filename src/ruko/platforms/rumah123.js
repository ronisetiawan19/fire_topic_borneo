import { CONFIG } from "../../config.js";
import { detectBlocked } from "../../browser.js";
import { log } from "../../utils.js";
import { slugify } from "../utils.js";

export const name = "rumah123";
export const cookieFile = CONFIG.ruko.rumah123.cookieFile;
export const cookieDomain = CONFIG.ruko.rumah123.cookieDomain;

function normalizeKotaName(kota) {
  return (kota || "")
    .toLowerCase()
    .replace(/\b(kota|kab\.?|kabupaten|provinsi)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CITY_SLUG_MAP = Object.fromEntries(
  Object.entries(CONFIG.ruko.rumah123.citySlugs || {}).map(([k, v]) => [normalizeKotaName(k), v]),
);

export function citySlugFor(titik) {
  const key = normalizeKotaName(titik.kota);
  return CITY_SLUG_MAP[key] || slugify(key) || null;
}

export function searchUrlsFor(titik, opts = {}) {
  const slug = citySlugFor(titik);
  if (!slug) return [];
  const { baseUrl } = CONFIG.ruko.rumah123;
  const urls = [
    { url: `${baseUrl}/sewa/${slug}/ruko/`, variant: "ruko" },
    { url: `${baseUrl}/sewa/${slug}/rumah/`, variant: "rumah" },
  ];
  if (opts.includeTanah) urls.push({ url: `${baseUrl}/sewa/${slug}/tanah/`, variant: "tanah" });
  return urls;
}

export function listingCode(url) {
  const matches = [...String(url || "").matchAll(/(shr|hor|lar)[a-z0-9]+/gi)].map((m) => m[0].toLowerCase());
  if (!matches.length) return null;
  return matches.reduce((longest, m) => (m.length > longest.length ? m : longest), "");
}

const INDONESIA_BBOX = { latMin: -12, latMax: 7, lonMin: 94, lonMax: 142 };
const unesc = (s) =>
  (s || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export function geoValid(g) {
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return false;
  if (Math.abs(g.lat - g.lon) < 1e-6) return false;
  return (
    g.lat >= INDONESIA_BBOX.latMin &&
    g.lat <= INDONESIA_BBOX.latMax &&
    g.lon >= INDONESIA_BBOX.lonMin &&
    g.lon <= INDONESIA_BBOX.lonMax
  );
}

export async function extractListingDetail(page, url, { waitAfter = CONFIG.ruko.waitAfterNav } = {}) {
  let navErr = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: CONFIG.ruko.navTimeout });
  } catch (e) {
    navErr = e.message.split("\n")[0];
  }
  await page.waitForTimeout(waitAfter);
  const blk = await detectBlocked(page);
  if (blk.blocked) return { ok: false, reason: `blocked:${blk.reason}` };
  const html = await page.content();
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  const rawTitle = unesc(titleM?.[1]);
  if (/404|not[ -]?found|belum tersedia|tidak ditemukan/i.test(rawTitle || "")) {
    return { ok: false, reason: "not-found", title: rawTitle };
  }
  const found = { geo: null, address: "", price: null, agent: null };
  const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let scannedGeo = 0;
  for (const raw of ldBlocks) {
    const inner = raw.replace(/^<script[^>]*>/, "").replace(/<\/script>\s*$/, "");
    let data;
    try {
      data = JSON.parse(inner);
    } catch {
      continue;
    }
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      const geoNode = node.geo && typeof node.geo === "object" ? node.geo : null;
      if (geoNode) {
        scannedGeo++;
        const cand = {
          lat: Number(geoNode.latitude),
          lon: Number(geoNode.longitude),
        };
        if (!found.geo && geoValid(cand)) {
          found.geo = cand;
          const addr = node.address;
          if (addr) found.address = unesc([addr.addressLocality, addr.addressRegion].filter(Boolean).join(", "));
          const o = node.offers && node.offers.priceSpecification ? node.offers.priceSpecification : node.offers;
          if (o && !found.price && (o.price || o.price === 0)) found.price = String(o.price);
          if (!found.agent && node.offeredBy && typeof node.offeredBy === "object" && node.offeredBy.name) {
            found.agent = unesc(node.offeredBy.name);
          }
        }
      }
      for (const v of Object.values(node)) {
        if (v && typeof v === "object") {
          if (Array.isArray(v)) v.forEach(walk);
          else walk(v);
        }
      }
    };
    walk(data);
    if (found.geo) {
      if (!found.agent) {
        const collect = (node) => {
          if (!node || typeof node !== "object") return;
          const byType = node["@type"];
          const isAgent = Array.isArray(byType) ? byType.some((t) => /Agent|Person/.test(String(t))) : /Agent|Person/.test(String(byType || ""));
          if (isAgent && node.name && !found.agent) found.agent = unesc(node.name);
          for (const v of Object.values(node)) {
            if (v && typeof v === "object") (Array.isArray(v) ? v : [v]).forEach(collect);
          }
        };
        collect(data);
      }
      break;
    }
  }
  let geo = found.geo;
  const priceM = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
  const offeredM = html.match(/"offeredBy"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
  return {
    ok: true,
    code: listingCode(url),
    geo,
    address_locality: found.address,
    address_region: "",
    address: found.address,
    price: found.price || (priceM ? priceM[1] : null),
    agent: found.agent || (offeredM ? unesc(offeredM[1]) : null),
    judul: rawTitle,
    nav_error: navErr,
  };
}

export function parseSrpPins(html) {
  const unesc = (s) =>
    (s || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  let t = String(html)
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
  const pins = [];
  let i = t.indexOf("locationPin");
  while (i !== -1) {
    const blockStart = Math.max(0, i - 1400);
    const blockEnd = Math.min(t.length, i + 500);
    const block = t.slice(blockStart, blockEnd);
    const urlM = block.match(/"url"\s*:\s*"(\/properti\/[^"]+)"/);
    const locM = block.match(/"location"\s*:\s*\{\s*"text"\s*:\s*"([^"]+)"/);
    const latM = block.match(/"latitude"\s*:\s*(-?\d[\d.]*)/);
    const lonM = block.match(/"longitude"\s*:\s*(-?\d[\d.]*)/);
    if (urlM && latM && lonM) {
      pins.push({
        url: urlM[1],
        code: listingCode(urlM[1]),
        lat: parseFloat(latM[1]),
        lon: parseFloat(lonM[1]),
        location_text: unesc(locM?.[1]),
      });
    }
    i = t.indexOf("locationPin", i + 10);
  }
  return pins;
}

export async function extractLocationPinFromSrp(page, titik, targetCodes = [], opts = {}) {
  const byCode = {};
  for (const entry of searchUrlsFor(titik, opts)) {
    const url = typeof entry === "string" ? entry : entry.url;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: CONFIG.ruko.navTimeout });
      await page.waitForTimeout(CONFIG.ruko.waitAfterNav);
      const html = await page.content();
      for (const pin of parseSrpPins(html)) {
        if (!pin.code) continue;
        if (targetCodes.length && !targetCodes.includes(pin.code)) continue;
        byCode[pin.code] = pin;
      }
    } catch (e) {
      log(`  SRP nav: ${e.message.split("\n")[0]}`, "warn");
    }
  }
  return byCode;
}

export async function extractCards(page, variant) {
  const cards = await page.$$eval(
    'article[data-test-id^="srp-listing-card"], [data-name="ldp-listing-card"]',
    (nodes, origin) => {
      const out = [];
      for (const card of nodes) {
        const a = card.querySelector('a[href*="/properti/"]') || card.querySelector("a[href]");
        if (!a) continue;
        const hrefRaw = a.getAttribute("href");
        if (!hrefRaw) continue;
        const href = hrefRaw.startsWith("http") ? hrefRaw : new URL(hrefRaw, origin).href;
        if (!/\/properti\//.test(href)) continue;

        let title = "";
        const img = card.querySelector("img[alt]");
        const titleNode = card.querySelector('[data-test-id="srp-card-listing-title"]');
        if (titleNode) title = (titleNode.textContent || "").trim();
        if (!title && img) title = (img.getAttribute("alt") || "").trim();

        const locNode = card.querySelector('[data-test-id="srp-card-listing-location"]');
        const address = locNode ? locNode.textContent.trim() : "";

        let price = "";
        const priceMatch = /"price"\s*:\s*"([^"]+)"/.exec(card.outerHTML);
        if (priceMatch) price = priceMatch[1];
        if (!price) {
          const pm = /(Rp\s?[\d.]+(?:\s?\S*)?)/.exec(card.textContent);
          if (pm) price = pm[1];
        }

        const satuan = /per\s*(tahun|thn|bulan|bln|minggu)/i.exec(card.textContent);
        const rawSatuan = satuan ? satuan[1].toLowerCase() : "";

        out.push({
          href,
          title,
          address,
          price,
          satuan: rawSatuan ? `per ${rawSatuan.replace("thn", "tahun").replace("bln", "bulan")}` : "",
          lines: (card.innerText || card.textContent || "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }
      return out;
    },
    page.url(),
  );
  if (variant && cards.length) {
    for (const c of cards) c.tipe_properti = variant;
  }
  return cards;
}
/**
 * Ekstraktor input Google Maps (murni, tanpa I/O, tanpa browser).
 *
 * Bekerja untuk:
 * - URL tempat (/maps/place/, !1s0x, place_id:)
 * - URL search (/maps/search/?q=, /maps/search/?query=, /maps/search/<q>)
 * - Ekstraksi dari teks/CSV/TSV/HTML (kutip, href, =HYPERLINK)
 *
 * Sesuai rencana: CSV search → hasil pertama (first result only).
 */
import { parsePlaceIdFromUrl } from "../utils.js";

const MAPS_HOST_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:maps\.google\.[a-z]+|google\.[a-z]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
const MAPS_SEARCH_RE =
  /\/maps\/search\/?(?:\?|$)|[?&](?:q|query)=|\/maps\/search\//i;
const PLACE_ID_RE = /!1s([^:!]+):0x([0-9a-f]+)/i;
const PLACE_ID_ALT_RE = /(?:place_id|pb)=([A-Za-z0-9\-\_]+)/i;
const URL_IN_QUOTES_RE = /["'](https?:\/\/[^"']+)["']/g;
const HYPERLINK_RE = /=HYPERLINK\(["']([^"']+)["']/gi;
const A_HREF_RE = /<a[^>]+href=["']([^"']+)["']/gi;

function decodeQuery(v) {
  if (!v) return "";
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v.replace(/\+/g, " ");
  }
}

export function extractSearchQuery(u) {
  if (!u) return "";
  try {
    const url = new URL(u, "https://www.google.com");
    const q = url.searchParams.get("q") || url.searchParams.get("query");
    if (q) return decodeQuery(q);

    const pathname = url.pathname || "";
    if (/\/maps\/search\//i.test(pathname)) {
      let rest = pathname.replace(/^\/maps\/search\/?/i, "");
      rest = rest.split(/[?#]/)[0];
      if (rest) return decodeQuery(rest);
    }
    return "";
  } catch {
    let s = String(u);
    const mq = s.match(/[?&](?:q|query)=([^&#]+)/i);
    if (mq) return decodeQuery(mq[1]);
    const mp = s.match(/\/maps\/search\/([^?#]+)/i);
    if (mp) return decodeQuery(mp[1]);
    return "";
  }
}

export function classifyInput(raw) {
  if (!raw) return { kind: "unknown" };
  const s = String(raw).trim();
  if (!s) return { kind: "unknown" };

  if (MAPS_SEARCH_RE.test(s)) {
    const query = extractSearchQuery(s);
    return { kind: "search", query };
  }

  const pid = parsePlaceIdFromUrl(s);
  if (pid) return { kind: "place", placeIdHint: pid };

  if (PLACE_ID_RE.test(s) || PLACE_ID_ALT_RE.test(s)) {
    return { kind: "place" };
  }

  if (MAPS_HOST_RE.test(s) && /\/maps\//i.test(s)) {
    return { kind: "place" };
  }

  return { kind: "unknown" };
}

export function cleanCell(s) {
  if (!s) return "";
  let t = String(s).trim();
  t = t.replace(/^[\s"'`]+|[\s"'`,;:]+$/g, "");
  t = t.replace(HYPERLINK_RE, "$1");
  t = t.replace(A_HREF_RE, "$1");
  return t;
}

export function looksLikeMapsUrl(input) {
  if (!input) return false;
  const t = cleanCell(input);
  if (!t) return false;
  if (!/^https?:\/\//i.test(t) && !MAPS_HOST_RE.test(t)) return false;
  if (MAPS_HOST_RE.test(t) && /\/maps\//i.test(t)) return true;
  if (/\/maps\/search/i.test(t)) return true;
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(t)) return true;
  if (/google\.[a-z]+\/maps/i.test(t)) return true;
  return false;
}

export function scanFreeText(text) {
  if (!text) return [];
  const out = [];
  let m;

  URL_IN_QUOTES_RE.lastIndex = 0;
  while ((m = URL_IN_QUOTES_RE.exec(text))) {
    const c = cleanCell(m[1]);
    if (looksLikeMapsUrl(c)) out.push(c);
  }

  HYPERLINK_RE.lastIndex = 0;
  while ((m = HYPERLINK_RE.exec(text))) {
    const c = cleanCell(m[1]);
    if (looksLikeMapsUrl(c)) out.push(c);
  }

  A_HREF_RE.lastIndex = 0;
  while ((m = A_HREF_RE.exec(text))) {
    const c = cleanCell(m[1]);
    if (looksLikeMapsUrl(c)) out.push(c);
  }

  const reLine = /https?:\/\/[^\s"'<>]+/gi;
  while ((m = reLine.exec(text))) {
    let u = m[0];
    u = u.replace(/[),;:]+$/, "");
    const c = cleanCell(u);
    if (looksLikeMapsUrl(c)) out.push(c);
  }

  return out;
}

export function extractMapsUrls(text) {
  if (!text) return [];
  const raw = scanFreeText(text);
  const seen = new Set();
  const urls = [];
  for (const r of raw) {
    const c = cleanCell(r);
    if (!c) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    urls.push(c);
  }
  return urls;
}

export function pickUrlColumn(headers = []) {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  const keys = headers.map((h) => String(h || "").trim().toLowerCase());

  const priority = [
    "google_maps_url",
    "maps_url",
    "google_maps",
    "gmap_url",
    "gmap",
    "map_url",
    "url_maps",
    "mapslink",
    "url",
    "link",
    "website",
    "lokasi",
    "alamat",
  ];

  for (const p of priority) {
    const i = keys.findIndex((k) => k === p || k.includes(p));
    if (i >= 0) return headers[i];
  }

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (/maps|gmap|goo\.gl|place|search/i.test(k)) return headers[i];
  }
  return null;
}

export function normalizeInputList(list = []) {
  const seen = new Set();
  const urls = [];
  const skipped = [];
  for (const it of list) {
    if (!it) continue;
    const c = cleanCell(String(it));
    if (!c) {
      skipped.push({ val: it, reason: "empty" });
      continue;
    }
    if (seen.has(c)) continue;
    seen.add(c);
    urls.push(c);
  }
  return { urls, skipped };
}

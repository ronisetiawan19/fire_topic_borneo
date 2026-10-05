import { CONFIG } from "../config.js";
import { log, randomDelay } from "./http.js";

export function parseCountMap(txt) {
  if (!txt) return 0;
  const t = String(txt).trim().toLowerCase();
  const m = t.match(/([\d.,]+)\s*(rb|ribu|jt|juta|[kmb])?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return 0;
  const u = m[2];
  if (u === "rb" || u === "ribu" || u === "k") n *= 1e3;
  if (u === "jt" || u === "juta" || u === "m") n *= 1e6;
  if (u === "b") n *= 1e9;
  return Math.round(n);
}

export function parseRating(label) {
  const m = String(label || "").match(/(\d(?:[.,]\d)?)/);
  const v = m ? m[1] : null;
  return v ? parseFloat(v.replace(",", ".")) || 0 : 0;
}

function placeIdOf(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (m) return m[1];
  const p = url.match(/(?:^|[^0-9a-fA-F])(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})(?:[^0-9a-fa-f]|$)/);
  return p ? p[1] : null;
}

export function parseDistanceKm(txt) {
  if (!txt) return null;
  const t = String(txt).replace(/,/g, ".");
  let m = t.match(/([\d.]+)\s*km/i);
  if (m) {
    const v = parseFloat(m[1]);
    return isNaN(v) ? null : v;
  }
  m = t.match(/([\d.,]+)\s*(?:m|meter)/i);
  if (m) {
    const v = parseFloat(m[1].replace(/,/g, "."));
    return isNaN(v) ? null : v / 1000;
  }
  return null;
}

export function parsePriceLevel(txt) {
  if (!txt) return null;
  const m = String(txt).match(/\${2,}/);
  if (!m) return null;
  const dollars = m[0].length;
  if (dollars <= 1) return "$";
  if (dollars === 2) return "$$";
  if (dollars === 3) return "$$$";
  return "$$$$";
}

export function parsePriceLabel(txt) {
  if (!txt) return "";
  const m = String(txt).match(/Rp\s?[\d.,]+\s*(?:[-\u2013]\s*[\d.,]+\s*)?(?:rb|ribu|jt|juta|k)?/i);
  return m ? m[0].trim() : "";
}

export function parseCoordsFromLink(url) {
  if (!url) return null;
  const m = String(url).match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon };
}

export function parseDetailText(detail) {
  const raw = String(detail || "");
  const out = {
    category: "",
    address: "",
    priceLabel: parsePriceLabel(raw),
    priceLevel: parsePriceLevel(raw),
    distanceKm: parseDistanceKm(raw),
    raw: raw.slice(0, 400),
  };
  const priceLevelInline = parsePriceLevel(raw);
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l !== "·");

  const isRatingLike = (l) =>
    /^\d(?:[.,]\d)?(\s*\(\s*[\d.,]+\s*\))?$/.test(l) ||
    /^\d[\d.,]*\s*\([^)]*\)$/.test(l) ||
    /^\(\s*[\d.,]+\s*\)$/.test(l) ||
    /^tidak ada (ulasan|nilai)|^belum ada ulasan|^no reviews?$/i.test(l);

  const isPriceLike = (l) => /\${1,}/.test(l) || (/rp\s?\d/i.test(l) && /\d/.test(l));

  const isAddressLike = (l) =>
    /^(jl|jln|jalan|rt\s?[.\d]+|rw\s?[.\d]+|gg\s?\.?|kec\.|kel\.|desa|kab)/i.test(l) ||
    /^\d{4,5}\s*$/i.test(l) ||
    /(·|purwakarta|bandung|tangsel|tangerang|depok|bekasi|bogor|sleman|yogyakarta|lampung|jakarta)/i.test(l);

  for (const l of lines) {
    if (isRatingLike(l)) continue;
    const stripped = l.replace(/\$\s*·?\s*/g, "").replace(/·?\s*\d[\d.,]*\s*km?/i, "").trim();
    if (!stripped) continue;
    if (/\${2,}/.test(l) || /\d[\d.,]*\s*km/i.test(l) || /^\d[\d.,]*\s*m$/i.test(l)) continue;
    if (isPriceLike(l)) continue;
    if (!out.category && !isAddressLike(stripped) && !/^\d+$/.test(stripped)) {
      out.category = stripped;
      continue;
    }
    if (stripped && stripped !== out.category) {
      out.address = out.address ? `${out.address} ${stripped}` : stripped;
    }
  }

  const priceLine = lines.find((l) => /\${2,}/.test(l));
  if (priceLine) {
    const m = priceLine.match(/\${2,}/);
    if (m) out.priceLevel = m[0].length <= 2 ? "$".repeat(m[0].length) : "$" + "$".repeat(Math.min(m[0].length - 1, 3));
    if (priceLevelInline && Math.abs(priceLevelInline.length - out.priceLevel.length) > 1) out.priceLevel = priceLevelInline;
  }

  if (!out.category && out.address && !isAddressLike(out.address.split(" ")[0])) {
    out.category = out.address.split(" ")[0];
    out.address = out.address.split(" ").slice(1).join(" ");
  }
  return out;
}

export async function collectPlacesFromDom(page) {
  try {
    const raw = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];
      const items = Array.from(feed.children).filter(
        (it) => it.matches("a") || it.querySelector('a[href*="/maps/place/"]'),
      );
      const placeIdOf = (url) => {
        if (!url) return null;
        const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
        if (m) return m[1];
        const p = url.match(/(?:^|[^0-9a-fA-F])(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})(?:[^0-9a-fa-f]|$)/);
        return p ? p[1] : null;
      };
      const parseCountMap = (txt) => {
        if (!txt) return 0;
        const m = String(txt).toLowerCase().match(/([\d.,]+)\s*(rb|ribu|jt|juta|[kmb])?/);
        if (!m) return 0;
        let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
        if (isNaN(n)) return 0;
        const u = m[2];
        if (u === "rb" || u === "ribu" || u === "k") n *= 1e3;
        if (u === "jt" || u === "juta" || u === "m") n *= 1e6;
        if (u === "b") n *= 1e9;
        return Math.round(n);
      };
      const parseRating = (label) => {
        const m = String(label || "").match(/(\d(?:[.,]\d)?)/i);
        const v = m ? m[1] : null;
        return v ? parseFloat(v.replace(",", ".")) || 0 : 0;
      };

      const out = [];
      for (const it of items) {
        const a = it.matches("a") ? it : it.querySelector('a[href*="/maps/place/"]');
        if (!a) continue;
        const href = a.getAttribute("href") || "";
        const absHref = href.startsWith("http") ? href : `https://www.google.com/maps${href.replace(/^\./, "")}`;
        const place_id = placeIdOf(absHref);
        if (!place_id) continue;

        const nameEl =
          it.querySelector('[class*="qBF1Pd"]') ||
          it.querySelector("h3, [class*='fontHeadlineSmall']");
        const name = nameEl?.textContent?.trim() || "";
        if (!name) continue;

        let rating = 0;
        for (const s of Array.from(it.querySelectorAll('span[aria-hidden="true"]'))) {
          const r = parseRating(s.textContent || "");
          if (r > 0) {
            rating = r;
            break;
          }
        }

        let reviews_count = 0;
        for (const s of Array.from(it.querySelectorAll("span"))) {
          if (/(ulasan|reviews?)/i.test(s.textContent || "")) {
            const c = parseCountMap((s.textContent || "").replace(/\s*(ulasan|reviews?)/i, ""));
            if (c > 0) {
              reviews_count = c;
              break;
            }
          }
        }

        const detailEl = it.querySelector('[class*="W4Efsd"]') || it;
        const detail = detailEl?.innerText?.trim() || "";

        out.push({ place_id, name, link: absHref, rating, reviews_count, detail });
      }
      return out;
    });

    const dedup = new Map();
    for (const p of raw || []) {
      const key = p.place_id || p.link;
      if (!dedup.has(key)) dedup.set(key, p);
    }
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}

export async function scrollFeed(page) {
  await page.evaluate(() => {
    try {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) feed.scrollTo(0, feed.scrollHeight);
      const panels = Array.from(
        document.querySelectorAll('div[class*="m6QErb"]'),
      ).filter((p) => p.clientHeight > 200 && p.scrollHeight > p.clientHeight);
      panels.forEach((p) => {
        p.scrollTop = p.scrollHeight;
        p.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      window.scrollTo(0, document.body.scrollHeight);
    } catch {}
  });
  await page.waitForTimeout(350);
  await page.mouse.wheel(0, 2400);
  await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
}

export async function readPlaceDetailMeta(page) {
  try {
    const meta = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const out = { category: "", address: "", priceLabel: "", priceLevel: "" };

      const looksCategory = (t) =>
        !!t &&
        /[A-Za-z]/.test(t) &&
        !/^\d/.test(t) &&
        t.length < 60 &&
        /^(restoran|italian|caf[eé]|pasta|pizza|bar|bistro|western|restaurant|ristorante|trattoria|food|rumah makan)/i.test(t) &&
        !/^(kelola|tulis ulasan|simpan|bagikan)/i.test(t) &&
        !/(terdekat|terkenal|terpopuler|terbaik)/i.test(t);

      const titleEl = document.querySelector("h1") || document.querySelector('[class*="fontHeadlineSmall"]');
      const title = titleEl?.textContent?.trim() || "";

      for (const sel of [
        '[jsaction*="category"]',
        'button[jsaction*="pane.rating.category"]',
        'a[jsaction*="pane.rating.category"]',
        "a[class*='n4xcd']",
        '[class*="lUGxxf"]',
      ]) {
        const el = document.querySelector(sel);
        const t = el?.textContent?.trim();
        if (looksCategory(t)) {
          out.category = t;
          break;
        }
      }

      if (!out.category) {
        const anchor = titleEl?.closest('[class*="THOPZb"]') || titleEl?.parentElement || document.body;
        const cand = Array.from(anchor.querySelectorAll("div, span, a, h2"))
          .map((e) => (e.textContent || "").trim())
          .find((t) => t && t !== title && looksCategory(t) && !/\d{2,}/.test(t));
        if (cand) out.category = cand;
      }

      if (!out.category) {
        const line = String(text)
          .split("\n")
          .map((l) => l.trim())
          .find((l) => looksCategory(l) && !/\d/.test(l));
        if (line) out.category = line;
      }

      const priceBtn = document.querySelector('[data-item-id="price"]');
      if (priceBtn) {
        const pt = (priceBtn.textContent || "").trim() || (priceBtn.getAttribute("aria-label") || "").trim();
        if (/\${2,}/.test(pt)) out.priceLevel = pt.match(/\${2,}/)[0];
        else if (/rp\s?\d/i.test(pt)) out.priceLabel = pt;
      }
      if (!out.priceLabel) {
        const pm = String(text).match(/Rp\s?[\d.,]+\s*(?:[-\u2013]\s*[\d.,]+\s*)?(?:rb|ribu|jt|juta|k)?/i);
        if (pm) out.priceLabel = pm[0].trim();
      }

      const addrEl = document.querySelector('[data-item-id="address"]');
      if (addrEl) {
        const a = (addrEl.getAttribute("aria-label") || addrEl.textContent || "").trim();
        if (a) out.address = a;
      }
      if (!out.address) {
        const am = String(text).match(/(?:Alamat|Address)\s*:\s*([^\n]+)/i);
        if (am) out.address = am[1].trim();
      }
      return out;
    });
    await page.waitForTimeout(1200);
    return meta;
  } catch {
    return { category: "", address: "", priceLabel: "", priceLevel: "" };
  }
}
import { CONFIG } from "../../config.js";

export const name = "lamudi";
export const cookieFile = CONFIG.ruko.lamudi.cookieFile;
export const cookieDomain = CONFIG.ruko.lamudi.cookieDomain;

function normalizeKotaName(kota) {
  return (kota || "")
    .toLowerCase()
    .replace(/\b(kota|kab\.?|kabupaten|provinsi)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CITY_SLUG_MAP = Object.fromEntries(
  Object.entries(CONFIG.ruko.lamudi.citySlugs || {}).map(([k, v]) => [normalizeKotaName(k), v]),
);

export function citySlugFor(titik) {
  const key = normalizeKotaName(titik.kota);
  return CITY_SLUG_MAP[key] || null;
}

export function searchUrlsFor(titik) {
  const geo = citySlugFor(titik);
  if (!geo) return [];
  const { baseUrl } = CONFIG.ruko.lamudi;
  const base = `${baseUrl}/sewa/${geo.prov}/${geo.kota}`;
  return [
    { url: `${base}/komersial/ruko`, variant: "ruko" },
    { url: `${base}/komersial/rumah`, variant: "rumah" },
  ];
}

function pickPrice(txt) {
  const m = /(Rp\s?[\d.,]+\s?(?:juta|miliar|jt|rb)?(?:\s*(?:per\s*[- ]?(?:tahun|bulan|thn|bln|minggu)))?)/i.exec(txt);
  return m ? m[1] : "";
}

export async function extractCards(page, variant) {
  const cards = await page.$$eval(
    'a[href*="/detail/"], a[href*="/post/"]',
    (links, origin) => {
      const out = [];
      const seen = new Set();
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
      for (const a of links) {
        const hrefRaw = a.getAttribute("href");
        if (!hrefRaw) continue;
        const href = hrefRaw.startsWith("http") ? hrefRaw : new URL(hrefRaw, origin).href;
        if (seen.has(href)) continue;
        seen.add(href);

        let container = a;
        for (let i = 0; i < 7 && container; i++) {
          if (container.querySelector && container.querySelector("h2, h3, [class*='title']")) break;
          container = container.parentElement;
        }
        const root = container || a;
        let title = "";
        if (a.getAttribute && a.getAttribute("title")) title = clean(a.getAttribute("title"));
        if (!title) {
          const tn = root.querySelector && (root.querySelector("h2, h3") || root.querySelector("[class*='title']"));
          if (tn) title = clean(tn.textContent);
        }
        if (!title) title = clean(a.textContent).slice(0, 120);

        const txt = clean(root.innerText || root.textContent);
        const addrNode = root.querySelector("[class*='address'], [data-test*='location'], [class*='location']");
        const address = addrNode ? clean(addrNode.textContent) : "";

        out.push({
          href,
          title,
          address,
          price: pickPrice(txt),
          lines: (root.innerText || root.textContent || "")
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
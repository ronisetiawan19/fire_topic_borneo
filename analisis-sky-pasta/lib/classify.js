const SPECIALIST_RE =
  /(pasta|pastaria|trattoria|lasagna|spaghetti|spaghet|macaroni|ristorante|al forno)/i;
const SPECIALIST_EXCLUDE_RE =
  /(steak|pizza|coffee|caf[eé]|bistro|hotel|seafood|sushi|ayam|chicken|bakso|dim sum|hotpot|lamian)/i;
const NAME_MELEBAR_RE =
  /(steak|pizza|caf[eé]|coffee|bar$|bistro|bufet?|hotel|halal|seafood|chinese|japanese|korean|vietnamese|indonesian|western)/i;
const CAT_MELEBAR_RE =
  /pizza|steak house|coffee|caf[eé]|restaurant|bistro/i;
const CAT_ITALIAN_LOGIC_RE = /restoran\s*ital|italian\s*restaurant/i;
const CAT_FOREIGN_RE =
  /korea|jepang|korean|japanese|chinese|china|thai|vietnam|padang|minang|melayu|india|arab/i;

function normalizeHargaAngka(n) {
  if (n === null || n === undefined) return null;
  let s = String(n).toLowerCase().trim();
  s = s.replace(/\./g, "").replace(/[\s,]/g, "");
  let mult = 1;
  let m = s.match(/^(.*?)(rb|ribu|jt|juta|k|m|b)?$/);
  if (m) {
    const u = m[2];
    if (u === "rb" || u === "ribu" || u === "k") mult = 1e3;
    else if (u === "jt" || u === "juta" || u === "m") mult = 1e6;
    else if (u === "b") mult = 1e9;
    s = m[1];
  }
  const v = parseFloat(s);
  if (isNaN(v)) return null;
  return v * mult;
}

export function parseHargaLabelResult(label, priceLevel = null) {
  if (priceLevel) {
    const tierMap = { "$": "cheap", "$$": "mid", "$$$": "premium", "$$$$": "premium" };
    const tier = tierMap[priceLevel];
    if (tier) return { known: true, min: null, max: null, source: "price_level", tier };
  }
  const t = String(label || "").toLowerCase();
  if (!t) return { known: false, min: null, max: null, source: "none", tier: null };
  const nums = t.match(/([\d.,]+\s*(?:rb|ribu|jt|juta|k|m|b)?)/g) || [];
  const vals = nums
    .map(normalizeHargaAngka)
    .filter((v) => v !== null && v >= 1000);
  if (!vals.length) return { known: false, min: null, max: null, source: "label", tier: null };
  if (vals.length === 1) return { known: true, min: vals[0], max: vals[0], source: "label", tier: null };
  return { known: true, min: Math.min(...vals), max: Math.max(...vals), source: "label", tier: null };
}

export function hargaDalamBenchmark(parsed, [lo, hi] = [20000, 50000]) {
  if (!parsed.known) return null;
  if (parsed.tier) return parsed.tier === "mid";
  const min = parsed.min;
  const max = parsed.max;
  if (min >= lo && max <= hi) return true;
  if (max < lo) return false;
  if (min >= hi && max > hi) return false;
  return null;
}

export function compressHargaLabel(label) {
  const t = String(label || "").trim();
  if (!t) return "";
  return t.replace(/\s*(rb|ribu|jt|juta)\b/gi, "rb").replace(/\s+/g, " ");
}

export function isSpecialistByName(name) {
  const n = String(name || "");
  if (!n) return false;
  if (SPECIALIST_RE.test(n) && !SPECIALIST_EXCLUDE_RE.test(n)) return true;
  return false;
}

export function isSpecialistByCategory(category) {
  const c = String(category || "");
  if (!c) return false;
  if (CAT_ITALIAN_LOGIC_RE.test(c) && SPECIALIST_RE.test(c)) return true;
  return SPECIALIST_RE.test(c) && !SPECIALIST_EXCLUDE_RE.test(c);
}

export function isObjekMelebar(name, category) {
  const n = String(name || "");
  const c = String(category || "");
  if (CAT_FOREIGN_RE.test(c)) return true;
  if (NAME_MELEBAR_RE.test(n)) return true;
  if (CAT_MELEBAR_RE.test(c) && !CAT_ITALIAN_LOGIC_RE.test(c)) return true;
  if (!isSpecialistByName(n) && !isSpecialistByCategory(c)) return true;
  return false;
}

export function classifyCompetitor({ name, category, priceLabel, priceLevel }) {
  const parsed = parseHargaLabelResult(priceLabel, priceLevel);
  const priceOk = hargaDalamBenchmark(parsed);
  const spesialisNama = isSpecialistByName(name);
  const spesialisKategori = isSpecialistByCategory(category);
  const spesialis = (spesialisNama || spesialisKategori) && !CAT_FOREIGN_RE.test(String(category || ""));

  let label, kelas, alasan;

  if (spesialis && priceOk === true) {
    label = "Ya";
    kelas = "A";
    alasan = `Spesialis pasta/Italian (${spesialisNama ? "nama" : "kategori"}) & harga setara benchmark`;
  } else if (spesialis && priceOk === null) {
    label = "Cek Manual";
    kelas = "TBD";
    alasan = "Spesialis pasta/Italian; harga belum tertera di Maps — belum memenuhi syarat head-to-head, perlu cek manual";
  } else if (spesialis && priceOk === false) {
    label = "Tidak";
    kelas = "C";
    alasan = `Spesialis pasta tapi harga di luar benchmark (${compressHargaLabel(priceLabel) || priceLevel || "?"})`;
  } else {
    const melebar = isObjekMelebar(name, category);
    if (priceOk === false) {
      label = "Tidak";
      kelas = "C";
      alasan = `Harga di luar benchmark (${compressHargaLabel(priceLabel) || priceLevel || "?"})${spesialis ? ", meski spesialis pasta" : melebar ? "; objek juga melebar" : ""}`;
    } else {
      label = "Tidak";
      kelas = "B";
      const hargaInfo =
        priceOk === null ? "harga belum diketahui" : "harga dalam benchmark";
      alasan = `Objek melebar${spesialis ? "" : " (bukan spesialis pasta)"} & ${hargaInfo} — kompetitor sekunder`;
    }
  }

  if (/sky steak/i.test(String(name || "")) && /pasta/i.test(String(name || ""))) {
    label = "Tidak";
    kelas = "B";
    alasan = "SKY Steak & Pasta — objek steak-dominant, bukan spesialis pasta";
  }

  return { label, kelas, alasan, spesialis, priceOk, priceParsed: parsed };
}
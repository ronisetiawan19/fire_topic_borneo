const POSITIVE_LEXICON = new Set([
  "enak", "lezat", "nikmat", "sedap", "mantap", "maknyus", "joss", "top",
  "empuk", "lembut", "segar", "renyah", "gurih", "manis", "fresh", "hangat",
  "umami", "wangi", "harum", "juicy", "crispy", "creamy", "murah", "terjangkau",
  "worth", "ramah", "sopan", "baik", "cekatan", "responsif", "membantu",
  "cepat", "kencang", "lancar", "bersih", "rapi", "nyaman", "cozy", "homey",
  "elegan", "cantik", "indah", "estetik", "recommended", "recommend",
  "rekomendasi", "best", "terbaik", "bagus", "ok", "oke", "puas", "suka",
  "cinta", "langganan", "wajib", "senang", "santai", "tenang", "halal",
  "autentik", "premium", "mewah", "amazing", "awesome", "fantastic",
  "perfect", "delicious", "tasty", "yummy", "nom",
]);

const NEGATIVE_LEXICON = new Set([
  "mahal", "kemahalan", "pricey", "overpriced", "pahit", "asin", "hambar",
  "tawar", "bau", "busuk", "basi", "alot", "keras", "kering", "garing",
  "berminyak", "penyedap", "dingin", "beku", "melempem", "lembek", "lengket",
  "penuh", "enyek", "mual", "lambung", "gangguan", "capcay", "gambling",
  "lama", "telat", "lambat", "ngaret", "antri", "antre", "macet", "buruk",
  "jelek", "mengecewakan", "kecewa", "nyesal", "parah", "sangat buruk",
  "kasar", "sombong", "cuek", "cuekin", "tidak ramah", "tidak sopan",
  "kotor", "jorok", "jorok", "semraut", "berantakan", "sesak", "gerah",
  "panas", "bising", "berisik", "ramai", "ribut", "kecil", "sempit",
  "gelap", "redup", "berdebu", "lawas", "jadul", "usang", "tua", "rusak",
  "tidak enak", "gak enak", "nggak enak", "ggls", "gagal", "jelek banget",
  "buset", "anjir", "gila", "nagih", "boong", "bohong", "bohong banget",
  "nggak mau balik", "ga mau balik", "tidak mau kembali", "skip", "lewati",
]);

const NEGATORS = [
  "tidak", "tak", "nggak", "ngga", "gak", "ga", "gk", "belum", "kurang",
  "enggak", "engga", "ngg", "ngk", "bukan", "tidakk", "tdk",
];
const NEGATOR_RE = new RegExp(`\\b(?:${NEGATORS.join("|")})\\b`, "i");

const INTENSIFIERS = new Set([
  "sangat", "banget", "bgt", "bngt", "amat", "paling", "super", "ekstra",
  "benar", "benar-benar", "lur", "parah", "sekali", "bangett", "bangettt",
]);

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text).split(" ").filter(Boolean);
}

function buildHasWindow(tokens, windowSize = 3) {
  const bounds = tokenize(tokens);
  const set = new Set();
  for (let i = 0; i < bounds.length; i++) {
    const word = bounds[i];
    if (!set.has(word)) set.add(word);
  }
  return set;
}

function stemIndonesian(w) {
  if (w.length <= 4) return w;
  if (w.endsWith("nya")) return w.slice(0, -3);
  if (w.endsWith("lah")) return w.slice(0, -3);
  if (w.endsWith("kah")) return w.slice(0, -3);
  if (w.endsWith("ku")) return w.slice(0, -2);
  if (w.endsWith("mu")) return w.slice(0, -2);
  return w;
}

function scoreReview(text) {
  const tokens = tokenize(text);
  let score = 0;
  const matchedPos = [];
  const matchedNeg = [];
  const usedNegators = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const w = stemIndonesian(tokens[i]);
    let negated = false;
    for (let j = 1; j <= 3; j++) {
      if (i - j < 0) break;
      const prev = tokens[i - j];
      if (NEGATOR_RE.test(prev) && !usedNegators.has(i - j)) {
        negated = true;
        usedNegators.add(i - j);
        break;
      }
    }
    let mult = 1;
    for (let j = 1; j <= 2; j++) {
      if (i - j < 0) break;
      const prev = stemIndonesian(tokens[i - j]);
      if (INTENSIFIERS.has(prev)) {
        mult = 2;
        break;
      }
    }
    if (POSITIVE_LEXICON.has(w)) {
      score += (negated ? -mult : mult);
      (negated ? matchedNeg : matchedPos).push(w);
    } else if (NEGATIVE_LEXICON.has(w)) {
      score += negated ? mult : -mult;
      (negated ? matchedPos : matchedNeg).push(w);
    }
  }
  const label = score > 0 ? "positif" : score < 0 ? "negatif" : "netral";
  return { score, label, matchedPos, matchedNeg, tokens: tokens.length };
}

function aggregate(reviews) {
  const scored = reviews.map((r) => {
    const s = scoreReview(r.text || r);
    return { ...r, ...s };
  });
  const n = scored.length;
  if (n === 0) {
    return { n: 0, avgScore: 0, pctPositif: 0, pctNegatif: 0, pctNetral: 0, label: "TIDAK ADA DATA", scored: [] };
  }
  const posCount = scored.filter((s) => s.label === "positif").length;
  const negCount = scored.filter((s) => s.label === "negatif").length;
  const netCount = scored.filter((s) => s.label === "netral").length;
  const sum = scored.reduce((acc, s) => acc + s.score, 0);
  let label;
  if (posCount / n >= 0.6 && negCount / n <= 0.2) label = "POSITIF";
  else if (negCount / n >= 0.6) label = "NEGATIF";
  else label = "CAMPURAN";
  return {
    n,
    avgScore: +(sum / n).toFixed(3),
    pctPositif: Math.round((posCount / n) * 100),
    pctNegatif: Math.round((negCount / n) * 100),
    pctNetral: Math.round((netCount / n) * 100),
    label,
    scored,
  };
}

function topThemes(reviews, { limit = 5 } = {}) {
  const freq = new Map();
  for (const r of reviews) {
    const t = tokenize(r.text || r);
    const s = buildHasWindow(t);
    for (const w of s) {
      if (POSITIVE_LEXICON.has(w) || NEGATIVE_LEXICON.has(w)) {
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}

export { scoreReview, aggregate, topThemes, POSITIVE_LEXICON, NEGATIVE_LEXICON };
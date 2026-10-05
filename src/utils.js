export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cleanText(text = "") {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function randomDelay(min, max) {
  return delay(min + Math.floor(Math.random() * (max - min)));
}

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

export function log(msg, level = "info") {
  const colors = {
    info: COLORS.cyan,
    success: COLORS.green,
    warn: COLORS.yellow,
    error: COLORS.red,
    highlight: COLORS.magenta,
  };
  const prefix = {
    info: "•",
    success: "✓",
    warn: "⚠",
    error: "✗",
    highlight: "→",
  };
  const color = colors[level] || COLORS.reset;
  console.log(`${color}[${prefix[level]}]${COLORS.reset} ${msg}`);
}

export function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|#@\s]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function formatTimestamp(unix, locale = "id-ID") {
  if (!unix) return "";
  try {
    return new Date(unix * 1000).toLocaleString(locale);
  } catch {
    return String(unix);
  }
}

export function readableNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function parseVideoIdFromUrl(url) {
  const m = url.match(
    /(?:video|share\/video|v)\/(\d{6,})(?:[?&#]|$)/,
  );
  if (m) return m[1];
  const segments = url.split(/[/?]/).filter(Boolean);
  for (const seg of segments.reverse()) {
    if (/^\d{10,}$/.test(seg)) return seg;
  }
  return null;
}

export function parseYoutubeVideoId(input) {
  if (!input) return null;
  const url = String(input).trim();
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  return null;
}

export function parseTweetIdFromUrl(input) {
  if (!input) return null;
  const url = String(input).trim();
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    /(?:t\.co)\/([\w]+)(?:[?&#]|$)/,
    /\/status\/(\d+)(?:[?&#]|$)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  if (/^\d{5,19}$/.test(url)) return url;
  return null;
}

export function parsePlaceIdFromUrl(input) {
  if (!input) return null;
  const url = String(input).trim();
  const placeIdParam = url.match(/place_id:([\w-]+)/);
  if (placeIdParam) return placeIdParam[1];
  const withPrefix = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (withPrefix) return withPrefix[1];
  const plain = url.match(/(?:^|[^0-9a-fA-F])(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})(?:[^0-9a-fA-F]|$)/);
  if (plain) return plain[1];
  return url.match(/^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/) ? url : null;
}

const REL_ID_RE = /(\d+)\s*(menit|jam|hari|minggu|bulan|tahun)(?:\s+yang)?\s+lalu/;
const REL_EN_RE = /(\d+|a|an|a few|several)\s*(minute|hour|day|week|month|year)s?\s+ago/;

export function relativeTimeToDate(label, ref = new Date()) {
  if (!label) return null;
  const text = String(label).trim().toLowerCase();
  const back = new Date(ref.getTime());
  const sub = (amount, unit) => {
    const map = {
      menit: (n) => { back.setMinutes(back.getMinutes() - n); },
      jam: (n) => { back.setHours(back.getHours() - n); },
      hari: (n) => { back.setDate(back.getDate() - n); },
      minggu: (n) => { back.setDate(back.getDate() - n * 7); },
      bulan: (n) => { back.setMonth(back.getMonth() - n); },
      tahun: (n) => { back.setFullYear(back.getFullYear() - n); },
      minute: (n) => sub(n, "menit"),
      hour: (n) => sub(n, "jam"),
      day: (n) => sub(n, "hari"),
      week: (n) => sub(n, "minggu"),
      month: (n) => sub(n, "bulan"),
      year: (n) => sub(n, "tahun"),
    };
    const fn = map[unit];
    if (!fn) return false;
    fn(amount);
    return true;
  };
  const num = (v) => (v === "a" || v === "an") ? 1 : (v === "a few" || v === "several") ? 3 : parseInt(v, 10);

  const idM = text.match(REL_ID_RE);
  if (idM) {
    sub(parseInt(idM[1], 10), idM[2]);
    return back;
  }
  const enM = text.match(REL_EN_RE);
  if (enM) {
    sub(num(enM[1]), enM[2]);
    return back;
  }
  const ago = text.match(/^(\d+|a|an|a few|several)\s*(minute|hour|day|week|month|year)s?\s*ago$/);
  if (ago) {
    sub(num(ago[1]), ago[2]);
    return back;
  }
  if (/(^|\s)(semalam|kemarin)(\s|$)/.test(text)) {
    back.setDate(back.getDate() - 1);
    return back;
  }
  // Bentuk jamak Bahasa Indonesia tanpa angka: "sebulan lalu" = 1 bulan,
  // "setahun lalu" = 1 tahun, dll. Tanpa ini label tsb. tidak ter-parse.
  const idSingular = text.match(
    /\bse(menit|jam|hari|minggu|bulan|tahun)\b(?:\s+yang)?\s+lalu\b/,
  );
  if (idSingular) {
    sub(1, idSingular[1]);
    return back;
  }
  if (/(^|\s)yesterday(\s|$)/.test(text)) {
    back.setDate(back.getDate() - 1);
    return back;
  }
  if (/(^|\s)(baru saja|just now|a moment ago)(\s|$)/.test(text)) {
    return back;
  }
  return null;
}
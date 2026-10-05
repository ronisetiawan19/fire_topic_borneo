export function parseCount(s) {
  if (s === null || s === undefined) return 0;
  const str = String(s).trim();
  if (!str) return 0;
  const m = str.match(/([\d.,]+)\s*([KMBkmb])?/);
  if (!m) return Number(str) || 0;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase()] || 1;
  return Math.round(num * mult);
}

const RELATIVE_SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2629746,
  year: 31556952,
};

export function parseRelativeTime(str) {
  if (!str) return 0;
  const m = String(str).match(
    /(\d+)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago/i,
  );
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase().replace(/s$/, "");
  const mult = RELATIVE_SECONDS[unit];
  if (!mult || !n) return 0;
  return Math.floor(Date.now() / 1000 - n * mult);
}
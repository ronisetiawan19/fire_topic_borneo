export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parsePrice(text) {
  if (!text) return null;
  const t = String(text);
  const matches = [...t.matchAll(/Rp\s*([\d.,]+)\s*(m|juta|jt|rb|ribu)?/gi)];
  let best = null;
  for (const m of matches) {
    const cleaned = m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    let num = parseFloat(cleaned);
    if (isNaN(num)) continue;
    const unit = (m[2] || "").toLowerCase();
    if (unit === "m") num *= 1e6;
    else if (unit === "juta" || unit === "jt") num *= 1e6;
    else if (unit === "rb" || unit === "ribu") num *= 1e3;
    if (best === null || num > best) best = num;
  }
  if (best !== null) return Math.round(best);
  const bare = t.match(/^\s*([\d.,]{5,})\s*$/i);
  if (bare) {
    const num = parseFloat(bare[1].replace(/\./g, "").replace(",", "."));
    if (!isNaN(num)) return Math.round(num);
  }
  return null;
}

export function parseAreaLt(text) {
  const m = String(text ?? "").match(/\b(?:lt|luas tanah)\s*[:.]?\s*([\d.,]+)/i);
  return m ? numOrNull(m[1]) : null;
}

export function parseAreaLb(text) {
  const m = String(text ?? "").match(/\b(?:lb|luas bangunan)\s*[:.]?\s*([\d.,]+)/i);
  return m ? numOrNull(m[1]) : null;
}

export function parseAreaGeneric(text) {
  const m = String(text ?? "").match(/([\d.,]+)\s*(?:m\s*[²2]|m2)/i);
  return m ? numOrNull(m[1]) : null;
}

export function parseLantai(text) {
  const m = String(text ?? "").match(/(\d+)\s*lantai/i);
  return m ? parseInt(m[1], 10) : null;
}

function numOrNull(v) {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export function cleanTitle(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}
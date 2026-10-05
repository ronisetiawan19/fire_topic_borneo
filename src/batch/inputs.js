/**
 * Loader input batch (URL) untuk CLI scraper Google Maps.
 *
 * Sumber input yang didukung:
 *   - positional  : URL langsung, atau token "@path.txt" (isi file), atau "-" (stdin)
 *   - file        : --file <path> (long-only)
 *   - auto-discover: links.txt → links.csv → plan-fitur/kompetitor_*.csv
 *   - clipboard   : Windows Get-Clipboard -Raw (hanya jika masih kosong; bisa dinonaktifkan --no-clipboard)
 *
 * Aturan:
 *   - Baris kosong dan baris komentar (# ...) diabaikan.
 *   - Kutip pembungkus (" ' `) dan tanda ; / , di ujung baris dibersihkan.
 *   - Duplikat dihapus dengan mempertahankan urutan kemunculan pertama.
 *   - Validasi bersifat LONGGAR: input yang tidak terlihat seperti URL Google Maps
 *     TETAP diteruskan (urlFlow sudah memvalidasi & melompatinya dengan pesan).
 *
 * Modul ini murni (tanpa browser) agar mudah diuji.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parsePlaceIdFromUrl } from "../utils.js";
import {
  extractMapsUrls,
  pickUrlColumn,
  cleanCell,
  looksLikeMapsUrl,
} from "../googlemaps/inputs-extract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isCommentLine(s) {
  if (!s) return true;
  const t = s.replace(/^\s+/, "");
  return t === "" || t.startsWith("#");
}

/**
 * Petunjuk kasar URL Google Maps (legacy-compatible)
 */
export function looksLikeMapsUrlCompat(input) {
  if (!input) return false;
  const t = String(input).trim();
  if (!t) return false;

  if (/^@/.test(t)) return false;
  if (t === "-") return false;

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(t)) return true;
  if (/\/maps\/place\//i.test(t)) return true;
  if (/\/maps\/search\//i.test(t)) return true;
  if (/maps\.google\./i.test(t)) return true;
  if (/google\.[a-z]+\/maps/i.test(t)) return true;
  return false;
}

export function normalizeLine(raw) {
  if (!raw) return "";
  let t = String(raw).trim();
  t = t.replace(/^["'`]+|["'`,;:]+$/g, "");
  return t;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuote = false;
  let quoteChar = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
        quoteChar = null;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'" || ch === "`") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === "," || ch === "\t" || ch === ";") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseCsvText(text) {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const urlCol = pickUrlColumn(headers);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const cols = parseCsvLine(ln);
    let cand = null;
    if (urlCol) {
      const idx = headers.indexOf(urlCol);
      if (idx >= 0 && cols[idx]) cand = cols[idx];
    }
    if (!cand) {
      const urls = extractMapsUrls(ln);
      if (urls.length > 0) cand = urls[0];
    }
    if (cand) out.push(cand);
  }
  return out;
}

function readFromFile(filePath) {
  const abs = path.resolve(filePath);
  if (!existsSync(abs)) return [];
  const buf = readFileSync(abs, "utf-8");
  const lower = abs.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return parseCsvText(buf);
  }
  return extractMapsUrls(buf);
}

export function discoverFiles() {
  const candidates = ["links.txt", "links.csv", "plan-fitur/kompetitor_18_titik.csv"];
  const found = [];
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (existsSync(abs)) {
      found.push(abs);
      break;
    }
  }
  if (found.length > 0) return found;
  try {
    const pf = path.resolve("plan-fitur");
    if (existsSync(pf)) {
      const files = readdirSync(pf).filter((f) => f.endsWith(".csv"));
      if (files.length > 0) {
        files.sort();
        return [path.resolve("plan-fitur", files[0])];
      }
    }
  } catch {}
  return [];
}

export function readClipboard() {
  const platform = process.platform;
  if (platform !== "win32") return [];
  try {
    const res = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Get-Clipboard -Raw"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    if (res.error) return [];
    if (res.status !== 0) return [];
    const text = (res.stdout || "").trim();
    if (!text) return [];
    const urls = extractMapsUrls(text);
    if (urls.length === 0 && looksLikeMapsUrlCompat(text)) {
      return [normalizeLine(text)];
    }
    return urls;
  } catch {
    return [];
  }
}

export function readFromStdin() {
  if (process.stdin.isTTY) return [];
  try {
    const buf = readFileSync(0, "utf-8");
    return extractMapsUrls(buf);
  } catch {
    return [];
  }
}

function expandAtTokens(items) {
  const out = [];
  for (const it of items) {
    if (!it) continue;
    const s = normalizeLine(it);
    if (s.startsWith("@")) {
      const p = s.slice(1);
      out.push(...readFromFile(p));
    } else {
      out.push(s);
    }
  }
  return out;
}

export async function collectUrlInputs({
  positional = [],
  file,
  allowClipboard = true,
  noClipboard = false,
} = {}) {
  const urls = [];
  const seen = new Set();
  const sources = [];

  function pushList(list, src) {
    for (const u of list) {
      const c = cleanCell(String(u));
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      urls.push(c);
      sources.push(src);
    }
  }

  const posExpanded = expandAtTokens(positional);
  pushList(posExpanded, "positional");

  if (file) {
    pushList(readFromFile(file), "file");
  }

  if (urls.length === 0) {
    const stdinUrls = readFromStdin();
    if (stdinUrls.length > 0) pushList(stdinUrls, "stdin");
  }

  if (urls.length === 0) {
    const disc = discoverFiles();
    if (disc.length > 0) {
      pushList(readFromFile(disc[0]), "auto-discover");
    }
  }

  if (urls.length === 0 && allowClipboard && !noClipboard) {
    const cb = readClipboard();
    if (cb.length > 0) pushList(cb, "clipboard");
  }

  const suspicious = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!looksLikeMapsUrlCompat(u) && !looksLikeMapsUrl(u)) {
      suspicious.push({ index: i, url: u });
    }
  }

  return { urls, suspicious, sources, fromClipboard: sources.includes("clipboard"), autoDiscovered: sources.includes("auto-discover") };
}

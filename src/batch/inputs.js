/**
 * Loader input batch (URL) untuk CLI scraper.
 *
 * Sumber input yang didukung:
 *   - positional  : URL langsung, atau token "@path.txt" (isi file), atau "-" (stdin)
 *   - file        : --file <path>
 *
 * Aturan:
 *   - Baris kosong dan baris komentar (# ...) diabaikan.
 *   - Kutip pembungkus (" ' `) dan tanda ; / , di ujung baris dibersihkan,
 *     karena URL yang disalin dari browser/spreadsheet sering ikut membawa tanda baca.
 *   - Duplikat dihapus dengan mempertahankan urutan kemunculan pertama.
 *   - Validasi bersifat LONGGAR: input yang tidak terlihat seperti URL Google Maps
 *     TETAP diteruskan (urlFlow sudah memvalidasi & melompatinya dengan pesan),
 *     supaya typos tidak hilang diam-diam. Antrean ini hanya untuk peringatan.
 *
 * Modul ini murni (tanpa I/O selain baca file/stdin, tanpa log, tanpa browser)
 * agar mudah diuji tanpa Playwright.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePlaceIdFromUrl } from "../utils.js";

/**
 * Petunjuk kasar bahwa string "kemungkinan" URL Google Maps.
 * Menggabungkan variasi yang sudah dipakai src/googlemaps.js:
 * short link goo.gl / maps.app.goo.gl dan URL /maps/ (maps.google.com, google.co.id, dll).
 */
export function looksLikeMapsUrl(input) {
  if (!input) return false;
  return /goo\.gl|redirect|\/maps\/|maps\.google\./i.test(String(input));
}

/**
 * Apakah input akan diterima oleh urlFlow.
 * urlFlow menerima apa pun yang bisa di-parse jadi place ID, ATAU yang
 * terlihat seperti short link. Bare place ID (0x...:0x...) tidak mengandung
 * "/maps/", jadi harus ikut diterima agar tidak salah diperingatkan.
 */
export function isAcceptedInput(input) {
  return looksLikeMapsUrl(input) || Boolean(parsePlaceIdFromUrl(input));
}

/** Bersihkan satu baris mentah: trim, buang kutip pembungkus & sisa tanda baca. */
export function normalizeLine(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/^["'`]+/, "")
      .replace(/["'`]+$/, "")
      .replace(/[;,]+$/, "")
      .trim();
  }
  // Copot kurung tidak seimbang: "(https://…)" → "https://…"
  const opens = (s.match(/\(/g) || []).length;
  const closes = (s.match(/\)/g) || []).length;
  if (opens > 0 && opens === closes && s.startsWith("(") && s.endsWith(")")) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Pecah teks (file / stdin) menjadi URL; hitung baris yang dilewati. */
export function parseUrlLines(text) {
  const urls = [];
  const skipped = { blank: 0, comment: 0 };
  // Buang SATU newline penutup lebih dulu. File teks yang rapi selalu berakhir
  // dengan "\n"; itu akhir file, bukan "baris kosong" yang layak dilaporkan.
  const body = String(text ?? "").replace(/\r?\n$/, "");
  if (!body.trim()) return { urls, skipped };
  for (const raw of body.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (!line) {
      skipped.blank += 1;
      continue;
    }
    if (line.startsWith("#")) {
      skipped.comment += 1;
      continue;
    }
    urls.push(line);
  }
  return { urls, skipped };
}

/** Hapus duplikat (perbandingan string persis), urutan pertama dipertahankan. */
export function dedupeUrls(list) {
  const seen = new Set();
  const urls = [];
  const duplicates = [];
  for (const u of list) {
    if (seen.has(u)) {
      duplicates.push(u);
      continue;
    }
    seen.add(u);
    urls.push(u);
  }
  return { urls, duplicates };
}

/** Baca file sebagai teks; lempar error dengan pesan yang jelas jika gagal. */
export function readFileText(file) {
  const resolved = path.resolve(String(file));
  let text;
  try {
    text = readFileSync(resolved, "utf-8");
  } catch (err) {
    throw new Error(`Tidak bisa baca file "${resolved}" — ${err.code || err.message}`);
  }
  return parseUrlLines(text);
}

/**
 * Baca seluruh stdin. Menolak bila stdin adalah terminal (TTY) supaya
 * perintah `url -` tanpa pipe tidak menggantung selamanya.
 */
export function readStdinText() {
  if (process.stdin.isTTY) {
    throw new Error(
      "stdin tidak berisi pipe. Pakai: Get-Content links.txt | googlemaps-scraper url -  (atau pakai --file <path>)",
    );
  }
  let text;
  try {
    text = readFileSync(0, "utf-8");
  } catch (err) {
    throw new Error(`Tidak bisa baca stdin — ${err.code || err.message}`);
  }
  return parseUrlLines(text);
}

/**
 * Gabungkan semua sumber input menjadi satu daftar URL.
 *
 * @param {object}  opts
 * @param {string[]} [opts.positional] token CLI apa adanya
 * @param {string|null} [opts.file]   nilai --file
 * @returns {{
 *   urls: string[],
 *   sources: Array<{ label: string, count: number }>,
 *   duplicates: string[],
 *   suspicious: string[],
 *   skipped: { blank: number, comment: number },
 * }}
 */
export function collectUrlInputs({ positional = [], file = null } = {}) {
  // Batch dialog disimpan sebagai array agar URUTAN pemrosesan persis mengikuti
  // urutan argumen CLI. Penting: saat `CONFIG.gm.maxSessionRounds` habis di tengah
  // batch, tempat yang diproses lebih dulu berisiko terpotong paling besar.
  const batches = [];
  let blank = 0;
  let comment = 0;

  const ingest = (label, parsed) => {
    blank += parsed.skipped.blank;
    comment += parsed.skipped.comment;
    if (parsed.urls.length) batches.push({ label, urls: parsed.urls });
  };

  // URL langsung dikelompokkan jadi satu batch berurutan, dimulai dari posisi
  // pertama agar label ringkasan mencerminkan urutan kerja sebenarnya.
  let direct = null;
  const pushDirect = (token) => {
    if (!direct) {
      direct = { label: "positional", urls: [] };
      batches.push(direct);
    }
    direct.urls.push(token);
  };

  for (const raw of positional) {
    const token = normalizeLine(raw);
    if (!token) {
      blank += 1;
      continue;
    }
    if (token === "-") {
      direct = null;
      ingest("stdin (-)", readStdinText());
      continue;
    }
    if (token.startsWith("@")) {
      direct = null;
      ingest(token, readFileText(token.slice(1)));
      continue;
    }
    pushDirect(token);
  }

  if (file) ingest(`--file ${file}`, readFileText(file));

  const collected = batches.flatMap((b) => b.urls);
  const { urls, duplicates } = dedupeUrls(collected);
  const suspicious = urls.filter((u) => !isAcceptedInput(u));

  return {
    urls,
    sources: batches.map((b) => ({ label: b.label, count: b.urls.length })),
    duplicates,
    suspicious,
    skipped: { blank, comment },
  };
}
// Perbaiki timestamp review yang gagal ter-parse dari time_label yang tersimpan.
// Loop ini hanya membaca checkpoint lalu menulis ulang; tidak ada scraping.
import { relativeTimeToDate } from "../../src/utils.js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const CP_DIR = path.resolve(import.meta.dirname, "..", "checkpoints", "sentimen");
const SINCE = Date.now() / 1000 - 365 * 24 * 3600;

if (!existsSync(CP_DIR)) {
  console.log("Direktori checkpoint tidak ada.");
  process.exit(1);
}

let totalFixed = 0;
for (const f of readdirSync(CP_DIR).filter((x) => x.endsWith(".json"))) {
  const full = path.join(CP_DIR, f);
  const cp = JSON.parse(readFileSync(full, "utf-8"));
  const before = (cp.raw || []).filter((r) => r.time).length;

  for (const r of cp.raw || []) {
    if (r.time || !r.time_label) continue;
    const d = relativeTimeToDate(r.time_label);
    if (d) r.time = Math.floor(d.getTime() / 1000);
  }

  cp.raw.sort((a, b) => (b.time || 0) - (a.time || 0));
  cp.kept = cp.raw.filter((r) => !r.time || r.time >= SINCE);
  cp.skipped = cp.raw.length - cp.kept.length;

  const after = cp.raw.filter((r) => r.time).length;
  const fixed = after - before;
  totalFixed += fixed;
  writeFileSync(full, JSON.stringify(cp, null, 2), "utf-8");
  console.log(
    `${(cp.name || f).slice(0, 38).padEnd(40)} timestamp ${before}->${after} (+${fixed})  1thn=${cp.kept.length}`,
  );
}
console.log(`\nTotal timestamp diperbaiki: ${totalFixed}`);

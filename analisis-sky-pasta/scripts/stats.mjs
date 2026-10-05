import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const outDir = path.join(import.meta.dirname, "..", "output");
const latest = readdirSync(outDir)
  .filter((f) => /^kompetitor_\d{4}-\d{2}-\d{2}\.csv$/.test(f))
  .sort()
  .reverse()[0];
const c = readFileSync(path.join(outDir, latest), "utf8").replace(/^\uFEFF/, "");
const L = c.split(/\r?\n/).filter(Boolean);
const [h, ...rows] = L;
const idx = Object.fromEntries(h.split(",").map((x, i) => [JSON.parse(x), i]));
const R = rows.map((r) => {
  const v = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, ""));
  return Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, v[i]]));
});
const byT = {};
for (const r of R) {
  byT[r.titik] ??= { n: 0, Ya: 0, A: 0, TBD: 0, B: 0, C: 0, tbd: 0 };
  const b = byT[r.titik];
  b.n++;
  if (r.apple_to_apple === "Ya") b.Ya++;
  b[r.kelas]++;
  if (r.harga_tbd) b.tbd++;
}
console.log("Total titik:", Object.keys(byT).length, "| Total kompetitor:", R.length);
let T = { n: 0, Ya: 0, A: 0, TBD: 0, B: 0, C: 0, tbd: 0, rr: 0 };
for (const r of R) {
  T.n++;
  if (r.apple_to_apple === "Ya") T.Ya++;
  T[r.kelas]++;
  if (r.harga_tbd) T.tbd++;
  if (r.review_rendah) T.rr++;
}
console.log("AGG Ya:", T.Ya, "A:", T.A, "TBD:", T.TBD, "B:", T.B, "C:", T.C, "harga_tbd:", T.tbd, "review_rendah:", T.rr);
for (const [k, v] of Object.entries(byT)) {
  console.log(k.padEnd(28), String(v.n).padStart(3), "komp | Ya", String(v.Ya).padStart(2), "| A", v.A, "TBD", v.TBD, "B", v.B, "C", v.C, "| tbd", v.tbd);
}
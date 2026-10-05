import { readFileSync } from "node:fs";
const raw = readFileSync("scripts/_qv9/qv9Egd_126572.json", "utf8");

function parseFrame(body) {
  const buf = Buffer.from(body, "utf-8");
  const m = buf.toString("utf-8").match(/^\)\]\}'\s*\n?\n?(\d+)\n/);
  if (!m) return null;
  const start = Buffer.byteLength(m[0], "utf-8");
  return { frame: buf.slice(start, start + Number(m[1])).toString("utf-8"), m };
}

const pf = parseFrame(raw);
console.log("prefix:", JSON.stringify(pf?.m?.[0]));
const frame = pf.frame;
console.log("frame len:", frame.length);
let data;
try { data = JSON.parse(frame); } catch (e) {
  console.log("declared-len parse failed:", e.message, "trying rest-of-file");
  const start2 = Buffer.byteLength(pf.m[0], "utf-8");
  const rest = Buffer.from(raw, "utf-8").slice(start2).toString("utf-8");
  const linetail = rest.match(/\r?\n\d+\r?\n\[\[/);
  const body = linetail ? rest.slice(0, linetail.index) : rest;
  console.log("rest len:", body.length);
  data = JSON.parse(body.replace(/\]\s*$/, "]"));
  console.log("  parsed via slicing-tail; data[0][0]:", data[0][0]);
}
const frameStr = JSON.stringify(data);
console.log("data[0][0]:", data[0][0]);
const inner = JSON.parse(data[0][2]);
console.log("inner type:", Array.isArray(inner), "inner[0]:", JSON.stringify(inner?.[0] || null).slice(0, 80));
console.log("inner[1] token:", inner?.[1] ? String(inner[1]).slice(0, 100) : null);
console.log("inner[2] len:", Array.isArray(inner?.[2]) ? inner[2].length : "n/a");
if (Array.isArray(inner?.[2])) {
  console.log("=== all records ===");
  for (let i = 0; i < inner[2].length; i++) {
    const v = inner[2][i][0] || inner[2][i];
    const meta = v[1] || [];
    const author = meta[4]?.[5]?.[0] || null;
    const time = meta[6] ?? null;
    const rt = meta[13] ? (Array.isArray(meta[13]) ? meta[13][4] : null) : null;
    const rating = rt ?? null;
    const revId = Array.isArray(v[4]) ? (v[4][3] || null) : null;
    const photos = Array.isArray(v[2]) ? v[2].length : 0;
    console.log(`rec[${i}] author=${author} time=${time} rating=${rating} photos=${photos} id=${String(revId).slice(0, 40)}`);
  }
}
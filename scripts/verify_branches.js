#!/usr/bin/env bun
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SKY_PASTA_BRANCHES } from "../src/data/sky_pasta_branches.js";

const OUTPUT_DIR = process.argv[2] || path.join("output", "gofood");

function loadOutputs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f.includes("gofood"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(dir, f), "utf-8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const outputs = loadOutputs(OUTPUT_DIR);
if (!outputs.length) {
  console.error(`[FAIL] Tidak ada file output GoFood di ${OUTPUT_DIR}`);
  process.exit(1);
}

const byBranch = new Map();
for (const out of outputs) {
  for (const b of out.branches || []) {
    const name = b.branch;
    if (!byBranch.has(name)) byBranch.set(name, []);
    byBranch.get(name).push(b);
  }
}

const expected = SKY_PASTA_BRANCHES.map((b) => b.branch);
const result = [];
let pass = 0;

console.log(`\nVerifikasi branch Sky Pasta — platform: GoFood`);
console.log(`Output dir: ${OUTPUT_DIR}`);
console.log(`-`.repeat(52));

for (const branch of expected) {
  const hits = byBranch.get(branch) || [];
  const okHits = hits.filter((h) => h.ok);
  const total = okHits.reduce((a, h) => a + (h.total || 0), 0);
  const kept = okHits.reduce((a, h) => a + (h.kept?.length || 0), 0);
  const ok = okHits.length > 0;
  if (ok) pass += 1;
  const status = ok ? "PASS" : "FAIL";
  console.log(
    `[${status}] ${branch.padEnd(15)} tersedia=${okHits.length ? "ya" : "TIDAK"} totalReview=${total} kept=${kept}`,
  );
  result.push({ branch, ok, total, kept, hits: okHits });
}

console.log(`-`.repeat(52));
const allPass = expected.length === pass;
console.log(`Status: ${pass}/${expected.length} branch ditemukan`);
if (!allPass) {
  console.log("Branch yang gagal: " + expected.filter((b) => !byBranch.get(b)?.some((h) => h.ok)).join(", "));
  process.exit(1);
}
console.log("[PASS] Semua 7 branch terverifikasi");
process.exit(0);
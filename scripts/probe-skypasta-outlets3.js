#!/usr/bin/env bun
const r = await fetch("https://www.skypasta.co.id/_next/static/chunks/app/outlets/page-091e6d7e7dc307d0.js", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
const c = await r.text();
console.log(`status ${r.status} len ${c.length}`);
const links = [...new Set([...c.matchAll(/https?:\/\/[^"'`\s\\]+/g)].map((m) => m[0].replace(/\\u002F/g, "/")))];
const interesting = links.filter((l) => /gofood|grabfood|desty|gojek|maps|instagram|foodpanda/i.test(l));
console.log("LINKS:");
for (const l of interesting) console.log("  ", l);
console.log("\nall gofood.co.id refs:");
for (const l of links.filter((l) => /gofood\.co\.id/.test(l))) console.log("  ", l);
console.log("\nall grabfood refs:");
for (const l of links.filter((l) => /grab|food\.grab/i.test(l))) console.log("  ", l);
if (!interesting.length) console.log("first 600:", c.slice(0, 600));
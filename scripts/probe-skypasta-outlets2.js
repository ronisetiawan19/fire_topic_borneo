#!/usr/bin/env bun
const r = await fetch("https://www.skypasta.co.id/outlets", {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
});
const c = await r.text();
const buildId = c.match(/"buildId":"([^"]+)"/)?.[1];
const buildIdAlt = c.match(/"b":"([A-Za-z0-9_-]+)"/)?.[1];
console.log("buildId:", buildId, "alt:", buildIdAlt);
const scriptSrcs = [...new Set([...c.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]))];
console.log("scripts:");
for (const s of scriptSrcs) console.log("  ", s);
const rsc = c.match(/self\.__next_f\.push\(\[1,"([^"]+)/)?.[1];
if (rsc) { console.log("RSC head:", rsc.slice(0, 500)); }
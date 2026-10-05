#!/usr/bin/env bun
const urls = ["https://gofood.link/u/OjRp", "https://gofood.link/u/51zOQ"];
for (const u of urls) {
  try {
    const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await r.text();
    console.log(`\n===== ${u} ===== (len=${text.length})`);
    // meta refresh / canonical / og:url / any gofood.co.id reference
    const metas = [...text.matchAll(/<meta[^>]+(?:content|property|name)="([^"]*(?:refresh|canonical|og:url|url)[^"]*)"[^>]+content="([^"]*)"/gi)].map((m) => m[0]).slice(0, 10);
    for (const m of metas) console.log(" META:", m.replace(/\s+/g, " "));
    const gofood = [...text.matchAll(/https?:\/\/gofood\.co\.id[^"'\\\s]*/g)].map((m) => m[0]);
    console.log(" gofood.co.id refs:", gofood.join(" | "));
    if (!metas.length && !gofood.length) console.log(" first 300 chars:", text.slice(0, 300).replace(/\s+/g, " "));
  } catch (e) {
    console.log(`[${u}] ERR ${e.message}`);
  }
}
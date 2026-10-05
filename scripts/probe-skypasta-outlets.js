#!/usr/bin/env bun
const r = await fetch("https://www.skypasta.co.id/outlets", {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
});
const c = await r.text();
console.log(`status ${r.status} len ${c.length}`);
const links = [...new Set([...c.matchAll(/https?:\/\/[^"'\s\\]+/g)].map((m) => m[0]))];
const interesting = links.filter((l) => /gofood|grabfood|desty|linktr|gojek|foodpanda|maps/i.test(l));
console.log("interesting:", interesting.join("\n  "));
// also look for outlet names / api data
const buildId = c.match(/"buildId":"([^"]+)"/)?.[1] || c.match(/b:"([^"]+)"/)?.[1];
console.log("buildId:", buildId);
const apiRefs = [...new Set([...c.matchAll(/\/api\/[a-zA-Z0-9_\-/\${}.:]+/g)].map((m) => m[0]))];
console.log("api refs:", apiRefs.join(" | "));
if (!interesting.length) {
  // maybe outlets data is in next __NEXT_DATA__ or RSC payload
  const names = [...c.matchAll(/Petukangan|Cinere|Pamulang|Tebet|Ciledug|Galaxy|Binus/gi)].length;
  console.log("branch-name mentions:", names);
}
const t = await (await fetch("https://www.skypasta.co.id/_next/static/chunks/app/outlets/page-091e6d7e7dc307d0.js")).text();
console.log("len", t.length);
console.log("grab hits:", (t.match(/grab/gi) || []).length);
console.log("gofood hits:", (t.match(/gofood/gi) || []).length);
const anchors = [...new Set([...t.matchAll(/https:[^'"\s]{5,150}/g)].map((x) => x[0]))];
for (const a of anchors.slice(0, 100)) console.log(a);
console.log("--- strings containing sky pasta branch names ---");
for (const kw of ["pamulang", "cinere", "ciledug", "petukangan", "binus", "tebet", "galaxy", "bekasi"]) {
  console.log(kw, ":", (t.toLowerCase().match(new RegExp(kw, "g")) || []).length);
}
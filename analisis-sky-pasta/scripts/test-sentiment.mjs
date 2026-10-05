import { scoreReview, aggregate, topThemes } from "../lib/sentiment.js";

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const cases = [
  { name: "pujian sederhana", text: "makanannya enak banget", want: { label: "positif" } },
  { name: "keluhan tegas", text: "pelayanan lama sekali, makanannya tidak enak", want: { label: "negatif" } },
  { name: "negasi positif (tidak enak)", text: "spaghettinya tidak enak", want: { label: "negatif" } },
  { name: "negasi negatif (tidak mahal)", text: "harganya tidak mahal, worth", want: { label: "positif" } },
  { name: "netral tanpa kata sentimen", text: "datang jam 7 malam", want: { label: "netral" } },
  { name: "slang bgt", text: "enaknya bgt pokoknya", want: { label: "positif" } },
  { name: "slang gak (negasi)", text: "gak enak", want: { label: "negatif" } },
];

for (const c of cases) {
  const got = scoreReview(c.text);
  check(c.name, { label: got.label }, c.want);
}

const agg = aggregate([
  "enak banget", "tidak enak", "biasa saja", "enak", "lezat sekali",
]);
check(
  "aggregate dasar",
  { n: agg.n, label: agg.label, pctPos: agg.pctPositif },
  { n: 5, label: "POSITIF", pctPos: 60 },
);

const aggEmpty = aggregate([]);
check("aggregate kosong", { n: aggEmpty.n, label: aggEmpty.label }, { n: 0, label: "TIDAK ADA DATA" });

const themes = topThemes(["enak banget", "enak juga", "mahal sih"], { limit: 2 });
check("topThemes", themes.map((t) => t.word), ["enak", "mahal"]);

console.log(`\nSummary: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
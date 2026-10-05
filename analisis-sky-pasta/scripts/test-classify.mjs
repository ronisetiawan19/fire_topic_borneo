import { classifyCompetitor } from "../lib/classify.js";

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const cases = [
  {
    name: "HOZ Pasta (spesialis, $$ setara)",
    input: { name: "HOZ Pasta", category: "Restoran Italia", priceLevel: "$$" },
    want: { label: "Ya", kelas: "A", priceOk: true },
  },
  {
    name: "Pasta Basta (spesialis, harga literal 20-50rb)",
    input: { name: "Pasta Basta", category: "Restoran Italia", priceLabel: "Rp 20.000–50.000" },
    want: { label: "Ya", kelas: "A", priceOk: true },
  },
  {
    name: "Barraci Steak & Pasta (objek melebar steak)",
    input: { name: "Barraci Steak & Pasta", category: "Steak house", priceLevel: "$$" },
    want: { label: "Tidak", kelas: "B", priceOk: true },
  },
  {
    name: "SKY Steak & Pasta (aturan khusus)",
    input: { name: "SKY Steak & Pasta BSD", category: "Steak house", priceLevel: "$$" },
    want: { label: "Tidak", kelas: "B", priceOk: true },
  },
  {
    name: "Napolo Pizza (pizza, bukan pasta)",
    input: { name: "Napolo Pizza", category: "Pizza restaurant", priceLevel: "$$" },
    want: { label: "Tidak", kelas: "B", priceOk: true },
  },
  {
    name: "Warung Pasta (spesialis, $ murah)",
    input: { name: "Warung Pasta", category: "Restoran", priceLevel: "$" },
    want: { label: "Tidak", kelas: "C", priceOk: false },
  },
  {
    name: "Trattoria La Luna (spesialis, $$$ mahal)",
    input: { name: "Trattoria La Luna", category: "Restoran Italia", priceLevel: "$$$" },
    want: { label: "Tidak", kelas: "C", priceOk: false },
  },
  {
    name: "Cafe umum (objek melebar, harga ok)",
    input: { name: "Kopi Senja Cafe", category: "Cafe", priceLevel: "$$" },
    want: { label: "Tidak", kelas: "B", priceOk: true },
  },
  {
    name: "Spesialis tanpa harga (Cek Manual, keluar kelas A)",
    input: { name: "Pasta Milano", category: "", priceLabel: "" },
    want: { label: "Cek Manual", kelas: "TBD", priceOk: null },
  },
  {
    name: "Bakso Mas Joko (noise, harga murah)",
    input: { name: "Bakso Mas Joko", category: "Restoran", priceLevel: "$" },
    want: { label: "Tidak", kelas: "C", priceOk: false },
  },
  {
    name: "HOZ Pasta Pamulang (literal 50-75rb, di atas benchmark)",
    input: { name: "HOZ Pasta Pamulang", category: "Restoran", priceLabel: "Rp 50–75 rb" },
    want: { label: "Tidak", kelas: "C", priceOk: false },
  },
  {
    name: "EAT & JOY (Restoran Korea, pasta di nama tetap melebar)",
    input: {
      name: "EAT & JOY The Pasta and Topokki Market - BSD",
      category: "Restoran Korea",
      priceLabel: "",
    },
    want: { label: "Tidak", kelas: "B", priceOk: null },
  },
  {
    name: "Lapak Spaghetti Dayeuhkolot (Restoran Indonesia, nama spesialis tetap Cek Manual)",
    input: { name: "Spaghetti Dayeuhkolot", category: "Restoran Indonesia", priceLabel: "" },
    want: { label: "Cek Manual", kelas: "TBD", priceOk: null },
  },
];

for (const c of cases) {
  const got = classifyCompetitor(c.input);
  check(c.name, { label: got.label, kelas: got.kelas, priceOk: got.priceOk }, c.want);
}

console.log(`\nSummary: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
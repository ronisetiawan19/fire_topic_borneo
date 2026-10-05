import { createBrowser } from "../src/browser.js";
import { CONFIG } from "../src/config.js";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("scripts/_feedrpc", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.argv[2];
const { browser, context, page } = await createBrowser({ cookieFile: CONFIG.gm.cookieFile });
let qv9s = [];
page.on("request", (r) => {
  const u = r.url();
  if (!u.includes("batchexecute") || !/rpcids=qv9Egd/.test(u)) return;
  qv9s.push({ res: null, req: r.postData() || "" });
});
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("batchexecute") || !/rpcids=qv9Egd/.test(u)) return;
  try { qv9s[qv9s.length - 1].res = await r.text(); } catch {}
});

// transform data param to reviews-mode
function toReviewUrl(base) {
  let u = base;
  const m = u.match(/(data=)([^&?]+)/);
  if (!m) return base;
  let d = m[2];
  d = d.replace(/!4m7!3m6/, "!4m8!3m7");
  d = d.replace(/!19s[A-Za-z0-9=_%.-]+/, "");
  d = d.replace(/!16s/, "!9m1!1b1!16s");
  if (d.includes("!9m1")) {
    u = u.replace(/data=[^&?]+/, "data=" + d);
  }
  const q = u.match(/[?&](authuser=[0-9]+|hl=[a-z-]+|gl=[a-z-]+)/g) || [];
  const basePart = u.split(/[?&](authuser|hl|gl|g_ep)/)[0];
  return basePart + "?" + (q.includes("hl=id") ? "" : "hl=id&") + q.filter((x, i) => q.indexOf(x) === i).join("&").replace(/^&/, "");
}
const REVIEW = toReviewUrl(BASE);
console.log("REVIEW URL:", REVIEW.slice(0, 200));

await page.goto(REVIEW, { waitUntil: "domcontentloaded", timeout: 45000 });
await sleep(6000);
const st = await page.evaluate(() => {
  let big = null;
  for (const el of document.querySelectorAll("div.m6QErb")) {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.querySelector("div[data-review-id]") && el.scrollHeight > el.clientHeight + 50) {
      if (!big || el.scrollHeight > big.scrollHeight) big = { c: el.clientHeight, s: el.scrollHeight };
    }
  }
  return { cards: document.querySelectorAll("div[data-review-id]").length, big, okUlasan: /Ulasan/i.test(document.body?.innerText || "").toString().slice(0, 40) };
});
console.log("initial:", JSON.stringify(st));
const urlNow = await page.evaluate(() => location.href);
console.log("url now:", urlNow.slice(0, 160));

if (st.big) {
  for (let i = 0; i < 25; i++) {
    const moved = await page.evaluate(() => {
      let t = null;
      for (const el of document.querySelectorAll("div.m6QErb")) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.querySelector("div[data-review-id]") && el.scrollHeight > el.clientHeight + 50) {
          if (!t || el.scrollHeight > t.scrollHeight) t = el;
        }
      }
      if (t) { t.scrollTop += 1200; t.dispatchEvent(new Event("scroll", { bubbles: true })); document.dispatchEvent(new Event("scroll", { bubbles: true })); return t.scrollTop; }
      return null;
    });
    await sleep(4000);
    const cards = await page.evaluate(() => document.querySelectorAll("div[data-review-id]").length);
    console.log(`scroll ${i}: qv9=${qv9s.length} cards=${cards} top=${moved}`);
    if (moved === null) break;
  }
  // if stalled, check for load-more / end of list
  const stall = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].map((b) => b.innerText?.trim()).filter(Boolean);
    const big = [...document.querySelectorAll("div.m6QErb")].map((el) => {
      const cs = getComputedStyle(el);
      return { c: el.clientHeight, s: el.scrollHeight, top: el.scrollTop, cards: el.querySelectorAll("div[data-review-id]").length };
    }).filter((x) => x.cards);
    return { btns: btns.slice(-12), big };
  });
  console.log("STALL state:", JSON.stringify(stall));
}
console.log("FINAL qv9:", qv9s.length, "cards:", await page.evaluate(() => document.querySelectorAll("div[data-review-id]").length));
process.exit(0);
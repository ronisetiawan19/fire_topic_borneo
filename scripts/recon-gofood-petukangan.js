import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars", "--window-size=1280,900"],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  const page = await context.newPage();

  // Use GoFood search page to find Sky Pasta outlets near Petukangan (Jakarta Barat / South Jakarta border)
  const calls = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (/\/api\/(outlets|search|merchants)|_next\/data/.test(u)) {
      let body = null;
      try { body = (await res.text()).slice(0, 30000); } catch {}
      calls.push({ url: u, status: res.status(), body });
    }
  });

  await page.goto("https://gofood.co.id/jakarta/restaurant/sky-pasta-petukangan", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  console.log("petukangan guessed URL title:", await page.title());

  // try the search page
  await page.goto("https://gofood.co.id/search?query=sky+pasta+petukangan", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log("search page text:", JSON.stringify(txt.slice(0, 400)));
  console.log("calls:", calls.length, calls.map((c) => c.status + " " + c.url.slice(0, 140)).join("\n"));

  writeFileSync(path.join(OUT_DIR, "recon_gofood_petukangan.json"), JSON.stringify({ calls, searchText: txt }, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const SEEDS = [
  "sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842",
  "sky-pasta-signature-pamulang-bd96dd68-4bd3-41e2-8fde-ce7ea7b1c41c",
  "sky-pasta-ciledug-423518a4-dea9-46b0-ab0e-015e0129a38f",
  "sky-pasta-taman-galaxy-bekasi-c4b7588e-a2e5-4fae-bd07-3a99c66edf22",
  "sky-pasta-binus-jakbar-2e05c08c-0485-47a6-b128-acaf8d39271f",
  "sky-pasta-binus-jakbar-dd55f44c-4a1b-4329-a31c-295f284d0885",
];

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  const RESULT = {};

  for (const seed of SEEDS) {
    const url = `https://gofood.co.id/id/jakarta/restaurant/${seed}`;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      } catch (e) {
        console.log(`  goto err (${seed}):`, e.message);
      }
      await page.waitForTimeout(6000);
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => {
        const links = [...new Set(
          Array.from(document.querySelectorAll('a[href*="/restaurant/"]'))
            .map((a) => a.getAttribute("href"))
            .filter(Boolean)
            .map((h) => h.split("?")[0].replace(/\/id\//, "/").replace(/^\/(id|en)/, "")),
        )];
        const text = document.body?.innerText || "";
        const idx = text.toLowerCase().indexOf("tempat lainnya");
        const around = idx >= 0 ? text.slice(idx, idx + 1500) : "";
        return { links, text_len: text.length, around };
      });
      console.log(`\n=== ${seed} (attempt ${attempt + 1}) ===`);
      console.log(`  text_len=${data.text_len}`);
      ok = data.text_len > 2000 && data.around !== "";
      const sky = data.links.filter((l) => /sky/i.test(l) || /pasta/i.test(l));
      console.log("  SKY/sibling links:", sky.length ? sky : "(none)");
      if (data.around) console.log("  tempat lainnya:", data.around.replace(/\n+/g, " | ").slice(0, 1000));
      if (data.links.length && data.links.length < 30) console.log("  other links:", data.links);
      RESULT[seed] = data;
    }
  }

  writeFileSync(path.join(OUT_DIR, "recon_gofood_siblings.json"), JSON.stringify(RESULT, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
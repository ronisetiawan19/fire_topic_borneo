#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const UUID = "594d2e42-b1fd-44f2-83a9-da53b2210842";

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

  await page.goto(`https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-${UUID}/reviews`, { waitUntil: "domcontentloaded", timeout: 75000 });
  await page.waitForTimeout(6000);

  const responses = [];
  page.on("response", async (res) => {
    if (/\/api\/outlets\/.*\/reviews(\?|$)/.test(res.url())) {
      let body = null;
      try { body = await res.text(); } catch {}
      responses.push({ url: res.url(), status: res.status(), body });
    }
  });

  // click load more 4 times to also see pages 2..5
  for (let i = 0; i < 4; i++) {
    const btn = page.getByText("Muat lebih banyak").first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(5000);
  }

  console.log("captured review API responses:", responses.length);
  const out = [];
  for (const r of responses) {
    let json = null;
    try { json = JSON.parse(r.body); } catch {}
    out.push({ url: r.url, status: r.status, body: json });
    if (json) {
      const keys = Object.keys(json);
      console.log(`\n[${r.url.split("?").pop()}] status=${r.status} keys=${keys.join(",")}`);
      const rd = json.reviews ?? json.data ?? json.results ?? json;
      if (Array.isArray(rd)) {
        console.log("  count:", rd.length);
        console.log("  [0] fields:", Object.keys(rd[0] || {}).join(","));
        console.log("  [0]:", JSON.stringify(rd[0], null, 1).slice(0, 800));
        console.log("  last createdAt:", rd[rd.length - 1]?.createdAt);
      } else if (rd) {
        console.log("  rd keys:", Object.keys(rd).join(","));
        const data = rd.data ?? rd.reviews ?? rd.items ?? [];
        console.log("  data count:", Array.isArray(data) ? data.length : typeof data);
        if (Array.isArray(data) && data[0]) console.log("  data[0]:", JSON.stringify(data[0], null, 1).slice(0, 800));
      }
    }
  }
  writeFileSync(path.join(OUT_DIR, "recon_gofood_reviews_api.json"), JSON.stringify(out, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
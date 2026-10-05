import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const OUT_DIR = path.join("output", "debug");
mkdirSync(OUT_DIR, { recursive: true });

const SLUGS = {
  pamulang: ["tangerang-selatan", "sky-pasta-signature-pamulang-bd96dd68-4bd3-41e2-8fde-ce7ea7b1c41c"],
  cinere: ["depok", "sky-pasta-cinere-43373425-c78e-4dd4-a4e5-23d58e701cae"],
  tebet: ["jakarta", "sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842"],
  petukangan: ["jakarta", "sky-pasta-petukangan-03ba0e0d-e52b-4531-a140-69cac28c986f"],
  ciledug: ["jakarta", "sky-pasta-ciledug-423518a4-dea9-46b0-ab0e-015e0129a38f"],
  bekasi: ["jakarta", "sky-pasta-taman-galaxy-bekasi-c4b7588e-a2e5-4fae-bd07-3a99c66edf22"],
  binus: ["jakarta", "sky-pasta-binus-jakbar-2e05c08c-0485-47a6-b128-acaf8d39271f"],
};

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

  const results = {};
  for (const [branch, [area, slug]] of Object.entries(SLUGS)) {
    const url = `https://gofood.co.id/${area}/restaurant/${slug}/reviews`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 70000 });
      await page.waitForTimeout(5000);
      const data = await page.evaluate(() => {
        const nd = document.getElementById("__NEXT_DATA__");
        let pp = null;
        try { pp = JSON.parse(nd && nd.textContent || "null")?.props?.pageProps; } catch {}
        const rv = pp?.reviewsData?.reviews;
        return {
          title: document.title,
          url: location.href,
          outletName: pp?.outlet?.name,
          outletRating: pp?.outlet?.rating?.ratingAvg ?? pp?.outlet?.ratingAvg,
          reviewCount: rv?.data?.length ?? null,
          next: rv?.next_page,
          firstCreated: rv?.data?.[0]?.createdAt ?? null,
        };
      });
      console.log(`\n[${branch}] ${url}`);
      console.log("  title:", data.title, "| outlet:", data.outletName, "| rating:", data.outletRating, "| page1 reviews:", data.reviewCount, "| next:", data.next);
      console.log("  firstCreated:", data.firstCreated, "| url resolved:", data.url);
      results[branch] = data;
    } catch (e) {
      console.log(`\n[${branch}] ERR ${e.message.slice(0, 120)}`);
      results[branch] = { err: e.message };
    }
  }
  writeFileSync(path.join(OUT_DIR, "recon_gofood_all_branches.json"), JSON.stringify(results, null, 2), "utf-8");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
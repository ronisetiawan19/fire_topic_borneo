#!/usr/bin/env bun
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const URL = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842/reviews";

async function main() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars", "--window-size=1280,900"] });
  const context = await browser.newContext({ userAgent: ua, viewport: { width: 1280, height: 900 }, locale: "id-ID", timezoneId: "Asia/Jakarta", extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" } });
  const page = await context.newPage();

  let docRedirects = [];
  page.on("response", (res) => {
    if (res.request().resourceType() === "document" && /gofood|restaurant/.test(res.url())) {
      docRedirects.push({ status: res.status(), url: res.url() });
    }
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 75000 });
  await page.waitForTimeout(10000);

  console.log("final URL:", page.url());
  console.log("title:", await page.title());
  console.log("doc responses:", JSON.stringify(docRedirects, null, 1));
  const probe = await page.evaluate(() => {
    const nd = document.getElementById("__NEXT_DATA__");
    const ndLen = nd?.textContent?.length ?? 0;
    let ppKeys = null;
    let rv = null;
    if (nd) {
      try {
        const parsed = JSON.parse(nd.textContent);
        ppKeys = Object.keys(parsed?.props?.pageProps ?? {});
        const rd = parsed?.props?.pageProps?.reviewsData;
        rv = rd?.reviews ? { count: rd.reviews.data?.length, next: rd.reviews.next_page } : null;
      } catch {}
    }
    return {
      ndLen,
      ppKeys,
      rv,
      bodyLen: document.body.innerText.length,
      bodyHead: document.body.innerText.slice(0, 300),
    };
  });
  console.log("probe:", JSON.stringify(probe, null, 1));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
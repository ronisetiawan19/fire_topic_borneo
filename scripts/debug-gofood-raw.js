#!/usr/bin/env bun
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const URL = "https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842/reviews";

async function main() {
  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars", "--window-size=1280,900"] });
  const context = await browser.newContext({
    userAgent: USER_AGENTS[0],
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  const page = await context.newPage();
  let docBody = null;
  let docStatus = null;
  page.on("response", async (res) => {
    if (res.request().resourceType() === "document" && /\/reviews$/.test(res.url())) {
      docStatus = res.status();
      try { docBody = await res.text(); } catch (e) { docBody = "ERR:" + e.message; }
    }
  });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);
  console.log("docStatus:", docStatus, "bodyLen:", docBody?.length);
  console.log("bodyHead:", docBody?.slice(0, 600));
  console.log("final title:", await page.title());
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
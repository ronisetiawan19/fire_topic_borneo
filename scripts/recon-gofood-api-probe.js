#!/usr/bin/env bun
import { chromium } from "playwright";
import { USER_AGENTS } from "../src/config.js";

const UUID = "594d2e42-b1fd-44f2-83a9-da53b2210842";
const URL = `https://gofood.co.id/jakarta/restaurant/sky-pasta-tebet-${UUID}/reviews`;

async function main() {
  const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars", "--window-size=1280,900"] });
  const context = await browser.newContext({
    userAgent: USER_AGENTS[1],
    viewport: { width: 1280, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  const page = await context.newPage();

  let docStatus = null;
  let docLen = 0;
  page.on("response", async (res) => {
    if (res.request().resourceType() === "document" && /\/reviews$/.test(res.url())) {
      docStatus = res.status();
      try { docLen = (await res.text()).length; } catch {}
    }
  });

  console.log("[1] load reviews page (paced)");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);
  console.log("   docStatus:", docStatus, "bodyLen:", docLen);

  const hasCaptcha = docLen < 3000;
  if (hasCaptcha) {
    console.log("   CAPTCHA detected on SSR page. Try API anyway via context.request...");
  }

  console.log("[2] replay /api/outlets/{uuid}/reviews?page=1 via context.request");
  const apiUrl = `https://gofood.co.id/api/outlets/${UUID}/reviews?page=1&page_size=20`;
  const resp = await context.request.get(apiUrl, {
    headers: { accept: "application/json", "referer": URL, "x-requested-with": "XMLHttpRequest" },
  });
  const text = await resp.text();
  console.log("   API status:", resp.status(), "len:", text.length);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (json) {
    console.log("   keys:", Object.keys(json).join(","));
    const data = json.data || json.reviews || json.results || [];
    console.log("   count:", Array.isArray(data) ? data.length : typeof data);
    if (Array.isArray(data) && data[0]) console.log("   [0] createdAt:", data[0].createdAt, "| text:", (data[0].text || "").slice(0, 60));
    console.log("   next:", json.next_page);
  } else {
    console.log("   head:", text.slice(0, 300));
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
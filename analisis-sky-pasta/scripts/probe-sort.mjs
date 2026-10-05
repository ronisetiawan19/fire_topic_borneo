import { createBrowser, log } from "../lib/http.js";
import {
  revealReviewsSection,
  gmGoto,
  waitForGMContent,
  waitForReviewFeed,
  readPanelState,
  toReviewUrl,
  applySort,
} from "../../src/googlemaps/parse.js";

const url =
  "https://www.google.com/maps/place/Macaroni+Panggang/data=!4m7!3m6!1s0x2e69c5cce4b0d74d:0x57a7475005c8be6c!8m2!3d-6.5889224!4d106.8026474!16s%2Fg%2F11b6rw2zfv!19sChIJTdew5MzFaS4RbL7IBVBHp1c?authuser=0&hl=id&g_ep=EgoyMDI2MDkwOS4wIJJjKgBIAVAD&rclk=1";

const { browser, page } = await createBrowser({ headless: true });
try {
  const reviewUrl = toReviewUrl(url);
  log(`reviewUrl: ${reviewUrl.slice(0, 110)}...`, "info");
  await gmGoto(page, reviewUrl, "id-ID");
  await waitForGMContent(page, 30000);
  await revealReviewsSection(page);
  await waitForReviewFeed(page, 10, 20000);
  await page.waitForTimeout(3000);
  const st = await readPanelState(page);
  log(`panel: ${JSON.stringify(st)}`, "success");

  const before = await page.evaluate(
    () => document.querySelectorAll("div[data-review-id]").length,
  );
  log(`review cards sebelum sort: ${before}`, "info");

  // Uji applySort yang sekarang (sebelum patch) —Interest berapa yang ketemu
  const sortResult = await applySort(page, "newest");
  log(`applySort(newest) -> ${JSON.stringify(sortResult)}`, "info");

  const probe = await page.evaluate(() => {
    const describe = (el) => ({
      tag: el.tagName,
      role: el.getAttribute("role") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      dataValue: el.getAttribute("data-value") || "",
      jsaction: el.getAttribute("jsaction") || "",
      cls: (el.className || "").toString().slice(0, 80),
      text: (el.innerText || "").trim().slice(0, 50),
    });
    const rx = /urutkan|sort/i;
    return {
      reviewCards: document.querySelectorAll("div[data-review-id]").length,
      byAria: Array.from(document.querySelectorAll("[aria-label],[data-value]"))
        .filter((el) => rx.test(el.getAttribute("aria-label") || "") || rx.test(el.getAttribute("data-value") || ""))
        .slice(0, 10)
        .map(describe),
      byText: Array.from(document.querySelectorAll("button,[role=button]"))
        .filter((el) => rx.test((el.innerText || "").trim()))
        .slice(0, 10)
        .map(describe),
      menuItems: Array.from(document.querySelectorAll("[role=menuitem],[role=menuitemradio],[role=option],li"))
        .map((el) => (el.innerText || "").trim())
        .filter((t) => t && t.length < 40)
        .slice(0, 15),
    };
  });

  console.log(JSON.stringify({ sortResult, ...probe }, null, 2));
} finally {
  await browser.close();
}

import { CONFIG } from "../config.js";
import { log, createBrowser } from "../lib/http.js";

const name = process.argv[2] || "Pasta Nafisa";
const cp = JSON.parse(
  await Bun.file(`${CONFIG.scan.checkpointDir}/Buah_Batu.json`).text(),
);
const row = cp.results.find((r) => r.name.includes(name)) || cp.results[0];
if (!row) {
  console.log("tidak ada hasil untuk debug.");
  process.exit(0);
}

const { browser, page } = await createBrowser({ headless: true });
try {
  await page.goto(row.link, { waitUntil: "domcontentloaded", timeout: CONFIG.gm.navTimeout });
  await page.waitForTimeout(4500);
  const url = page.url();
  const dump = await page.evaluate(() => {
    const out = { url: location.href, title: "", h1: "", cats: [], jsactions: [], items: [], searchLinks: [] };
    const t = document.querySelector('[class*="fontHeadlineSmall"]');
    out.title = t?.textContent?.trim() || "";
    out.h1 = document.querySelector("h1")?.textContent?.trim() || "";
    const seen = new Set();
    for (const el of Array.from(document.querySelectorAll('a[href*="/maps/search/"]')).slice(0, 12)) {
      const txt = (el.textContent || "").trim();
      if (txt && txt.length < 60 && !seen.has(txt)) {
        seen.add(txt);
        out.searchLinks.push({ cls: (el.className || "").slice(0, 60), txt });
      }
    }
    for (const el of Array.from(document.querySelectorAll("[jsaction]")).slice(0, 200)) {
      const ja = (el.getAttribute("jsaction") || "");
      if (/category|place/i.test(ja)) {
        out.jsactions.push({ ja: ja.slice(0, 80), txt: (el.textContent || "").trim().slice(0, 40) });
      }
    }
    for (const el of Array.from(document.querySelectorAll("[data-item-id]"))) {
      const id = el.getAttribute("data-item-id");
      if (!out.items.includes(id)) out.items.push(id);
    }
    const bodyLines = (document.body?.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
    out.cats = bodyLines
      .filter((l) => /^(restoran|italian|caf[eé]|pasta|pizza|bar|bistro|western|restaurant|ristorante|trattoria)/i.test(l) && l.length < 60)
      .slice(0, 8);
    return out;
  });
  console.log(JSON.stringify(dump, null, 2));
} finally {
  await browser.close();
}
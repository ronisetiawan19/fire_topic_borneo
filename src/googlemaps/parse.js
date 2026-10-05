import { CONFIG } from "../config.js";
import { log, randomDelay, relativeTimeToDate, parsePlaceIdFromUrl } from "../utils.js";

export function parseCountMap(txt) {
  if (!txt) return 0;
  const t = String(txt).trim().toLowerCase();
  const m = t.match(/([\d.,]+)\s*(rb|ribu|jt|juta|[kmb])?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return 0;
  const u = m[2];
  if (u === "rb" || u === "ribu" || u === "k") n *= 1e3;
  if (u === "jt" || u === "juta" || u === "m") n *= 1e6;
  if (u === "b") n *= 1e9;
  return Math.round(n);
}

export async function revealReviewsSection(page) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const panels = Array.from(
        document.querySelectorAll('div[class*="m6QErb"]'),
      ).filter((el) => el.clientHeight > 200 && el.scrollHeight > el.clientHeight);
      panels.forEach((p) => (p.scrollTop = p.scrollHeight));
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2500);
  }
}

export async function waitForGMContent(page, timeout = 20000) {
  try {
    await page.waitForFunction(
      () => {
        const hasTab = Array.from(document.querySelectorAll("button, [role='button']")).some(
          (el) => /^(ulasan|reviews?)$/i.test((el.innerText || "").trim()),
        );
        const t = document.body?.innerText || "";
        const deep = hasTab;
        return (
          document.querySelector("div[data-review-id]") &&
          (deep ||
            /[\d.,]+\s*(?:rb|ribu|jt|juta|k|m)?\s*(ulasan|reviews?)/i.test(t) ||
            /(lihat semua|semua ulasan|lihat ulasan lainnya|see all|all reviews)/i.test(t))
        );
      },
      { timeout },
    );
  } catch {}
}

export async function waitForReviewFeed(page, min = 3, timeout = 10000) {
  try {
    return await page
      .waitForFunction(
        (m) => {
          const cards = document.querySelectorAll("div[data-review-id]").length;
          const feed = document.querySelector('div[role="feed"]');
          return cards >= m || (feed && cards >= 3);
        },
        min,
        { timeout },
      )
      .then(() => true)
      .catch(() => false);
  } catch {
    return false;
  }
}

export async function readPanelState(page) {
  return page
    .evaluate(() => {
      let maxH = 0;
      let scrollable = false;
      for (const el of document.querySelectorAll("div.m6QErb")) {
        const cs = getComputedStyle(el);
        if (
          (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          el.querySelector("div[data-review-id]")
        ) {
          scrollable = true;
          if (el.scrollHeight > maxH) maxH = el.scrollHeight;
        }
      }
      return {
        cards: document.querySelectorAll("div[data-review-id]").length,
        feed: !!document.querySelector('div[role="feed"]'),
        scrollable,
        feedHeight: maxH,
      };
    })
    .catch(() => ({ cards: 0, feed: false, scrollable: false, feedHeight: 0 }));
}

export function parseRatingLabel(label) {
  if (!label) return 0;
  const m = String(label).match(/(\d(?:[.,]\d)?)\s*(?:bintang|star|stars)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export async function gmGoto(page, url, lang = CONFIG.gm.defaultLang) {
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}hl=${lang}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3000);
  await dismissConsent(page);
  await page.waitForTimeout(1000);
  return detectBlockedOnPage(page);
}

export async function dismissConsent(page) {
  try {
    if (page.url().includes("consent.google.com")) {
      await page.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll("button, form[action] input[type=submit]"),
        );
        const agree = btns.find((b) =>
          /setuju|agree|accept all|^accept|ya, saya setuju|i agree|saya setuju/i.test(
            (b.innerText || b.value || "").trim(),
          ),
        );
        if (agree) agree.click();
      });
      await page.waitForTimeout(3500);
      await page.goto(page.url(), { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    const banner = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const agree = btns.find((b) =>
        /setuju|saya setuju|^agree$|^accept all$|^i agree$/i.test(
          (b.innerText || "").trim(),
        ),
      );
      if (agree) {
        agree.click();
        return true;
      }
      return false;
    });
    if (banner) await page.waitForTimeout(1500);
  } catch {}
  return true;
}

export async function detectBlockedOnPage(page) {
  try {
    const status = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() || "";
      return {
        captcha: /verify|unusual traffic|prove you'?re human|captcha/i.test(text),
        consent: /sebelum melanjutkan|before you continue|consent/i.test(text),
      };
    });
    if (status.captcha) {
      log("Google CAPTCHA / unusual traffic detected!", "error");
      return { blocked: true, reason: "captcha" };
    }
    return { blocked: false, reason: null };
  } catch {
    return { blocked: false, reason: null };
  }
}

export async function collectPlacesFromDom(page) {
  try {
    const raw = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];
      const items = Array.from(feed.children).filter(
        (it) => it.matches("a") || it.querySelector('a[href*="/maps/place/"]'),
      );

      const placeIdOf = (url) => {
        if (!url) return null;
        const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
        if (m) return m[1];
        const p = url.match(/(?:^|[^0-9a-fA-F])(0x[0-9a-fA-F]{8,}:0x[0-9a-fA-F]{8,})(?:[^0-9a-fA-F]|$)/);
        return p ? p[1] : null;
      };
      const parseCountMap = (txt) => {
        if (!txt) return 0;
        const m = String(txt)
          .toLowerCase()
          .match(/([\d.,]+)\s*(rb|ribu|jt|juta|[kmb])?/);
        if (!m) return 0;
        let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
        if (isNaN(n)) return 0;
        const u = m[2];
        if (u === "rb" || u === "ribu" || u === "k") n *= 1e3;
        if (u === "jt" || u === "juta" || u === "m") n *= 1e6;
        if (u === "b") n *= 1e9;
        return Math.round(n);
      };
      const parseRating = (label) => {
        const m = String(label || "").match(/(\d(?:[.,]\d)?)/i);
        const v = m ? m[1] : null;
        return v ? parseFloat(v.replace(",", ".")) || 0 : 0;
      };

      const out = [];
      for (const it of items) {
        const a = it.matches("a") ? it : it.querySelector('a[href*="/maps/place/"]');
        if (!a) continue;
        const href = a.getAttribute("href") || "";
        const absHref = href.startsWith("http")
          ? href
          : `https://www.google.com/maps${href.replace(/^\./, "")}`;
        const place_id = placeIdOf(absHref);
        if (!place_id) continue;

        const nameEl =
          it.querySelector('[class*="qBF1Pd"]') ||
          it.querySelector("h3, [class*='fontHeadlineSmall']");
        const name = nameEl?.textContent?.trim() || "";

        let rating = 0;
        for (const s of Array.from(it.querySelectorAll('span[aria-hidden="true"]'))) {
          const r = parseRating(s.textContent || "");
          if (r > 0) {
            rating = r;
            break;
          }
        }

        let reviews_count = 0;
        for (const s of Array.from(it.querySelectorAll("span"))) {
          if (/(ulasan|reviews?)/i.test(s.textContent || "")) {
            const c = parseCountMap(
              (s.textContent || "").replace(/\s*(ulasan|reviews?)/i, ""),
            );
            if (c > 0) {
              reviews_count = c;
              break;
            }
          }
        }

        const detailEl = it.querySelector('[class*="W4Efsd"]');
        const detail = detailEl?.innerText?.trim() || "";

        out.push({
          place_id,
          name,
          link: absHref,
          rating,
          reviews_count,
          detail,
        });
      }
      return out;
    });

    const dedup = new Map();
    for (const p of raw || []) {
      const key = p.place_id || p.link;
      if (!dedup.has(key)) dedup.set(key, p);
    }
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}

export async function collectReviewsFromDom(page) {
  let raw = [];
  try {
    raw = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[data-review-id]'));
      const parseCount = (txt) => {
        if (!txt) return 0;
        const m = String(txt)
          .toLowerCase()
          .match(/([\d.,]+)\s*(rb|ribu|jt|juta|[kmb])?/);
        if (!m) return 0;
        let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
        if (isNaN(n)) return 0;
        const u = m[2];
        if (u === "rb" || u === "ribu" || u === "k") n *= 1e3;
        if (u === "jt" || u === "juta" || u === "m") n *= 1e6;
        if (u === "b") n *= 1e9;
        return Math.round(n);
      };
      const parseRating = (label) => {
        const m = String(label || "").match(/(\d(?:[.,]\d)?)\s*bintang|(\d(?:[.,]\d)?)/i);
        const v = m ? m[1] || m[2] : null;
        return v ? parseFloat(v.replace(",", ".")) || 0 : 0;
      };

      const out = [];
      for (const el of items) {
        const review_id = el.getAttribute("data-review-id") || "";

        const authorEl = el.querySelector('[class*="d4r55"][class*="fontTitleMedium"], [class*="fontTitleMedium"][class*="d4r55"]');
        let author = authorEl?.textContent?.trim() || "";
        if (!author) author = el.getAttribute("aria-label") || "";
        if (!author) {
          const hdr = el.querySelector('[class*="TSUbDb"]');
          author = hdr?.textContent?.trim() || "";
        }

        let rating = 0;
        for (const s of Array.from(el.querySelectorAll('[role="img"][aria-label]'))) {
          const r = parseRating(s.getAttribute("aria-label") || "");
          if (r > 0) {
            rating = r;
            break;
          }
        }

        let time_label = "";
        const timeByClass = el.querySelector('[class*="rsqaWe"]');
        if (timeByClass) {
          const t = (timeByClass.textContent || "").trim();
          if (/lalu|ago|kemarin|semalam|menit|jam|hari|minggu|bulan|tahun/i.test(t)) time_label = t;
        }
        if (!time_label) {
          for (const s of Array.from(el.querySelectorAll("span"))) {
            const t = (s.textContent || "").trim();
            if (/lalu|ago|kemarin|semalam|menit|jam|hari|minggu|bulan|tahun/i.test(t) && /(lalu|ago|kemarin|semalam)$/i.test(t)) {
              time_label = t;
              break;
            }
          }
        }

        const textEl =
          el.querySelector('[class*="wiI7pd"]') ||
          el.querySelector('[class*="MyEned"]');
        const text = (textEl?.innerText || textEl?.textContent || "")
          .trim()
          .replace(/\s*\("[^"]*"\)\.?$/, "")
          .replace(/\s*(selengkapnya|more|mo  la|\(more\))\s*$/i, "");

        out.push({ review_id, author, rating, time_label, text });
      }
      return out;
    });
  } catch {
    return [];
  }

  const dedup = new Map();
  const now = new Date();
  for (const r of raw || []) {
    const key = r.review_id || `${r.author}|${r.time_label}|${r.text.slice(0, 80)}`;
    if (dedup.has(key)) continue;
    const est = relativeTimeToDate(r.time_label, now);
    dedup.set(key, {
      ...r,
      time: est ? Math.floor(est.getTime() / 1000) : null,
      source: "dom",
    });
  }
  return Array.from(dedup.values());
}

export function toReviewUrl(url) {
  try {
    const m = url.match(/(data=)([^&?]+)/);
    if (!m) return url;
    let d = m[2];
    d = d.replace(/!4m7!3m6/, "!4m8!3m7");
    d = d.replace(/!19s[^!]+/, "");
    d = d.replace(/!16s/, "!9m1!1b1!16s");
    if (!d.includes("!9m1")) return url;
    return url.replace(/data=[^&?]+/, "data=" + d);
  } catch {
    return url;
  }
}

export async function scrollReviewFeed(page) {
  const res = await page.evaluate(() => {
    let t = null;
    for (const el of document.querySelectorAll("div.m6QErb")) {
      const cs = getComputedStyle(el);
      if (
        (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
        el.querySelector("div[data-review-id]") &&
        el.scrollHeight > el.clientHeight + 50
      ) {
        if (!t || el.scrollHeight > t.scrollHeight) t = el;
      }
    }
    if (!t) return null;
    const atBottom = t.scrollTop + t.clientHeight >= t.scrollHeight - 5;
    t.scrollTop = t.scrollHeight;
    t.dispatchEvent(new Event("scroll", { bubbles: true }));
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    if (atBottom) {
      window.scrollTo(0, document.body.scrollHeight);
      document.querySelectorAll("div.m6QErb").forEach((el) => {
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
    }
    return { moved: t.scrollTop, atBottom };
  });
  await page.waitForTimeout(3200);
  if (res && res.atBottom) {
    await page.evaluate(() => {
      const t = (() => {
        let best = null;
        for (const el of document.querySelectorAll("div.m6QErb")) {
          const cs = getComputedStyle(el);
          if (
            (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
            el.querySelector("div[data-review-id]") &&
            el.scrollHeight > el.clientHeight + 50
          ) {
            if (!best || el.scrollHeight > best.scrollHeight) best = el;
          }
        }
        return best;
      })();
      if (t) {
        t.scrollTop = t.scrollHeight;
        t.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });
    await page.waitForTimeout(2600);
  }
  return res;
}

export async function scrollFeed(page) {
  const res = await scrollReviewFeed(page);
  if (!res) {
    await page.evaluate(() => {
      try {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) feed.scrollTo(0, feed.scrollHeight);
        window.scrollTo(0, document.body.scrollHeight);
      } catch {}
    });
    await page.mouse.wheel(0, 2400);
  }
  await randomDelay(Math.max(1800, CONFIG.gm.delayMin), CONFIG.gm.delayMax);
}

export async function expandAllReviews(page) {
  try {
    const changed = await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('button[aria-expanded="false"]'),
      );
      let n = 0;
      for (const b of btns) {
        if (b.getAttribute("aria-controls") || /(lihat lainnya|more|selengkapnya)/i.test(b.getAttribute("aria-label") || b.innerText || "")) {
          b.click();
          n += 1;
        }
      }
      return n;
    });
    if (changed > 0) await page.waitForTimeout(900);
    return changed;
  } catch {
    return 0;
  }
}

export async function clickReviewsTab(page) {
  try {
    const locs = page.getByRole("button", { name: /^\s*(ulasan|reviews?)\b/i });
    const n = await locs.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const l = locs.nth(i);
      if (await l.isVisible().catch(() => false)) {
        await l.scrollIntoViewIfNeeded().catch(() => {});
        await l.click({ delay: 30, timeout: 5000 });
        return true;
      }
    }
    log("    No visible reviews-tab button.", "warn");
    return false;
  } catch (e) {
    log(`    Reviews-tab click error: ${e.message}`, "warn");
    return false;
  }
}

export async function clickSeeAllReviews(page) {
  const scrollToBottom = () =>
    page.evaluate(() => {
      document.querySelectorAll("div").forEach((el) => {
        if (el.scrollHeight > el.clientHeight && el.clientHeight > 100)
          el.scrollTop = el.scrollHeight;
      });
      window.scrollTo(0, document.body.scrollHeight);
    });

  const cardCount = () =>
    page
      .evaluate(() => document.querySelectorAll("div[data-review-id]").length)
      .catch(() => 0);

  const hasFeed = () =>
    page.evaluate(() => !!document.querySelector('div[role="feed"]')).catch(() => false);

  const tryStrategy = (tag) =>
    page
      .locator(
        'button, a[role="link"], [role="link"], a, div[role="button"], li[role="button"], [role="button"]',
      )
      .filter((el) =>
        tag === "more"
          ? /moreReviews/i.test(el.getAttribute("jsaction") || "")
          : tag === "seeAll"
            ? /(semua ulasan|lihat semua|see all (reviews)?|all reviews|tampilkan semua)/i.test(
                (el.innerText || "").trim(),
              )
            : /^[\d.,]+(?:\s*(?:rb|ribu|jt|juta|k|m))?\s*(ulasan|reviews?)/i.test(
                (el.innerText || "").trim(),
              ),
      )
      .first();

  await scrollToBottom();
  await page.waitForTimeout(2000);

  let best = 0;
  for (let pass = 0; pass < 2; pass++) {
    const before = await cardCount();
    for (const tag of ["more", "seeAll", "count"]) {
      const loc = tryStrategy(tag);
      const cnt = await loc.count().catch(() => 0);
      if (!cnt) continue;
      const visible = await loc.isVisible().catch(() => false);
      if (!visible) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
      }
      const clicked = await loc
        .click({ delay: 30, timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) continue;
      await page.waitForTimeout(2000);
      const after = await cardCount();
      if (after > before + 3 || after >= 12 || (await hasFeed())) {
        await page.waitForTimeout(1500);
        return true;
      }
      if (after > best) best = after;
    }
    await scrollToBottom();
    await page.waitForTimeout(1200);
  }
  return best > 0;
}

export async function applySort(page, sort) {
  if (!sort || sort === "relevant") return;
  try {
    const clicked = await page.evaluate(() => {
      // Teks tombol Google berisi line-break di depan ("\nUrutkan") dan ikon
      // sebagai karakter tak cetak, jadi normalisasi dulu sebelum diuji.
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const btns = Array.from(
        document.querySelectorAll("button,[role='button']"),
      );
      const sortBtn = btns.find((b) => {
        const dv = norm(b.getAttribute("data-value"));
        if (/^urutkan$|^sort$/i.test(dv)) return true;
        const al = norm(b.getAttribute("aria-label"));
        if (/^urutkan ulasan$|^sort reviews$/i.test(al)) return true;
        return /^(urutkan|sort)\b/i.test(norm(b.innerText));
      });
      if (!sortBtn) return false;
      sortBtn.click();
      return true;
    });
    if (!clicked) {
      log("Sort button not found — using default order.", "warn");
      return;
    }
    await page.waitForTimeout(1200);
    const picked = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      // Opsi sort Google muncul sebagai <li> tanpa role, jadi selector harus
      // luas; penentu kecocokan tetap teks persis "Terbaru"/"Newest".
      const scope = Array.from(
        document.querySelectorAll(
          '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],li,div,span',
        ),
      );
      const target = scope.find((el) => {
        if (el.querySelector("li,div,span")) return false;
        return /^(terbaru|newest)$/i.test(norm(el.innerText));
      });
      if (!target) return false;
      (target.closest("li,[role='menuitem'],[role='option']") || target).click();
      return true;
    });
    if (!picked) {
      log("Sort option not found in menu — keeping default order.", "warn");
      return;
    }
    await page.waitForTimeout(3000);
    log("Sorted by newest.", "success");
  } catch {
    log("Failed to change sort order.", "warn");
  }
}

export function normalizePlace(place) {
  return {
    place_id: parsePlaceIdFromUrl(place.link || "") || place.place_id || "",
    name: place.name || "",
    link: place.link || "",
    address: place.detail || "",
    rating: place.rating || 0,
    reviews_count: place.reviews_count || 0,
  };
}
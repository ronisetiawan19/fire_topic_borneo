import { chromium } from "playwright";
import { CONFIG, USER_AGENTS } from "../config.js";
import { log, randomDelay } from "../utils.js";

export function reviewsUrlFor(branch) {
  return `https://gofood.co.id/${branch.area}/restaurant/${branch.slug}/reviews`;
}

export function reviewsApiFor(branch, page, pageSize = CONFIG.gofood.pageSize) {
  return `https://gofood.co.id/api/outlets/${branch.uuid}/reviews?page=${page}&page_size=${pageSize}`;
}

export async function createGoFoodBrowser({ headless = false } = {}) {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });
  return { browser };
}

export async function newGoFoodContext(browser) {
  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["id-ID", "id", "en"] });
  });
  return context;
}

function parseGoFoodDate(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return isNaN(t) ? null : t;
}

export function normalizeReview(r, branch) {
  const created = parseGoFoodDate(r.createdAt);
  const ordered = parseGoFoodDate(r.order?.orderedAt);
  const period = typeof r.createdAt === "string" ? r.createdAt.slice(0, 4) : "";
  return {
    review_id: r.id || "",
    author: r.author?.fullName || "",
    author_initial: r.author?.initialName || "",
    rating: r.rating ?? 0,
    text: r.text || "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    created_at: r.createdAt || "",
    created_ts: created,
    period,
    ordered_at: r.order?.orderedAt || "",
    ordered_ts: ordered,
    items: (r.order?.items || []).map((i) => i.name).filter(Boolean),
  };
}

export function summarizeByYear(kept) {
  const byYear = {};
  for (const r of kept) {
    const year = r.period || (r.created_at || "").slice(0, 4);
    if (!year) continue;
    if (!byYear[year]) byYear[year] = { count: 0, rating_sum: 0, first: null, last: null };
    const s = byYear[year];
    s.count += 1;
    s.rating_sum += r.rating;
    if (!s.first || r.created_ts < s.first) s.first = r.created_ts;
    if (!s.last || r.created_ts > s.last) s.last = r.created_ts;
  }
  const out = {};
  for (const [year, s] of Object.entries(byYear)) {
    out[year] = {
      count: s.count,
      avg_rating: s.count ? Math.round((s.rating_sum / s.count) * 100) / 100 : null,
      first: s.first,
      last: s.last,
    };
  }
  return out;
}

export async function fetchReviewsPage(context, branch, page, referer) {
  const url = reviewsApiFor(branch, page);
  const resp = await context.request.get(url, {
    headers: {
      accept: "application/json",
      referer,
      "x-requested-with": "XMLHttpRequest",
    },
    timeout: CONFIG.gofood.apiTimeout,
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status(), body: null };
  }
  let body = null;
  try {
    body = await resp.json();
  } catch {
    return { ok: false, status: resp.status(), body: null };
  }
  return { ok: true, status: resp.status(), body };
}

export async function crawlBranchReviews({ browser, branch, sinceT, untilT, onPage }) {
  const context = await newGoFoodContext(browser);
  const page = await context.newPage();
  const reviewsUrl = reviewsUrlFor(branch);

  try {
    log(`  menunggu halaman review...`, "info");
    try {
      await page.goto(reviewsUrl, { waitUntil: "domcontentloaded", timeout: CONFIG.gofood.navTimeout });
    } catch (e) {
      log(`  halaman tidak selesai dimuat (${e.message.split("\n")[0]}) — lanjut lewat API`, "warn");
    }
    await page.waitForTimeout(CONFIG.gofood.waitAfterNav);

    const raw = [];
    let pageNum = 1;
    let done = false;
    while (!done && pageNum <= CONFIG.gofood.maxPages) {
      const res = await fetchReviewsPage(context, branch, pageNum, reviewsUrl);
      if (!res.ok) {
        log(`  API page ${pageNum} gagal (HTTP ${res.status}) — berhenti`, "error");
        break;
      }
      const data = Array.isArray(res.body.data) ? res.body.data : [];
      if (!data.length) {
        log(`  API page ${pageNum}: data kosong — berhenti`, "info");
        break;
      }
      raw.push(...data);
      if (onPage) onPage(pageNum, data.length);

      const last = data[data.length - 1];
      const lastT = parseGoFoodDate(last?.createdAt);
      if (lastT !== null && sinceT !== null && lastT < sinceT) {
        log(`  page ${pageNum}: ulasan tertua sudah di bawah cutoff (${last?.createdAt}) — stop paginasi`, "info");
        done = true;
      }
      const next = res.body.next_page;
      if (typeof next !== "string" || !next.includes("page=")) {
        done = true;
      }
      pageNum += 1;
      if (!done) await randomDelay(CONFIG.gofood.delayMin, CONFIG.gofood.delayMax);
    }

    const kept = [];
    let skipped = 0;
    let unknown = 0;
    for (const r of raw) {
      const ts = parseGoFoodDate(r.createdAt);
      if (ts === null) {
        unknown += 1;
        kept.push({ ...normalizeReview(r, branch), date_flag: "unknown" });
        continue;
      }
      if (sinceT !== null && ts < sinceT) {
        skipped += 1;
        continue;
      }
      if (untilT !== null && ts > untilT) {
        skipped += 1;
        continue;
      }
      kept.push(normalizeReview(r, branch));
    }

    return { ok: true, branch, uuid: branch.uuid, url: reviewsUrl, total: raw.length, kept, skipped, unknown, pages: pageNum - 1, by_year: summarizeByYear(kept) };
  } catch (e) {
    return { ok: false, branch, uuid: branch.uuid, url: reviewsUrl, error: String(e.message) };
  } finally {
    await context.close();
  }
}
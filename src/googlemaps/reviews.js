import { CONFIG } from "../config.js";
import { log, randomDelay } from "../utils.js";
import {
  gmGoto,
  collectReviewsFromDom,
  scrollFeed,
  scrollReviewFeed,
  toReviewUrl,
  clickReviewsTab,
  clickSeeAllReviews,
  applySort,
  expandAllReviews,
  detectBlockedOnPage,
  waitForGMContent,
  revealReviewsSection,
  readPanelState,
} from "./parse.js";

let sessionRoundsUsed = 0;

async function openReviewsPanel(page, expectedReviews = 0) {
  const isFullFeed = (st) =>
    st.scrollable && st.cards > 0 &&
    (expectedReviews <= 40 ? st.feedHeight >= 1500 : st.cards >= 30 || st.feedHeight >= 6000);

  let base = await readPanelState(page);

  if (isFullFeed(base)) {
    log(`    Reviews feed open (${base.cards} cards, full feed).`, "success");
    return true;
  }

  await page.waitForTimeout(3000);
  base = await readPanelState(page);
  if (isFullFeed(base)) {
    log(`    Reviews feed open (${base.cards} cards, full feed).`, "success");
    return true;
  }

  const tryTab = async (baseCards) => {
    const tabClicked = await clickReviewsTab(page);
    log(`    "Reviews" tab: ${tabClicked ? "clicked" : "not found"}`, "info");
    if (tabClicked) await page.waitForTimeout(2500);
    return readPanelState(page);
  };

  const pres = base.cards > 0 ? await tryTab(base.cards) : null;
  if (pres && isFullFeed(pres)) {
    log(`    Full feed via tab (${pres.cards} cards).`, "success");
    return true;
  }

  const seeAll = await clickSeeAllReviews(page);
  log(`    "See all reviews": ${seeAll ? "clicked" : "not found"}`, "info");
  if (seeAll) await page.waitForTimeout(2500);
  const after = await readPanelState(page);
  return isFullFeed(after);
}

async function readReviewCount(page) {
  try {
    return await page.evaluate(() => {
      const text = (document.body.innerText || "").replace(/\s+/g, " ");
      const m = text.match(
        /([\d.,]+(?:\s*(?:rb|ribu|jt|juta|k|m))?)\s*(?:ulasan|reviews?)/i,
      );
      if (!m) return 0;
      let n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (isNaN(n)) return 0;
      const u = m[1].toLowerCase();
      if (/rb|ribu|k/.test(u)) n *= 1e3;
      if (/jt|juta|m/.test(u)) n *= 1e6;
      return Math.round(n);
    });
  } catch {
    return 0;
  }
}

function resolveMaxRounds(reviewsCount) {
  if (reviewsCount > 0) {
    const needed =
      Math.ceil(reviewsCount / CONFIG.gm.reviewsPerRound) + CONFIG.gm.roundsBuffer;
    return Math.min(
      CONFIG.gm.maxRoundsCap,
      Math.max(CONFIG.gm.maxRounds, needed),
    );
  }
  return CONFIG.gm.maxRounds;
}

async function stabilizeReviewsView(page, url, l) {
  for (let i = 0; i < 4; i++) {
    await waitForGMContent(page, 30000);
    await revealReviewsSection(page);
    const st = await readPanelState(page);
    if (st.cards > 0) {
      log(`    Review UI rendered (${st.cards} cards).`, "info");
      await page.waitForTimeout(4000);
      return true;
    }
    if (i < 3) {
      log(`    Review UI not rendered — reloading (${3 - i} left).`, "warn");
      const blk = await gmGoto(page, url, l);
      if (blk.blocked) return false;
    }
  }
  return false;
}

export async function getPlaceReviewsBrowser(
  page,
  place,
  { maxReviews = CONFIG.gm.maxReviews, sort, lang, stopBeforeTs = 0 } = {},
) {
  const l = lang || CONFIG.gm.defaultLang;
  const url = place.link;
  if (!url) return { ok: false, results: [], error: "Place has no link" };

  const reviewUrl = toReviewUrl(url);
  log(`  Opening ${place.name || place.place_id}...`, "highlight");

  let blocked = await gmGoto(page, reviewUrl, l);
  if (blocked.blocked) return { ok: false, results: [], reason: blocked.reason };
  await waitForGMContent(page, 30000);
  const renderOk = await stabilizeReviewsView(page, reviewUrl, l);

  const pageCount = (await readReviewCount(page)) || place.reviews_count || 0;

  let panelOpened = renderOk ? await openReviewsPanel(page, pageCount) : false;
  let reloadBudget = 2;
  while (!panelOpened && reloadBudget > 0) {
    reloadBudget -= 1;
    log(
      `    Reviews panel not opened — reloading place page and retrying (${reloadBudget} left).`,
      "warn",
    );
    const sep = reviewUrl.includes("?") ? "&" : "?";
    const blk = await gmGoto(page, `${reviewUrl}${sep}_xg=${Math.random().toString(36).slice(2)}`, l);
    if (blk.blocked) return { ok: false, results: [], reason: blk.reason };
    await revealReviewsSection(page);
    await waitForGMContent(page, 35000);
    panelOpened = await openReviewsPanel(page, pageCount);
  }
  await applySort(page, sort);

  const postNav = await detectBlockedOnPage(page);
  if (postNav.blocked) return { ok: false, results: [], reason: postNav.reason };

  const initialInDom = await page
    .evaluate(() => document.querySelectorAll("div[data-review-id]").length)
    .catch(() => 0);
  log(`    Initial review cards in DOM: ${initialInDom}`, "info");

  const all = new Map();
  let emptyRounds = 0;
  let retriggerBudget = 3;
  let retriggerWait = 8000;
  const maxRounds = resolveMaxRounds(pageCount);
  log(`    Round budget: ${maxRounds} (total reviews: ${pageCount || "n/a"})`, "info");
  const noGrowthStop = 4;

  const reloadReviewUrl = () => {
    const sep = reviewUrl.includes("?") ? "&" : "?";
    return `${reviewUrl}${sep}_xg=${Math.random().toString(36).slice(2)}`;
  };

  const doRetrigger = async () => {
    retriggerBudget -= 1;
    log("    Feed stalled — reloading reviews URL to re-trigger qv9Egd.", "warn");
    const blk = await gmGoto(page, reloadReviewUrl(), l);
    if (blk.blocked) return false;
    await page.waitForTimeout(retriggerWait);
    retriggerWait = Math.min(retriggerWait + 7000, 30000);
    emptyRounds = 0;
    return true;
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (sessionRoundsUsed >= CONFIG.gm.maxSessionRounds) {
      log(
        `    Session round budget (${CONFIG.gm.maxSessionRounds}) reached — stopping early.`,
        "warn",
      );
      break;
    }
    sessionRoundsUsed += 1;
    await expandAllReviews(page);
    const feed = await scrollReviewFeed(page);
    const atBottom = feed && feed.atBottom;
    const batch = await collectReviewsFromDom(page);
    let added = 0;
    for (const r of batch) {
      const key = r.review_id || `${r.author}|${r.time_label}|${r.text.slice(0, 80)}`;
      if (!all.has(key)) {
        all.set(key, r);
        added += 1;
      }
    }
    if (feed === null && added === 0 && all.size === 0) {
      log("    No scrollable reviews feed found.", "warn");
      break;
    }
    if (added > 0) {
      log(`    round ${round} → +${added} reviews (${all.size} total)`, "info");
      emptyRounds = 0;
      if (atBottom && all.size < 32 && retriggerBudget > 0) {
        log("    Compact feed (early bottom) — extra reload attempt.", "warn");
        if (!(await doRetrigger())) return { ok: false, results: [], reason: "blocked" };
        continue;
      }
    } else {
      emptyRounds += 1;
      if (atBottom) {
        if (all.size < 32 && retriggerBudget > 0 && emptyRounds <= 2) {
          if (!(await doRetrigger())) return { ok: false, results: [], reason: "blocked" };
          continue;
        }
        log(`    round ${round} → +0 reviews (${all.size} total) [bottom]`, "info");
      } else {
        log(`    round ${round} → +0 reviews (${all.size} total) [no-growth]`, "info");
      }
    }
    if (maxReviews > 0 && all.size >= maxReviews) break;

    // Berhenti saat feed sudah melewati batas waktu (butuh sort=newest agar
    // urutannya kronologis). Opt-in lewat stopBeforeTs; default 0 = nonaktif.
    if (stopBeforeTs > 0 && batch.length >= 5) {
      const dated = batch.filter((r) => r.time);
      if (dated.length >= 5) {
        const older = dated.filter((r) => r.time < stopBeforeTs).length;
        const ratio = older / dated.length;
        if (ratio >= 0.9) {
          log(
            `    Batas ${stopBeforeTs} terlampaui (${Math.round(ratio * 100)}% review lebih tua) — berhenti.`,
            "success",
          );
          break;
        }
      }
    }

    if (emptyRounds >= noGrowthStop) {
      log("    Reached end of reviews feed.", "info");
      break;
    }
    await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
  }

  let reviews = Array.from(all.values());
  if (maxReviews > 0) reviews = reviews.slice(0, maxReviews);
  return { ok: true, results: reviews };
}

export async function resolveGoogleMapsShortLink(page, shortUrl) {
  const blocked = await gmGoto(page, shortUrl);
  if (blocked.blocked) return { ok: false, url: null, reason: blocked.reason };
  await page.waitForTimeout(3500);
  const finalUrl = page.url();
  if (!/maps\.google\.com|google\.com\/maps/i.test(finalUrl)) {
    return { ok: false, url: null, reason: "not_maps" };
  }
  return { ok: true, url: finalUrl };
}
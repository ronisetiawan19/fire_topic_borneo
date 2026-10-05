import { CONFIG } from "../config.js";
import { graphqlFetch, getUserByScreenName } from "./api.js";
import { parseTimelineInstructions } from "./parse.js";
import { gotoX, drainApiCapture, waitForApiCapture } from "./capture.js";
import { scrollPage, detectBlocked } from "../browser.js";
import { collectTweetsFromDom } from "./dom.js";
import { log, randomDelay } from "../utils.js";

const SEARCH_PRODUCTS = {
  top: "Top",
  latest: "Latest",
  media: "Media",
};

const SEARCH_TABS = {
  top: "top",
  latest: "live",
  media: "image",
};

export async function searchTweets(
  queryRaw,
  { limit = CONFIG.twitter.searchLimit, product = "top" } = {},
) {
  const query = queryRaw.trim();
  const productType = SEARCH_PRODUCTS[product.toLowerCase()] || "Top";
  const results = [];
  let cursor = "";
  let rounds = 0;
  let emptyRounds = 0;

  log(`Searching tweets: "${query}" (${productType})`, "highlight");

  if (query.startsWith("@")) {
    const userRes = await searchUserTimeline(query, { limit });
    return userRes;
  }

  while (results.length < limit && rounds < CONFIG.twitter.maxRetries + 10) {
    rounds++;

    const variables = {
      rawQuery: query,
      count: 20,
      cursor,
      querySource: "typed_query",
      product: productType,
    };

    const res = await graphqlFetch("SearchTimeline", variables);
    if (!res.ok) {
      if (res.rateLimited) {
        log("Search rate limited, stopping.", "error");
        break;
      }
      log(`Search API error: ${res.error || "unknown"}`, "error");
      break;
    }

    const before = results.length;
    const parsed = parseTimelineInstructions(res.data, "search_by_raw_query");
    results.push(...parsed.tweets);

    log(
      `  cursor=${cursor || "start"} → +${results.length - before} tweets (${results.length} total)`,
      "info",
    );

    if (!parsed.hasMore && !parsed.cursor) break;
    cursor = parsed.cursor || cursor;
    if (results.length === before) {
      emptyRounds += 1;
      if (emptyRounds >= 2) break;
    } else {
      emptyRounds = 0;
    }
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  const unique = dedupe(results).slice(0, limit);
  log(`Found ${unique.length} tweets`, "success");
  return { ok: true, results: unique };
}

export async function searchTweetsBrowser(
  page,
  queryRaw,
  { limit = CONFIG.twitter.searchLimit, product = "top" } = {},
) {
  const query = queryRaw.trim();
  const tab = SEARCH_TABS[product.toLowerCase()] || "top";
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=${tab}`;

  log(`Searching tweets: "${query}" (${product.toLowerCase()})`, "highlight");

  await gotoX(page, url);

  const blocked = await detectBlocked(page);
  if (blocked.blocked) {
    log(`Blocked on search (${blocked.reason}) — cookies may be expired`, "error");
    return { ok: false, reason: blocked.reason, results: [] };
  }

  await waitForApiCapture(page, "SearchTimeline", 15000);

  const results = [];
  let rounds = 0;
  const maxRounds = Math.min(Math.ceil(limit / 20) + 4, 25);

  while (results.length < limit && rounds < maxRounds) {
    rounds++;
    if (rounds > 1) {
      await scrollPage(page, 2, CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
    } else {
      await page.waitForTimeout(2000);
    }

    const before = results.length;
    const captured = await drainApiCapture(page, "SearchTimeline");
    for (const c of captured) {
      const parsed = parseTimelineInstructions(c.body, "search_by_raw_query");
      results.push(...parsed.tweets);
    }
    const domTweets = await collectTweetsFromDom(page);
    results.push(...domTweets);
    const unique = dedupe(results);
    results.length = 0;
    results.push(...unique);

    log(
      `  round ${rounds} → +${results.length - before} tweets (${results.length} total)`,
      "info",
    );

    if (results.length === before && rounds >= 2) {
      await scrollPage(page, 3, CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
      const extra = await drainApiCapture(page, "SearchTimeline");
      const extraBefore = results.length;
      for (const c of extra) {
        const parsed = parseTimelineInstructions(c.body, "search_by_raw_query");
        results.push(...parsed.tweets);
      }
      const domExtra = await collectTweetsFromDom(page);
      results.push(...domExtra);
      const unique2 = dedupe(results);
      results.length = 0;
      results.push(...unique2);
      if (results.length === extraBefore) break;
    }
  }

  const final = dedupe(results).slice(0, limit);
  log(`Found ${final.length} tweets`, "success");
  return { ok: true, results: final };
}

async function searchUserTimeline(username, { limit }) {
  const user = await getUserByScreenName(username.replace(/^@/, ""));
  if (!user.ok) return { ok: false, error: user.error, results: [] };

  const uid = user.data?.result?.rest_id;
  if (!uid) {
    return { ok: false, error: `User not found: ${username}`, results: [] };
  }

  const userTweets = await getUserTweetsByRestId(uid, { limit });
  return { ok: true, results: userTweets.results };
}

async function getUserTweetsByRestId(userId, { limit = CONFIG.twitter.searchLimit } = {}) {
  const results = [];
  let cursor = "";
  let rounds = 0;

  while (results.length < limit && rounds < 15) {
    rounds++;
    const variables = {
      userId,
      count: 20,
      cursor,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    };

    const res = await graphqlFetch("UserTweets", variables);
    if (!res.ok) {
      log(`User tweets error: ${res.error || "unknown"}`, "error");
      break;
    }

    const parsed = parseTimelineInstructions(res.data, "user");
    results.push(...parsed.tweets);

    if (!parsed.hasMore && !parsed.cursor) break;
    cursor = parsed.cursor || cursor;
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  return { results: dedupe(results).slice(0, limit) };
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    if (item.tweet_id && !seen.has(item.tweet_id)) seen.set(item.tweet_id, item);
  }
  return Array.from(seen.values());
}
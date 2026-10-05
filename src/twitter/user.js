import { CONFIG } from "../config.js";
import { graphqlFetch, getUserByScreenName } from "./api.js";
import { parseTimelineInstructions, parseUser } from "./parse.js";
import { gotoX, drainApiCapture, waitForApiCapture } from "./capture.js";
import { scrollPage, detectBlocked } from "../browser.js";
import { collectTweetsFromDom, parseUserFromDom } from "./dom.js";
import { log, randomDelay } from "../utils.js";

export async function getUserInfo(username) {
  const user = await getUserByScreenName(username.replace(/^@/, ""));
  if (!user.ok) {
    return { ok: false, error: user.error, results: null };
  }
  const info = parseUser(user.data?.result);
  if (!info) return { ok: false, error: "User not found", results: null };
  return { ok: true, results: info };
}

export async function getUserTweetsBrowser(
  page,
  username,
  { limit = CONFIG.twitter.searchLimit } = {},
) {
  const name = username.replace(/^@/, "");
  const url = `https://x.com/${name}`;

  log(`Fetching tweets from @${name}...`, "highlight");

  await gotoX(page, url);

  const blocked = await detectBlocked(page);
  if (blocked.blocked) {
    log(`Blocked on @${name} (${blocked.reason}) — cookies may be expired`, "error");
    return { ok: false, reason: blocked.reason, error: blocked.reason, results: [], user: null };
  }

  await waitForApiCapture(page, ["UserTweets", "UserByScreenName", "UserByRestId"], 10000);

  let user = null;
  const results = [];
  let rounds = 0;
  const maxRounds = Math.min(Math.ceil(limit / 20) + 6, 25);
  let lastCount = -1;

  while (results.length < limit && rounds < maxRounds) {
    rounds++;
    if (rounds > 1) {
      await scrollPage(page, 2, CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
    } else {
      await page.waitForTimeout(2500);
    }

    const captured = await drainApiCapture(
      page,
      ["UserTweets", "UserByScreenName", "UserByRestId"],
    );

    for (const c of captured) {
      if (c.op === "UserByScreenName" && !user) {
        user = parseUser(c.body?.data?.user_result_by_screen_name?.result);
      }
      if (c.op === "UserByRestId" && !user) {
        user = parseUser(c.body?.data?.user?.result);
      }
      if (c.op === "UserTweets") {
        const parsed = parseTimelineInstructions(c.body, "user");
        results.push(...parsed.tweets);
      }
    }

    const domTweets = await collectTweetsFromDom(page, { skipPinned: true });
    results.push(...domTweets);

    const unique = dedupe(results);
    results.length = 0;
    results.push(...unique);

    log(
      `  round ${rounds} → ${results.length} tweets (${domTweets.length} from DOM)`,
      "info",
    );

    if (results.length === lastCount && rounds >= 2) break;
    lastCount = results.length;
  }

  if (!user) {
    user = await parseUserFromDom(page, name);
  }

  const final = dedupe(results).slice(0, limit);
  log(`Found ${final.length} tweets from @${name}`, "success");
  return { ok: true, results: final, user };
}

export async function getUserTweets(
  username,
  { limit = CONFIG.twitter.searchLimit } = {},
) {
  const info = await getUserInfo(username);
  if (!info.ok) return { ok: false, error: info.error, results: [] };

  const userId = info.results.user_id;
  const tweets = [];
  let cursor = "";
  let rounds = 0;

  log(`Fetching tweets from @${info.results.username}...`, "highlight");

  while (tweets.length < limit && rounds < 15) {
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
      if (res.rateLimited) {
        log("Rate limited, stopping.", "error");
        break;
      }
      log(`User tweets error: ${res.error || "unknown"}`, "error");
      break;
    }

    const before = tweets.length;
    const parsed = parseTimelineInstructions(res.data, "user");
    tweets.push(...parsed.tweets);

    log(
      `  cursor=${cursor || "start"} → +${tweets.length - before} tweets (${tweets.length} total)`,
      "info",
    );

    if (!parsed.hasMore && !parsed.cursor) break;
    cursor = parsed.cursor || cursor;
    if (tweets.length === before && rounds > 3) break;
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  const unique = dedupe(tweets).slice(0, limit);
  log(`Found ${unique.length} tweets from @${info.results.username}`, "success");
  return { ok: true, results: unique, user: info.results };
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    if (item.tweet_id && !seen.has(item.tweet_id)) seen.set(item.tweet_id, item);
  }
  return Array.from(seen.values());
}
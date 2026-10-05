import { CONFIG } from "../config.js";
import { graphqlFetch } from "./api.js";
import { parseTimelineInstructions, parseTweetResult, parseTweetDetail } from "./parse.js";
import { gotoX, drainApiCapture, waitForApiCapture } from "./capture.js";
import { scrollPage, detectBlocked } from "../browser.js";
import { log, randomDelay } from "../utils.js";

const REPLY_FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: false,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export async function getTweetUrlBrowser(
  page,
  tweetId,
  { includeReplies = true, maxReplies = CONFIG.twitter.maxRepliesPerTweet } = {},
) {
  const url = `https://x.com/i/web/status/${tweetId}`;

  await gotoX(page, url);

  const blocked = await detectBlocked(page);
  if (blocked.blocked) {
    log(`Blocked on tweet ${tweetId} (${blocked.reason}) — cookies may be expired`, "error");
    return { ok: false, reason: blocked.reason, error: blocked.reason, tweet: null, replies: [] };
  }

  await waitForApiCapture(page, ["TweetDetail", "TweetResultByRestId"], 15000);

  if (!includeReplies) {
    const captured = await drainApiCapture(page, ["TweetDetail", "TweetResultByRestId"]);
    let tweet = null;
    for (const c of captured) {
      if (!tweet && c.op === "TweetResultByRestId") {
        tweet = parseTweetResult(c.body?.data?.tweetResult?.result);
      }
      if (!tweet && c.op === "TweetDetail") {
        const detail = parseTweetDetail(c.body);
        tweet = detail.tweet;
      }
    }
    if (!tweet) {
      return { ok: false, error: "Tweet unavailable (paid/deleted).", tweet: null, replies: [] };
    }
    log("  → tweet fetched", "success");
    return { ok: true, tweet, replies: [] };
  }

  const cap = maxReplies || Infinity;
  let tweet = null;
  const replies = [];
  let rounds = 0;
  const maxRounds = maxReplies === 0 ? 12 : Math.min(Math.ceil(maxReplies / 20) + 4, 12);

  while (rounds < maxRounds && replies.length < cap) {
    rounds++;
    if (rounds > 1) {
      await scrollPage(page, 2, CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
    } else {
      await page.waitForTimeout(2000);
    }

    const before = replies.length;
    const captured = await drainApiCapture(page, ["TweetDetail", "TweetResultByRestId"]);

    for (const c of captured) {
      if (!tweet && c.op === "TweetResultByRestId") {
        const t = parseTweetResult(c.body?.data?.tweetResult?.result);
        if (t) tweet = t;
      }
      if (c.op === "TweetDetail") {
        const detail = parseTweetDetail(c.body);
        if (!tweet && detail.tweet) tweet = detail.tweet;
        for (const r of detail.replies) {
          if (!tweet || r.tweet_id !== tweet.tweet_id) replies.push(r);
        }
      }
    }

    const unique = dedupe(replies);
    replies.length = 0;
    replies.push(...unique);

    log(
      `  replies round ${rounds} → +${replies.length - before} (${replies.length} total)`,
      "info",
    );

    if (replies.length === before && rounds >= 2) break;
  }

  if (!tweet) {
    return { ok: false, error: "Tweet unavailable (paid/deleted).", tweet: null, replies: [] };
  }

  const final = replies.slice(0, cap === Infinity ? undefined : cap);
  log(`  → ${final.length} replies`, "success");
  return { ok: true, tweet, replies: final };
}

export async function getTweetReplies(
  tweetId,
  { maxReplies = CONFIG.twitter.maxRepliesPerTweet } = {},
) {
  const cap = maxReplies || Infinity;
  const variables = {
    focalTweetId: tweetId,
    cursor: "",
    referrer: "tweet",
    controller_data: "",
    with_rux_injections: false,
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
    withV2Timeline: true,
  };

  const results = [];
  let cursor = "";
  let rounds = 0;

  while (results.length < cap && rounds < 10) {
    rounds++;
    if (cursor) variables.cursor = cursor;

    const res = await graphqlFetch("TweetDetail", variables, {
      features: REPLY_FEATURES,
    });
    if (!res.ok) {
      if (res.rateLimited) {
        log("Rate limited fetching replies, stopping.", "error");
        break;
      }
      log(`Replies error: ${res.error || "unknown"}`, "error");
      break;
    }

    const before = results.length;
    const parsed = parseTimelineInstructions(res.data, "threaded_conversation");
    results.push(...parsed.tweets);

    log(
      `  replies cursor=${cursor || "start"} → +${results.length - before} (${results.length} total)`,
      "info",
    );

    if (!parsed.hasMore && !parsed.cursor) break;
    cursor = parsed.cursor || cursor;
    if (results.length === before) break;
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  return { ok: true, results: dedupe(results) };
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    if (item.tweet_id && !seen.has(item.tweet_id)) seen.set(item.tweet_id, item);
  }
  return Array.from(seen.values());
}
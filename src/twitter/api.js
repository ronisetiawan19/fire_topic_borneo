import { CONFIG } from "../config.js";
import { log, delay } from "../utils.js";

export const TW_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export const QUERY_IDS = {
  SearchTimeline: "7SQMoe0O7dFRzTJOTYdHWg",
  UserTweets: "5YpEQci22Q63wntb0HDKRA",
  TweetDetail: "3XBTx8zQZ3HaMpLbE2N7KA",
  TweetResultByRestId: "4zM7l8v2VcPzG7H5Kb6PvA",
  UserByScreenName: "3N2UoO1e3zZQ2XfN8lL6mA",
  TweetDetailWithReplies: "H8bttOe0l3iV5f2WcJ7dQw",
};

const OPERATION_NAMES = [
  "SearchTimeline",
  "UserTweets",
  "TweetDetail",
  "TweetResultByRestId",
  "UserByScreenName",
];

export async function refreshQueryIds({ force = false } = {}) {
  if (!force && Object.values(QUERY_IDS).every((v) => v)) return QUERY_IDS;

  log("Discovering X query IDs from web bundles...", "highlight");
  const ua = buildHeaders()["user-agent"];
  try {
    const pageResp = await fetch("https://x.com/home", {
      headers: { "user-agent": ua, accept: "text/html" },
      redirect: "follow",
    });
    const html = await pageResp.text();

    const bundleUrls = new Set();
    const patterns = [
      /https:\/\/abs\.twimg\.com\/[^"'\s]+\.js/g,
      /\/\/abs\.twimg\.com\/[^"'\s]+\.js/g,
      /\/assets\/[^"'\s]+\.js/g,
    ];
    for (const re of patterns) {
      for (const m of html.matchAll(re)) {
        let url = m[0];
        if (url.startsWith("//")) url = `https:${url}`;
        if (url.startsWith("/")) url = `https://x.com${url}`;
        bundleUrls.add(url);
        if (bundleUrls.size >= 12) break;
      }
    }

    for (const url of bundleUrls) {
      const res = await fetch(url, { headers: { "user-agent": ua } });
      if (!res.ok) continue;
      const js = await res.text();
      collectQueryIds(js);
    }

    const found = countFound();
    log(`Query IDs discovered: ${found}/${OPERATION_NAMES.length}`, found >= 3 ? "success" : "warn");
  } catch (err) {
    log(`Query ID discovery failed: ${err.message} — using fallback IDs`, "warn");
  }
  return QUERY_IDS;
}

function collectQueryIds(js) {
  for (const name of OPERATION_NAMES) {
    const fwd = js.match(
      new RegExp(`queryId:"([A-Za-z0-9_.-]+)".{0,120}?operationName:"${name}"`),
    );
    if (fwd) {
      QUERY_IDS[name] = fwd[1];
      continue;
    }
    const bwd = js.match(
      new RegExp(`operationName:"${name}".{0,120}?queryId:"([A-Za-z0-9_.-]+)"`),
    );
    if (bwd) QUERY_IDS[name] = bwd[1];
  }
}

function countFound() {
  return OPERATION_NAMES.filter((name) => QUERY_IDS[name]).length;
}

export const TWEET_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  rweb_sports_post_context_enabled: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
    true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export const TWEET_FIELD_TOGGLE = {
  withArticleRichContentState: false,
  withArticlePlainText: false,
  withGrocerySuperHeroProductImageEnabled: false,
  withGrocerySuperHeroProductImageQuickViewEnabled: false,
  withGrocerySuperHeroProductMetadataEnabled: false,
  withSpaces: true,
  withVoice: true,
};

export function getTwCookies() {
  const { authToken, ct0 } = CONFIG.twitter;
  const cookies = [];
  if (authToken) {
    cookies.push({
      name: "auth_token",
      value: authToken,
      domain: ".x.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  }
  if (ct0) {
    cookies.push({
      name: "ct0",
      value: ct0,
      domain: ".x.com",
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return cookies;
}

export function cookieHeader() {
  return getTwCookies()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function makeTransactionId() {
  const buf = new Uint8Array(69);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

export function buildHeaders({ contentType } = {}) {
  const cookies = getTwCookies();
  const ct0 = cookies.find((c) => c.name === "ct0")?.value || "";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
  const headers = {
    authorization: `Bearer ${TW_BEARER}`,
    "x-csrf-token": ct0,
    cookie: cookieHeader(),
    "user-agent": userAgent,
    accept: "*/*",
    origin: "https://x.com",
    referer: "https://x.com/search?q=keyword&src=typed_query",
    "sec-ch-ua": '"Chromium";v="153", "Not_A Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "x-twitter-client-language": "en",
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "content-type": "application/json",
    "x-client-transaction-id": makeTransactionId(),
  };
  if (contentType) headers["content-type"] = contentType;
  return headers;
}

let lastSuccessAt = 0;

async function paceRequest() {
  const minGap = CONFIG.twitter.minRequestInterval ?? 35000;
  const wait = minGap - (Date.now() - lastSuccessAt);
  if (wait > 0) {
    log(`Pacing request — waiting ${Math.round(wait / 1000)}s to avoid X rate limit`, "warn");
    await delay(wait + 1000);
  }
}

export async function graphqlFetch(
  operationName,
  variables,
  { features = TWEET_FEATURES, fieldToggles = TWEET_FIELD_TOGGLE } = {},
) {
  let queryId = QUERY_IDS[operationName];

  const { twitter } = CONFIG;
  let attempt = 0;
  let refreshed = false;

  while (true) {
    attempt++;
    if (!queryId) {
      await refreshQueryIds({ force: true });
      queryId = QUERY_IDS[operationName];
      if (!queryId) return { ok: false, error: `Unknown operation: ${operationName}` };
    }

    const cleaned = {};
    for (const [k, v] of Object.entries(variables)) {
      if (v === "") continue;
      cleaned[k] = v;
    }

    let url =
      `https://x.com/i/api/graphql/${queryId}/${operationName}` +
      `?variables=${encodeURIComponent(JSON.stringify(cleaned))}` +
      `&features=${encodeURIComponent(JSON.stringify(features))}`;
    if (Object.keys(fieldToggles).length) {
      url += `&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`;
    }

    try {
      await paceRequest();
      const resp = await fetch(url, { headers: buildHeaders() });

      if (resp.status === 429) {
        if (attempt > twitter.maxRetries) {
          return { ok: false, rateLimited: true, status: 429 };
        }
        log(`Rate limited (429) — retry ${attempt}/${twitter.maxRetries}`, "warn");
        await delay(twitter.retryBaseDelay * attempt);
        continue;
      }

      if (resp.status === 401 || resp.status === 403) {
        log(`Auth error (${resp.status}) — cookies may be expired`, "error");
        return { ok: false, status: resp.status, error: "Authentication failed" };
      }

      const body = await resp.text();

      if (resp.status === 404 && body.length === 0) {
        if (attempt > twitter.maxRetries + 6) {
          return { ok: false, rateLimited: true, status: 404 };
        }
        log(
          `X returned empty 404 (disguised rate limit) for ${operationName} — retry ${attempt}/${twitter.maxRetries + 6}`,
          "warn",
        );
        await delay(Math.min(twitter.retryBaseDelay * attempt * 2, 60000));
        continue;
      }

      if (resp.status === 404 && !refreshed) {
        refreshed = true;
        log(`Query ID invalid (404) for ${operationName} — refreshing...`, "warn");
        await refreshQueryIds({ force: true });
        queryId = QUERY_IDS[operationName];
        continue;
      }

      if (!resp.ok) {
        return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
      }

      const data = JSON.parse(body);
      if (data.errors?.length && !data.data) {
        return { ok: false, error: data.errors.map((e) => e.message).join("; ") };
      }
      lastSuccessAt = Date.now();
      if (attempt > 1) log(`Query ID recovered for ${operationName}`, "success");
      return { ok: true, data };
    } catch (err) {
      if (attempt > twitter.maxRetries) {
        return { ok: false, error: err.message };
      }
      await delay(twitter.retryBaseDelay * attempt);
    }
  }
}

export async function getUserByScreenName(username) {
  const res = await graphqlFetch("UserByScreenName", {
    screen_name: username,
  });
  if (!res.ok) return { ok: false, error: res.error, rateLimited: res.rateLimited };
  const result = res.data?.data?.user_result_by_screen_name;
  if (!result) return { ok: false, error: "User not found" };
  return { ok: true, data: result };
}

export async function getTweetById(tweetId) {
  const res = await graphqlFetch("TweetResultByRestId", {
    tweetId,
    includePromotedContent: false,
    withVoice: true,
    withBirdwatchNotes: false,
    withQuickPromoteEligibilityTweetFields: false,
  });
  if (!res.ok) return { ok: false, error: res.error, rateLimited: res.rateLimited };
  const result = res.data?.data?.tweetResult?.result;
  if (!result) return { ok: false, error: "Tweet not found" };
  return { ok: true, data: result };
}

export { delay };
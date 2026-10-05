import { cleanText } from "../utils.js";

export function parseTweetResult(result) {
  if (!result) return null;

  let tweet = result;
  if (result.result) tweet = result.result;
  if (tweet.tweet) tweet = tweet.tweet;

  if (tweet.__typename === "TweetWithVisibilityResults" && tweet.tweet) {
    tweet = tweet.tweet;
  }

  if (tweet.__typename === "TweetPreviewDisplay") return null; // paid content
  if (tweet.__typename === "Label") return null;
  if (!tweet.rest_id && !tweet.legacy) return null;

  const legacy = tweet.legacy || {};
  const core = tweet.core || {};
  const userResult = core.user_results?.result || {};
  const user = userResult.legacy || {};
  const userCore = userResult.core || {};
  const media = parseMedia(legacy.entities?.media, legacy.extended_entities);

  return {
    tweet_id: String(tweet.rest_id || ""),
    text: cleanText(legacy.full_text || tweet.full_text || ""),
    author: user.screen_name || userCore.screen_name || userResult.screen_name || "",
    nickname: user.name || userCore.name || "",
    user_id: String(userResult.rest_id || ""),
    created_at: legacy.created_at || "",
    likes: legacy.favorite_count ?? 0,
    retweets: legacy.retweet_count ?? 0,
    replies: legacy.reply_count ?? 0,
    quotes: legacy.quote_count ?? 0,
    views: parseViews(tweet.views),
    is_retweet: !!legacy.retweeted_status_result,
    retweeted: !!legacy.retweeted,
    is_quote: !!legacy.quoted_status_result,
    quoted_text: parseQuoted(legacy.quoted_status_result),
    media,
    in_reply_to: legacy.in_reply_to_status_id_str || "",
    url: `https://x.com/${user.screen_name || userCore.screen_name || userResult.screen_name || ""}/status/${tweet.rest_id || ""}`.replace(/\/\/(status)/, "/$1"),
    lang: legacy.lang || "",
    type: "tweet",
  };
}

function parseViews(views) {
  if (!views) return 0;
  if (typeof views.count === "string") return Number(views.count) || 0;
  if (typeof views === "string") return Number(views) || 0;
  return 0;
}

function parseMedia(mediaList, extendedMedia) {
  const items = [];
  const candidates = Array.isArray(extendedMedia)
    ? extendedMedia
    : Array.isArray(mediaList)
      ? mediaList
      : [];
  for (const m of candidates) {
    const item = {
      type: m.type || "",
      url: m.media_url_https || m.media_url || "",
      expanded_url: m.expanded_url || "",
      preview: m.video_info?.variants?.[0]?.url || "",
      duration: m.video_info?.duration_millis || 0,
    };
    if (m.type === "video" && m.video_info?.variants) {
      item.variants = m.video_info.variants
        .filter((v) => v.content_type?.includes("video/mp4"))
        .map((v) => ({ bitrate: v.bitrate || 0, url: v.url }));
    }
    if (item.url || item.preview) items.push(item);
  }
  return items;
}

function parseQuoted(quotedStatusResult) {
  if (!quotedStatusResult) return "";
  const quoted = parseTweetResult(quotedStatusResult.result || quotedStatusResult);
  return quoted?.text || "";
}

function resolveTimeline(data, field) {
  const root = data?.data || data || {};

  if (field === "search_by_raw_query") {
    return (
      root.search_by_raw_query?.search_timeline?.timeline ||
      root.search_by_raw_query?.timeline ||
      root.search_by_raw_query
    );
  }

  if (field === "user") {
    return (
      root.user?.result?.timeline_v2?.timeline ||
      root.user?.timeline_v2?.timeline ||
      root.user?.result?.timeline?.timeline ||
      root.user?.timeline?.timeline ||
      root.user
    );
  }

  if (field === "threaded_conversation") {
    return (
      root.threaded_conversation_with_injections_v2?.timeline ||
      root.threaded_conversation_with_injections_v2 ||
      root.threaded_conversation?.timeline ||
      root.threaded_conversation
    );
  }

  const leaf = root[field];
  return leaf?.timeline || leaf;
}

export function parseTimelineInstructions(data, field = "tweet") {
  const tweets = [];
  let cursor = null;
  let hasMore = false;

  const timeline = resolveTimeline(data, field);
  const instructions = timeline?.instructions || [];

  for (const instruction of instructions) {
    if (instruction.type === "TimelineAddEntries") {
      for (const entry of instruction.entries || []) {
        if (entry.entryId?.startsWith("cursor-")) {
          const content = entry.content;
          const value = content?.value;
          const cursorType = content?.cursorType;
          if (cursorType === "Bottom" || cursorType === "ShowMore") {
            cursor = value || cursor;
            hasMore = cursorType === "Bottom" || hasMore;
          }
          continue;
        }

        let result = null;
        const content = entry.content;
        if (content?.entryType === "TimelineTimelineItem") {
          result = content.itemContent?.tweet_results?.result;
        } else if (content?.entryType === "TimelineTimelineModule") {
          for (const item of content.items || []) {
            const ir = item.item?.itemContent?.tweet_results?.result;
            if (ir) {
              const t = parseTweetResult(ir);
              if (t) tweets.push(t);
            }
          }
          continue;
        }

        if (result) {
          const tweet = parseTweetResult(result);
          if (tweet) tweets.push(tweet);
        }
      }
    } else if (
      instruction.type === "TimelineReplaceEntry" ||
      instruction.type === "TimelinePinEntry"
    ) {
      const entry = instruction.entry;
      if (entry?.entryId === "cursor-bottom" || entry.entryId?.startsWith("cursor-bottom-")) {
        cursor = entry.content?.value || cursor;
      }
    }
  }

  return { tweets, cursor, hasMore };
}

export function parseTweetDetail(body) {
  const root = body?.data || {};
  const conv =
    root.threaded_conversation_with_injections_v2 ||
    root.threaded_conversation;
  const instructions = conv?.timeline?.instructions || conv?.instructions || [];

  const tweets = [];
  let focal = null;

  const push = (result, entryId, displayType) => {
    const t = parseTweetResult(result);
    if (!t) return;
    const isFocal =
      !focal &&
      (entryId?.startsWith("conversationthread-") ||
        entryId?.startsWith("profile-conversation-") ||
        displayType === "SelfThread");
    if (isFocal) focal = t;
    else tweets.push(t);
  };

  for (const instr of instructions) {
    if (instr.type === "TimelinePinEntry") {
      const result = instr.entry?.content?.itemContent?.tweet_results?.result;
      const t = parseTweetResult(result);
      if (t && !focal) focal = t;
      continue;
    }
    if (instr.type !== "TimelineAddEntries") continue;

    for (const entry of instr.entries || []) {
      const content = entry.content;
      if (content?.entryType === "TimelineTimelineItem") {
        push(content.itemContent?.tweet_results?.result, entry.entryId);
      } else if (content?.entryType === "TimelineTimelineModule") {
        for (const item of content.items || []) {
          const ic = item.item?.itemContent;
          push(ic?.tweet_results?.result, entry.entryId, ic?.tweetDisplayType);
        }
      }
    }
  }

  return { tweet: focal, replies: tweets };
}

export function extractCursorFromBottom(data) {
  const cursor = data?.data?.search_by_raw_query?.search_timeline?.timeline
    ?.bottom?.content?.cursorContent;
  if (cursor?.cursorType === "Bottom") {
    return { cursor: cursor.value, hasMore: true };
  }
  return { cursor: null, hasMore: false };
}

export function parseUser(userResult) {
  if (!userResult) return null;
  const legacy = userResult.legacy || {};
  const core = userResult.core || {};
  return {
    user_id: String(userResult.rest_id || ""),
    username: legacy.screen_name || core.screen_name || userResult.screen_name || "",
    nickname: legacy.name || core.name || "",
    bio: cleanText(legacy.description || ""),
    followers: legacy.followers_count ?? 0,
    following: legacy.friends_count ?? 0,
    tweets_count: legacy.statuses_count ?? 0,
    verified: legacy.verified ?? false,
    blue_verified: userResult.is_blue_verified ?? false,
    location: legacy.location || "",
    joined: legacy.created_at || core.created_at || "",
    profile_image: legacy.profile_image_url_https || userResult.avatar?.image_url || "",
    url: `https://x.com/${legacy.screen_name || core.screen_name || userResult.screen_name || ""}`,
  };
}

export function cleanTweetText(text) {
  return cleanText(text)
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

export { cleanText };
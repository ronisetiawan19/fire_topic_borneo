import { CONFIG } from "../config.js";
import { getEngine } from "./engine.js";
import { parseCount, parseRelativeTime } from "./yt-utils.js";
import { log } from "../utils.js";

function engineMap(c, videoId, type, parentId) {
  return {
    comment_id: String(c.comment_id || ""),
    author: c.author?.id || "",
    nickname: (c.author?.name || "").replace(/^@/, ""),
    text: c.content?.toString() || "",
    likes: parseCount(c.like_count?.toString()),
    replies: parseCount(c.reply_count?.toString()),
    time: parseRelativeTime(c.published_time || ""),
    video_id: String(videoId),
    type,
    parent_comment_id: String(parentId),
  };
}

async function threadReplies(videoId, thread, cap) {
  const replies = [];
  const rootId = thread.comment?.comment_id || "";
  if (!rootId || !thread.has_replies) return replies;

  let cursor = thread;
  if (!cursor.replies) {
    cursor = await cursor.getReplies();
  }

  while (replies.length < cap && cursor) {
    for (const rt of cursor.replies || []) {
      if (replies.length >= cap) break;
      const rc = rt?.comment;
      if (rc?.comment_id) replies.push(engineMap(rc, videoId, "reply", rootId));
    }
    if (cursor.has_continuation) {
      cursor = await cursor.getContinuation();
    } else {
      break;
    }
  }

  return replies;
}

export async function getComments(
  videoId,
  { maxComments = CONFIG.maxCommentsPerVideo, includeReplies = true } = {},
) {
  const cap = maxComments || Infinity;
  const comments = [];

  try {
    const eng = getEngine();
    let page = await eng.getComments(videoId);
    let rounds = 0;

    while (page?.contents?.length && comments.length < cap && rounds < CONFIG.yt.maxContinuationRounds) {
      rounds++;

      for (const thread of page.contents) {
        if (comments.length >= cap) break;
        const c = thread?.comment;
        if (!c?.comment_id) continue;

        comments.push(engineMap(c, videoId, "comment", ""));

        if (includeReplies && thread?.has_replies) {
          const replies = await threadReplies(videoId, thread, cap - comments.length);
          comments.push(...replies);
        }
      }

      if (comments.length >= cap || !page.has_continuation) break;
      page = await page.getContinuation();
    }
  } catch (err) {
    log(`Comment error for ${videoId}: ${err.message}`, "error");
    return { ok: false, reason: err.message, comments: [] };
  }

  const replyCount = comments.filter((c) => c.type === "reply").length;
  if (replyCount) log(`  → replies collected: ${replyCount}`, "info");

  return { ok: true, comments };
}

export async function getVideoMetaYt(videoId) {
  try {
    const eng = getEngine();
    const info = await eng.getBasicInfo(videoId);
    const basic = info?.basic_info || info || {};
    const views = basic.view_count ?? 0;
    const authorIsString = typeof basic.author === "string";
    return {
      video_id: videoId,
      title: basic.title || "",
      author: authorIsString ? "" : basic.author?.id || "",
      nickname: authorIsString ? basic.author : (basic.author?.name || "").replace(/^@/, ""),
      channel_id: authorIsString ? "" : basic.author?.id || "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      views,
      stats: { play: views || 0, like: 0, share: 0, comment: null },
    };
  } catch {
    return null;
  }
}
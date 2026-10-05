import { CONFIG } from "../config.js";
import { loadCookies } from "../cookies.js";
import { log, delay, cleanText } from "../utils.js";

let headersCache = null;

function buildHeaders() {
  if (headersCache) return headersCache;
  const cookieResult = loadCookies(CONFIG.cookieFile);
  headersCache = {
    accept: "application/json, text/plain, */*",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    referer: "https://www.tiktok.com/",
    "x-secsdk-csrf-token": "",
    ...(cookieResult.ok
      ? { cookie: cookieResult.cookies.map((c) => `${c.name}=${c.value}`).join("; ") }
      : {}),
  };
  const csrf = cookieResult.cookies.find((c) => c.name === "tt_csrf_token");
  if (csrf) {
    headersCache["x-secsdk-csrf-token"] = csrf.value;
  }
  return headersCache;
}

export async function apiGet(url, { retries = CONFIG.maxRetries } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const resp = await fetch(url, { headers: buildHeaders() });
      if (resp.status === 429 || resp.status === 403 || resp.status === 401) {
        if (attempt > retries) {
          return { status: resp.status, data: null, rateLimited: true };
        }
        log(`Rate limited / auth error (${resp.status}) — retry ${attempt}/${retries}`, "warn");
        await delay(CONFIG.retryBaseDelay * attempt);
        continue;
      }
      if (!resp.ok) {
        return { status: resp.status, data: null };
      }
      const data = await resp.json();
      return { status: resp.status, data };
    } catch (err) {
      if (attempt > retries) {
        return { status: 0, data: null, error: err.message };
      }
      await delay(CONFIG.retryBaseDelay * attempt);
    }
  }
}

export function mapComment(comment, videoId, type = "comment", parentId = "") {
  const user = comment.user || {};
  const stats = comment.stats || {};
  return {
    comment_id: String(comment.cid ?? comment.comment_id ?? ""),
    author: user.unique_id ?? user.uniqueId ?? "",
    nickname: user.nickname ?? user.nickName ?? "",
    text: cleanText(comment.text),
    likes: stats.digg_count ?? comment.digg_count ?? 0,
    replies: comment.reply_comment_total ?? comment.reply_total ?? 0,
    time: comment.create_time ?? 0,
    video_id: String(videoId),
    type,
    parent_comment_id: String(parentId),
  };
}

export async function fetchCommentsPage(videoId, cursor = 0, count = 50) {
  const url = `https://www.tiktok.com/api/comment/list/?aid=1988&aweme_id=${videoId}&count=${count}&cursor=${cursor}&sort_by=0`;
  const { status, data } = await apiGet(url);
  if (!data) return { ok: false, status, data: null };
  return { ok: true, status, data };
}

export async function fetchRepliesPage(videoId, commentId, cursor = 0, count = 20) {
  const url = `https://www.tiktok.com/api/comment/list/reply/?aid=1988&item_id=${videoId}&comment_id=${commentId}&count=${count}&cursor=${cursor}`;
  const { status, data } = await apiGet(url);
  if (!data) return { ok: false, status, data: null };
  return { ok: true, status, data };
}

export async function getVideoMeta(videoId) {
  const url = `https://www.tiktok.com/api/item/detail/?aid=1988&itemId=${videoId}&translate=0`;
  const { status, data } = await apiGet(url, { retries: 1 });
  if (!data?.itemInfo?.itemStruct) return null;
  const item = data.itemInfo.itemStruct;
  return {
    video_id: String(item.aweme_id ?? videoId),
    author: item.author?.unique_id ?? "",
    nickname: item.author?.nickname ?? "",
    description: item.desc ?? "",
    create_time: item.create_time ?? 0,
    stats: {
      play: item.stats?.play_count ?? 0,
      like: item.stats?.digg_count ?? 0,
      comment: item.stats?.comment_count ?? 0,
      share: item.stats?.share_count ?? 0,
    },
    url: `https://www.tiktok.com/@${item.author?.unique_id ?? ""}/video/${videoId}`,
  };
}
import { CONFIG } from "../config.js";
import { resetPage, detectBlocked } from "../browser.js";
import { log, delay } from "../utils.js";

function extractVideoFromItem(item) {
  if (!item) return null;
  const awemeId = item.aweme_id || item.id || item.awemeId;
  if (!awemeId) return null;

  const author = item.author || {};
  const stats = item.stats || {};
  const uniqueId = author.unique_id || author.uniqueId || "";

  return {
    video_id: String(awemeId),
    author: uniqueId,
    nickname: author.nickname || author.nickName || "",
    description: item.desc || "",
    create_time: item.create_time || item.createTime || 0,
    stats: {
      play: stats.play_count ?? stats.playCount ?? 0,
      like: stats.digg_count ?? stats.diggCount ?? 0,
      comment: stats.comment_count ?? stats.commentCount ?? 0,
      share: stats.share_count ?? stats.shareCount ?? 0,
    },
    url: `https://www.tiktok.com/@${uniqueId}/video/${awemeId}`,
  };
}

function parseSearchData(data, results) {
  if (!Array.isArray(data)) return 0;
  let added = 0;
  for (const entry of data) {
    if (entry.type === 62 || entry.type === 3001) continue;
    const src = entry.item || entry.aweme_info || entry;
    const v = extractVideoFromItem(src);
    if (v) {
      results.push(v);
      added++;
    }
  }
  return added;
}

export async function searchVideos(
  page,
  query,
  { limit = CONFIG.defaultLimit } = {},
) {
  const trimmed = query.trim();
  const isHashtag = trimmed.startsWith("#");
  const cleanQuery = trimmed.replace(/^#/, "");
  const keyword = isHashtag ? trimmed : cleanQuery;

  const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(cleanQuery)}`;
  log(
    `${isHashtag ? "Hashtag" : "Keyword"} search: "${cleanQuery}"`,
    "highlight",
  );

  await resetPage(page, searchUrl);

  const { blocked } = await detectBlocked(page);
  if (blocked) {
    return { ok: false, reason: blocked, results: [] };
  }

  await warmupSdk(page);

  const results = [];
  let cursor = 0;
  let has_more = true;
  let rounds = 0;
  let emptyRounds = 0;
  const maxRounds = Math.ceil(limit / 30) + 3;

  while (has_more && results.length < limit && rounds < maxRounds) {
    rounds++;
    if (rounds > 1) await delay(900);

    const resp = await signedSearchFetch(page, keyword, cursor);

    if (resp.error) {
      log(`Search API error: ${resp.error}`, "error");
      break;
    }
    if (resp.status_code !== 0) {
      log(`Search API: ${resp.status_msg || `status_code=${resp.status_code}`}`, "warn");
      break;
    }

    const before = results.length;
    parseSearchData(resp.data, results);
    log(
      `  cursor=${cursor} → +${results.length - before} videos (${results.length} total)`,
      "info",
    );

    has_more = resp.has_more && resp.data.length > 0;
    cursor = resp.cursor;
    if (results.length === before) {
      emptyRounds += 1;
      if (emptyRounds >= 2) break;
    } else {
      emptyRounds = 0;
    }
  }

  const unique = dedupe(results).slice(0, limit);
  log(`Found ${unique.length} unique videos`, "success");
  return { ok: true, results: unique, isHashtag };
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    if (!seen.has(item.video_id)) seen.set(item.video_id, item);
  }
  return Array.from(seen.values());
}

async function signedSearchFetch(page, keyword, cursor) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const resp = await page.evaluate(
      async ({ k, c }) => {
        try {
          const r = await fetch(
            `/api/search/general/full/?aid=1988&keyword=${encodeURIComponent(k)}&cursor=${c}&count=30`,
            { credentials: "include" },
          );
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const txt = await r.text();
          if (!txt.length) return { error: "empty body" };
          const d = JSON.parse(txt);
          return {
            data: d.data || [],
            has_more: !!d.has_more,
            cursor: d.cursor ?? c + 30,
            status_code: d.status_code,
            status_msg: d.status_msg,
          };
        } catch (err) {
          return { error: err.message };
        }
      },
      { k: keyword, c: cursor },
    );
    if (!resp.error) return resp;
    if (attempt < 4) await delay(1200 * attempt);
  }
  return { error: "signature SDK did not initialize" };
}

async function warmupSdk(page) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const ready = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/search/general/full/?aid=1988&keyword=a&cursor=0&count=1", {
          credentials: "include",
        });
        const txt = await r.text();
        return txt.length > 100;
      } catch {
        return false;
      }
    });
    if (ready) return;
    await delay(1500);
  }
  log("SDK not warming up, proceeding anyway", "warn");
}
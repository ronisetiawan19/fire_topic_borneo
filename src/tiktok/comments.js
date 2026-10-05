import { CONFIG } from "../config.js";
import {
  fetchCommentsPage,
  fetchRepliesPage,
  mapComment,
} from "./api.js";
import { cleanText, randomDelay, log } from "../utils.js";

export async function scrapeCommentsByApi(
  videoId,
  { maxComments = CONFIG.maxCommentsPerVideo, includeReplies = true } = {},
) {
  const comments = [];
  let cursor = 0;
  let hasMore = true;
  const cap = maxComments || Infinity;
  const maxRounds = 400;

  for (let round = 0; round < maxRounds && hasMore && comments.length < cap; round++) {
    if (round > 0) {
      await randomDelay(CONFIG.paginationDelayMin, CONFIG.paginationDelayMax);
    }

    const { ok, status, data } = await fetchCommentsPage(videoId, cursor);
    if (!ok || !data) {
      log(
        `Comment list API failed (${status || "network"}) for video ${videoId} at cursor=${cursor}`,
        "error",
      );
      break;
    }

    const batch = data.comments || [];
    for (const c of batch) {
      if (!c?.cid) continue;
      comments.push(mapComment(c, videoId));
      if (comments.length >= cap) break;
    }

    hasMore = !!data.has_more && batch.length > 0;
    cursor = data.cursor ?? cursor + batch.length;
    if (batch.length === 0) break;
  }

  if (includeReplies) {
    const replies = await scrapeRepliesByApi(videoId, comments);
    comments.push(...replies);
  }

  return { ok: true, comments };
}

export async function scrapeRepliesByApi(videoId, rootComments) {
  const replies = [];
  const withReplies = rootComments.filter((c) => c.replies > 0);

  if (withReplies.length) {
    log(
      `${withReplies.length}/${rootComments.length} comments have replies`,
      "info",
    );
  }

  for (const comment of withReplies) {
    const before = replies.length;
    let cursor = 0;
    let hasMore = true;
    let safeRounds = 0;

    while (hasMore && safeRounds < 30) {
      safeRounds++;
      if (safeRounds > 1) {
        await randomDelay(500, 1000);
      }
      const { ok, data } = await fetchRepliesPage(videoId, comment.comment_id, cursor);
      if (!ok || !data) break;

      const batch = data.comments || [];
      for (const r of batch) {
        if (!r?.cid) continue;
        replies.push(mapComment(r, videoId, "reply", comment.comment_id));
      }
      hasMore = !!data.has_more && batch.length > 0;
      cursor = data.cursor ?? cursor + batch.length;
      if (batch.length === 0) break;
    }

    const got = replies.length - before;
    log(
      `  Replies for @${comment.author} "${comment.text.slice(0, 36)}${comment.text.length > 36 ? "…" : ""}": ${got}/${comment.replies}`,
      "info",
    );
  }

  return replies;
}

import { setupResponseCapture, resetPage, detectBlocked, scrollPage } from "../browser.js";
import { delay } from "../utils.js";

export async function scrapeCommentsBrowser(
  page,
  videoId,
  { maxComments = CONFIG.maxCommentsPerVideo, includeReplies = true } = {},
) {
  const url = `https://www.tiktok.com/@_/video/${videoId}`;
  const captured = setupResponseCapture(page);
  const comments = [];

  log(`Browser fallback: scraping comments for video ${videoId}...`, "highlight");

  await resetPage(page, url);
  const { blocked } = await detectBlocked(page);
  if (blocked) return { ok: false, reason: blocked, comments: [] };

  await scrollPage(page, 2, 600, 1000);
  await delay(2000);

  const cap = maxComments || Infinity;
  let stall = 0;

  for (let round = 0; round < 40 && comments.length < cap; round++) {
    const before = comments.length;
    for (const r of captured.comments) {
      try {
        if (r.body?.comments) {
          for (const c of r.body.comments) {
            if (!c?.cid) continue;
            comments.push(mapComment(c, videoId));
          }
        }
      } catch {}
    }
    captured.comments.length = 0;

    await scrollPage(page, 2, 800, 1400);
    await randomDelay(CONFIG.paginationDelayMin, CONFIG.paginationDelayMax);

    if (comments.length === before) {
      stall++;
      if (stall >= 3) break;
    } else {
      stall = 0;
    }
  }

  if (includeReplies) {
    const replies = await scrapeRepliesByApi(videoId, comments);
    comments.push(...replies);
  }

  return { ok: true, comments };
}
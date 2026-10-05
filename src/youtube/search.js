import { CONFIG } from "../config.js";
import { getEngine } from "./engine.js";
import { parseCount } from "./yt-utils.js";
import { log, randomDelay } from "../utils.js";

function extractVideo(node, query) {
  const play = parseCount(node.view_count?.toString());
  return {
    video_id: node.video_id,
    title: node.title?.toString() || "",
    author: node.author?.id || "",
    nickname: (node.author?.name || "").replace(/^@/, ""),
    channel_id: node.author?.id || "",
    duration: node.duration?.seconds || 0,
    duration_text: node.length_text?.toString() || node.duration?.text || "",
    published: node.published?.toString() || "",
    views: play,
    likes: 0,
    comments: 0,
    type: "video",
    query,
    url: `https://www.youtube.com/watch?v=${node.video_id}`,
    stats: { play, like: 0, share: 0, comment: null },
  };
}

export async function searchVideosYt(queryRaw, { limit = CONFIG.defaultLimit } = {}) {
  const query = queryRaw.replace(/^#/, "");
  const eng = getEngine();
  const results = [];

  try {
    let search = await eng.search(query, { type: "video" });
    let rounds = 0;

    while (results.length < limit && rounds < CONFIG.yt.maxSearchRounds) {
      rounds++;
      for (const node of search.results || []) {
        if (!node?.video_id) continue;
        results.push(extractVideo(node, queryRaw));
        if (results.length >= limit) break;
      }

      if (results.length >= limit || !search.has_continuation) break;
      await randomDelay(700, 1200);
      search = await search.getContinuation();
    }
  } catch (err) {
    log(`Search error for "${queryRaw}": ${err.message}`, "error");
    return { ok: false, error: err.message, results: [] };
  }

  if (!results.length) {
    log(`No video results for "${queryRaw}"`, "warn");
  }

  return { ok: true, results };
}
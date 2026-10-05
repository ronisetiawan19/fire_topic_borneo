import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";
import { todayStamp, sanitizeFilename } from "./utils.js";

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function exportJson(data, filepath) {
  ensureDir(path.dirname(filepath));
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  return filepath;
}

export function exportCsv(comments, filepath, author) {
  ensureDir(path.dirname(filepath));
  if (!comments.length) {
    writeFileSync(filepath, "", "utf-8");
    return filepath;
  }

  const headers = [
    "comment_id",
    "author",
    "nickname",
    "text",
    "likes",
    "replies",
    "time",
    "video_id",
    "type",
    "parent_comment_id",
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...comments.map((c) =>
      headers.map((h) => escape(c[h]?? (c[`comment_${h}`] ?? ""))).join(","),
    ),
  ];

  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
  return filepath;
}

export function buildOutputPath(baseName, extension, outputDir) {
  const safe = sanitizeFilename(baseName);
  return path.join(
    outputDir ?? CONFIG.outputDir,
    `${safe}_${todayStamp()}.${extension}`,
  );
}

export function makeSummary(videos, comments, meta) {
  const totalComments = comments.filter((c) => c.type === "comment").length;
  const totalReplies = comments.filter((c) => c.type === "reply").length;

  const byVideo = new Map();
  for (const c of comments) {
    if (!byVideo.has(c.video_id)) byVideo.set(c.video_id, []);
    byVideo.get(c.video_id).push(c);
  }

  return {
    ...meta,
    scraped_at: new Date().toISOString(),
    total_videos: videos.length,
    total_comments: totalComments,
    total_replies: totalReplies,
    total_records: comments.length,
    comments,
    videos: videos.map((v) => ({
      ...v,
      comments: byVideo.get(v.video_id) || [],
    })),
  };
}
#!/usr/bin/env bun
import { program } from "commander";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { initYt } from "./youtube/engine.js";
import { searchVideosYt } from "./youtube/search.js";
import { getComments, getVideoMetaYt } from "./youtube/comments.js";
import { exportJson, exportCsv, buildOutputPath, makeSummary } from "./exporter.js";
import { log, randomDelay, parseYoutubeVideoId } from "./utils.js";

function banner() {
  console.log(`
  ╭───────────────────────────────────────────╮
  │         YouTube Comment Scraper           │
  │         Bun · InnerTube · f=json|csv      │
  ╰───────────────────────────────────────────╯
  `);
}

async function scrapeVideo(video, opts) {
  if (video.stats?.comment === 0) {
    log(`Skipping @${video.nickname || video.video_id}: 0 comments`, "info");
    return [];
  }
  log(`Scraping @${video.nickname || "?"} video ${video.video_id}...`, "highlight");
  const result = await getComments(video.video_id, {
    maxComments: opts.maxComments,
    includeReplies: opts.includeReplies,
  });
  if (!result.ok) {
    log(`Failed: ${result.reason || "unknown"}`, "error");
    return [];
  }
  if (result.disabled) {
    log(`Skipping @${video.nickname || video.video_id}: comments disabled`, "info");
    return [];
  }
  const replies = result.comments.filter((c) => c.type === "reply").length;
  log(
    `  → ${result.comments.length} comments${opts.includeReplies && replies ? ` (${replies} replies)` : ""}`,
    "success",
  );
  return result.comments;
}

async function scrapeFlow({ query, output, limit, includeReplies, outputFormat, maxComments }) {
  banner();
  log("Starting YouTube scraper...", "highlight");
  await initYt();

  const allVideos = [];
  const allComments = [];

  for (const q of query) {
    const { ok, results } = await searchVideosYt(q, { limit });
    if (!ok) {
      log(`Search failed for "${q}"`, "error");
      continue;
    }
    log(`Processing ${results.length} videos for "${q}"`, "highlight");

    for (let i = 0; i < results.length; i++) {
      const v = results[i];
      const comments = await scrapeVideo(v, { maxComments, includeReplies });
      allComments.push(...comments);
      allVideos.push(v);
      await randomDelay(CONFIG.videoDelayMin, CONFIG.videoDelayMax);
    }

    if (q !== query[query.length - 1]) {
      await randomDelay(4000, 7000);
    }
  }

  if (!allComments.length) {
    log("No comments collected.", "warn");
    return;
  }

  const baseName =
    query.length > 1 ? "yt_multi" : `yt_${query[0].replace(/^#/, "").replace(/\s+/g, "_").toLowerCase()}`;
  writeOutputs(baseName, allVideos, allComments, { query }, output, outputFormat);
}

async function urlFlow({ urls, output, includeReplies, outputFormat, maxComments }) {
  banner();
  log("Starting YouTube URL scrape...", "highlight");
  await initYt();

  const videos = [];
  const allComments = [];

  for (const url of urls) {
    const videoId = parseYoutubeVideoId(url);
    if (!videoId) {
      log(`Could not parse video ID from: ${url}`, "error");
      continue;
    }
    log(`Video ID: ${videoId}`, "highlight");

    const meta = await getVideoMetaYt(videoId);
    const video = meta || {
      video_id: videoId,
      title: "",
      nickname: "",
      author: "",
      stats: {},
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };

    const comments = await scrapeVideo(video, { maxComments, includeReplies });
    allComments.push(...comments);
    if (video.video_id) videos.push(video);
    await randomDelay(CONFIG.videoDelayMin, CONFIG.videoDelayMax);
  }

  if (!allComments.length) {
    log("No comments collected.", "warn");
    return;
  }

  const baseName =
    urls.length === 1 ? `video_${videos[0]?.video_id || "single"}` : "yt_videos";
  writeOutputs(baseName, videos, allComments, { source: "urls" }, output, outputFormat);
}

function writeOutputs(baseName, videos, comments, meta, output, outputFormat) {
  const jsonPath = buildOutputPath(baseName, "json", output);
  exportJson(makeSummary(videos, comments, meta), jsonPath);
  log(`JSON saved → ${jsonPath}`, "success");

  if (outputFormat === "csv" || outputFormat === "both") {
    const csvPath = buildOutputPath(baseName, "csv", output);
    exportCsv(comments, csvPath);
    log(`CSV saved → ${csvPath}`, "success");
  }
}

program
  .name("youtube-scraper")
  .description("YouTube comment scraper — keyword, hashtag, and direct URL")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.youtube)
  .option("-f, --format <format>", "output format: json, csv, both", "json");

program
  .command("scrape")
  .description("Scrape comments by keyword or hashtag")
  .argument("<inputs...>", "one or more keywords or #hashtags")
  .option("-l, --limit <n>", "max videos per input", parseInt, CONFIG.defaultLimit)
  .option("--max-comments <n>", "max comments per video (0 = unlimited)", parseInt, CONFIG.maxCommentsPerVideo)
  .option("--no-replies", "skip reply scraping")
  .action(async (inputs, opts) => {
    const options = program.opts();
    await scrapeFlow({
      query: inputs,
      limit: opts.limit,
      includeReplies: opts.replies !== false,
      maxComments: opts.maxComments,
      output: options.output,
      outputFormat: options.format,
    });
  });

program
  .command("url")
  .description("Scrape comments from one or more YouTube video URLs")
  .argument("<urls...>")
  .option("--no-replies", "skip reply scraping")
  .option("--max-comments <n>", "max comments per video", parseInt, CONFIG.maxCommentsPerVideo)
  .action(async (urls, opts) => {
    const options = program.opts();
    await urlFlow({
      urls,
      includeReplies: opts.replies !== false,
      maxComments: opts.maxComments,
      output: options.output,
      outputFormat: options.format,
    });
  });

program.parse();
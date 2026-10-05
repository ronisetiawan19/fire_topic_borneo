#!/usr/bin/env bun
import { program } from "commander";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { createBrowser } from "./browser.js";
import { searchVideos } from "./tiktok/search.js";
import { scrapeCommentsByApi, scrapeCommentsBrowser } from "./tiktok/comments.js";
import { getVideoMeta } from "./tiktok/api.js";
import { exportJson, exportCsv, buildOutputPath, makeSummary } from "./exporter.js";
import { log, randomDelay, readableNumber, parseVideoIdFromUrl } from "./utils.js";

function banner() {
  console.log(`
  ╭─────────────────────────────────────────╮
  │          TikTok Comment Scraper         │
  │            Bun + Playwright             │
  ╰─────────────────────────────────────────╯
  `);
}

async function scrapeVideo(video, opts) {
  if (video.stats?.comment === 0) {
    log(`Skipping @${video.author || video.video_id}: 0 comments`, "info");
    return [];
  }
  log(
    `Scraping @${video.author || "?"} video ${video.video_id}...`,
    "highlight",
  );
  let result;
  if (opts.mode === "browser") {
    result = await scrapeCommentsBrowser(opts.page, video.video_id, {
      maxComments: opts.maxComments,
      includeReplies: opts.includeReplies,
    });
  } else {
    result = await scrapeCommentsByApi(video.video_id, {
      maxComments: opts.maxComments,
      includeReplies: opts.includeReplies,
    });
  }
  if (!result.ok) {
    log(`Failed: ${result.reason || "unknown"}`, "error");
    return [];
  }
  log(
    `  → ${result.comments.length} comments${opts.includeReplies ? ` (${result.comments.filter((c) => c.type === "reply").length} replies)` : ""}`,
    "success",
  );
  return result.comments;
}

async function scrapeFlow({
  query,
  output,
  limit,
  includeReplies,
  outputFormat,
  headless,
  maxComments,
  mode,
}) {
  banner();
  log("Starting TikTok scraper...", "highlight");

  const common = { includeReplies, maxComments, mode };
  const { browser, page } = await createBrowser({ headless });
  const allVideos = [];
  const allComments = [];

  try {
    for (const q of query) {
      const result = await searchVideos(page, q, { limit });
      if (!result.ok) {
        log(`Search failed for "${q}": ${result.reason}`, "error");
        continue;
      }

      const videos = result.results;
      log(`Processing ${videos.length} videos for "${q}"`, "highlight");

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        log(
          `[${i + 1}/${videos.length}] @${v.author}: ${readableNumber(v.stats?.comment)} comments`,
          "info",
        );
        const comments = await scrapeVideo(v, { ...common, page });
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

    const baseName = getBaseName(query[0] ?? "tiktok", query.length > 1);
    writeOutputs(baseName, allVideos, allComments, { query }, output, outputFormat);
  } finally {
    await browser.close();
  }
}

async function urlFlow({
  urls,
  output,
  includeReplies,
  outputFormat,
  maxComments,
}) {
  banner();
  log("Starting URL scrape...", "highlight");

  const videos = [];
  const allComments = [];

  for (const url of urls) {
    const videoId = parseVideoIdFromUrl(url);
    if (!videoId) {
      log(`Could not parse video ID from: ${url}`, "error");
      continue;
    }
    log(`Video ID: ${videoId}`, "highlight");

    const meta = await getVideoMeta(videoId);
    const video = meta || {
      video_id: videoId,
      author: "",
      nickname: "",
      description: "",
      stats: {},
      url,
    };

    const comments = await scrapeVideo(video, {
      includeReplies,
      maxComments,
      mode: "api",
    });
    allComments.push(...comments);

    if (video.video_id) videos.push(video);
    await randomDelay(CONFIG.videoDelayMin, CONFIG.videoDelayMax);
  }

  if (!allComments.length) {
    log("No comments collected.", "warn");
    return;
  }

  const baseName = urls.length === 1 ? `video_${videos[0]?.video_id || "single"}` : "videos";
  writeOutputs(baseName, videos, allComments, { source: "urls" }, output, outputFormat);
}

function getBaseName(name, multi) {
  if (multi) return "multi_keywords";
  return name.replace(/^#/, "").replace(/\s+/g, "_").toLowerCase();
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
  .name("tiktok-scraper")
  .description("TikTok comment scraper — hashtag, keyword, and direct URL")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.tiktok)
  .option("-f, --format <format>", "output format: json, csv, both", "json")
  .option("--headless <bool>", "run headless", (v) => v !== "false", true);

program
  .command("scrape")
  .description("Scrape comments by hashtag or keyword")
  .argument("<inputs...>", "one or more hashtags (#tag) or keywords")
  .option("-l, --limit <n>", "max videos per input", parseInt, CONFIG.defaultLimit)
  .option(
    "--max-comments <n>",
    "max comments per video (0 = unlimited)",
    parseInt,
    CONFIG.maxCommentsPerVideo,
  )
  .option("--no-replies", "skip reply scraping")
  .option("--mode <api|browser>", "scraping engine", "api")
  .action(async (inputs, opts) => {
    const options = program.opts();
    await scrapeFlow({
      query: inputs,
      limit: opts.limit,
      includeReplies: opts.replies !== false,
      maxComments: opts.maxComments,
      output: options.output,
      outputFormat: options.format,
      headless: options.headless,
      mode: opts.mode,
    });
  });

program
  .command("url")
  .description("Scrape comments from one or more TikTok video URLs")
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
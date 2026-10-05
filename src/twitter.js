#!/usr/bin/env bun
import { program } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG, PLATFORM_OUTPUT } from "./config.js";
import { createBrowser } from "./browser.js";
import { loadCookies } from "./cookies.js";
import { installApiHook, gotoX } from "./twitter/capture.js";
import { searchTweets, searchTweetsBrowser } from "./twitter/search.js";
import { getUserTweets, getUserInfo, getUserTweetsBrowser } from "./twitter/user.js";
import { getTweetReplies, getTweetUrlBrowser } from "./twitter/comments.js";
import { getTweetById } from "./twitter/api.js";
import { parseTweetResult } from "./twitter/parse.js";
import { exportJson, buildOutputPath } from "./exporter.js";
import { log, randomDelay, parseTweetIdFromUrl } from "./utils.js";

function banner() {
  console.log(`
  ╭───────────────────────────────────────────╮
  │            Twitter/X Scraper              │
  │              Bun · Playwright             │
  ╰───────────────────────────────────────────╯
  `);
}

function authCheck(mode) {
  if (mode === "browser") {
    const result = loadCookies(CONFIG.twitter.cookieFile);
    if (!result.ok) {
      log(`Missing ${CONFIG.twitter.cookieFile}!`, "error");
      log("Fill auth_token + ct0 then retry.", "warn");
      return false;
    }
    const names = result.cookieNames;
    if (!names.includes("auth_token") || !names.includes("ct0")) {
      log(`auth_token or ct0 missing in ${CONFIG.twitter.cookieFile}!`, "error");
      return false;
    }
    return true;
  }

  const { authToken, ct0 } = CONFIG.twitter;
  if (!authToken || !ct0) {
    log("Missing auth_token or ct0 in .env!", "error");
    log("Add both to .env then retry.", "warn");
    return false;
  }
  return true;
}

async function withBrowserPage(fn) {
  const { browser, page } = await createBrowser({
    cookieFile: CONFIG.twitter.cookieFile,
  });
  try {
    await installApiHook(page);
    await gotoX(page, "https://x.com/home");
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function scrapeTweet(id, opts) {
  log(`Fetching tweet ${id}...`, "highlight");
  const res = await getTweetById(id);
  if (res.ok) {
    const tweet = parseTweetResult(res.data);
    if (tweet) {
      let replies = [];
      if (opts.includeReplies) {
        const replyRes = await getTweetReplies(id, {
          maxReplies: opts.maxReplies,
        });
        if (replyRes.ok) replies = replyRes.results;
      }
      log(`  → ${replies.length} replies`, "success");
      return { tweet, replies };
    }
  }

  log(
    `Direct fetch failed (${res?.error || "tweet not parsed"}) — falling back to conversation...`,
    "warn",
  );
  const conv = await getTweetReplies(id, {
    maxReplies: opts.includeReplies ? opts.maxReplies : 10,
  });
  if (!conv.ok) {
    log(`Failed: ${conv.error || "unknown"}`, "error");
    return null;
  }
  const tweet = conv.results.find((r) => r.tweet_id === String(id)) || null;
  if (!tweet) {
    log("Tweet unavailable (paid/deleted).", "warn");
    return null;
  }
  const replies = conv.results
    .filter((r) => r.tweet_id !== String(id))
    .slice(0, opts.maxReplies || Infinity);
  log(`  → ${replies.length} replies`, "success");
  return { tweet, replies };
}

async function scrapeTweetBrowser(page, tweetId, opts) {
  const res = await getTweetUrlBrowser(page, tweetId, {
    includeReplies: opts.includeReplies,
    maxReplies: opts.maxReplies,
  });
  if (!res.ok) {
    log(`Failed: ${res.error || "unknown"}`, "error");
    return null;
  }
  return { tweet: res.tweet, replies: res.replies };
}

async function scrapeFlow({ query, output, limit, outputFormat, product, mode }) {
  banner();
  if (!authCheck(mode)) return;
  log("Starting Twitter scraper...", "highlight");

  if (mode === "browser") {
    return withBrowserPage(async (page) => {
      const allTweets = [];
      for (const q of query) {
        const res = await searchTweetsBrowser(page, q, { limit, product });
        if (!res.ok) {
          log(`Search failed for "${q}": ${res.error || res.reason || "unknown"}`, "error");
          continue;
        }
        log(`Processing ${res.results.length} tweets for "${q}"`, "highlight");
        allTweets.push(...res.results);
        await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
      }

      if (!allTweets.length) {
        log("No tweets collected.", "warn");
        return;
      }

      const baseName = getBaseName(query, "search");
      writeOutputs({
        baseName,
        tweets: allTweets,
        replies: [],
        meta: { query, mode },
        output,
        outputFormat,
      });
    });
  }

  const allTweets = [];
  const allReplies = [];

  for (const q of query) {
    const res = await searchTweets(q, { limit, product });
    if (!res.ok) {
      log(`Search failed for "${q}": ${res.error}`, "error");
      continue;
    }
    log(`Processing ${res.results.length} tweets for "${q}"`, "highlight");
    allTweets.push(...res.results);
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  if (!allTweets.length) {
    log("No tweets collected.", "warn");
    return;
  }

  const baseName = getBaseName(query, "search");
  writeOutputs({ baseName, tweets: allTweets, replies: allReplies, meta: { query, mode }, output, outputFormat });
}

async function userFlow({ users, output, limit, outputFormat, mode }) {
  banner();
  if (!authCheck(mode)) return;
  log("Starting Twitter user scrape...", "highlight");

  if (mode === "browser") {
    return withBrowserPage(async (page) => {
      const allTweets = [];
      const usersInfo = [];

      for (const username of users) {
        const res = await getUserTweetsBrowser(page, username, { limit });
        if (!res.ok) {
          log(`User not found: ${username}`, "error");
          continue;
        }
        if (res.user) {
          log(`@${res.user.username}: ${res.user.followers} followers`, "highlight");
          usersInfo.push(res.user);
        }
        allTweets.push(...res.results);
        await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
      }

      if (!allTweets.length) {
        log("No tweets collected.", "warn");
        return;
      }

      const baseName = getBaseName(users, "user");
      writeOutputs({
        baseName,
        tweets: allTweets,
        replies: [],
        meta: { users: usersInfo, mode },
        output,
        outputFormat,
      });
    });
  }

  const allTweets = [];
  const usersInfo = [];

  for (const username of users) {
    const info = await getUserInfo(username);
    if (!info.ok) {
      log(`User not found: ${username}`, "error");
      continue;
    }
    log(`@${info.results.username}: ${info.results.followers} followers`, "highlight");
    usersInfo.push(info.results);

    const res = await getUserTweets(username, { limit });
    if (!res.ok) {
      log(`Failed: ${res.error}`, "error");
      continue;
    }
    allTweets.push(...res.results);
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  if (!allTweets.length) {
    log("No tweets collected.", "warn");
    return;
  }

  const baseName = getBaseName(users, "user");
  writeOutputs({ baseName, tweets: allTweets, replies: [], meta: { users: usersInfo, mode }, output, outputFormat });
}

async function urlFlow({ urls, output, outputFormat, includeReplies, maxReplies, mode }) {
  banner();
  if (!authCheck(mode)) return;
  log("Starting URL scrape...", "highlight");

  if (mode === "browser") {
    return withBrowserPage(async (page) => {
      const tweets = [];
      const allReplies = [];

      for (const url of urls) {
        const tweetId = parseTweetIdFromUrl(url);
        if (!tweetId) {
          log(`Could not parse tweet ID from: ${url}`, "error");
          continue;
        }
        log(`Tweet ID: ${tweetId}`, "highlight");

        const result = await scrapeTweetBrowser(page, tweetId, { includeReplies, maxReplies });
        if (!result) continue;

        tweets.push(result.tweet);
        allReplies.push(...result.replies.map((r) => ({ ...r, parent_tweet_id: tweetId })));
        await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
      }

      if (!tweets.length) {
        log("No tweets collected.", "warn");
        return;
      }

      const baseName = urls.length === 1 ? `tweet_${tweets[0]?.tweet_id || "single"}` : "tweets";
      writeOutputs({
        baseName,
        tweets,
        replies: allReplies,
        meta: { source: "urls", mode },
        output,
        outputFormat,
      });
    });
  }

  const tweets = [];
  const allReplies = [];

  for (const url of urls) {
    const tweetId = parseTweetIdFromUrl(url);
    if (!tweetId) {
      log(`Could not parse tweet ID from: ${url}`, "error");
      continue;
    }
    log(`Tweet ID: ${tweetId}`, "highlight");

    const result = await scrapeTweet(tweetId, { includeReplies, maxReplies });
    if (!result) continue;

    tweets.push(result.tweet);
    allReplies.push(...result.replies.map((r) => ({ ...r, parent_tweet_id: tweetId })));
    await randomDelay(CONFIG.twitter.delayMin, CONFIG.twitter.delayMax);
  }

  if (!tweets.length) {
    log("No tweets collected.", "warn");
    return;
  }

  const baseName = urls.length === 1 ? `tweet_${tweets[0]?.tweet_id || "single"}` : "tweets";
  writeOutputs({ baseName, tweets, replies: allReplies, meta: { source: "urls", mode }, output, outputFormat });
}

function getBaseName(inputs, type) {
  if (inputs.length > 1) return `tw_${type}_multi`;
  const name = inputs[0]?.replace(/^[@#]/, "").replace(/\s+/g, "_").toLowerCase();
  return `tw_${name || type}`;
}

function writeOutputs({ baseName, tweets, replies, meta, output, outputFormat }) {
  const jsonPath = buildOutputPath(baseName, "json", output);
  exportJson(makeTwitterSummary(tweets, replies, meta), jsonPath);
  log(`JSON saved → ${jsonPath}`, "success");

  if (outputFormat === "csv" || outputFormat === "both") {
    const csvPath = buildOutputPath(baseName, "csv", output);
    exportCsvTweets([...tweets, ...replies], csvPath);
    log(`CSV saved → ${csvPath}`, "success");
  }
}

function makeTwitterSummary(tweets, replies, meta) {
  return {
    ...meta,
    scraped_at: new Date().toISOString(),
    total_tweets: tweets.length,
    total_replies: replies.length,
    total_records: tweets.length + replies.length,
    tweets: tweets.map((t) => ({ ...t, type: "tweet" })),
    replies,
  };
}

function exportCsvTweets(rows, filepath) {
  const headers = [
    "tweet_id",
    "type",
    "author",
    "nickname",
    "text",
    "likes",
    "retweets",
    "replies",
    "quotes",
    "views",
    "created_at",
    "is_retweet",
    "url",
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((t) => headers.map((h) => escape(t[h] ?? "")).join(",")),
  ];

  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(filepath, "\uFEFF" + lines.join("\n"), "utf-8");
  return filepath;
}

program
  .name("twitter-scraper")
  .description("Twitter/X scraper — keyword, user, and direct tweet URL")
  .version("1.0.0")
  .option("-o, --output <dir>", "output directory", PLATFORM_OUTPUT.twitter)
  .option("-f, --format <format>", "output format: json, csv, both", "json");

program
  .command("scrape")
  .description("Scrape tweets by keyword or hashtag")
  .argument("<keywords...>", "one or more keywords or #hashtags")
  .option("-l, --limit <n>", "max tweets per keyword", parseInt, CONFIG.twitter.searchLimit)
  .option("-p, --product <type>", "search type: top, latest, media", "top")
  .option("-m, --mode <api|browser>", "scraping engine", "browser")
  .action(async (keywords, opts) => {
    const options = program.opts();
    await scrapeFlow({
      query: keywords,
      limit: opts.limit,
      product: opts.product,
      mode: opts.mode,
      output: options.output,
      outputFormat: options.format,
    });
  });

program
  .command("user")
  .description("Scrape tweets from one or more user profiles")
  .argument("<usernames...>", "one or more usernames (with or without @)")
  .option("-l, --limit <n>", "max tweets per user", parseInt, CONFIG.twitter.searchLimit)
  .option("-m, --mode <api|browser>", "scraping engine", "browser")
  .action(async (usernames, opts) => {
    const options = program.opts();
    await userFlow({
      users: usernames,
      limit: opts.limit,
      mode: opts.mode,
      output: options.output,
      outputFormat: options.format,
    });
  });

program
  .command("url")
  .description("Scrape a tweet and its replies from URLs")
  .argument("<urls...>", "one or more tweet URLs")
  .option("--no-replies", "skip reply scraping")
  .option("--max-replies <n>", "max replies per tweet (0 = unlimited)", parseInt, CONFIG.twitter.maxRepliesPerTweet)
  .option("-m, --mode <api|browser>", "scraping engine", "browser")
  .action(async (urls, opts) => {
    const options = program.opts();
    await urlFlow({
      urls,
      includeReplies: opts.replies !== false,
      maxReplies: opts.maxReplies,
      mode: opts.mode,
      output: options.output,
      outputFormat: options.format,
    });
  });

program.parse();
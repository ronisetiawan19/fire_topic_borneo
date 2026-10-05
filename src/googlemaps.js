#!/usr/bin/env bun
import { program } from "commander";
program
  .name("gm")
  .description("Google Maps scraper")
  .version("1.0.0")
  .option("-o, --output <path>", "output directory", PLATFORM_OUTPUT)
  .option("--format <csv|json>", "output format", "json")
  .option("--headless <true|false>", "run headless", "true")
  .option("--max-reviews <n>", "max reviews per place (0 = all)", String(DEFAULT_MAX_REVIEWS))
  .option("--sort <newest|oldest|relevance>", "review sort order", "newest")
  .option("--since <YYYY-MM-DD>", "only reviews after this date")
  .option("--until <YYYY-MM-DD>", "only reviews before this date");
program
  .command("search")
  .description("Search Google Maps for places and scrape reviews")
  .argument("<queries...>", "search queries")
  .action(async (queries, opts) => {
    const options = program.opts();
    const maxReviews = Number(options.maxReviews ?? DEFAULT_MAX_REVIEWS);
    const outputFormat = options.format || "json";
    const output = options.output || PLATFORM_OUTPUT;
    return searchFlow({
      queries,
      output,
      outputFormat,
      limit: 20,
      maxReviews,
      since: options.since,
      until: options.until,
      sort: options.sort || "newest",
    });
  });
program
  .command("url")
  .description("Collect reviews from one or more Google Maps URLs/places/search links")
  .argument("[urls...]", "Google Maps URLs or search terms")
  .option("--file <path>", "read URLs/inputs from file (@path supported)")
  .option("--no-clipboard", "disable clipboard fallback")
  .action(async (urlsArg, opts) => {
    const options = program.opts();
    const maxReviews = Number(options.maxReviews ?? DEFAULT_MAX_REVIEWS);
    const outputFormat = options.format || "json";
    const output = options.output || PLATFORM_OUTPUT;
    const { allUrls } = await collectUrlInputs({
      positional: urlsArg || [],
      file: opts.file,
      noClipboard: opts.noClipboard,
    });
    return urlFlow({
      urls: allUrls,
      output,
      outputFormat,
      maxReviews,
      since: options.since,
      until: options.until,
      sort: options.sort || "newest",
    });
  });
program.parse();
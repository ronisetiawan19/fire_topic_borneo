# Checkpoint: 2026-09-13

> Project: `my-scraping-tools-js` — GoFood Sky Pasta review scraper
> Note: repo is NOT a git repository — no `git diff` available; change list tracked inline.

## Tests

- Total: 1 (verification suite: `scripts/verify_branches.js`)
- Passing: 1 — 7/7 branches verified
  - Pamulang 80 avail / 78 kept
  - Tebet 80 / 79
  - Cinere 100 / 88
  - Ciledug 60 / 48
  - Petukangan 40 / 28
  - Binus Jakbar 60 / 52
  - Galaxy Bekasi 42 / 42
- Failing: 0
- Coverage: N/A (no coverage framework configured)

## Build

- Status: PASS (Bun runs all entry scripts cleanly)
- No automated test framework; verification = `verify_branches.js` + output spot-checks.

## Code Changes

### This session (since last checkpoint)
- `src/gofood/capture.js`
  - `normalizeReview` adds `period` (year from `createdAt`)
  - new `summarizeByYear(kept)` — per-year `{ count, avg_rating, first, last }`
  - crawl result now carries `by_year` per branch
- `src/gofood.js`
  - `writeOutputs` emits top-level `by_year_summary` rollup (count + avg_rating per year)
- Data artifact: `output/gofood/2year/gofood_sky_pasta_2026-09-13.json` + `.csv`
  - **415 kept / 462 available** (window `--since 2024-09-13`, 2 years)

### Earlier session (constraint of record)
- `src/data/sky_pasta_branches.js` — 7-branch manifest (all UUIDs/slugs/areas + Binus altUuid)
- `src/gofood.js` — CLI (`branches`, `url` subcommands, `-o`, `-f json|csv|both`, `--since`, `--until`, `--headless`)
- `src/gofood/capture.js` — API crawler via `context.request` (WAF-tolerant), early-stop pagination
- `src/config.js` — `PLATFORM_OUTPUT.gofood = "output/gofood"`, `CONFIG.gofood` (pageSize 20, maxPages 200, pacing 3–6 s)
- `package.json` — bin `gofood-scraper`, script `gf`
- `scripts/verify_branches.js` — 7/7 assertion
- `docs/dokumentasi-gofood.md` — usage docs
- Recon/debug scripts under `scripts/` (recon-gofood-*, debug-gofood-*, recon-grabfood-*)

## Known Facts (source of truth)

- GoFood pagination: `GET /api/outlets/{uuid}/reviews?page=N&page_size=20` → `{ data, next_page, prev_page }`, newest-first (DESC `createdAt`). SSR `?page=` query ignored by GoFood.
- Review shape: `{ id, text, rating, tags, createdAt (+07:00), order { orderedAt, items[{id,name}] }, author { fullName (masked), initialName, avatarUrl, userSince } }`.
- WAF: Tencent qcloud CAPTCHA shell on SSR after burst; reviews API still returns JSON via browser-session `context.request`.
- 7 GoFood UUIDs (resolved): Pamulang `bd96dd68-...41c`, Tebet `594d2e42-...842`, Cinere `43373425-...1cae`, Ciledug `423518a4-...38f`, Petukangan `03ba0e0d-...86f`, Binus Jakbar `2e05c08c-...71f` (alt `dd55f44c-...d5`), Galaxy Bekasi `c4b7588e-...22f`.
- GrabFood DROPPED from scope (no written reviews). No cookie file needed for GoFood.

## Completed Tasks

- [x] GoFood pagination recon (API confirmed, newest-first)
- [x] All 7 branch UUIDs located (Petukangan & Binus UUID ambiguity resolved)
- [x] Build `gofood-scraper` CLI + capture + manifest + config
- [x] Fix `writeOutputs` bug (branches vs normalized `merged`)
- [x] 1-year capture — 205 kept / 280 available
- [x] Verify 7/7 branches
- [x] Add `period` + `by_year` (per branch) + `by_year_summary` (rollup)
- [x] 2-year capture — 415 kept / 462 available, verified 7/7

## Blocking Issues

- None active.

## Analysis Output (2-year run)

- `by_year_summary`: 2024 (partial Sep–Dec) count 39 avg 3.87; 2025 count 260 avg 3.81; 2026 (YTD) count 116 avg 3.75
- Declining branches: Cinere (4.36 → 3.85 → 3.61), Petukangan (3.75 → 3.47 → 2.86)
- Improving: Tebet (3.30 → 3.71 → 3.96), Ciledug (2.67 → 3.88 → 3.92)
- Fair comparison: 2025 full vs 2026 YTD (2024 bucket is partial only)

## Next Steps

1. (Optional) `bun link` in project root → global `gofood-scraper` command (like `tiktok-scraper` / `googlemaps-scraper`)
2. (Pending decision) Google Maps cross-scrape for the 7 branches to augment volume
3. (Pending decision) YoY quality analysis: 2025 full vs 2026 YTD per branch
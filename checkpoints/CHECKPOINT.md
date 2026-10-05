# Checkpoint: 2026-09-10 22:25

## Tests
- **Total:** 0
- **Passing:** 0
- **Failing:** 0
- **Coverage:** N/A (no test framework installed)
- **Smoke tests (manual, all passed):**
  - YouTube `url dQw4w9WgXcQ --max-comments 2` → `output/youtube/video_dQw4w9WgXcQ_2026-09-10.json` (2 comments)
  - TikTok `url video/7676096424802651413 --max-comments 5 --no-replies` → `output/tiktok/video_7676096424802651413_2026-09-10.json` (5 comments; API returns 48 raw)
  - Twitter `url status/2096075733299044633` → `output/twitter/tweet_2096075733299044633_2026-09-10.json` (5 replies)
  - Google Maps `search "warung kopi tangerang" -l 1 --max-reviews 3` → `output/googlemaps/gm_warung_kopi_tangerang_2026-09-10.json` (3 reviews)

## Build
- **Status:** PASS (no build step; Bun runtime)
- **Bun version:** 1.4.0
- **Errors:** None

## Project Summary
| Metric | Value |
|--------|-------|
| Language | JavaScript (ESM) |
| Runtime | Bun |
| Modules | 27 source files (~135 KB) |
| Binaries | 4 (`tiktok-scraper`, `youtube-scraper`, `twitter-scraper`, `googlemaps-scraper` — npm link active) |
| Dependencies | 3 (`commander`, `playwright`, `youtubei.js`) |

## Changes Since Last Checkpoint

### Sources restructured — 1 platform = 1 folder
- `src/tiktok/` created; `api.js`, `comments.js`, `search.js` moved in.
- `src/index.js` → renamed `src/tiktok.js` (uniform CLI naming).
- Folders renamed: `yt/`→`youtube/`, `tw/`→`twitter/`, `gm/`→`googlemaps/`.
- Shared infra stays at `src/` root: `browser.js`, `config.js`, `cookies.js`, `exporter.js`, `utils.js`.
- All relative imports updated (static check: 0 missing); 4 CLIs + sub-modules verified at runtime.

### Refactor: shared `cleanText`
- Moved `cleanText` from `src/tiktok/api.js` → `src/utils.js`.
- Fixed latent cross-platform bug: `src/twitter/parse.js` was importing `cleanText` from `../api.js` (= TikTok's file, broken after move). Now both TikTok and Twitter import from `src/utils.js`.
- Removed orphaned `export { randomDelay }` re-export in `src/tiktok/api.js`.
- `src/tiktok/comments.js` now imports `cleanText`/`randomDelay`/`log` directly from `utils.js`.

### Entry points
- `package.json`: module → `src/tiktok.js`, bin `tiktok-scraper` → `src/tiktok.js`, start → `bun src/tiktok.js`. `npm link` re-run OK.
- `checkpoints/CHECKPOINT.md` source-file map updated to new layout.

### Folder reorganization (output/cookies/docs — from previous phase)
- Output separated per platform: `output/{googlemaps,tiktok,twitter,youtube}/` via `PLATFORM_OUTPUT`.
- Cookies moved to `cookies/{tiktok,twitter,googlemaps}_cookies.json`.
- Docs moved to `docs/dokumentasi-*.md`, content updated (default output paths, cookie file paths).
- TikTok doc: added cookie note (`cookies/tiktok_cookies.json`) for parity.
- Docs use `bun run src/*.js` — still valid since CLIs remain at `src/` root.

## Completed Tasks
- [x] Project initialization with Bun
- [x] TikTok scraper CLI (`src/tiktok.js`)
- [x] YouTube scraper CLI (`src/youtube.js`)
- [x] Twitter scraper CLI (`src/twitter.js`)
- [x] Google Maps scraper CLI (`src/googlemaps.js`)
- [x] Browser automation with Playwright
- [x] Cookie management for authenticated sessions
- [x] Comment/review scraping (TikTok + YouTube + Twitter + Google Maps)
- [x] Search functionality (all platforms)
- [x] Export/output utilities
- [x] `src/` restructure: one folder per platform (tiktok/, youtube/, twitter/, googlemaps/)
- [x] Shared `cleanText` in `utils.js` (removed cross-platform import bug)
- [x] `package.json` + CHECKPOINT.md updated for `src/tiktok.js`
- [x] Docs updated for cookie/output paths; TikTok cookie note added
- [x] All 4 `bun run src/*.js` CLIs + global bins smoke-tested end-to-end

## Blocking Issues
- **No git repository** - Project is not version-controlled (no rollback via git)
- **No tests** - Zero test coverage, no test framework configured
- **No linting** - No ESLint/Biome configured
- **No CI/CD** - No GitHub Actions or similar
- **Google Maps NID cookie exposed** - `cookies/googlemaps_cookies.json` was shared in an earlier session; MUST be regenerated before use in another environment
- **TikTok 0-comment edge** - `scrape`/`url` may select videos with no comments (skip logged); not a bug, but worth a retry-loop enhancement

## Next Steps
1. Initialize git repository (`git init`) + verify `.gitignore`
2. Install test framework (Vitest recommended for Bun)
3. Write unit tests for core utilities (`utils.js`, `config.js`, `cookies.js`, `exporter.js`, `parse*.js`)
4. Write integration tests for scraper modules (mock HTTP to keep them offline/CI-safe)
5. Configure Biome or ESLint for code quality
6. Add TypeScript types (optional, JSDoc or migration)
7. Regenerate `cookies/googlemaps_cookies.json` (NID exposed) before relying on GM scraper elsewhere
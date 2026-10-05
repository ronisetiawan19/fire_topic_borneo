import { CONFIG } from "../config.js";
import { log, randomDelay } from "../utils.js";
import {
  gmGoto,
  collectPlacesFromDom,
  scrollFeed,
  detectBlockedOnPage,
  normalizePlace,
} from "./parse.js";

export async function searchPlacesBrowser(page, query, { limit, lang }) {
  const l = lang || CONFIG.gm.defaultLang;
  const q = encodeURIComponent(String(query).trim());
  const url = `${CONFIG.gm.searchUrl}/${q}`;

  log(`Searching "${query}"...`, "highlight");
  const blocked = await gmGoto(page, url, l);
  if (blocked.blocked) return { ok: false, results: [], reason: blocked.reason };

  await page.waitForSelector('div[role="feed"]', { timeout: 20000 }).catch(() => {});
  const afterWait = await detectBlockedOnPage(page);
  if (afterWait.blocked) return { ok: false, results: [], reason: afterWait.reason };

  let places = await collectPlacesFromDom(page);
  let emptyRounds = 0;
  const maxRounds = Math.max(4, Math.ceil((limit || CONFIG.gm.maxPlaces) / 2));

  for (let round = 1; round <= maxRounds; round++) {
    if (limit > 0 && places.length >= limit) break;
    const before = places.length;
    await scrollFeed(page);
    places = await collectPlacesFromDom(page);
    if (places.length === before) emptyRounds += 1;
    else emptyRounds = 0;
    if (emptyRounds >= 2) break;
    await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
  }

  const capped = limit > 0 ? places.slice(0, limit) : places;
  const normalized = capped.map(normalizePlace);
  log(`Found ${normalized.length} places.`, "success");
  return { ok: true, results: normalized };
}
async function urlFlow({ urls, output, outputFormat, maxReviews, since, until, sort }) {
  banner();
  const { sinceDate, untilDate } = resolveRange(since, until, 0);
  log(
    sinceDate || untilDate
      ? `Date range: ${formatRange(sinceDate, untilDate)}`
      : "Date range: all time (no --since/--until) — semua ulasan akan diambil.",
    "info",
  );

  const doSingle = async () => {
    const { browser, page } = await createBrowser({ cookieFile: CONFIG.gm.cookieFile });
    try {
      await installGmHook(page);
      const allPlaces = [];
      for (const u of urls) {
        let placeUrl = u;
        let placeId = parsePlaceIdFromUrl(u);
        if (!placeId && /goo\.gl|redirect/i.test(u)) {
          log(`Resolving short link ${u}...`, "highlight");
          const resolved = await resolveGoogleMapsShortLink(page, u);
          if (!resolved.ok) {
            log(`Could not resolve short link: ${resolved.reason}`, "error");
            allPlaces.push({
              place_id: placeId,
              name: placeId,
              link: placeUrl,
              reviews: [],
              status: "failed",
              reason: resolved.reason || "shortlink",
            });
            continue;
          }
          placeUrl = resolved.url;
          placeId = parsePlaceIdFromUrl(resolved.url);
        }

        const resInp = await resolveInputToPlace(page, u);
        if (resInp.kind === "failed") {
          log(`Input resolve failed: ${resInp.reason}`, "error");
          allPlaces.push({
            place_id: placeId,
            name: placeId,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: resInp.reason,
          });
          continue;
        }
        if (resInp.kind === "place" && resInp.url) {
          placeUrl = resInp.url;
          placeId = parsePlaceIdFromUrl(placeUrl) || placeId || resInp.placeId;
        }
        if (!placeId) {
          log(`Could not extract place ID from: ${u}`, "error");
          allPlaces.push({
            place_id: placeId,
            name: placeId,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: "no-place-id",
          });
          continue;
        }

        const place = { place_id: placeId, name: placeId, link: placeUrl };
        const metaBefore = await readPlaceMeta(page);
        const r = await getPlaceReviewsBrowser(page, place, { maxReviews, sort });
        if (!r.ok) {
          log(`Reviews failed: ${r.reason || r.error || "unknown"}`, "error");
          allPlaces.push({
            place_id: metaBefore.place_id || placeId,
            name: metaBefore.name || placeId,
            address: metaBefore.address,
            rating: metaBefore.rating,
            reviews_count: metaBefore.reviews_count,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: r.reason || r.error || "reviews-failed",
          });
          await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
          continue;
        }
        const filtered = filterByRange(r.results, sinceDate, untilDate);
        const meta = await readPlaceMeta(page);
        const keptCount = filtered.kept.length;
        allPlaces.push({
          place_id: meta.place_id || placeId,
          name: meta.name || placeId,
          address: meta.address,
          rating: meta.rating,
          reviews_count: meta.reviews_count,
          link: placeUrl,
          reviews: filtered.kept,
          status: keptCount > 0 ? "ok" : "empty",
          reason: keptCount > 0 ? undefined : "tidak-ada-ulasan",
        });
        log(
          `URL → ${keptCount} reviews (${filtered.skipped} skipped, ${filtered.unknown} unknown date)`,
          "success",
        );
        await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
      }
      if (!allPlaces.length) {
        log("No places collected.", "warn");
        return;
      }
      const baseName = getBaseName(urls, "url");
      writeOutputs({
        baseName,
        places: allPlaces,
        query: urls,
        since: sinceDate ? sinceDate.toISOString().slice(0, 10) : null,
        until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
        sort,
        output,
        outputFormat,
      });
    } finally {
      await browser.close();
    }
  };

  const doBatch = async () => {
    const allPlaces = [];
    const hhmm = new Date().getHours().toString().padStart(2, "0") + new Date().getMinutes().toString().padStart(2, "0");
    for (const u of urls) {
      const { browser, page } = await createBrowser({ cookieFile: CONFIG.gm.cookieFile });
      try {
        await installGmHook(page);
        let placeUrl = u;
        let placeId = parsePlaceIdFromUrl(u);
        if (!placeId && /goo\.gl|redirect/i.test(u)) {
          log(`Resolving short link ${u}...`, "highlight");
          const resolved = await resolveGoogleMapsShortLink(page, u);
          if (!resolved.ok) {
            log(`Could not resolve short link: ${resolved.reason}`, "error");
            allPlaces.push({
              place_id: placeId,
              name: placeId,
              link: placeUrl,
              reviews: [],
              status: "failed",
              reason: resolved.reason || "shortlink",
            });
            continue;
          }
          placeUrl = resolved.url;
          placeId = parsePlaceIdFromUrl(resolved.url);
        }
        const resInp = await resolveInputToPlace(page, u);
        if (resInp.kind === "failed") {
          log(`Input resolve failed: ${resInp.reason}`, "error");
          allPlaces.push({
            place_id: placeId,
            name: placeId,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: resInp.reason,
          });
          continue;
        }
        if (resInp.kind === "place" && resInp.url) {
          placeUrl = resInp.url;
          placeId = parsePlaceIdFromUrl(placeUrl) || placeId || resInp.placeId;
        }
        if (!placeId) {
          log(`Could not extract place ID from: ${u}`, "error");
          allPlaces.push({
            place_id: placeId,
            name: placeId,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: "no-place-id",
          });
          continue;
        }
        const place = { place_id: placeId, name: placeId, link: placeUrl };
        const metaBefore = await readPlaceMeta(page);
        const r = await getPlaceReviewsBrowser(page, place, { maxReviews, sort });
        if (!r.ok) {
          log(`Reviews failed: ${r.reason || r.error || "unknown"}`, "error");
          allPlaces.push({
            place_id: metaBefore.place_id || placeId,
            name: metaBefore.name || placeId,
            address: metaBefore.address,
            rating: metaBefore.rating,
            reviews_count: metaBefore.reviews_count,
            link: placeUrl,
            reviews: [],
            status: "failed",
            reason: r.reason || r.error || "reviews-failed",
          });
          await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
          continue;
        }
        const filtered = filterByRange(r.results, sinceDate, untilDate);
        const meta = await readPlaceMeta(page);
        const keptCount = filtered.kept.length;
        allPlaces.push({
          place_id: meta.place_id || placeId,
          name: meta.name || placeId,
          address: meta.address,
          rating: meta.rating,
          reviews_count: meta.reviews_count,
          link: placeUrl,
          reviews: filtered.kept,
          status: keptCount > 0 ? "ok" : "empty",
          reason: keptCount > 0 ? undefined : "tidak-ada-ulasan",
        });
        log(
          `URL → ${keptCount} reviews (${filtered.skipped} skipped, ${filtered.unknown} unknown date)`,
          "success",
        );
        await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
      } finally {
        await browser.close();
      }
    }
    if (!allPlaces.length) {
      log("No places collected.", "warn");
      return;
    }
    const baseName = getBaseName(urls, "url", hhmm);
    writeOutputs({
      baseName,
      places: allPlaces,
      query: urls,
      since: sinceDate ? sinceDate.toISOString().slice(0, 10) : null,
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      sort,
      output,
      outputFormat,
    });
  };

  if (urls.length > 1) return doBatch();
  return doSingle();
}

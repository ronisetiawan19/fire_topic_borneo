async function searchFlow({ queries, output, outputFormat, limit, maxReviews, since, until, sort }) {
  banner();
  const { sinceDate, untilDate } = resolveRange(since, until, CONFIG.gm.sinceDefaultDays);
  log(`Date range (default 1yr): ${formatRange(sinceDate, untilDate)}`, "info");

  return withBrowserPage(async (page) => {
    const allPlaces = [];

    for (const q of queries) {
      const res = await searchPlacesBrowser(page, q, { limit });
      if (!res.ok) {
        log(`Search failed for "${q}": ${res.reason || "unknown"}`, "error");
        continue;
      }
      const places = [];
      let totalReviews = 0;
      for (const p of res.results) {
        const r = await getPlaceReviewsBrowser(page, p, { maxReviews, sort });
        if (r.ok) {
          const filtered = filterByRange(r.results, sinceDate, untilDate);
          if (filtered.skipped > 0) log(`    ${filtered.skipped} reviews outside range skipped.`, "info");
          const meta = await readPlaceMeta(page);
          const keptCount = filtered.kept.length;
          const enriched = {
            ...p,
            name: meta.name || p.name,
            rating: meta.rating || p.rating,
            reviews_count: meta.reviews_count || p.reviews_count,
            address: meta.address || p.detail || "",
            status: keptCount > 0 ? "ok" : "empty",
            reason: keptCount > 0 ? undefined : "tidak-ada-ulasan",
          };
          places.push({ ...enriched, reviews: filtered.kept });
          totalReviews += keptCount;
        } else {
          log(`    Reviews failed for ${p.name}: ${r.reason || r.error || "unknown"}`, "error");
        }
        await randomDelay(CONFIG.gm.delayMin, CONFIG.gm.delayMax);
      }
      log(`"${q}" → ${places.length} places, ${totalReviews} reviews (in range)`, "success");
      allPlaces.push(...places);
    }

    if (!allPlaces.length) {
      log("No places collected.", "warn");
      return;
    }

    const baseName = getBaseName(queries, "search");
    writeOutputs({
      baseName,
      places: allPlaces,
      query: queries,
      since: sinceDate.toISOString().slice(0, 10),
      until: untilDate ? untilDate.toISOString().slice(0, 10) : null,
      sort,
      output,
      outputFormat,
    });
  });
}

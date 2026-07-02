const express = require("express");
const { getPlan } = require("../services/queryPlan");
const { fetchSubQuery } = require("../services/googleNewsClient");
const { clampDate, addDays, filterByDate } = require("../services/dateFilter");
const { mergeDedupe } = require("../services/mergeDedupe");
const { normalizeTitle } = require("../lib/textUtils");
const cache = require("../lib/cache");

const router = express.Router();

const TARGET_COUNT = 40;
const MIN_ACCEPTABLE = 30;
const CACHE_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

router.get("/", async (req, res) => {
  const region = ["india", "world"].includes(req.query.region) ? req.query.region : "india";
  const plan = getPlan(region);
  const targetDate = clampDate(req.query.date, plan.timezone);
  const cacheKey = `${region}:${targetDate}`;

  try {
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    if (cache.isCoolingDown(region)) {
      const stale = cache.getStale(cacheKey);
      if (stale) return res.json(stale);
    }

    const payload = await cache.dedupe(cacheKey, () => buildNewsPayload(plan, region, targetDate));
    cache.set(cacheKey, payload, CACHE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    // Absolute safety net: this route must always return 200 + valid JSON.
    return res.json({
      articles: [],
      meta: {
        requestedDate: targetDate,
        effectiveRange: [targetDate, targetDate],
        count: 0,
        note: "Temporarily unable to load news. Please try again shortly.",
      },
    });
  }
});

function groupsFrom(rawByQuery, plan, targetDate, windowDays) {
  return rawByQuery.map((items, i) => ({
    items: filterByDate(items, targetDate, plan.timezone, windowDays),
    slots: plan.queries[i % plan.queries.length].slots,
  }));
}

function seenSetsFrom(merged) {
  return {
    links: new Set(merged.map((m) => m.link)),
    titles: new Set(merged.map((m) => normalizeTitle(m.title))),
  };
}

async function buildNewsPayload(plan, region, targetDate) {
  const dateOperator = `after:${targetDate} before:${addDays(targetDate, 1)}`;

  const scopedResults = await Promise.allSettled(
    plan.queries.map((sq) => fetchSubQuery(sq.q, plan.locale, dateOperator))
  );
  const scopedRaw = scopedResults.map((r) => (r.status === "fulfilled" ? r.value : []));
  const anyScopedSucceeded = scopedResults.some((r) => r.status === "fulfilled" && r.value.length > 0);
  if (!anyScopedSucceeded) cache.startCooldown(region, COOLDOWN_MS);

  let merged = mergeDedupe(groupsFrom(scopedRaw, plan, targetDate, 0), TARGET_COUNT);
  let usedNearby = false;
  let broadRaw = [];

  if (merged.length < MIN_ACCEPTABLE) {
    const broadResults = await Promise.allSettled(
      plan.queries.map((sq) => fetchSubQuery(sq.q, plan.locale, null))
    );
    broadRaw = broadResults.map((r) => (r.status === "fulfilled" ? r.value : []));

    const { links, titles } = seenSetsFrom(merged);
    const additional = mergeDedupe(
      groupsFrom(broadRaw, plan, targetDate, 0),
      TARGET_COUNT - merged.length,
      links,
      titles
    );
    merged = merged.concat(additional);

    for (const windowDays of [1, 2]) {
      if (merged.length >= MIN_ACCEPTABLE) break;
      const { links: l2, titles: t2 } = seenSetsFrom(merged);
      const nearbyGroups = [
        ...groupsFrom(scopedRaw, plan, targetDate, windowDays),
        ...groupsFrom(broadRaw, plan, targetDate, windowDays),
      ];
      const nearbyAdditional = mergeDedupe(nearbyGroups, TARGET_COUNT - merged.length, l2, t2);
      if (nearbyAdditional.length) {
        usedNearby = true;
        merged = merged.concat(nearbyAdditional);
      }
    }
  }

  merged = merged
    .slice(0, TARGET_COUNT)
    .map((a) => ({ ...a, imageUrl: a.imageUrl || `https://picsum.photos/seed/${a.id}/640/380` }));

  let note = null;
  if (merged.length === 0) {
    note = "No articles found for this date yet. Try a different date.";
  } else if (merged.length < MIN_ACCEPTABLE) {
    note = `Only ${merged.length} stories are available for this date.`;
  } else if (usedNearby) {
    note = "A few stories are from the closest available nearby dates.";
  }

  return {
    articles: merged,
    meta: { requestedDate: targetDate, effectiveRange: [targetDate, targetDate], count: merged.length, note },
  };
}

module.exports = router;

const express = require("express");
const { extractArticle } = require("../services/articleExtractor");
const { resolveGoogleNewsLink } = require("../services/linkResolver");
const cache = require("../lib/cache");

const router = express.Router();
const CACHE_TTL_MS = 30 * 60 * 1000;

router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return res.json({ extracted: false, reason: "invalid_url" });
  }

  try {
    const cacheKey = `article:${url}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await cache.dedupe(cacheKey, async () => {
      const resolvedUrl = await resolveGoogleNewsLink(url);
      const extraction = await extractArticle(resolvedUrl);
      return { ...extraction, resolvedUrl };
    });
    cache.set(cacheKey, result, CACHE_TTL_MS);
    return res.json(result);
  } catch {
    return res.json({ extracted: false, reason: "fetch_error", resolvedUrl: url });
  }
});

module.exports = router;

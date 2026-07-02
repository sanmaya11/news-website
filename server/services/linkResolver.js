// Google News RSS <link> values are interstitial redirect URLs
// (news.google.com/rss/articles/<id>), not the original publisher URL.
// Google's own web client resolves these via an internal batchexecute RPC
// using a signature/timestamp pair embedded in the interstitial page.
// This mirrors that call server-side so extraction and the "Read Original
// Article" link can point at the real source. Always resolves to a URL
// string (falls back to the original link on any failure) — never throws.

const cache = require("../lib/cache");

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const DECODE_ENDPOINT =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&source-path=%2Frss%2Farticles%2F&hl=en-US&soc-app=345&soc-platform=1&soc-device=1";

function isGoogleNewsLink(url) {
  try {
    return new URL(url).hostname === "news.google.com";
  } catch {
    return false;
  }
}

async function fetchLimited(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BODY_BYTES) {
        controller.abort();
        break;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  } finally {
    clearTimeout(timer);
  }
}

async function decodeOnce(googleUrl) {
  const html = await fetchLimited(googleUrl, { headers: HEADERS, redirect: "follow" });

  const sg = html.match(/data-n-a-sg="([^"]+)"/);
  const ts = html.match(/data-n-a-ts="([^"]+)"/);
  const id = html.match(/data-n-a-id="([^"]+)"/);
  if (!sg || !ts || !id) return null;

  const innerReq = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id[1],
    Number(ts[1]),
    sg[1],
  ]);
  const outerReq = JSON.stringify([[["Fbv4je", innerReq, null, "generic"]]]);
  const body = "f.req=" + encodeURIComponent(outerReq);

  const respText = await fetchLimited(DECODE_ENDPOINT, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });

  const cleaned = respText.replace(/^\)\]\}'/, "").trim();
  const outer = JSON.parse(cleaned);
  const row = outer.find((r) => Array.isArray(r) && r[0] === "wrb.fr" && typeof r[2] === "string");
  if (!row) return null;

  const inner = JSON.parse(row[2]);
  if (!Array.isArray(inner) || inner[0] !== "garturlres" || typeof inner[1] !== "string") return null;

  return inner[1];
}

// Always resolves to a URL string. Falls back to the original googleUrl on
// any failure (non-Google link, missing signature, network error, parse
// error) so callers never need their own fallback branch.
async function resolveGoogleNewsLink(url) {
  if (!isGoogleNewsLink(url)) return url;

  const cacheKey = `resolve:${url}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const resolved = await cache.dedupe(cacheKey, () => decodeOnce(url));
    const finalUrl = resolved || url;
    cache.set(cacheKey, finalUrl, CACHE_TTL_MS);
    return finalUrl;
  } catch {
    return url;
  }
}

module.exports = { resolveGoogleNewsLink, isGoogleNewsLink };

const Parser = require("rss-parser");
const { stripHtml, decodeText, shortHash } = require("../lib/textUtils");

const parser = new Parser({ timeout: 8000 });
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function buildUrl(q, locale, dateOperator) {
  const fullQuery = dateOperator ? `${q} ${dateOperator}` : q;
  const params = new URLSearchParams({
    q: fullQuery,
    hl: locale.hl,
    gl: locale.gl,
    ceid: locale.ceid,
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

// Pulls a usable thumbnail out of the item's raw description HTML, if any.
function extractImage(rawDescription) {
  if (!rawDescription) return null;
  const match = rawDescription.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

async function fetchWithLimit(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BODY_BYTES) {
        controller.abort();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fetches one sub-query's RSS feed and returns normalized, unfiltered items.
// Never throws — any failure (network, parse, timeout) resolves to [].
async function fetchSubQuery(q, locale, dateOperator) {
  const url = buildUrl(q, locale, dateOperator);
  try {
    const xml = await fetchWithLimit(url);
    if (!xml) return [];
    const feed = await parser.parseString(xml);
    if (!feed || !Array.isArray(feed.items)) return [];

    return feed.items.map((item) => {
      const rawSource =
        (item.source && (item.source._ || item.source)) ||
        decodeText(item.title || "").split(" - ").pop() ||
        "Unknown";
      const title = decodeText(item.title || "").replace(/\s+-\s+[^-]+$/, "");
      const snippet = stripHtml(item.contentSnippet || item.content || item.summary || "");
      return {
        id: shortHash(item.link || title),
        title,
        link: item.link || "",
        source: decodeText(typeof rawSource === "string" ? rawSource : "Unknown"),
        pubDate: item.pubDate || item.isoDate || null,
        snippet,
        imageUrl: extractImage(item.content || item.summary || ""),
      };
    });
  } catch {
    return [];
  }
}

module.exports = { fetchSubQuery };

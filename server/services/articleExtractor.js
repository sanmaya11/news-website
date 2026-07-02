const { JSDOM, VirtualConsole } = require("jsdom");

// Real-world pages often ship CSS jsdom's parser can't handle; that's
// irrelevant to text extraction, so swallow it instead of spamming stderr.
const silentVirtualConsole = new VirtualConsole();
const { Readability, isProbablyReaderable } = require("@mozilla/readability");
const sanitizeHtml = require("sanitize-html");

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MIN_TEXT_LENGTH = 400;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) return { error: "blocked" };
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { error: "unsupported_content_type" };
    }
    if (!res.body) return { error: "fetch_error" };

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BODY_BYTES) {
        controller.abort();
        return { error: "too_large" };
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { html, finalUrl: res.url || url };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : "fetch_error" };
  } finally {
    clearTimeout(timer);
  }
}

// Attempts full-text extraction from an original article URL. Always
// resolves (never throws) to either { extracted: true, ... } or
// { extracted: false, reason }.
async function extractArticle(url) {
  try {
    const fetched = await fetchHtml(url);
    if (fetched.error) return { extracted: false, reason: fetched.error };

    let dom;
    try {
      dom = new JSDOM(fetched.html, { url: fetched.finalUrl, virtualConsole: silentVirtualConsole });
    } catch {
      return { extracted: false, reason: "parse_error" };
    }

    if (!isProbablyReaderable(dom.window.document)) {
      return { extracted: false, reason: "not_readerable" };
    }

    let article;
    try {
      article = new Readability(dom.window.document).parse();
    } catch {
      return { extracted: false, reason: "parse_error" };
    }

    if (!article || !article.textContent || article.textContent.trim().length < MIN_TEXT_LENGTH) {
      return { extracted: false, reason: "too_short" };
    }

    const cleanHtml = sanitizeHtml(article.content || "", {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption"]),
      allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"], "*": ["class"] },
    });

    return {
      extracted: true,
      title: article.title || null,
      byline: article.byline || null,
      html: cleanHtml,
      textLength: article.textContent.trim().length,
    };
  } catch {
    return { extracted: false, reason: "fetch_error" };
  }
}

module.exports = { extractArticle };

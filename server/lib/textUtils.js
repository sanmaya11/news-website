const { decode } = require("html-entities");
const crypto = require("crypto");

// Google News snippets are often double-encoded ("&amp;quot;") — decode twice.
function decodeText(raw) {
  if (!raw) return "";
  return decode(decode(String(raw))).trim();
}

// Strips markup Google sometimes embeds in <description>, keeping plain text.
function stripHtml(raw) {
  if (!raw) return "";
  return decodeText(raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

// Normalizes a title for fuzzy dedupe: lowercase, strip trailing " - Source",
// strip punctuation, collapse whitespace.
function normalizeTitle(title) {
  if (!title) return "";
  return decodeText(title)
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortHash(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 16);
}

module.exports = { decodeText, stripHtml, normalizeTitle, shortHash };

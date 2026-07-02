// Handles: validating/clamping the user's requested date, converting a raw
// RSS pubDate into a calendar-day key in a given timezone, and filtering a
// list of items down to those matching the requested day (with an optional
// +/- day window for the broadening ladder).

function todayStr(timezone) {
  return toDayKey(new Date(), timezone);
}

function toDayKey(date, timezone) {
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Returns a valid YYYY-MM-DD string, defaulting to (and clamping to) today.
function clampDate(rawDate, timezone) {
  const today = todayStr(timezone);
  if (!rawDate || typeof rawDate !== "string") return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return today;
  const parsed = Date.parse(rawDate + "T00:00:00Z");
  if (Number.isNaN(parsed)) return today;
  return rawDate > today ? today : rawDate;
}

// windowDays=0 => exact match only. windowDays=N => target +/- N days.
function filterByDate(items, targetDayKey, timezone, windowDays) {
  const allowed = new Set();
  for (let d = -windowDays; d <= windowDays; d++) {
    allowed.add(addDays(targetDayKey, d));
  }
  const matched = [];
  for (const item of items) {
    if (!item.pubDate) continue;
    const parsed = new Date(item.pubDate);
    if (Number.isNaN(parsed.getTime())) continue;
    const dayKey = toDayKey(parsed, timezone);
    if (allowed.has(dayKey)) {
      matched.push({
        ...item,
        publishedAt: parsed.toISOString(),
        dateMatch: dayKey === targetDayKey ? "exact" : "nearby",
      });
    }
  }
  return matched;
}

module.exports = { todayStr, toDayKey, addDays, clampDate, filterByDate };

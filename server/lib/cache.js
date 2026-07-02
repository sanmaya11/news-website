// Small in-memory TTL cache + in-flight request de-duplication + a per-key
// cooldown flag so a flaky upstream never gets hammered. All local to the
// server process — no external deps, nothing to configure.

const store = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> Promise
const cooldowns = new Map(); // key -> untilTimestamp

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function getStale(key) {
  const entry = store.get(key);
  return entry ? entry.value : undefined;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function isCoolingDown(key) {
  const until = cooldowns.get(key);
  return typeof until === "number" && Date.now() < until;
}

function startCooldown(key, durationMs) {
  cooldowns.set(key, Date.now() + durationMs);
}

// Ensures concurrent callers for the same key share a single upstream fetch.
async function dedupe(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

module.exports = { get, getStale, set, isCoolingDown, startCooldown, dedupe };

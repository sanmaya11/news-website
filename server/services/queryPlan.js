// Defines the sub-queries fanned out per region and each one's target share
// of the final ~40-article cap, plus the Google News locale params that bias
// results toward that region's sources.

const PLANS = {
  india: {
    locale: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
    timezone: "Asia/Kolkata",
    queries: [
      { q: "India", slots: 10 },
      { q: "India politics OR government OR parliament", slots: 8 },
      { q: "India economy OR business OR markets", slots: 8 },
      { q: "Mumbai OR Delhi OR Bengaluru OR Chennai OR Kolkata OR Hyderabad", slots: 8 },
      { q: "India cricket OR sports", slots: 6 },
    ],
  },
  world: {
    locale: { hl: "en-US", gl: "US", ceid: "US:en" },
    timezone: "UTC",
    queries: [
      { q: "world news", slots: 8 },
      { q: "international relations OR diplomacy", slots: 6 },
      { q: "Europe OR European Union", slots: 6 },
      { q: "Middle East", slots: 6 },
      { q: "China OR East Asia OR Japan OR Korea", slots: 6 },
      { q: "Africa", slots: 4 },
      { q: "United States OR Americas", slots: 4 },
    ],
  },
};

function getPlan(region) {
  return PLANS[region] || PLANS.india;
}

module.exports = { getPlan, REGIONS: Object.keys(PLANS) };

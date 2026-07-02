const { normalizeTitle } = require("../lib/textUtils");

// Round-robin merges several already-date-filtered item groups (one per
// sub-query), respecting each group's soft "slots" cap so no single broad
// query crowds out the more specific ones, de-duping by link then by
// normalized title, until `cap` total items are collected.
//
// `groups`: [{ items: [...], slots: number }]
// `seenLinks`/`seenTitles`: optional Sets to continue de-duping against
// items already accepted in a previous ladder step.
function mergeDedupe(groups, cap, seenLinks = new Set(), seenTitles = new Set()) {
  const result = [];
  const cursors = groups.map(() => 0);
  const taken = groups.map(() => 0);

  let progressed = true;
  while (result.length < cap && progressed) {
    progressed = false;
    for (let g = 0; g < groups.length; g++) {
      if (result.length >= cap) break;
      const group = groups[g];
      if (taken[g] >= group.slots) continue;
      while (cursors[g] < group.items.length) {
        const item = group.items[cursors[g]++];
        const link = item.link;
        const normTitle = normalizeTitle(item.title);
        if ((link && seenLinks.has(link)) || (normTitle && seenTitles.has(normTitle))) {
          continue;
        }
        if (link) seenLinks.add(link);
        if (normTitle) seenTitles.add(normTitle);
        result.push(item);
        taken[g]++;
        progressed = true;
        break;
      }
    }
  }
  return result;
}

module.exports = { mergeDedupe };

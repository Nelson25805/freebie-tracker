// filters.js
// Filtering, sorting, and the per-chip count logic. Reads from state.js and
// dom.js but never touches innerHTML — rendering stays in render.js.

import { els } from "./dom.js";
import { allGames, collected, selectedStores, selectedRedeemPlatforms } from "./state.js";

export function gameKey(game) {
  return game.id || game.slug || game.title;
}

// Applies every filter (search, status, hide-collected, redeem platform) and
// optionally the store chip filter. Pulled out so the store chip counts can
// reuse the exact same logic while skipping only the store filter itself —
// that way each chip's count reflects "how many games would show up if I
// picked this store," given the other filters in place.
export function getFilteredGames({ skipStoreFilter = false, skipRedeemFilter = false } = {}) {
  const q = els.searchInput.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  const hideClaimed = els.hideClaimed.checked;

  let items = [...allGames];

  if (q) {
    items = items.filter((g) =>
      [g.title, g.storeName, g.seller, g.slug].join(" ").toLowerCase().includes(q)
    );
  }

  if (!skipStoreFilter) {
    items = items.filter((g) => selectedStores.has(g.store));
  }

  // Redemption-platform filter only applies to Prime Gaming offers, since
  // that's the only store where the claim platform varies (Epic, GOG,
  // Legacy Games, Amazon Games App, native Amazon Luna, etc.). Games with
  // no recorded platform are left visible rather than hidden by default.
  if (!skipRedeemFilter) {
    items = items.filter((g) => {
      if (g.store !== "prime") return true;
      if (!g.platforms?.length) return true;
      return g.platforms.some((p) => selectedRedeemPlatforms.has(p));
    });
  }

  if (status !== "all") {
    if (status === "claimed") {
      items = items.filter((g) => collected.has(gameKey(g)));
    } else {
      items = items.filter((g) => g.status === status);
    }
  }

  if (hideClaimed) {
    items = items.filter((g) => !collected.has(gameKey(g)));
  }

  return items;
}

export function getVisibleGames() {
  const sort = els.sortFilter.value;
  const items = getFilteredGames();

  items.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);

    if (sort === "newest") {
      const ad = new Date(a.offerStart || 0).getTime();
      const bd = new Date(b.offerStart || 0).getTime();
      return bd - ad;
    }

    // ends-soon: sort by end date ascending, nulls last
    const ae = a.offerEnd ? new Date(a.offerEnd).getTime() : Infinity;
    const be = b.offerEnd ? new Date(b.offerEnd).getTime() : Infinity;
    return ae - be;
  });

  return items;
}

// Counts, per store, how many games would be visible if that store's chip
// were the only thing added back into the current filter set (search,
// status, hide-collected, redeem platform all still apply). Used to label
// chips like "Epic (3)".
export function getStoreCounts() {
  const counts = Object.create(null);
  for (const g of getFilteredGames({ skipStoreFilter: true })) {
    counts[g.store] = (counts[g.store] || 0) + 1;
  }
  return counts;
}

// Counts, per redemption platform, how many Prime Gaming games would be
// visible if that platform's chip were the only thing added back into the
// current filter set. Used to label chips like "GOG (2)".
export function getRedeemPlatformCounts() {
  const counts = Object.create(null);
  for (const g of getFilteredGames({ skipRedeemFilter: true })) {
    if (g.store !== "prime") continue;
    for (const p of g.platforms || []) {
      counts[p] = (counts[p] || 0) + 1;
    }
  }
  return counts;
}

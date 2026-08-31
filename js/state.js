// state.js
// Every piece of mutable app state, plus localStorage persistence. Other
// modules import the values directly (ES module bindings stay "live" —
// importers always see the current value). To *reassign* a value (not just
// mutate the Set/array in place), go through the exported setter — only the
// module that owns a `let` is allowed to rebind it.
//
// The "collected" set's actual localStorage read/write lives in
// collected-store.js (shared with backup.html) — this module just owns the
// live Set instance and the DOM painting that goes with it on index.html.

import { els } from "./dom.js";
import { loadCollected, persistCollected } from "./collected-store.js";

// ─── All games loaded from data/games.json ─────────────────────────────────

export let allGames = [];
export function setAllGames(games) {
  allGames = games;
}

// ─── Which games the user has marked collected (persisted) ────────────────

export let collected = loadCollected();

export function saveCollected() {
  persistCollected(collected);
  els.claimedCount.textContent = String(collected.size);
}

// ─── Free Now / Upcoming tab ────────────────────────────────────────────────

export let activeGamesTab = "free"; // "free" | "upcoming"
export function setActiveGamesTab(tab) {
  activeGamesTab = tab;
}

// ─── Store chip filter ──────────────────────────────────────────────────────

// "All stores" is a chip alongside the specific-store chips, not a separate
// control — split it out so its active state can be derived (active
// whenever every specific store happens to be selected) instead of tracked
// independently.
export const storeAllChip = els.storeChips.find((chip) => chip.dataset.store === "all");
export const storeSpecificChips = els.storeChips.filter((chip) => chip.dataset.store !== "all");

export let selectedStores = new Set(storeSpecificChips.map((chip) => chip.dataset.store));
export function setSelectedStores(stores) {
  selectedStores = stores;
}

// ─── Prime Gaming "redeemed via" platform filter ───────────────────────────

// Which redemption platforms (Epic, GOG, Legacy Games, Amazon Luna, etc.) are
// currently shown for Prime Gaming offers. Rebuilt from the data each load,
// since which platforms appear varies month to month.
export let selectedRedeemPlatforms = new Set();
export function setSelectedRedeemPlatforms(platforms) {
  selectedRedeemPlatforms = platforms;
}

// state.js
// Every piece of mutable app state, plus localStorage persistence. Other
// modules import the values directly (ES module bindings stay "live" —
// importers always see the current value). To *reassign* a value (not just
// mutate the Set/array in place), go through the exported setter — only the
// module that owns a `let` is allowed to rebind it.

import { els } from "./dom.js";
import { fmtRelativeBackup, isBackupStale } from "./format.js";

export const STORAGE_KEY = "fgt_collected_v2";

// ─── All games loaded from data/games.json ─────────────────────────────────

export let allGames = [];
export function setAllGames(games) {
  allGames = games;
}

// ─── Which games the user has marked collected (persisted) ────────────────

function loadCollected() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export let collected = loadCollected();

export function saveCollected() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]));
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

// ─── Backup / restore ───────────────────────────────────────────────────────

// Portable snapshot of the collected set. Kept as a small envelope (not a
// bare array) so future versions can add fields without breaking old
// exports, and so an import can sanity-check it's actually one of ours.
export function exportCollectedData() {
  return JSON.stringify(
    {
      type: "fgt_collected_backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      collected: [...collected],
    },
    null,
    2
  );
}

// mode: "merge" (default, union with what's already here) or "replace"
// (wipe first). Throws on anything that isn't recognizably a backup, so
// callers can show a friendly error instead of silently importing garbage.
export function importCollectedData(text, { mode = "merge" } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That doesn't look like valid backup data (not JSON).");
  }

  const incoming = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.collected)
      ? parsed.collected
      : null;

  if (!incoming) {
    throw new Error("That doesn't look like a Free Game Tracker backup file.");
  }

  const cleaned = incoming.filter((k) => typeof k === "string" && k.length);

  if (mode === "replace") {
    collected = new Set(cleaned);
  } else {
    for (const key of cleaned) collected.add(key);
  }

  saveCollected();
  return { count: collected.size, imported: cleaned.length };
}

// ─── Last backup timestamp (nudges people who haven't exported in a while) ─

const LAST_BACKUP_KEY = "fgt_last_backup_v1";

function loadLastBackupAt() {
  return localStorage.getItem(LAST_BACKUP_KEY) || null;
}

export let lastBackupAt = loadLastBackupAt();

function paintBackupStatus() {
  if (!els.backupStatus) return;
  els.backupStatus.textContent = fmtRelativeBackup(lastBackupAt);
  els.backupStatus.classList.toggle("stale", isBackupStale(lastBackupAt));
}

// Called after a successful export/copy — NOT after import, since importing
// restores data onto this device but doesn't create a new copy elsewhere.
export function setLastBackupAt(iso) {
  lastBackupAt = iso;
  localStorage.setItem(LAST_BACKUP_KEY, iso);
  paintBackupStatus();
}

paintBackupStatus(); // initial paint on load, using whatever was persisted

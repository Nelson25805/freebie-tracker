// collected-store.js
// Pure data layer for the "already collected" set and the backup
// timestamp — localStorage in, localStorage out, no DOM whatsoever. This
// is what lets index.html (state.js) and backup.html (backup-main.js)
// read and write the exact same data without either page depending on
// the other's markup.

export const STORAGE_KEY = "fgt_collected_v2";
const LAST_BACKUP_KEY = "fgt_last_backup_v1";

export function loadCollected() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function persistCollected(collected) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]));
}

// Portable snapshot of the collected set. Kept as a small envelope (not a
// bare array) so future versions can add fields without breaking old
// exports, and so an import can sanity-check it's actually one of ours.
export function exportCollectedData(collected) {
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

// mode: "merge" (default, union with `collected`) or "replace" (wipe
// first). Returns a NEW Set rather than mutating `collected` in place, so
// callers stay in control of when/whether the result gets persisted.
// Throws on anything that isn't recognizably a backup, so callers can show
// a friendly error instead of silently importing garbage.
export function importCollectedData(collected, text, { mode = "merge" } = {}) {
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

  const next = mode === "replace" ? new Set(cleaned) : new Set(collected);
  if (mode !== "replace") {
    for (const key of cleaned) next.add(key);
  }

  return { collected: next, imported: cleaned.length };
}

export function loadLastBackupAt() {
  return localStorage.getItem(LAST_BACKUP_KEY) || null;
}

export function persistLastBackupAt(iso) {
  localStorage.setItem(LAST_BACKUP_KEY, iso);
}

// backup-main.js
// Event wiring + boot for backup.html. Talks straight to collected-store.js
// (localStorage) — it doesn't need games data or anything else from
// index.html's state.

import { els } from "./backup-dom.js";
import {
  loadCollected,
  persistCollected,
  exportCollectedData,
  importCollectedData,
  loadLastBackupAt,
  persistLastBackupAt,
} from "./collected-store.js";
import { fmtRelativeBackup, isBackupStale } from "./format.js";

let collected = loadCollected();
let lastBackupAt = loadLastBackupAt();

function paintCollectedCount() {
  els.collectedCount.textContent = String(collected.size);
}

function paintBackupStatus() {
  els.backupStatus.textContent = fmtRelativeBackup(lastBackupAt);
  els.backupStatus.classList.toggle("stale", isBackupStale(lastBackupAt));
}

function setResult(text, isError = false) {
  els.backupResultText.textContent = text;
  els.backupResultText.style.color = isError ? "#ffb4b4" : "#b8ffcf";
}

// Called after a successful export/copy — NOT after import, since importing
// restores data onto this device but doesn't create a new copy elsewhere.
function markBackedUp() {
  lastBackupAt = new Date().toISOString();
  persistLastBackupAt(lastBackupAt);
  paintBackupStatus();
}

function currentImportMode() {
  return els.importModeReplace?.checked ? "replace" : "merge";
}

function applyImport(text) {
  const { collected: next, imported } = importCollectedData(collected, text, {
    mode: currentImportMode(),
  });
  collected = next;
  persistCollected(collected);
  paintCollectedCount();
  setResult(
    `Imported ${imported} entr${imported === 1 ? "y" : "ies"} — you now have ${collected.size} game(s) marked collected.`
  );
}

// ─── Export ─────────────────────────────────────────────────────────────

els.exportBtn.addEventListener("click", () => {
  const json = exportCollectedData(collected);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `free-game-tracker-collected-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  markBackedUp();
  setResult("Backup file downloaded.");
});

els.copyCodeBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportCollectedData(collected));
    markBackedUp();
    setResult("Backup code copied to your clipboard.");
  } catch {
    setResult("Couldn't access the clipboard — try the download button instead.", true);
  }
});

// ─── Import ─────────────────────────────────────────────────────────────

els.importBtn.addEventListener("click", () => els.importFileInput.click());

els.importFileInput.addEventListener("change", async () => {
  const file = els.importFileInput.files[0];
  if (!file) return;

  try {
    applyImport(await file.text());
  } catch (err) {
    setResult(err.message, true);
  } finally {
    els.importFileInput.value = ""; // lets the same file be re-selected later
  }
});

els.pasteCodeBtn.addEventListener("click", () => {
  const text = prompt("Paste your backup code here:");
  if (!text) return;

  try {
    applyImport(text);
  } catch (err) {
    setResult(err.message, true);
  }
});

// ─── Boot ───────────────────────────────────────────────────────────────

paintCollectedCount();
paintBackupStatus();

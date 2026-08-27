// main.js
// Event wiring + boot. This is the only file that should call
// addEventListener to tie user input to actions/render — every other
// module just exports functions and lets this one assemble them.

import { els } from "./dom.js";
import { saveCollected } from "./state.js";
import { render, setActiveGamesTabUI, updateOfferProgressBars } from "./render.js";
import { loadGames } from "./data.js";
import {
  syncStoreChips,
  toggleStoreChip,
  toggleCollected,
  markVisibleAsCollected,
  clearCollected,
  downloadCollectedBackup,
  uploadCollectedBackup,
  copyCollectedBackupToClipboard,
  importCollectedBackupFromText,
} from "./actions.js";

// ─── Event wiring ───────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const claimBtn = e.target.closest('[data-action="toggle-claimed"]');
  if (claimBtn) {
    toggleCollected(claimBtn.dataset.key, claimBtn);
    return;
  }

  const expandBtn = e.target.closest('[data-action="expand-desc"]');
  if (expandBtn) {
    const wrap = expandBtn.closest(".desc-wrap");
    const p = wrap.querySelector(".desc-text");
    const expanded = expandBtn.getAttribute("aria-expanded") === "true";
    if (expanded) {
      const full = p.dataset.full;
      p.textContent = full.slice(0, 160) + (full.length > 160 ? "…" : "");
      expandBtn.textContent = "Read more";
      expandBtn.setAttribute("aria-expanded", "false");
    } else {
      p.textContent = p.dataset.full;
      expandBtn.textContent = "Show less";
      expandBtn.setAttribute("aria-expanded", "true");
    }
  }
});

[els.searchInput, els.statusFilter, els.sortFilter, els.hideClaimed].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", render);
  el.addEventListener("change", render);
});

els.storeChips.forEach((chip) => {
  chip.setAttribute("aria-pressed", "true");
  chip.addEventListener("click", () => toggleStoreChip(chip));
});

els.freeTab.addEventListener("click", () => setActiveGamesTabUI("free"));
els.upcomingTab.addEventListener("click", () => setActiveGamesTabUI("upcoming"));

els.refreshBtn.addEventListener("click", loadGames);
els.resetBtn.addEventListener("click", clearCollected);
els.markAllBtn.addEventListener("click", markVisibleAsCollected);

els.refreshBtn.addEventListener("click", loadGames);
els.resetBtn.addEventListener("click", clearCollected);
els.markAllBtn.addEventListener("click", markVisibleAsCollected);

els.exportBtn.addEventListener("click", downloadCollectedBackup);

els.importBtn.addEventListener("click", () => els.importFileInput.click());

els.importFileInput.addEventListener("change", async () => {
  const file = els.importFileInput.files[0];
  if (!file) return;

  try {
    const { count, imported } = await uploadCollectedBackup(file, "merge");
    alert(`Imported ${imported} entr${imported === 1 ? "y" : "ies"} — you now have ${count} game(s) marked collected.`);
  } catch (err) {
    alert(err.message);
  } finally {
    els.importFileInput.value = ""; // lets the same file be re-selected later
  }
});

// Optional text/clipboard fallback
if (els.copyCodeBtn) {
  els.copyCodeBtn.addEventListener("click", async () => {
    try {
      await copyCollectedBackupToClipboard();
      alert("Backup code copied! Paste it anywhere to save it, or paste it into another device using 'Paste backup code'.");
    } catch {
      alert("Couldn't access the clipboard. Try Export instead.");
    }
  });
}

if (els.pasteCodeBtn) {
  els.pasteCodeBtn.addEventListener("click", async () => {
    const text = prompt("Paste your backup code here:");
    if (!text) return;
    try {
      const { count, imported } = await importCollectedBackupFromText(text, "merge");
      alert(`Imported ${imported} entr${imported === 1 ? "y" : "ies"} — you now have ${count} game(s) marked collected.`);
    } catch (err) {
      alert(err.message);
    }
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────

syncStoreChips();
saveCollected();
loadGames();
setInterval(updateOfferProgressBars, 30000); // keep bars fresh between full re-renders

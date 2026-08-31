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

// ─── Boot ───────────────────────────────────────────────────────────────────

syncStoreChips();
saveCollected();
loadGames();
setInterval(updateOfferProgressBars, 30000); // keep bars fresh between full re-renders

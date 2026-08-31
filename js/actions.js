// actions.js
// User-triggered state changes that aren't pure filtering: chip toggling,
// the claim micro-interaction/animation, mark-all/clear-all, and building
// the dynamic "redeemed via" chip row. Calls render() when it needs the
// grid to catch up with the new state.

import { els } from "./dom.js";
import {
  allGames,
  collected,
  saveCollected,
  activeGamesTab,
  selectedStores,
  setSelectedStores,
  storeAllChip,
  storeSpecificChips,
  selectedRedeemPlatforms,
  setSelectedRedeemPlatforms,
} from "./state.js";
import { gameKey, getVisibleGames } from "./filters.js";
import { render } from "./render.js";

// ─── Redeemed-via (Prime Gaming) chips ─────────────────────────────────────

function updateRedeemChipVisibility() {
  const hasMultiplePlatforms = els.redeemFilter.children.length > 1;
  els.redeemChipRow.hidden = !hasMultiplePlatforms || !selectedStores.has("prime");
}

export function buildRedeemChips() {
  const platforms = new Set();
  for (const g of allGames) {
    if (g.store === "prime") {
      for (const p of g.platforms || []) platforms.add(p);
    }
  }

  const sorted = [...platforms].sort();
  els.redeemFilter.innerHTML = "";
  setSelectedRedeemPlatforms(new Set(sorted));

  for (const platform of sorted) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip active";
    chip.dataset.platform = platform;
    chip.textContent = platform;
    chip.setAttribute("aria-pressed", "true");
    chip.addEventListener("click", () => toggleRedeemChip(chip));
    els.redeemFilter.appendChild(chip);
  }

  updateRedeemChipVisibility();
}

function toggleRedeemChip(chip) {
  const platform = chip.dataset.platform;
  if (selectedRedeemPlatforms.has(platform)) {
    selectedRedeemPlatforms.delete(platform);
    chip.classList.remove("active");
  } else {
    selectedRedeemPlatforms.add(platform);
    chip.classList.add("active");
  }
  chip.setAttribute("aria-pressed", selectedRedeemPlatforms.has(platform) ? "true" : "false");
  render();
}

// ─── Store chips ─────────────────────────────────────────────────────────────

export function syncStoreChips() {
  const allSelected = selectedStores.size === storeSpecificChips.length;
  if (storeAllChip) {
    storeAllChip.classList.toggle("active", allSelected);
    storeAllChip.setAttribute("aria-pressed", allSelected ? "true" : "false");
  }
  for (const chip of storeSpecificChips) {
    const active = selectedStores.has(chip.dataset.store);
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

export function toggleStoreChip(chip) {
  const store = chip.dataset.store;

  if (store === "all") {
    setSelectedStores(new Set(storeSpecificChips.map((c) => c.dataset.store)));
  } else if (selectedStores.size === storeSpecificChips.length) {
    // Was in "all" mode — clicking one store narrows down to just that one.
    setSelectedStores(new Set([store]));
  } else if (selectedStores.has(store)) {
    // Never allow zero stores selected — last one standing can't be removed.
    if (selectedStores.size > 1) selectedStores.delete(store);
  } else {
    selectedStores.add(store);
  }

  syncStoreChips();
  updateRedeemChipVisibility();
  render();
}

// ─── Claim micro-interaction ────────────────────────────────────────────────

// How long the claim micro-interaction plays before the grid fully
// re-renders (filters, sorting, "hide collected" etc. all still apply
// after this, so the animation is purely a bridge — not a replacement —
// for the real render).
const CLAIM_ANIM_MS = 480;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Plays a quick checkmark-and-fade over the card's cover art, and flips
// the action button's label/color immediately so the click feels instant
// even though the surrounding grid (counts, sort order, hide-collected
// filtering) doesn't catch up until the delayed render() below.
function playClaimAnimation(card, button, nowCollected) {
  if (button) {
    button.textContent = nowCollected ? "Unmark collected" : "Mark collected";
    button.classList.toggle("btn-ok", !nowCollected);
    button.classList.toggle("btn-danger", nowCollected);
  }

  if (!card || prefersReducedMotion()) return;

  card.classList.add("is-collect-pulse");
  card.addEventListener(
    "animationend",
    () => card.classList.remove("is-collect-pulse"),
    { once: true }
  );

  if (!nowCollected) return; // only show the checkmark when *claiming*, not un-claiming

  const cover = card.querySelector(".cover");
  if (!cover) return;

  const check = document.createElement("div");
  check.className = "claim-check";
  check.innerHTML =
    '<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
  cover.appendChild(check);
  check.addEventListener("animationend", () => check.remove(), { once: true });
}

export function toggleCollected(key, button) {
  if (collected.has(key)) collected.delete(key);
  else collected.add(key);
  saveCollected();

  const nowCollected = collected.has(key);
  const card = button?.closest(".card.game") || null;
  playClaimAnimation(card, button, nowCollected);

  const delay = prefersReducedMotion() ? 0 : CLAIM_ANIM_MS;
  window.setTimeout(render, delay);
}

export function markVisibleAsCollected() {
  const visible = getVisibleGames().filter((g) => g.status === activeGamesTab);
  for (const game of visible) {
    collected.add(gameKey(game));
  }
  saveCollected();
  render();
}

export function clearCollected() {
  if (!confirm("Clear all collected marks from this browser?")) return;
  collected.clear();
  saveCollected();
  render();
}
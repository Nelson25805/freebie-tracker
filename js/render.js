// render.js
// Everything that turns state into DOM: building cards/skeletons, painting
// the two grids, updating chip label counts, and switching tabs. Nothing in
// here mutates app state — it only reads it (via state.js/filters.js) and
// writes to the DOM. User-triggered state changes live in actions.js.

import { els } from "./dom.js";
import { collected, setActiveGamesTab, storeSpecificChips } from "./state.js";
import { gameKey, getVisibleGames, getStoreCounts, getRedeemPlatformCounts } from "./filters.js";
import {
  fmtDate,
  fmtEndDate,
  formatMoney,
  escapeHtml,
  storeLabel,
  storeChipBaseLabel,
  offerProgressMarkup,
  formatTimeLeft,
} from "./format.js";

// ─── Card status badge ──────────────────────────────────────────────────────

function cardStatusBadge(game) {
  const key = gameKey(game);
  if (collected.has(key)) return { label: "Already collected", cls: "claimed" };
  if (game.status === "free") return { label: "Free now", cls: "free" };
  return { label: "Upcoming", cls: "upcoming" };
}

// ─── Game cards ──────────────────────────────────────────────────────────────

export function buildGameCard(game) {
  const key = gameKey(game);
  const badge = cardStatusBadge(game);
  const endDateStr = game.offerEnd ? fmtEndDate(game.offerEnd) : null;
  const store = storeLabel(game.store);
  const originalFmt = game.originalPrice ? formatMoney(game.originalPrice) : null;

  const card = document.createElement("article");
  card.className = "card game";

  card.innerHTML = `
      <div class="cover">
        ${game.image ? `<img src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)} cover" loading="lazy">` : ""}
        <div class="badge ${badge.cls}">${badge.label}</div>
        <div class="store-tag store-icon ${store.cls}" title="${escapeHtml(game.storeName)}" aria-label="${escapeHtml(game.storeName)}">${store.icon}</div>
      </div>
      <div class="content">
        <div class="title-row">
          <h3 class="title">${escapeHtml(game.title)}</h3>
        </div>
        <div class="meta">${escapeHtml(game.storeName)}</div>
        <div class="prices">
          ${game.status === "free" ? `<span class="pill zero"><strong>$0.00</strong> to claim</span>` : ""}
          ${originalFmt ? `<span class="pill strike">Regular ${escapeHtml(originalFmt)}</span>` : ""}
          ${game.status === "free" && endDateStr ? `<span class="pill">Closes <strong>${endDateStr}</strong></span>` : ""}
          ${game.status === "upcoming" && game.offerStart ? `<span class="pill">Starts ${fmtDate(game.offerStart)}</span>` : ""}
          ${game.platforms?.length ? `<span class="pill">${escapeHtml(game.platforms.join(" · "))}</span>` : ""}
        </div>
         ${game.status === "free" ? offerProgressMarkup(game) : ""}
        <div class="desc-wrap">
          <p class="meta desc-text" data-full="${escapeHtml(game.description || "")}">${game.description
      ? escapeHtml(game.description).slice(0, 160) + (game.description.length > 160 ? "…" : "")
      : "No description available."
    }</p>${game.description && game.description.length > 160
      ? `<button class="btn-expand" data-action="expand-desc" aria-expanded="false">Read more</button>`
      : ""
    }
        </div>
        <div class="actions">
          <button class="btn ${collected.has(key) ? "btn-danger" : "btn-ok"}" data-action="toggle-claimed" data-key="${escapeHtml(key)}">
            ${collected.has(key) ? "Unmark collected" : "Mark collected"}
          </button>
          ${game.storeUrl
      ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${escapeHtml(game.storeUrl)}">Open store page</a>`
      : ""
    }
          ${game.sourcePost
      ? `<a class="btn btn-ghost" target="_blank" rel="noreferrer" href="${escapeHtml(game.sourcePost)}">PS Blog post</a>`
      : ""
    }
        </div>
      </div>
    `;

  return card;
}

// ─── Skeleton loading cards ──────────────────────────────────────────────────

function buildSkeletonCard() {
  const card = document.createElement("article");
  card.className = "card game skeleton-card";
  card.setAttribute("aria-hidden", "true");

  card.innerHTML = `
      <div class="cover skeleton-block"></div>
      <div class="content">
        <div class="title-row">
          <div class="skeleton-line skeleton-title"></div>
        </div>
        <div class="skeleton-line skeleton-meta"></div>
        <div class="prices">
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill"></span>
        </div>
        <div class="desc-wrap">
          <div class="skeleton-line skeleton-desc"></div>
          <div class="skeleton-line skeleton-desc short"></div>
        </div>
        <div class="actions">
          <span class="skeleton-btn"></span>
          <span class="skeleton-btn"></span>
        </div>
      </div>
    `;

  return card;
}

export function renderSkeletons(grid, emptyState, count = 6) {
  grid.innerHTML = "";
  if (emptyState) emptyState.hidden = true;
  for (let i = 0; i < count; i++) {
    grid.appendChild(buildSkeletonCard());
  }
}

// Renders one section's grid (Free Now or Upcoming) given its already
// status-filtered list of games, toggling that section's empty state.
function renderSection(grid, emptyState, games) {
  grid.innerHTML = "";
  emptyState.hidden = games.length !== 0;
  for (const game of games) {
    grid.appendChild(buildGameCard(game));
  }
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

// Shows the panel/grid for the selected tab and hides the other one.
// Only toggles visibility — both grids stay populated by render() so
// switching tabs is instant and doesn't require re-filtering.
export function setActiveGamesTabUI(tab) {
  setActiveGamesTab(tab);

  els.freeTab.classList.toggle("active", tab === "free");
  els.freeTab.setAttribute("aria-selected", tab === "free" ? "true" : "false");
  els.freePanel.hidden = tab !== "free";

  els.upcomingTab.classList.toggle("active", tab === "upcoming");
  els.upcomingTab.setAttribute("aria-selected", tab === "upcoming" ? "true" : "false");
  els.upcomingPanel.hidden = tab !== "upcoming";
}

// ─── Chip label counts ──────────────────────────────────────────────────────

function updateStoreChipCounts() {
  const counts = getStoreCounts();
  for (const chip of storeSpecificChips) {
    const store = chip.dataset.store;
    const count = counts[store] || 0;
    chip.textContent = `${storeChipBaseLabel(store)} (${count})`;
  }
}

function updateRedeemChipCounts() {
  const counts = getRedeemPlatformCounts();
  for (const chip of els.redeemFilter.querySelectorAll(".chip")) {
    const platform = chip.dataset.platform;
    const count = counts[platform] || 0;
    chip.textContent = `${platform} (${count})`;
  }
}

// ─── Main render ─────────────────────────────────────────────────────────────

export function render() {
  const visible = getVisibleGames();
  const freeGames = visible.filter((g) => g.status === "free");
  const upcomingGames = visible.filter((g) => g.status === "upcoming");

  renderSection(els.freeGrid, els.freeEmptyState, freeGames);
  renderSection(els.upcomingGrid, els.upcomingEmptyState, upcomingGames);

  els.freeSectionCount.textContent = String(freeGames.length);
  els.upcomingSectionCount.textContent = String(upcomingGames.length);

  updateStoreChipCounts();
  updateRedeemChipCounts();
}

// ─── Offer progress bar ticking (independent of full re-render) ───────────

export function updateOfferProgressBars() {
  document.querySelectorAll(".offer-progress-wrap").forEach((wrap) => {
    const bar = wrap.querySelector(".offer-progress");
    const countdown = wrap.querySelector(".offer-countdown");
    if (!bar) return;

    const start = new Date(bar.dataset.start).getTime();
    const end = new Date(bar.dataset.end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

    const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
    const fill = bar.querySelector(".offer-progress-fill");
    if (fill) fill.style.width = `${pct.toFixed(1)}%`;

    const urgent = pct >= 85;
    bar.classList.toggle("urgent", urgent);
    bar.title = `${Math.round(pct)}% of claim window elapsed`;

    if (countdown) {
      const timeLeft = formatTimeLeft(bar.dataset.end);
      if (timeLeft) countdown.textContent = timeLeft;
      countdown.classList.toggle("urgent", urgent);
    }
  });
}

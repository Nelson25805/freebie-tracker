import { els } from "./history-dom.js";
import { monthGames, selectedStores } from "./history-state.js";
import { escapeHtml, storeLabel, fmtDate } from "./format.js";

function getFilteredGames() {
  const q = els.searchInput.value.trim().toLowerCase();
  let items = monthGames.filter((g) => selectedStores.has(g.store));

  if (q) {
    items = items.filter((g) => [g.title, g.storeName, g.seller].join(" ").toLowerCase().includes(q));
  }

  const sort = els.sortSelect.value;
  items.sort((a, b) =>
    sort === "title" ? a.title.localeCompare(b.title) : new Date(a.firstSeen || 0) - new Date(b.firstSeen || 0)
  );

  return items;
}

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function buildHistoryCard(game) {
  const store = storeLabel(game.store);
  const span = game.firstSeen && game.lastSeen ? daysBetween(game.firstSeen, game.lastSeen) : null;

  const card = document.createElement("article");
  card.className = "card game";
  card.innerHTML = `
    <div class="cover">
      ${game.image ? `<img src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)} cover" loading="lazy">` : ""}
      <div class="badge free">Was free</div>
      <div class="store-tag store-icon ${store.cls}" title="${escapeHtml(game.storeName)}" aria-label="${escapeHtml(game.storeName)}">${store.icon}</div>
    </div>
    <div class="content">
      <div class="title-row"><h3 class="title">${escapeHtml(game.title)}</h3></div>
      <div class="meta">${escapeHtml(game.storeName)}</div>
      <div class="prices">
        ${game.firstSeen ? `<span class="pill">First seen ${fmtDate(game.firstSeen)}</span>` : ""}
        ${span ? `<span class="pill">Free for ~${span} day${span === 1 ? "" : "s"}</span>` : ""}
      </div>
      <div class="desc-wrap">
        <p class="meta desc-text">${game.description
      ? escapeHtml(game.description).slice(0, 160) + (game.description.length > 160 ? "…" : "")
      : "No description available."
    }</p>
      </div>
      <div class="actions">
        ${game.storeUrl ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${escapeHtml(game.storeUrl)}">Open store page</a>` : ""}
      </div>
    </div>
  `;
  return card;
}

export function render() {
  const games = getFilteredGames();
  els.grid.innerHTML = "";
  els.emptyState.hidden = games.length !== 0;
  for (const game of games) els.grid.appendChild(buildHistoryCard(game));
}
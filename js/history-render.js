import { els } from "./history-dom.js";
import { monthGames, selectedStores } from "./history-state.js";
import { escapeHtml, storeLabel, fmtDate, fmtEndDate } from "./format.js";

// See render.js for rationale — only ever render http(s) URLs into href/src.
function isSafeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

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

// Prefers the offer's real claim window (offerStart → offerEnd) for both
// whether it's actually over and how long it runs. firstSeen/lastSeen only
// reflect how often the Action happened to scrape it, which is meaningless
// on day one — every game would round to "~1 day" no matter its real length.
// Falls back to firstSeen/lastSeen only for stores with no known window
// (mainly Prime Gaming), and only once that span is actually informative.
function offerStatus(game) {
  const hasWindow = game.offerStart && game.offerEnd;

  if (hasWindow) {
    const expired = new Date(game.offerEnd).getTime() < Date.now();
    const span = daysBetween(game.offerStart, game.offerEnd);
    return { expired, span };
  }

  const scrapedSpan = game.firstSeen && game.lastSeen ? daysBetween(game.firstSeen, game.lastSeen) : null;
  return { expired: null, span: scrapedSpan && scrapedSpan > 1 ? scrapedSpan : null };
}

function buildHistoryCard(game) {
  const store = storeLabel(game.store);
  const { expired, span } = offerStatus(game);

  // expired === true  -> claim window has actually passed: "Was free"
  // expired === false -> still currently claimable: "Still free"
  // expired === null  -> no known window (e.g. most Prime offers): neutral "Free"
  const badgeLabel = expired === true ? "Was free" : expired === false ? "Still free" : "Free";
  const badgeCls = expired === false ? "upcoming" : "free"; // reuses existing badge color classes

  const safeImage = isSafeUrl(game.image) ? game.image : "";
  const safeStoreUrl = isSafeUrl(game.storeUrl) ? game.storeUrl : "";

  const card = document.createElement("article");
  card.className = "card game";
  card.innerHTML = `
    <div class="cover">
      ${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="${escapeHtml(game.title)} cover" loading="lazy">` : ""}
      <div class="badge ${badgeCls}">${badgeLabel}</div>
      <div class="store-tag store-icon ${store.cls}" title="${escapeHtml(game.storeName)}" aria-label="${escapeHtml(game.storeName)}">${store.icon}</div>
    </div>
    <div class="content">
      <div class="title-row"><h3 class="title">${escapeHtml(game.title)}</h3></div>
      <div class="meta">${escapeHtml(game.storeName)}</div>
      <div class="prices">
        ${game.firstSeen ? `<span class="pill">First seen ${fmtDate(game.firstSeen)}</span>` : ""}
        ${span ? `<span class="pill">Free for ~${span} day${span === 1 ? "" : "s"}</span>` : ""}
        ${expired === false && game.offerEnd ? `<span class="pill">Free until <strong>${fmtEndDate(game.offerEnd)}</strong></span>` : ""}
      </div>
      <div class="desc-wrap">
        <p class="meta desc-text">${game.description
      ? escapeHtml(game.description).slice(0, 160) + (game.description.length > 160 ? "…" : "")
      : "No description available."
    }</p>
      </div>
      <div class="actions">
        ${safeStoreUrl ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${escapeHtml(safeStoreUrl)}">Open store page</a>` : ""}
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
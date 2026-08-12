// Data is pre-fetched by GitHub Actions and written to data/games.json.
// The page simply reads that static file — no live API calls at page load.
const DATA_URL = "./data/games.json";

const STORAGE_KEY = "fgt_collected_v2";

const els = {
  freeTab: document.getElementById("freeTab"),
  upcomingTab: document.getElementById("upcomingTab"),
  freePanel: document.getElementById("freePanel"),
  upcomingPanel: document.getElementById("upcomingPanel"),
  freeGrid: document.getElementById("freeGrid"),
  freeEmptyState: document.getElementById("freeEmptyState"),
  freeSectionCount: document.getElementById("freeSectionCount"),
  upcomingGrid: document.getElementById("upcomingGrid"),
  upcomingEmptyState: document.getElementById("upcomingEmptyState"),
  upcomingSectionCount: document.getElementById("upcomingSectionCount"),
  searchInput: document.getElementById("searchInput"),
  storeFilter: document.getElementById("storeFilter"),
  storeChips: Array.from(document.getElementById("storeFilter").querySelectorAll(".chip")),
  redeemChipRow: document.getElementById("redeemChipRow"),
  redeemFilter: document.getElementById("redeemFilter"),
  statusFilter: document.getElementById("statusFilter"),
  sortFilter: document.getElementById("sortFilter"),
  hideClaimed: document.getElementById("hideClaimed"),
  refreshBtn: document.getElementById("refreshBtn"),
  resetBtn: document.getElementById("resetBtn"),
  markAllBtn: document.getElementById("markAllBtn"),
  currentCount: document.getElementById("currentCount"),
  upcomingCount: document.getElementById("upcomingCount"),
  claimedCount: document.getElementById("claimedCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  statusText: document.getElementById("statusText"),
  statusDot: document.getElementById("statusDot"),
};

let allGames = [];
let collected = loadCollected();
let activeGamesTab = "free"; // "free" | "upcoming"
let selectedStores = new Set(els.storeChips.map((chip) => chip.dataset.store));
// Which redemption platforms (Epic, GOG, Legacy Games, Amazon Luna, etc.) are
// currently shown for Prime Gaming offers. Rebuilt from the data each load,
// since which platforms appear varies month to month.
let selectedRedeemPlatforms = new Set();

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadCollected() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveCollected() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]));
  els.claimedCount.textContent = String(collected.size);
}

// ─── Status indicator ─────────────────────────────────────────────────────────

function setStatus(text, mode = "idle") {
  els.statusText.textContent = text;
  els.statusDot.className =
    "dot" +
    (mode === "ok" ? " ok" : mode === "busy" ? " busy" : mode === "err" ? " err" : "");
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDate(value) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function fmtEndDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n / 100);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(text) {
  if (!text) return "";

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;

  return textarea.value;
}

function storeLabel(store) {
  if (store === "epic") {
    return { label: "Epic", cls: "store-epic" };
  }

  if (store === "gog") {
    return { label: "GOG", cls: "store-gog" };
  }

  if (store === "psplus") {
    return { label: "PS Plus", cls: "store-psplus" };
  }

  if (store === "prime") {
    return { label: "Prime", cls: "store-prime" };
  }

  if (store === "steam") {
    return { label: "Steam", cls: "store-steam" };
  }

  return { label: store, cls: "" };
}

// Base (count-free) label for each store filter chip, keyed by chip's
// data-store value. Falls back to storeLabel()'s label for anything not
// listed here, so new stores don't need to be added in two places.
function storeChipBaseLabel(store) {
  return storeLabel(store).label;
}

// ─── Filtering & sorting ──────────────────────────────────────────────────────

function gameKey(game) {
  return game.id || game.slug || game.title;
}

// Applies every filter (search, status, hide-collected, redeem platform) and
// optionally the store chip filter. Pulled out from getVisibleGames() so the
// store chip counts can reuse the exact same logic while skipping only the
// store filter itself — that way each chip's count reflects "how many games
// would show up if I picked this store," given the other filters in place.
function getFilteredGames({ skipStoreFilter = false, skipRedeemFilter = false } = {}) {
  const q = els.searchInput.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  const hideClaimed = els.hideClaimed.checked;

  let items = [...allGames];

  if (q) {
    items = items.filter((g) =>
      [g.title, g.storeName, g.seller, g.slug].join(" ").toLowerCase().includes(q)
    );
  }

  if (!skipStoreFilter) {
    items = items.filter((g) => selectedStores.has(g.store));
  }

  // Redemption-platform filter only applies to Prime Gaming offers, since
  // that's the only store where the claim platform varies (Epic, GOG,
  // Legacy Games, Amazon Games App, native Amazon Luna, etc.). Games with
  // no recorded platform are left visible rather than hidden by default.
  if (!skipRedeemFilter) {
    items = items.filter((g) => {
      if (g.store !== "prime") return true;
      if (!g.platforms?.length) return true;
      return g.platforms.some((p) => selectedRedeemPlatforms.has(p));
    });
  }

  if (status !== "all") {
    if (status === "claimed") {
      items = items.filter((g) => collected.has(gameKey(g)));
    } else {
      items = items.filter((g) => g.status === status);
    }
  }

  if (hideClaimed) {
    items = items.filter((g) => !collected.has(gameKey(g)));
  }

  return items;
}

function getVisibleGames() {
  const sort = els.sortFilter.value;
  const items = getFilteredGames();

  items.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);

    if (sort === "newest") {
      const ad = new Date(a.offerStart || 0).getTime();
      const bd = new Date(b.offerStart || 0).getTime();
      return bd - ad;
    }

    // ends-soon: sort by end date ascending, nulls last
    const ae = a.offerEnd ? new Date(a.offerEnd).getTime() : Infinity;
    const be = b.offerEnd ? new Date(b.offerEnd).getTime() : Infinity;
    return ae - be;
  });

  return items;
}

// Counts, per store, how many games would be visible if that store's chip
// were the only thing added back into the current filter set (search,
// status, hide-collected, redeem platform all still apply). Used to label
// chips like "Epic (3)".
function getStoreCounts() {
  const counts = Object.create(null);
  for (const g of getFilteredGames({ skipStoreFilter: true })) {
    counts[g.store] = (counts[g.store] || 0) + 1;
  }
  return counts;
}

function updateStoreChipCounts() {
  const counts = getStoreCounts();
  for (const chip of els.storeChips) {
    const store = chip.dataset.store;
    const count = counts[store] || 0;
    chip.textContent = `${storeChipBaseLabel(store)} (${count})`;
  }
}

// Counts, per redemption platform, how many Prime Gaming games would be
// visible if that platform's chip were the only thing added back into the
// current filter set (search, status, hide-collected, and the store chips
// all still apply — only the redeem-platform filter itself is skipped).
// Used to label chips like "GOG (2)".
function getRedeemPlatformCounts() {
  const counts = Object.create(null);
  for (const g of getFilteredGames({ skipRedeemFilter: true })) {
    if (g.store !== "prime") continue;
    for (const p of g.platforms || []) {
      counts[p] = (counts[p] || 0) + 1;
    }
  }
  return counts;
}

function updateRedeemChipCounts() {
  const counts = getRedeemPlatformCounts();
  for (const chip of els.redeemFilter.querySelectorAll(".chip")) {
    const platform = chip.dataset.platform;
    const count = counts[platform] || 0;
    chip.textContent = `${platform} (${count})`;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function cardStatusBadge(game) {
  const key = gameKey(game);
  if (collected.has(key)) return { label: "Already collected", cls: "claimed" };
  if (game.status === "free") return { label: "Free now", cls: "free" };
  return { label: "Upcoming", cls: "upcoming" };
}

function buildGameCard(game) {
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
        <div class="store-tag ${store.cls}">${store.label}</div>
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

// Renders one section's grid (Free Now or Upcoming) given its already
// status-filtered list of games, toggling that section's empty state.
function renderSection(grid, emptyState, games) {
  grid.innerHTML = "";
  emptyState.hidden = games.length !== 0;
  for (const game of games) {
    grid.appendChild(buildGameCard(game));
  }
}

// Shows the panel/grid for the selected tab and hides the other one.
// Only toggles visibility — both grids stay populated by render() so
// switching tabs is instant and doesn't require re-filtering.
function setActiveGamesTab(tab) {
  activeGamesTab = tab;

  els.freeTab.classList.toggle("active", tab === "free");
  els.freeTab.setAttribute("aria-selected", tab === "free" ? "true" : "false");
  els.freePanel.hidden = tab !== "free";

  els.upcomingTab.classList.toggle("active", tab === "upcoming");
  els.upcomingTab.setAttribute("aria-selected", tab === "upcoming" ? "true" : "false");
  els.upcomingPanel.hidden = tab !== "upcoming";
}

function render() {
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

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadGames() {
  setStatus("Loading game data…", "busy");
  els.refreshBtn.disabled = true;

  try {
    // Cache-bust so GitHub Pages serves the latest committed file
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();

    allGames = (payload.games || []).map(game => ({
      ...game,
      title: decodeHtmlEntities(game.title),
      description: decodeHtmlEntities(game.description)
    }));

    const freeCount = allGames.filter((g) => g.status === "free").length;
    const upcomingCount = allGames.filter((g) => g.status === "upcoming").length;

    els.currentCount.textContent = String(freeCount);
    els.upcomingCount.textContent = String(upcomingCount);
    els.claimedCount.textContent = String(collected.size);

    if (payload.fetchedAt) {
      els.lastUpdated.textContent = `Data last fetched: ${new Intl.DateTimeFormat(undefined, {
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(payload.fetchedAt))}`;
    } else {
      els.lastUpdated.textContent = "Data has not been fetched yet — run the GitHub Action.";
    }

    if (allGames.length === 0 && !payload.fetchedAt) {
      setStatus("No data yet. Trigger the GitHub Action to fetch game data.", "err");
    } else {
      setStatus(`${freeCount} free now, ${upcomingCount} upcoming.`, "ok");
    }

    buildRedeemChips();
    render();
  } catch (err) {
    console.error(err);
    setStatus(
      "Could not load game data. Make sure data/games.json exists in the repo.",
      "err"
    );
    const errorHtml = `
      <div class="empty">
        Game data could not be loaded.<br>
        If you just set up the repo, go to <strong>Actions</strong> on GitHub and run
        <em>Fetch Free Games Data</em> manually to generate <code>data/games.json</code>.
      </div>
    `;
    els.freeGrid.innerHTML = errorHtml;
    els.freeEmptyState.hidden = true;
    els.upcomingGrid.innerHTML = "";
    els.upcomingEmptyState.hidden = true;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

// ─── Redeemed-via (Prime Gaming) chips ────────────────────────────────────────

function updateRedeemChipVisibility() {
  const hasMultiplePlatforms = els.redeemFilter.children.length > 1;
  els.redeemChipRow.hidden = !hasMultiplePlatforms || !selectedStores.has("prime");
}

function buildRedeemChips() {
  const platforms = new Set();
  for (const g of allGames) {
    if (g.store === "prime") {
      for (const p of g.platforms || []) platforms.add(p);
    }
  }

  const sorted = [...platforms].sort();
  els.redeemFilter.innerHTML = "";
  selectedRedeemPlatforms = new Set(sorted);

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

function toggleStoreChip(chip) {
  const store = chip.dataset.store;
  if (selectedStores.has(store)) {
    selectedStores.delete(store);
    chip.classList.remove("active");
  } else {
    selectedStores.add(store);
    chip.classList.add("active");
  }
  chip.setAttribute("aria-pressed", selectedStores.has(store) ? "true" : "false");
  updateRedeemChipVisibility();
  render();
}

function toggleCollected(key) {
  if (collected.has(key)) collected.delete(key);
  else collected.add(key);
  saveCollected();
  render();
}

function markVisibleAsCollected() {
  const visible = getVisibleGames().filter((g) => g.status === activeGamesTab);
  for (const game of visible) {
    collected.add(gameKey(game));
  }
  saveCollected();
  render();
}

function clearCollected() {
  if (!confirm("Clear all collected marks from this browser?")) return;
  collected.clear();
  saveCollected();
  render();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const claimBtn = e.target.closest('[data-action="toggle-claimed"]');
  if (claimBtn) {
    toggleCollected(claimBtn.dataset.key);
    return;
  }

  const expandBtn = e.target.closest('[data-action="expand-desc"]');
  if (expandBtn) {
    const wrap = expandBtn.closest('.desc-wrap');
    const p = wrap.querySelector('.desc-text');
    const expanded = expandBtn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      const full = p.dataset.full;
      p.textContent = full.slice(0, 160) + (full.length > 160 ? '…' : '');
      expandBtn.textContent = 'Read more';
      expandBtn.setAttribute('aria-expanded', 'false');
    } else {
      p.textContent = p.dataset.full;
      expandBtn.textContent = 'Show less';
      expandBtn.setAttribute('aria-expanded', 'true');
    }
  }
});

[els.searchInput, els.statusFilter, els.sortFilter, els.hideClaimed].forEach(
  (el) => {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
);

els.storeChips.forEach((chip) => {
  chip.setAttribute("aria-pressed", "true");
  chip.addEventListener("click", () => toggleStoreChip(chip));
});

els.freeTab.addEventListener("click", () => setActiveGamesTab("free"));
els.upcomingTab.addEventListener("click", () => setActiveGamesTab("upcoming"));

els.refreshBtn.addEventListener("click", loadGames);
els.resetBtn.addEventListener("click", clearCollected);
els.markAllBtn.addEventListener("click", markVisibleAsCollected);

// ─── Boot ─────────────────────────────────────────────────────────────────────

saveCollected();
loadGames();
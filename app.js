// Data is pre-fetched by GitHub Actions and written to data/games.json.
// The page simply reads that static file — no live API calls at page load.
const DATA_URL = "./data/games.json";

const STORAGE_KEY = "fgt_collected_v2";

const els = {
  grid: document.getElementById("gamesGrid"),
  emptyState: document.getElementById("emptyState"),
  searchInput: document.getElementById("searchInput"),
  storeFilter: document.getElementById("storeFilter"),
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

function hoursLeft(value) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - Date.now()) / 36e5));
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

function storeLabel(store) {
  if (store === "epic") return { label: "Epic", cls: "store-epic" };
  if (store === "gog") return { label: "GOG", cls: "store-gog" };
  return { label: store, cls: "" };
}

// ─── Filtering & sorting ──────────────────────────────────────────────────────

function gameKey(game) {
  return game.id || game.slug || game.title;
}

function getVisibleGames() {
  const q = els.searchInput.value.trim().toLowerCase();
  const store = els.storeFilter.value;
  const status = els.statusFilter.value;
  const hideClaimed = els.hideClaimed.checked;
  const sort = els.sortFilter.value;

  let items = [...allGames];

  if (q) {
    items = items.filter((g) =>
      [g.title, g.storeName, g.seller, g.slug].join(" ").toLowerCase().includes(q)
    );
  }

  if (store !== "all") {
    items = items.filter((g) => g.store === store);
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

// ─── Rendering ────────────────────────────────────────────────────────────────

function cardStatusBadge(game) {
  const key = gameKey(game);
  if (collected.has(key)) return { label: "Already collected", cls: "claimed" };
  if (game.status === "free") return { label: "Free now", cls: "free" };
  return { label: "Upcoming", cls: "upcoming" };
}

function render() {
  const visible = getVisibleGames();
  els.grid.innerHTML = "";
  els.emptyState.hidden = visible.length !== 0;

  for (const game of visible) {
    const key = gameKey(game);
    const badge = cardStatusBadge(game);
    const hours = game.status === "free" ? hoursLeft(game.offerEnd) : null;
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
        <div class="meta">${escapeHtml(game.seller || game.storeName)}</div>
        <div class="prices">
          ${game.status === "free" ? `<span class="pill zero"><strong>$0.00</strong> to claim</span>` : ""}
          ${originalFmt ? `<span class="pill strike">Regular ${escapeHtml(originalFmt)}</span>` : ""}
          ${hours !== null ? `<span class="pill">Ends in about <strong>${hours}h</strong></span>` : ""}
          ${game.offerEnd && game.status === "free" && hours === null ? `<span class="pill">Ends ${fmtDate(game.offerEnd)}</span>` : ""}
          ${game.status === "upcoming" && game.offerStart ? `<span class="pill">Starts ${fmtDate(game.offerStart)}</span>` : ""}
        </div>
        <div class="meta">${game.description
            ? escapeHtml(game.description).slice(0, 160) + (game.description.length > 160 ? "…" : "")
            : "No description available."
          }</div>
        <div class="actions">
          <button class="btn ${collected.has(key) ? "btn-danger" : "btn-ok"}" data-action="toggle-claimed" data-key="${escapeHtml(key)}">
            ${collected.has(key) ? "Unmark collected" : "Mark collected"}
          </button>
          ${game.storeUrl
            ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${escapeHtml(game.storeUrl)}">Open store page</a>`
            : ""
          }
        </div>
      </div>
    `;

    els.grid.appendChild(card);
  }
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

    allGames = payload.games || [];

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

    render();
  } catch (err) {
    console.error(err);
    setStatus(
      "Could not load game data. Make sure data/games.json exists in the repo.",
      "err"
    );
    els.grid.innerHTML = `
      <div class="empty">
        Game data could not be loaded.<br>
        If you just set up the repo, go to <strong>Actions</strong> on GitHub and run
        <em>Fetch Free Games Data</em> manually to generate <code>data/games.json</code>.
      </div>
    `;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function toggleCollected(key) {
  if (collected.has(key)) collected.delete(key);
  else collected.add(key);
  saveCollected();
  render();
}

function markVisibleAsCollected() {
  for (const game of getVisibleGames()) {
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
  const btn = e.target.closest('[data-action="toggle-claimed"]');
  if (!btn) return;
  toggleCollected(btn.dataset.key);
});

[els.searchInput, els.storeFilter, els.statusFilter, els.sortFilter, els.hideClaimed].forEach(
  (el) => {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
);

els.refreshBtn.addEventListener("click", loadGames);
els.resetBtn.addEventListener("click", clearCollected);
els.markAllBtn.addEventListener("click", markVisibleAsCollected);

// ─── Boot ─────────────────────────────────────────────────────────────────────

saveCollected();
loadGames();

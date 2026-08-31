// data.js
// Fetches data/games.json and updates status/stat text. The only module
// that talks to the network.

import { els } from "./dom.js";
import { setAllGames, collected } from "./state.js";
import { decodeHtmlEntities } from "./format.js";
import { renderSkeletons, render } from "./render.js";
import { buildRedeemChips } from "./actions.js";

// Data is pre-fetched by GitHub Actions and written to data/games.json.
// The page simply reads that static file — no live API calls at page load.
const DATA_URL = "./data/games.json";

const ENDING_SOON_MS = 48 * 60 * 60 * 1000; // 48 hours

function countEndingSoon(games) {
  const now = Date.now();
  return games.filter((g) => {
    if (g.status !== "free" || !g.offerEnd) return false;
    const end = new Date(g.offerEnd).getTime();
    if (Number.isNaN(end)) return false;
    const diff = end - now;
    return diff > 0 && diff <= ENDING_SOON_MS;
  }).length;
}

function setStatus(text, mode = "idle") {
  els.statusText.textContent = text;
  els.statusDot.className =
    "dot" +
    (mode === "ok" ? " ok" : mode === "busy" ? " busy" : mode === "err" ? " err" : "");
}

export async function loadGames() {
  setStatus("Loading game data…", "busy");
  els.refreshBtn.disabled = true;

  // Show placeholder cards immediately so the layout feels populated
  // while the fetch is in flight, instead of a blank grid + status text.
  renderSkeletons(els.freeGrid, els.freeEmptyState, 6);
  renderSkeletons(els.upcomingGrid, els.upcomingEmptyState, 3);

  try {
    // Cache-bust so GitHub Pages serves the latest committed file
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();

    const games = (payload.games || []).map((game) => ({
      ...game,
      title: decodeHtmlEntities(game.title),
      description: decodeHtmlEntities(game.description),
    }));
    setAllGames(games);

    const freeCount = games.filter((g) => g.status === "free").length;
    const upcomingCount = games.filter((g) => g.status === "upcoming").length;
    const endingSoonCount = countEndingSoon(games);

    els.currentCount.textContent = String(freeCount);
    els.upcomingCount.textContent = String(upcomingCount);
    els.claimedCount.textContent = String(collected.size);
    els.endingSoonCount.textContent = String(endingSoonCount);

    if (payload.fetchedAt) {
      els.lastUpdated.textContent = `Data last fetched: ${new Intl.DateTimeFormat(undefined, {
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(payload.fetchedAt))}`;
    } else {
      els.lastUpdated.textContent = "Data has not been fetched yet — run the GitHub Action.";
    }

    if (games.length === 0 && !payload.fetchedAt) {
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

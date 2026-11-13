/**
 * notify-newsletter.js
 *
 * Helpers for emailing "instant" subscribers about brand-new free games via
 * the Apps Script web app.
 *
 * Detection (findNewFreeGames) and sending (sendNewGamesNotification) are
 * split so the workflow can detect new games during the fetch, but only send
 * the emails after the data has been pushed successfully.
 */

import fetch from "node-fetch";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const FETCH_SECRET = process.env.FETCH_SECRET;

// Games that are free now and were NOT already free in the previous run's data.
// Comparing against previously-FREE ids (not all ids) matters: Epic and PS Plus
// list games as "upcoming" before they go free, so their ids are already known
// by the time they become claimable. Without this, upcoming -> free transitions
// would never be announced.
export function findNewFreeGames(previousGames, currentGames) {
  const previousFreeIds = new Set(
    previousGames.filter((g) => g.status === "free").map((g) => g.id)
  );
  return currentGames.filter((g) => g.status === "free" && !previousFreeIds.has(g.id));
}

export async function sendNewGamesNotification(newGames) {
  if (!APPS_SCRIPT_URL || !FETCH_SECRET) {
    console.log("  Newsletter: APPS_SCRIPT_URL / FETCH_SECRET not set, skipping notify step.");
    return;
  }

  if (!newGames.length) {
    console.log("  Newsletter: no new free games this run, nothing to notify.");
    return;
  }

  console.log(`  Newsletter: ${newGames.length} new free game(s), notifying subscribers…`);
  console.log(`  Newsletter: games → ${newGames.map((g) => g.title).join(", ")}`);

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "notifyNewGames",
        secret: FETCH_SECRET,
        games: newGames.map((g) => ({
          id: g.id,
          store: g.store,
          storeName: g.storeName,
          title: g.title,
          storeUrl: g.storeUrl,
          offerEnd: g.offerEnd,
          image: g.image,
          platforms: g.platforms,
        })),
      }),
    });

    // Apps Script often answers 200 even when the script itself failed
    // (bad secret, quota exceeded, exception), so log the body too.
    const body = await res.text().catch(() => "");
    console.log(`  Newsletter: notify request sent (HTTP ${res.status}).`);
    console.log(`  Newsletter: response body: ${body.slice(0, 500)}`);

    if (!res.ok) {
      console.warn("  Newsletter: non-OK response — subscribers may not have been emailed.");
    }
  } catch (err) {
    console.warn("  Newsletter: notify request failed:", err.message);
  }
}

// Kept for backward compatibility: detect + send in one call.
export async function notifyNewGames(previousGames, currentGames) {
  return sendNewGamesNotification(findNewFreeGames(previousGames, currentGames));
}
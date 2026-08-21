/**
 * notify-newsletter.js
 *
 * Compares this run's free games against the previous run and, if any
 * brand-new free games showed up, pings the Apps Script web app so it can
 * email "instant" subscribers. Costs nothing — it's just an HTTPS POST
 * to your own free Apps Script deployment. Silently no-ops if the two
 * required env vars aren't set, so it's safe to add before you've
 * finished the newsletter setup.
 */

import fetch from "node-fetch";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const FETCH_SECRET = process.env.FETCH_SECRET;

export async function notifyNewGames(previousGames, currentGames) {
  if (!APPS_SCRIPT_URL || !FETCH_SECRET) {
    console.log("  Newsletter: APPS_SCRIPT_URL / FETCH_SECRET not set, skipping notify step.");
    return;
  }

  const previousIds = new Set(previousGames.map((g) => g.id));
  const newGames = currentGames.filter((g) => g.status === "free" && !previousIds.has(g.id));

  if (!newGames.length) {
    console.log("  Newsletter: no new free games this run, nothing to notify.");
    return;
  }

  console.log(`  Newsletter: ${newGames.length} new free game(s), notifying subscribers…`);

  try {
    await fetch(APPS_SCRIPT_URL, {
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
    console.log("  Newsletter: notify request sent.");
  } catch (err) {
    console.warn("  Newsletter: notify request failed:", err.message);
  }
}

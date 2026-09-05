/**
 * fetchers/steam.js
 * 
 * Steam free-to-keep promotions are not available via a public API, so this fetcher
 * uses the GamerPower API to get a list of Steam giveaways. GamerPower aggregates
 * free game promotions from various sources, including Steam.
 */

import fetch from "node-fetch";

const GAMERPOWER_URL =
  "https://www.gamerpower.com/api/giveaways?platform=steam&type=game";

function parseWorthToCents(worth) {
  if (!worth) return null;
  const match = String(worth).match(/[\d.]+/);
  if (!match) return null;
  return Math.round(parseFloat(match[0]) * 100);
}

export async function fetchSteam() {
  console.log("Fetching Steam free-to-keep promotions via GamerPower…");

  try {
    const res = await fetch(GAMERPOWER_URL, {
      headers: { "User-Agent": "freebie-tracker/1.0 (github-actions)" },
    });

    if (!res.ok) throw new Error(`GamerPower HTTP ${res.status}`);

    const body = await res.json();

    const items = Array.isArray(body) ? body : Array.isArray(body?.giveaways) ? body.giveaways : null;

    if (!items) {
      console.warn(
        "  GamerPower response wasn't an array (or {giveaways:[...]}) — response shape may have changed."
      );
      console.log("  Raw response sample:", JSON.stringify(body).slice(0, 500));
      return [];
    }

    console.log(`  Found ${items.length} Steam giveaway(s) from GamerPower`);
    if (items[0]) {
      console.log("  Sample item:", JSON.stringify(items[0]).slice(0, 800));
    }

    const games = items.map((item) => ({
      id: `steam-${item.id}`,
      store: "steam",
      storeName: "Steam",
      title: item.title || "Untitled",
      slug: String(item.id),
      storeUrl: item.open_giveaway_url || item.gamerpower_url || "https://store.steampowered.com",
      seller: "Steam",
      description: item.description || "",
      image: item.image || item.thumbnail || "",
      originalPrice: parseWorthToCents(item.worth),
      discountPrice: 0,
      status: "free",
      offerStart: item.published_date
        ? new Date(item.published_date).toISOString()
        : null,
      offerEnd:
        item.end_date && item.end_date !== "N/A"
          ? new Date(item.end_date).toISOString()
          : null,
      platforms: ["PC"],
    }));

    console.log(`  → ${games.length} Steam promotion(s) found`);
    return games;
  } catch (err) {
    console.warn("  Steam fetch failed:", err.message);
    return [];
  }
}

/**
 * fetchers/steam.js
 *
 * SteamDB sits behind Cloudflare bot-management specifically to stop
 * scraping like this (confirmed by the "Just a moment..." challenge page
 * showing up in a prior Actions run even after UA/webdriver spoofing).
 *
 * Valve's own featuredcategories endpoint was tried next, but its "specials"
 * list is a curated "top deals" feed, not a complete list of every
 * discounted app — small free-to-keep promos (e.g. Breathedge, Moonlighter)
 * never make that curated cut even though the store page itself is priced
 * at $0. That endpoint returned 0 matches while real free-to-keep games
 * were live, confirming the gap.
 *
 * GamerPower (gamerpower.com) is a small, free, purpose-built API that
 * tracks exactly this — live giveaways across Steam/Epic/GOG/etc — without
 * scraping or a browser. Using it here instead of trying to reverse-engineer
 * Steam's internal (undocumented, frequently-changed) search HTML.
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

    // Docs and third-party mirrors disagree on whether this is a bare array
    // or wrapped as { giveaways: [...] } — accept either so a format change
    // doesn't silently zero us out.
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
      // Sample one item so a field-name mismatch is obvious in the log
      // rather than silently producing blank titles/images/links.
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

/**
 * fetch-games.js
 *
 * Fetches current and upcoming free game promotions from:
 *   - Epic Games Store
 *   - GOG
 *
 * Writes the combined, normalized result to ../data/games.json
 * This script is run by GitHub Actions on a schedule.
 */

import fetch from "node-fetch";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../data/games.json");

// ─── Epic Games ──────────────────────────────────────────────────────────────

const EPIC_URL =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

function epicPickImage(item) {
  const images = item.keyImages || [];
  const preferred =
    images.find((img) => /offerimagewide|featuredmedia|thumbnail/i.test(img.type)) ||
    images[0];
  return preferred?.url || "";
}

function epicHasCurrentPromo(item) {
  const promos = item.promotions?.promotionalOffers || [];
  return promos.some(
    (block) =>
      Array.isArray(block.promotionalOffers) && block.promotionalOffers.length > 0
  );
}

function epicGetCurrentOffer(item) {
  for (const block of item.promotions?.promotionalOffers || []) {
    for (const offer of block.promotionalOffers || []) {
      if (offer.startDate && offer.endDate) return offer;
    }
  }
  return null;
}

function epicGetUpcomingOffer(item) {
  for (const block of item.promotions?.upcomingPromotionalOffers || []) {
    for (const offer of block.promotionalOffers || []) {
      if (offer.startDate && offer.endDate) return offer;
    }
  }
  return null;
}

async function fetchEpic() {
  console.log("Fetching Epic Games Store data…");
  const res = await fetch(EPIC_URL, {
    headers: { "User-Agent": "free-game-tracker/1.0 (github-actions)" },
  });
  if (!res.ok) throw new Error(`Epic HTTP ${res.status}`);
  const data = await res.json();

  const elements = data?.data?.Catalog?.searchStore?.elements || [];

  const games = [];
  for (const item of elements) {
    const currentOffer = epicGetCurrentOffer(item);
    const upcomingOffer = epicGetUpcomingOffer(item);
    const discountPrice = item.price?.totalPrice?.discountPrice;
    const originalPrice = item.price?.totalPrice?.originalPrice;

    const nowFree =
      typeof discountPrice === "number" &&
      discountPrice === 0 &&
      epicHasCurrentPromo(item);
    const upcomingFree = !nowFree && !!upcomingOffer;
    const status = nowFree ? "free" : upcomingFree ? "upcoming" : null;
    if (!status) continue;

    const slug =
      item.productSlug ||
      item.urlSlug ||
      item.catalogNs?.mappings?.[0]?.pageSlug ||
      "";

    games.push({
      id: item.id,
      store: "epic",
      storeName: "Epic Games Store",
      title: item.title || "Untitled",
      slug,
      storeUrl: slug ? `https://store.epicgames.com/p/${encodeURIComponent(slug)}` : "https://store.epicgames.com/free-games",
      seller: item.seller?.name || "Epic Games Store",
      description: item.description || "",
      image: epicPickImage(item),
      originalPrice: originalPrice ?? null,
      discountPrice: discountPrice ?? null,
      status,
      offerStart: currentOffer?.startDate || upcomingOffer?.startDate || null,
      offerEnd: currentOffer?.endDate || upcomingOffer?.endDate || null,
    });
  }

  console.log(`  → ${games.filter((g) => g.status === "free").length} free, ${games.filter((g) => g.status === "upcoming").length} upcoming`);
  return games;
}

// ─── GOG ─────────────────────────────────────────────────────────────────────

// GOG exposes a public promotional endpoint. The giveaway section is under
// the "giveaway" section of their catalog API.
const GOG_GIVEAWAY_URL = "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&price=free";

// GOG also has a dedicated giveaway page we can scrape a known JSON endpoint for
const GOG_PROMO_URL = "https://www.gog.com/en/games?priceRange=0,0&discounted=true";

// The most reliable GOG endpoint for their free giveaway (the "free game" banner)
const GOG_CATALOG_API = "https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Atrending&price=between%3A0%2C0&discounted=true&productType=in%3Agame%2Cpack%2Cdlc%2Cextras&page=1&countryCode=US&locale=en-US&currencyCode=USD";

async function fetchGOG() {
  console.log("Fetching GOG data…");

  let games = [];

  // Try the GOG catalog API (discounted to free)
  try {
    const res = await fetch(GOG_CATALOG_API, {
      headers: {
        "User-Agent": "free-game-tracker/1.0 (github-actions)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) throw new Error(`GOG catalog HTTP ${res.status}`);
    const data = await res.json();

    const products = data?.products || [];

    for (const item of products) {
      // Only keep items where the final price is actually 0 (free)
      const finalPrice = item.price?.finalMoney?.amount;
      const basePrice = item.price?.baseMoney?.amount;
      if (finalPrice === undefined) continue;

      const isFree = parseFloat(finalPrice) === 0;
      if (!isFree) continue;

      // Skip items that are always free (no discount, base price also 0)
      // We only want temporarily-free promotional giveaways
      const isPromo = parseFloat(basePrice || "0") > 0;
      if (!isPromo) continue;

      const slug = item.slug || "";
      const image =
        item.coverHorizontal ||
        item.coverVertical ||
        (item.thumbnail ? `https://images.gog-statics.com/${item.thumbnail}_product_tile_304x172.webp` : "");

      games.push({
        id: `gog-${item.id || slug}`,
        store: "gog",
        storeName: "GOG",
        title: item.title || "Untitled",
        slug,
        storeUrl: slug ? `https://www.gog.com/en/game/${slug}` : "https://www.gog.com/en/games#discounted",
        seller: item.developers?.join(", ") || item.publisher || "GOG",
        description: item.description || item.summary || "",
        image: image ? (image.startsWith("http") ? image : `https:${image}`) : "",
        originalPrice: basePrice ? Math.round(parseFloat(basePrice) * 100) : null,
        discountPrice: 0,
        status: "free",
        offerStart: null, // GOG catalog API doesn't expose promo dates directly
        offerEnd: item.price?.discount?.endDate || null,
      });
    }
  } catch (err) {
    console.warn("  GOG catalog fetch failed:", err.message);
  }

  // Also check the GOG giveaway endpoint (their dedicated "free game" promotions)
  try {
    const res = await fetch("https://www.gog.com/en/games/ajax/filtered?mediaType=game&price=free&sort=popularity", {
      headers: {
        "User-Agent": "free-game-tracker/1.0 (github-actions)",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const products = data?.products || [];

      for (const item of products) {
        // Avoid duplicates
        const slug = item.slug || item.url?.split("/").pop() || "";
        const alreadyAdded = games.some((g) => g.slug === slug && g.store === "gog");
        if (alreadyAdded) continue;

        const originalPrice = item.price?.baseAmount
          ? Math.round(parseFloat(item.price.baseAmount) * 100)
          : null;

        // Only include if it actually has a non-zero base price (promo giveaway, not F2P)
        if (!originalPrice || originalPrice === 0) continue;

        const imageBase = item.image || "";
        const image = imageBase
          ? `https:${imageBase}_product_tile_304x172.webp`
          : "";

        games.push({
          id: `gog-${item.id || slug}`,
          store: "gog",
          storeName: "GOG",
          title: item.title || "Untitled",
          slug,
          storeUrl: `https://www.gog.com${item.url || `/en/game/${slug}`}`,
          seller: item.developer || item.publisher || "GOG",
          description: item.category || "",
          image,
          originalPrice,
          discountPrice: 0,
          status: "free",
          offerStart: null,
          offerEnd: null,
        });
      }
    }
  } catch (err) {
    console.warn("  GOG ajax fetch failed:", err.message);
  }

  console.log(`  → ${games.length} GOG free game(s) found`);
  return games;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = await Promise.allSettled([fetchEpic(), fetchGOG()]);

  let allGames = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allGames = allGames.concat(result.value);
    } else {
      console.error("A fetch failed:", result.reason);
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    totalFree: allGames.filter((g) => g.status === "free").length,
    totalUpcoming: allGames.filter((g) => g.status === "upcoming").length,
    games: allGames,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✓ Wrote ${allGames.length} games to ${OUT_PATH}`);
  console.log(`  ${output.totalFree} free now, ${output.totalUpcoming} upcoming`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

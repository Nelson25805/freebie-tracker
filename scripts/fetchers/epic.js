/**
 * fetchers/epic.js
 *
 * Free/upcoming-free promotions from the Epic Games Store.
 * Uses Epic's public (unauthenticated) freeGamesPromotions endpoint —
 * no browser automation needed here, so this one is comparatively stable.
 */

import fetch from "node-fetch";

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

export async function fetchEpic() {
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
      item.catalogNs?.mappings?.[0]?.pageSlug ||
      item.urlSlug ||
      item.productSlug ||
      "";

    games.push({
      id: item.id,
      store: "epic",
      storeName: "Epic Games Store",
      title: item.title || "Untitled",
      slug,
      storeUrl: slug ? `https://store.epicgames.com/p/${encodeURIComponent(slug)}` : "https://store.epicgames.com/free-games",
      seller: "PC",
      platforms: ["PC"],
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
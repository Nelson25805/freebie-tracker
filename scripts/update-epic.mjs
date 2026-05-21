import fs from "node:fs/promises";

const EPIC_API_URL =
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

function pickImage(game) {
    const images = game.keyImages || [];
    const preferred =
        images.find((img) => /offerimagewide|featuredmedia|thumbnail/i.test(img.type)) ||
        images[0];
    return preferred?.url || "";
}

function hasCurrentPromotion(game) {
    const promos = game.promotions?.promotionalOffers || [];
    return Array.isArray(promos) && promos.some((block) => Array.isArray(block.promotionalOffers) && block.promotionalOffers.length > 0);
}

function getCurrentOffer(game) {
    const promos = game.promotions?.promotionalOffers || [];
    for (const block of promos) {
        for (const offer of block.promotionalOffers || []) {
            if (offer.startDate && offer.endDate) return offer;
        }
    }
    return null;
}

function getUpcomingOffer(game) {
    const promos = game.promotions?.upcomingPromotionalOffers || [];
    for (const block of promos) {
        for (const offer of block.promotionalOffers || []) {
            if (offer.startDate && offer.endDate) return offer;
        }
    }
    return null;
}

function normalizeEpicGames(data) {
    const elements = data?.data?.Catalog?.searchStore?.elements || [];

    return elements
        .map((item) => {
            const currentOffer = getCurrentOffer(item);
            const upcomingOffer = getUpcomingOffer(item);
            const discountPrice = item.price?.totalPrice?.discountPrice;
            const originalPrice = item.price?.totalPrice?.originalPrice;
            const nowFree = typeof discountPrice === "number" && discountPrice === 0 && hasCurrentPromotion(item);
            const upcomingFree = !nowFree && !!upcomingOffer;
            const status = nowFree ? "free" : upcomingFree ? "upcoming" : "other";

            return {
                source: "epic",
                id: item.id,
                title: item.title || "Untitled",
                slug: item.productSlug || item.urlSlug || item.catalogNs?.mappings?.[0]?.pageSlug || "",
                seller: item.seller?.name || "Epic Games Store",
                description: item.description || "",
                image: pickImage(item),
                currentOffer,
                upcomingOffer,
                originalPrice,
                discountPrice,
                status,
                openUrl: item.productSlug
                    ? `https://store.epicgames.com/p/${encodeURIComponent(item.productSlug)}`
                    : "https://store.epicgames.com/free-games",
                raw: item,
            };
        })
        .filter((game) => game.status !== "other");
}

async function main() {
    const res = await fetch(EPIC_API_URL);
    if (!res.ok) throw new Error(`Epic HTTP ${res.status}`);

    const data = await res.json();
    const games = normalizeEpicGames(data);

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(
        "data/epic.json",
        JSON.stringify(
            {
                updatedAt: new Date().toISOString(),
                games,
            },
            null,
            2
        ),
        "utf8"
    );

    console.log(`Epic parsed: ${games.length}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
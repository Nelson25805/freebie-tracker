import fs from "node:fs/promises";

const EPIC_API_URL =
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

const PRIME_PAGE_URL =
    "https://clouddosage.com/gamelists/free-games-on-amazon-luna-with-amazon-prime/";

function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

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
            };
        })
        .filter((game) => game.status !== "other");
}

function parsePrimeGamesFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const headings = [...doc.querySelectorAll("h3")];
    const games = [];

    for (const heading of headings) {
        const title = heading.textContent.trim();
        if (!title) continue;

        const container = heading.closest("article, section, div") || heading.parentElement;
        const text = container?.innerText || heading.parentElement?.innerText || "";
        if (!/Release Date:/i.test(text) && !/Developer:/i.test(text)) continue;

        const getField = (label) => {
            const re = new RegExp(`${label}:\\s*([^\\n\\r]+)`, "i");
            const match = text.match(re);
            return match ? match[1].trim() : "";
        };

        const releaseDate = getField("Release Date");
        const developer = getField("Developer");
        const publisher = getField("Publisher");
        const genre = getField("Genre");
        const metascore = getField("Metascore");
        const image = container?.querySelector("img")?.src || "";

        games.push({
            source: "prime",
            id: `prime-${slugify(title)}`,
            title,
            seller: "Amazon Prime",
            description: [genre, developer ? `Developer: ${developer}` : "", publisher ? `Publisher: ${publisher}` : ""]
                .filter(Boolean)
                .join(" • "),
            image,
            currentOffer: null,
            upcomingOffer: null,
            originalPrice: null,
            discountPrice: 0,
            status: "prime",
            releaseDate,
            metascore,
            openUrl: PRIME_PAGE_URL,
        });
    }

    return games;
}

async function main() {
    const epicRes = await fetch(EPIC_API_URL);
    if (!epicRes.ok) throw new Error(`Epic HTTP ${epicRes.status}`);
    const epicData = await epicRes.json();
    const epicGames = normalizeEpicGames(epicData);

    const primeRes = await fetch(PRIME_PAGE_URL);
    if (!primeRes.ok) throw new Error(`Prime HTTP ${primeRes.status}`);
    const primeHtml = await primeRes.text();
    const primeGames = parsePrimeGamesFromHtml(primeHtml);

    const payload = {
        updatedAt: new Date().toISOString(),
        games: [...epicGames, ...primeGames],
    };

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/offers.json", JSON.stringify(payload, null, 2), "utf8");
    console.log(`Wrote ${payload.games.length} games to data/offers.json`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
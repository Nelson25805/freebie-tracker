import fs from "fs/promises";

// This script fetches free games from Epic Games Store and GOG, and saves them to data/freebies.json.
const SOURCES = [
    {
        platform: "Epic Games Store",
        type: "permanent",
        url: "https://store.epicgames.com/en-US/free-games"
    },
    {
        platform: "GOG",
        type: "permanent",
        url: "https://www.gog.com/en/games?price=free"
    }
];

// Fetch HTML content from a URL
async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "FreebieTrackerBot/1.0" }
    });
    return await res.text();
}

// Extract game titles from Epic Games Store HTML
function extractEpic(html) {
    const matches = [...html.matchAll(/"title":"(.*?)"/g)];
    return matches.slice(0, 5).map(m => m[1]);
}

// Extract game titles from GOG HTML
function extractGOG(html) {
    const matches = [...html.matchAll(/product-title__name[^>]*>(.*?)</g)];
    return matches.slice(0, 5).map(m => m[1]);
}

async function main() {
    let results = [];

    // Epic
    const epicHTML = await fetchHTML(SOURCES[0].url);
    const epicGames = extractEpic(epicHTML);

    epicGames.forEach(title => {
        results.push({
            platform: "Epic Games Store",
            title,
            type: "permanent",
            endsAt: null,
            claimUrl: SOURCES[0].url
        });
    });

    // GOG
    const gogHTML = await fetchHTML(SOURCES[1].url);
    const gogGames = extractGOG(gogHTML);

    gogGames.forEach(title => {
        results.push({
            platform: "GOG",
            title,
            type: "permanent",
            endsAt: null,
            claimUrl: SOURCES[1].url
        });
    });

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/freebies.json", JSON.stringify(results, null, 2));
}

main();
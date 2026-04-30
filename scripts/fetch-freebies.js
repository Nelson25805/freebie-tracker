import fs from "fs/promises";

const OUTPUT = "data/freebies.json";

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

async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 FreebieTrackerBot/1.0"
        }
    });

    if (!res.ok) {
        throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
    }

    return await res.text();
}

function extractEpic(html) {
    const matches = [...html.matchAll(/"title":"([^"]+)"/g)];
    return matches.slice(0, 10).map(m => m[1]);
}

function extractGOG(html) {
    const matches = [...html.matchAll(/product-title__name[^>]*>(.*?)</g)];
    return matches.slice(0, 10).map(m => m[1].replace(/&amp;/g, "&"));
}

async function loadPreviousData() {
    try {
        const text = await fs.readFile(OUTPUT, "utf8");
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function main() {
    const results = [];

    try {
        const epicHTML = await fetchHTML(SOURCES[0].url);
        const epicGames = extractEpic(epicHTML);

        for (const title of epicGames) {
            results.push({
                platform: "Epic Games Store",
                title,
                type: "permanent",
                startsAt: null,
                endsAt: null,
                claimUrl: SOURCES[0].url,
                sourceUrl: SOURCES[0].url,
                status: "active"
            });
        }
    } catch (err) {
        console.error("Epic parse failed:", err.message);
    }

    try {
        const gogHTML = await fetchHTML(SOURCES[1].url);
        const gogGames = extractGOG(gogHTML);

        for (const title of gogGames) {
            results.push({
                platform: "GOG",
                title,
                type: "permanent",
                startsAt: null,
                endsAt: null,
                claimUrl: SOURCES[1].url,
                sourceUrl: SOURCES[1].url,
                status: "active"
            });
        }
    } catch (err) {
        console.error("GOG parse failed:", err.message);
    }

    if (results.length === 0) {
        console.error("No freebies were parsed. Keeping the previous data file.");
        const previous = await loadPreviousData();
        if (previous.length === 0) {
            throw new Error("No previous data exists to preserve.");
        }
        return;
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2));
    console.log(`Wrote ${results.length} items to ${OUTPUT}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
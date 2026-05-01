import fs from "node:fs/promises";

const FREE_PAGE = "https://www.gog.com/en/partner/free_games";
const NEWS_PAGE = "https://www.gog.com/en/news";

async function fetchHtml(url) {
    const res = await fetch(url, {
        headers: { "user-agent": "FreeGameTrackerBot" }
    });
    return await res.text();
}

function parseFree(html) {
    const matches = [...html.matchAll(/0%\s+(.+?)\s+/g)];

    return matches.slice(0, 10).map(m => ({
        source: "gog",
        type: "permanent",
        title: m[1].trim(),
        url: FREE_PAGE,
        price: "Free",
        lastCheckedAt: new Date().toISOString()
    }));
}

function parseNews(html) {
    const matches = [...html.matchAll(/GIVEAWAY/gi)];

    return matches.slice(0, 5).map(() => ({
        source: "gog",
        type: "limited-time",
        title: "GOG Giveaway",
        url: NEWS_PAGE,
        price: "Free",
        endsAt: "Check site",
        lastCheckedAt: new Date().toISOString()
    }));
}

async function main() {
    const [freeHtml, newsHtml] = await Promise.all([
        fetchHtml(FREE_PAGE),
        fetchHtml(NEWS_PAGE)
    ]);

    const offers = [
        ...parseFree(freeHtml),
        ...parseNews(newsHtml)
    ];

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/offers.json", JSON.stringify(offers, null, 2));

    console.log("Updated offers:", offers.length);
}

main();
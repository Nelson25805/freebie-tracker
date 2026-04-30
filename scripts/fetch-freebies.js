import fs from "fs/promises";

const OUTPUT = "data/freebies.json";

const SOURCES = [
    {
        platform: "Epic Games Store",
        type: "permanent",
        url: "https://store.epicgames.com/en-US/free-games",
        claimUrl: "https://store.epicgames.com/en-US/free-games",
        extract: extractEpic,
    },
    {
        platform: "GOG",
        type: "permanent",
        url: "https://www.gog.com/en/partner/free_games",
        claimUrl: "https://www.gog.com/en/partner/free_games",
        extract: extractGOG,
    },
];

async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 FreebieTrackerBot/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });

    if (!res.ok) {
        throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
    }

    return await res.text();
}

function extractEpic(html) {
    // Epic often blocks bots or serves markup that is hard to scrape reliably.
    // Keep this conservative and only return obvious matches.
    const titles = [...html.matchAll(/"title":"([^"]+)"/g)].map(m => m[1]);
    return [...new Set(titles)].slice(0, 10);
}

function extractGOG(html) {
    // This is intentionally broad. If it stops matching, the script keeps old data.
    const candidates = [];

    for (const match of html.matchAll(/product-title__name[^>]*>(.*?)</g)) {
        const title = match[1]
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();

        if (title) candidates.push(title);
    }

    return [...new Set(candidates)].slice(0, 10);
}

async function loadExisting() {
    try {
        const text = await fs.readFile(OUTPUT, "utf8");
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function makeItems(platform, claimUrl, titles) {
    return titles.map(title => ({
        platform,
        title,
        type: "permanent",
        startsAt: null,
        endsAt: null,
        claimUrl,
        sourceUrl: claimUrl,
        status: "active",
    }));
}

function mergePlatform(existing, platform, newItems) {
    const kept = existing.filter(item => item.platform !== platform);
    return [...kept, ...newItems];
}

async function main() {
    const existing = await loadExisting();
    let updated = [...existing];
    let anySuccess = false;

    for (const source of SOURCES) {
        try {
            const html = await fetchHTML(source.url);
            const titles = source.extract(html);

            if (titles.length > 0) {
                updated = mergePlatform(updated, source.platform, makeItems(source.platform, source.claimUrl, titles));
                anySuccess = true;
                console.log(`${source.platform}: ${titles.length} item(s)`);
            } else {
                console.log(`${source.platform}: no items parsed, keeping previous data`);
            }
        } catch (err) {
            console.log(`${source.platform}: ${err.message} — keeping previous data`);
        }
    }

    await fs.mkdir("data", { recursive: true });

    if (!anySuccess) {
        if (existing.length > 0) {
            console.log("No source succeeded; leaving existing data untouched.");
            return;
        }

        // If this is the very first run, write a starter placeholder
        // so the site does not look broken while you improve scrapers.
        const starter = [
            {
                platform: "Manual seed",
                title: "Seed this file once, then the scraper will preserve it",
                type: "permanent",
                startsAt: null,
                endsAt: null,
                claimUrl: "https://example.com",
                sourceUrl: "https://example.com",
                status: "seed",
            },
        ];

        await fs.writeFile(OUTPUT, JSON.stringify(starter, null, 2));
        console.log("No source succeeded and no previous data existed, so wrote a starter seed file.");
        return;
    }

    await fs.writeFile(OUTPUT, JSON.stringify(updated, null, 2));
    console.log(`Wrote ${updated.length} total item(s) to ${OUTPUT}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
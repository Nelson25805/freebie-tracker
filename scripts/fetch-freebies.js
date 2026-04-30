import fs from "fs/promises";

const OUTPUT = "data/freebies.json";

const SOURCES = [
    {
        platform: "Epic Games Store",
        type: "permanent",
        url: "https://store.epicgames.com/en-US/free-games",
        extract: extractEpic,
    },
    {
        platform: "GOG",
        type: "permanent",
        url: "https://www.gog.com/en/partner/free_games",
        extract: extractGOG,
    },
];

async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 FreebieTrackerBot/1.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    });

    if (!res.ok) {
        throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
    }

    return await res.text();
}

function extractEpic(html) {
    // Keep this conservative. If Epic changes markup or blocks the request,
    // we keep the previous items instead of deleting them.
    const titles = [...html.matchAll(/"title":"([^"]+)"/g)].map(m => m[1]);
    return titles.slice(0, 10);
}

function extractGOG(html) {
    const titles = [...html.matchAll(/product-title__name[^>]*>(.*?)</g)]
        .map(m => m[1].replace(/&amp;/g, "&"));
    return titles.slice(0, 10);
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

function mergePlatform(existing, platform, newItems) {
    const kept = existing.filter(item => item.platform !== platform);
    return [
        ...kept,
        ...newItems.map(title => ({
            platform,
            title,
            type: platform === "Epic Games Store" || platform === "GOG" ? "permanent" : "temporary",
            startsAt: null,
            endsAt: null,
            claimUrl:
                platform === "Epic Games Store"
                    ? "https://store.epicgames.com/en-US/free-games"
                    : "https://www.gog.com/en/partner/free_games",
            sourceUrl:
                platform === "Epic Games Store"
                    ? "https://store.epicgames.com/en-US/free-games"
                    : "https://www.gog.com/en/partner/free_games",
            status: "active",
        })),
    ];
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
                updated = mergePlatform(updated, source.platform, titles);
                anySuccess = true;
                console.log(`${source.platform}: ${titles.length} item(s)`);
            } else {
                console.log(`${source.platform}: no items parsed, keeping previous data`);
            }
        } catch (err) {
            console.log(`${source.platform}: ${err.message} — keeping previous data`);
        }
    }

    if (!anySuccess && existing.length === 0) {
        console.log("No previous data exists yet, so writing an empty array.");
        await fs.mkdir("data", { recursive: true });
        await fs.writeFile(OUTPUT, "[]\n");
        return;
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(OUTPUT, JSON.stringify(updated, null, 2));
    console.log(`Wrote ${updated.length} total item(s) to ${OUTPUT}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
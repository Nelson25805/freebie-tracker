import fs from "fs/promises";
import { chromium } from "playwright";

const OUTPUT = "data/freebies.json";
const EPIC_URL = "https://store.epicgames.com/en-US/free-games";

async function loadExisting() {
    try {
        const text = await fs.readFile(OUTPUT, "utf8");
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function save(data) {
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(OUTPUT, JSON.stringify(data, null, 2));
}

async function scrapeEpic() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        locale: "en-US",
        viewport: { width: 1440, height: 1600 },
    });

    try {
        await page.goto(EPIC_URL, { waitUntil: "domcontentloaded", timeout: 120000 });

        const cards = page.locator('[data-component="FreeOfferCard"]');
        await cards.first().waitFor({ state: "attached", timeout: 60000 });

        const count = await cards.count();
        console.log(`Epic cards found: ${count}`);

        const items = await cards.evaluateAll(cards =>
            cards.map(card => {
                const link = card.querySelector('a[href]');
                const img = card.querySelector('img[alt]');
                const titleEl = card.querySelector('h6');
                const timeEls = [...card.querySelectorAll('time[datetime]')];
                const aria = link?.getAttribute('aria-label') || '';

                const title =
                    titleEl?.textContent?.trim() ||
                    img?.getAttribute('alt') ||
                    (aria.split(',').at(-2) || '').trim() ||
                    'Untitled';

                const href = link?.getAttribute('href') || '';
                const claimUrl = href.startsWith('http') ? href : `https://store.epicgames.com${href}`;

                return {
                    platform: "Epic Games Store",
                    title,
                    type: "permanent",
                    startsAt: timeEls[0]?.getAttribute('datetime') || null,
                    endsAt: timeEls[1]?.getAttribute('datetime') || null,
                    claimUrl,
                    sourceUrl: "https://store.epicgames.com/en-US/free-games",
                    imageUrl: img?.getAttribute('src') || img?.getAttribute('data-image') || null,
                    status: "active",
                };
            })
        );

        return items.filter(item => item.title && item.claimUrl);
    } finally {
        await browser.close();
    }
}

async function main() {
    const existing = await loadExisting();
    let updated = [...existing];

    try {
        const epicItems = await scrapeEpic();

        if (epicItems.length > 0) {
            // replace previous Epic entries with the newly scraped ones
            updated = [
                ...existing.filter(item => item.platform !== "Epic Games Store"),
                ...epicItems,
            ];
            console.log(`Epic Games Store: ${epicItems.length} item(s)`);
        } else {
            console.log("Epic Games Store: no items parsed, keeping previous data");
        }
    } catch (err) {
        console.log(`Epic Games Store: ${err.message} — keeping previous data`);
    }

    if (updated.length === 0) {
        if (existing.length > 0) {
            console.log("No new data found; leaving existing file untouched.");
            return;
        }

        updated = [
            {
                platform: "Manual seed",
                title: "Waiting for scraper results",
                type: "permanent",
                startsAt: null,
                endsAt: null,
                claimUrl: "https://example.com",
                sourceUrl: "https://example.com",
                status: "seed",
            },
        ];
    }

    await save(updated);
    console.log(`Wrote ${updated.length} total item(s) to ${OUTPUT}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
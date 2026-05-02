import fs from "node:fs/promises";
import { scrapeGog } from "./adapters/gog.mjs";
import { scrapeEpic } from "./adapters/epic.mjs";
import { scrapeSteam } from "./adapters/steam.mjs";
import { canonicalKey } from "./lib/normalize.mjs";
import { uniqBy } from "./lib/http.mjs";

async function main() {
    const results = await Promise.allSettled([scrapeGog(), scrapeEpic(), scrapeSteam()]);
    const offers = [];

    for (const result of results) {
        if (result.status === "fulfilled") offers.push(...result.value);
        else console.error(result.reason);
    }

    const deduped = uniqBy(offers, canonicalKey);
    deduped.sort((a, b) => {
        if (a.type !== b.type) return a.type === "limited-time" ? -1 : 1;
        return a.source.localeCompare(b.source) || a.title.localeCompare(b.title);
    });

    const output = {
        generatedAt: new Date().toISOString(),
        offers: deduped,
    };

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/offers.json", JSON.stringify(output, null, 2) + "\n");

    console.log(`Wrote ${deduped.length} offers`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
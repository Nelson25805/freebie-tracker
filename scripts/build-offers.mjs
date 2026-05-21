import fs from "node:fs/promises";

async function readJson(path) {
    try {
        const text = await fs.readFile(path, "utf8");
        return JSON.parse(text);
    } catch {
        return { games: [] };
    }
}

async function main() {
    const epic = await readJson("data/epic.json");
    const prime = await readJson("data/prime.json");

    const games = [...(epic.games || []), ...(prime.games || [])];

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(
        "data/offers.json",
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

    console.log(`Wrote ${games.length} total games to data/offers.json`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
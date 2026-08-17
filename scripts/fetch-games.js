/**
 * fetch-games.js
 *
 * Orchestrator only. Each store's scraping/parsing logic lives in its own
 * module under ./fetchers/ — this file just runs them all, merges whatever
 * succeeded, and writes the combined, normalized result to ../data/games.json.
 *
 * Run by GitHub Actions on a schedule. No API keys or credentials required.
 *
 * To fix or extend a single store, edit only its file in ./fetchers/ —
 * this file (and the other fetchers) should never need to change for that.
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { fetchEpic } from "./fetchers/epic.js";
import { fetchGOG } from "./fetchers/gog.js";
import { fetchPSPlus } from "./fetchers/psplus.js";
import { fetchPrimeGaming } from "./fetchers/prime.js";
import { fetchSteam } from "./fetchers/steam.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../data/games.json");

async function main() {
  let previousGames = [];
  try {
    const prevJson = JSON.parse(readFileSync(OUT_PATH, "utf-8"));
    previousGames = prevJson.games || [];
  } catch {
    // no previous file yet (first run) — that's fine
  }

  const results = await Promise.allSettled([
    fetchEpic(),
    fetchGOG(previousGames),
    fetchPSPlus(),
    fetchPrimeGaming(),
    fetchSteam(),
  ]);

  let allGames = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allGames = allGames.concat(result.value);
    } else {
      console.error("A fetch failed:", result.reason);
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    totalFree: allGames.filter((g) => g.status === "free").length,
    totalUpcoming: allGames.filter((g) => g.status === "upcoming").length,
    games: allGames,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✓ Wrote ${allGames.length} games to ${OUT_PATH}`);
  console.log(`  ${output.totalFree} free now, ${output.totalUpcoming} upcoming`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

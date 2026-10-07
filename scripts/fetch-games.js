import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { fetchEpic } from "./fetchers/epic.js";
import { fetchGOG } from "./fetchers/gog.js";
import { fetchPSPlus } from "./fetchers/psplus.js";
import { fetchPrimeGaming } from "./fetchers/prime.js";
import { fetchSteam } from "./fetchers/steam.js";

import { findNewFreeGames } from "./notify-newsletter.js";
import { updateMonthlyArchive, appendRunLog } from "./utils/history.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../data/games.json");

// Not committed (the workflow only `git add`s data/). Read by
// send-pending-notify.js after a successful push.
const PENDING_NOTIFY_PATH = resolve(__dirname, ".pending-notify.json");

const STORE_KEYS = ["epic", "gog", "psplus", "prime", "steam"];

async function main() {
  let previousGames = [];
  try {
    const prevJson = JSON.parse(readFileSync(OUT_PATH, "utf-8"));
    previousGames = prevJson.games || [];
  } catch {
    // first run, or unreadable file: treat as no previous data
  }

  const results = await Promise.allSettled([
    fetchEpic(),
    fetchGOG(previousGames),
    fetchPSPlus(),
    fetchPrimeGaming(previousGames),
    fetchSteam(),
  ]);

  let allGames = [];
  const storeLog = {};

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const key = STORE_KEYS[i];

    if (result.status === "fulfilled") {
      allGames = allGames.concat(result.value);
      storeLog[key] = { count: result.value.length };
    } else {
      console.error("A fetch failed:", result.reason);
      storeLog[key] = { count: 0, error: String(result.reason?.message || result.reason) };
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    totalFree: allGames.filter((g) => g.status === "free").length,
    totalUpcoming: allGames.filter((g) => g.status === "upcoming").length,
    games: allGames,
  };

  // Record which games are new, but DON'T email yet. The workflow sends the
  // emails only after games.json has been pushed successfully. Otherwise a
  // failed push would leave the repo's games.json stale and the next run
  // would re-announce the same games.
  const newGames = findNewFreeGames(previousGames, allGames);
  mkdirSync(dirname(PENDING_NOTIFY_PATH), { recursive: true });
  writeFileSync(PENDING_NOTIFY_PATH, JSON.stringify(newGames, null, 2), "utf-8");
  console.log(`  Newsletter: ${newGames.length} new free game(s) queued for notification after push.`);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✓ Wrote ${allGames.length} games to ${OUT_PATH}`);
  console.log(`  ${output.totalFree} free now, ${output.totalUpcoming} upcoming`);

  // Archive + run log
  try {
    updateMonthlyArchive(allGames, output.fetchedAt);
    appendRunLog({ fetchedAt: output.fetchedAt, stores: storeLog });
  } catch (err) {
    console.warn("History/log step failed (non-fatal):", err.message);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
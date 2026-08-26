/**
 * utils/history.js
 * (see previous version's header comment — unchanged)
 */

import { writeFileSync, readFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = resolve(__dirname, "../../data/history");
const RUN_LOG_PATH = resolve(HISTORY_DIR, "run-log.jsonl");
const INDEX_PATH = resolve(HISTORY_DIR, "index.json");
const RUN_LOG_RETENTION_DAYS = 90;

function ensureHistoryDir() {
    mkdirSync(HISTORY_DIR, { recursive: true });
}

function monthKeyFor(isoDate) {
    const d = new Date(isoDate);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
}

function monthlyArchivePath(monthKey) {
    return resolve(HISTORY_DIR, `${monthKey}.json`);
}

function loadMonthlyArchive(monthKey) {
    const path = monthlyArchivePath(monthKey);
    if (!existsSync(path)) return { month: monthKey, updatedAt: null, games: {} };
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
        console.warn(`  History: ${monthKey}.json was unreadable, starting fresh.`);
        return { month: monthKey, updatedAt: null, games: {} };
    }
}

// Keeps data/history/index.json — the manifest the browse page reads to
// populate its month picker, since a static host can't list a directory.
function updateMonthIndex(monthKey, fetchedAt) {
    let index = { months: [], updatedAt: null };
    if (existsSync(INDEX_PATH)) {
        try {
            index = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
        } catch {
            console.warn("  History: index.json was unreadable, rebuilding.");
        }
    }
    if (!index.months.includes(monthKey)) {
        index.months.push(monthKey);
        index.months.sort(); // "YYYY-MM" sorts correctly as plain strings
    }
    index.updatedAt = fetchedAt;
    writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Merges this run's FREE games only (upcoming games are intentionally left
 * out of the archive) into the current month's file. Existing entries get
 * lastSeen bumped and their fields refreshed; new ones get
 * firstSeen === lastSeen === fetchedAt.
 */
export function updateMonthlyArchive(games, fetchedAt) {
    ensureHistoryDir();

    const monthKey = monthKeyFor(fetchedAt);
    const archive = loadMonthlyArchive(monthKey);
    const freeGames = games.filter((g) => g.status === "free");

    for (const game of freeGames) {
        const existing = archive.games[game.id];
        archive.games[game.id] = {
            ...game,
            firstSeen: existing?.firstSeen || fetchedAt,
            lastSeen: fetchedAt,
        };
    }

    archive.updatedAt = fetchedAt;
    writeFileSync(monthlyArchivePath(monthKey), JSON.stringify(archive, null, 2), "utf-8");
    updateMonthIndex(monthKey, fetchedAt);

    console.log(`  History: ${monthKey}.json now has ${Object.keys(archive.games).length} game(s) archived.`);
}

// Drops any run-log line older than RUN_LOG_RETENTION_DAYS. Runs every
// call — the file stays small (≈1,000 lines/year at 3 runs/day) so a
// full read+rewrite each time is not worth optimizing away.
function pruneRunLog(now) {
    if (!existsSync(RUN_LOG_PATH)) return;

    const cutoff = now.getTime() - RUN_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const lines = readFileSync(RUN_LOG_PATH, "utf-8").split("\n").filter(Boolean);

    const kept = lines.filter((line) => {
        try {
            return new Date(JSON.parse(line).fetchedAt).getTime() >= cutoff;
        } catch {
            return false; // drop unparsable lines rather than let them pile up
        }
    });

    if (kept.length === lines.length) return;

    writeFileSync(RUN_LOG_PATH, kept.map((l) => l + "\n").join(""), "utf-8");
    console.log(`  History: pruned run-log.jsonl to last ${RUN_LOG_RETENTION_DAYS} days (${lines.length} → ${kept.length} entries).`);
}

export function appendRunLog({ fetchedAt, stores }) {
    ensureHistoryDir();
    appendFileSync(RUN_LOG_PATH, JSON.stringify({ fetchedAt, stores }) + "\n", "utf-8");
    pruneRunLog(new Date(fetchedAt));
}
/**
 * send-pending-notify.js
 *
 * Runs as its own workflow step AFTER the data has been pushed. Reads the
 * list of new games that fetch-games.js recorded and emails subscribers.
 */

import { readFileSync, unlinkSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { sendNewGamesNotification } from "./notify-newsletter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PENDING_PATH = resolve(__dirname, ".pending-notify.json");

async function main() {
  if (!existsSync(PENDING_PATH)) {
    console.log("  Newsletter: no pending notification file, nothing to send.");
    return;
  }

  let newGames = [];
  try {
    newGames = JSON.parse(readFileSync(PENDING_PATH, "utf-8"));
  } catch (err) {
    console.warn("  Newsletter: pending file was unreadable:", err.message);
    return;
  }

  await sendNewGamesNotification(newGames);

  try {
    unlinkSync(PENDING_PATH);
  } catch {
    // not important
  }
}

main().catch((err) => {
  console.error("Notify step failed:", err);
  process.exit(1);
});
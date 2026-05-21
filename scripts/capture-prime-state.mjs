import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const PRIME_URL = "https://gaming.amazon.com/home";
const OUTPUT_PATH = "playwright/.auth/prime.json";

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(PRIME_URL, { waitUntil: "domcontentloaded" });
    console.log("\nLog into Prime Gaming in the browser window.");
    console.log("After you can see the Prime page, come back here and press Enter.\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("Press Enter to save the authenticated state...");
    rl.close();

    await fs.mkdir("playwright/.auth", { recursive: true });
    await context.storageState({ path: OUTPUT_PATH });

    await browser.close();
    console.log(`Saved auth state to ${OUTPUT_PATH}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
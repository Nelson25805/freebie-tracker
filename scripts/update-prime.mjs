import fs from "node:fs/promises";
import { chromium } from "playwright";
import { load } from "cheerio";

const PRIME_URL = "https://gaming.amazon.com/home";
const AUTH_STATE_PATH = "playwright/.auth/prime.json";

function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function parsePrimeGamesFromHtml(html) {
    const $ = load(html);
    const games = [];
    const seen = new Set();

    $("h1, h2, h3, h4, [data-testid], article, section, li").each((_, el) => {
        const node = $(el);
        const text = cleanText(node.text());

        if (!text) return;
        if (!/claim|included with prime|free game|prime gaming/i.test(text)) return;

        const titleNode = node.find("h1, h2, h3, h4").first();
        const title = cleanText(titleNode.text()) || cleanText(text.split("\n")[0]);
        if (!title || title.length < 2) return;
        if (seen.has(title.toLowerCase())) return;

        const image = node.find("img").first().attr("src") || "";
        const link = node.find("a").first().attr("href") || PRIME_URL;

        let description = text;
        description = description.replace(title, "").trim();

        seen.add(title.toLowerCase());
        games.push({
            source: "prime",
            id: `prime-${slugify(title)}`,
            title,
            seller: "Amazon Prime Gaming",
            description,
            image,
            currentOffer: null,
            upcomingOffer: null,
            originalPrice: null,
            discountPrice: 0,
            status: "prime",
            openUrl: link.startsWith("http") ? link : `https://gaming.amazon.com${link}`,
            raw: {},
        });
    });

    return games;
}

async function main() {
    const browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
        storageState: AUTH_STATE_PATH,
    });

    const page = await context.newPage();
    await page.goto(PRIME_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => { });
    await page.waitForTimeout(3000);

    if (/sign in|login|verify/i.test((await page.title()) + " " + (await page.textContent("body").catch(() => "")))) {
        throw new Error("Prime page looks unauthenticated. Recreate playwright/.auth/prime.json.");
    }

    const html = await page.content();
    const games = parsePrimeGamesFromHtml(html);

    await browser.close();

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(
        "data/prime.json",
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

    console.log(`Prime parsed: ${games.length}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
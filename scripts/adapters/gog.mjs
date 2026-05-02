import * as cheerio from "cheerio";
const FREE_URL = "https://www.gog.com/en/partner/free_games";

function parseFromText(text) {
    const offers = [];
    const regex = /0\s*%\s+(.+?)\s+Soon IN DEV mod\s+(.+?)\s+(\d{4})\s+([A-Za-z][A-Za-z -]*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const title = cleanText(match[1]);
        const year = match[3];
        const genre = cleanText(match[4]);

        offers.push(
            makeOffer({
                source: "gog",
                sourceLabel: "GOG",
                type: "permanent",
                title,
                description: `${genre} game from GOG's free collection (${year}).`,
                url: FREE_URL,
                price: "Free",
                platform: ["Windows", "Mac", "Linux"],
                notes: "Official GOG free collection page",
            })
        );
    }

    return offers;
}

export async function scrapeGog() {
    const html = await fetchHtml(FREE_URL);
    const $ = cheerio.load(html);
    const bodyText = cleanText($("body").text());

    let offers = parseFromText(bodyText);

    if (!offers.length) {
        $("a[href*='/game/']").each((_, el) => {
            const text = cleanText($(el).text());
            const href = $(el).attr("href");
            if (!href || !/Free|0\.00|owned/i.test(text)) return;

            const title = cleanText(text.replace(/\bFree\b.*$/i, "")) || cleanText($(el).attr("aria-label") || text);
            if (!title) return;

            offers.push(
                makeOffer({
                    source: "gog",
                    sourceLabel: "GOG",
                    type: "permanent",
                    title,
                    description: "Official GOG free collection item.",
                    url: href.startsWith("http") ? href : `https://www.gog.com${href}`,
                    price: "Free",
                    platform: ["Windows", "Mac", "Linux"],
                    notes: "Fallback selector",
                })
            );
        });
    }

    return offers;
}
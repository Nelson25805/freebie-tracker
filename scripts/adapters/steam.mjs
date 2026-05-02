import * as cheerio from "cheerio";
import { absoluteUrl, cleanText, fetchHtml } from "../lib/http.mjs";
import { makeOffer } from "../lib/normalize.mjs";

const SEARCH_URL = "https://store.steampowered.com/search/?maxprice=free&sort_by=Released_DESC";

export async function scrapeSteam() {
    const html = await fetchHtml(SEARCH_URL);
    const $ = cheerio.load(html);
    const offers = [];

    $("a.search_result_row").each((_, el) => {
        const $el = $(el);
        const title = cleanText($el.find("span.title").text());
        const priceText = cleanText($el.find("div.search_price").text());
        const dateText = cleanText($el.find("div.search_released").text());
        const href = $el.attr("href");

        if (!title || !href) return;
        if (!/Free/i.test(priceText)) return;
        if (/Demo|Soundtrack|Artbook|OST/i.test(title)) return;

        offers.push(
            makeOffer({
                source: "steam",
                sourceLabel: "Steam",
                type: "permanent",
                title,
                description: dateText ? `Steam listing released ${dateText}.` : "Steam free listing.",
                url: absoluteUrl(SEARCH_URL, href),
                price: "Free",
                platform: ["Windows", "macOS", "Linux"],
                notes: "Official Steam search results filtered by free price",
            })
        );
    });

    return offers.slice(0, 25);
}
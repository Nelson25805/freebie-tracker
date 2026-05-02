import * as cheerio from "cheerio";

function extractCard($, el) {
    const $el = $(el);
    const card = $el.closest('article, section, div[class*="Card"], div[class*="card"]');
    const linkText = cleanText($el.text());
    const heading = cleanText(card.find("h1,h2,h3,h4,h5,h6").first().text());
    const imageAlt = cleanText(card.find("img[alt]").first().attr("alt") || "");
    const title = heading || imageAlt || linkText;
    const desc = cleanText(card.text());

    return { title, desc };
}

export async function scrapeEpic() {
    const html = await fetchHtml(FREE_URL);
    const $ = cheerio.load(html);
    const offers = [];
    const seen = new Set();

    // The hero giveaway is explicitly documented by Epic as a weekly free game.
    $("a").each((_, el) => {
        const $el = $(el);
        const text = cleanText($el.text());
        const href = $el.attr("href");
        if (!href) return;

        const isFreeAction = /Play For Free|Claim Now|Free Giveaway/i.test(text);
        const isStoreLink = /\/p\//i.test(href);
        if (!isFreeAction && !isStoreLink) return;

        const { title, desc } = extractCard($, el);
        if (!title || seen.has(title.toLowerCase())) return;

        const limitedTime = /Free Giveaway|Play For Free Now|every Thursday/i.test(desc) || /Free Giveaway/i.test(title);
        const type = limitedTime ? "limited-time" : "permanent";

        offers.push(
            makeOffer({
                source: "epic",
                sourceLabel: "Epic",
                type,
                title,
                description: limitedTime
                    ? "Weekly Epic Games Store giveaway or featured free offer."
                    : "Free-to-play or free store listing on Epic Games Store.",
                url: absoluteUrl(FREE_URL, href),
                price: "Free",
                endsAtLabel: limitedTime ? "Check Epic free-games page" : null,
                platform: ["Windows"],
                notes: "Official Epic free-games page",
            })
        );

        seen.add(title.toLowerCase());
    });

    // Keep only the first few meaningful entries so the page stays focused.
    return offers.slice(0, 12);
}
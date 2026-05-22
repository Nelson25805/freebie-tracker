/**
 * fetch-games.js
 *
 * Fetches current and upcoming free game promotions from:
 *   - Epic Games Store
 *   - GOG
 *   - PlayStation Plus (via PlayStation Blog RSS + Claude parsing)
 *
 * Writes the combined, normalized result to ../data/games.json
 * This script is run by GitHub Actions on a schedule.
 *
 * Required env var for PS Plus:
 *   ANTHROPIC_API_KEY — used to parse the PS Blog post into structured game data
 */

import fetch from "node-fetch";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../data/games.json");

// ─── Epic Games ──────────────────────────────────────────────────────────────

const EPIC_URL =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

function epicPickImage(item) {
  const images = item.keyImages || [];
  const preferred =
    images.find((img) => /offerimagewide|featuredmedia|thumbnail/i.test(img.type)) ||
    images[0];
  return preferred?.url || "";
}

function epicHasCurrentPromo(item) {
  const promos = item.promotions?.promotionalOffers || [];
  return promos.some(
    (block) =>
      Array.isArray(block.promotionalOffers) && block.promotionalOffers.length > 0
  );
}

function epicGetCurrentOffer(item) {
  for (const block of item.promotions?.promotionalOffers || []) {
    for (const offer of block.promotionalOffers || []) {
      if (offer.startDate && offer.endDate) return offer;
    }
  }
  return null;
}

function epicGetUpcomingOffer(item) {
  for (const block of item.promotions?.upcomingPromotionalOffers || []) {
    for (const offer of block.promotionalOffers || []) {
      if (offer.startDate && offer.endDate) return offer;
    }
  }
  return null;
}

async function fetchEpic() {
  console.log("Fetching Epic Games Store data…");
  const res = await fetch(EPIC_URL, {
    headers: { "User-Agent": "free-game-tracker/1.0 (github-actions)" },
  });
  if (!res.ok) throw new Error(`Epic HTTP ${res.status}`);
  const data = await res.json();

  const elements = data?.data?.Catalog?.searchStore?.elements || [];

  const games = [];
  for (const item of elements) {
    const currentOffer = epicGetCurrentOffer(item);
    const upcomingOffer = epicGetUpcomingOffer(item);
    const discountPrice = item.price?.totalPrice?.discountPrice;
    const originalPrice = item.price?.totalPrice?.originalPrice;

    const nowFree =
      typeof discountPrice === "number" &&
      discountPrice === 0 &&
      epicHasCurrentPromo(item);
    const upcomingFree = !nowFree && !!upcomingOffer;
    const status = nowFree ? "free" : upcomingFree ? "upcoming" : null;
    if (!status) continue;

    const slug =
      item.productSlug ||
      item.urlSlug ||
      item.catalogNs?.mappings?.[0]?.pageSlug ||
      "";

    games.push({
      id: item.id,
      store: "epic",
      storeName: "Epic Games Store",
      title: item.title || "Untitled",
      slug,
      storeUrl: slug ? `https://store.epicgames.com/p/${encodeURIComponent(slug)}` : "https://store.epicgames.com/free-games",
      seller: item.seller?.name || "Epic Games Store",
      description: item.description || "",
      image: epicPickImage(item),
      originalPrice: originalPrice ?? null,
      discountPrice: discountPrice ?? null,
      status,
      offerStart: currentOffer?.startDate || upcomingOffer?.startDate || null,
      offerEnd: currentOffer?.endDate || upcomingOffer?.endDate || null,
    });
  }

  console.log(`  → ${games.filter((g) => g.status === "free").length} free, ${games.filter((g) => g.status === "upcoming").length} upcoming`);
  return games;
}

// ─── GOG ─────────────────────────────────────────────────────────────────────

// GOG exposes a public promotional endpoint. The giveaway section is under
// the "giveaway" section of their catalog API.
const GOG_GIVEAWAY_URL = "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&price=free";

// GOG also has a dedicated giveaway page we can scrape a known JSON endpoint for
const GOG_PROMO_URL = "https://www.gog.com/en/games?priceRange=0,0&discounted=true";

// The most reliable GOG endpoint for their free giveaway (the "free game" banner)
const GOG_CATALOG_API = "https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Atrending&price=between%3A0%2C0&discounted=true&productType=in%3Agame%2Cpack%2Cdlc%2Cextras&page=1&countryCode=US&locale=en-US&currencyCode=USD";

async function fetchGOG() {
  console.log("Fetching GOG data…");

  let games = [];

  // Try the GOG catalog API (discounted to free)
  try {
    const res = await fetch(GOG_CATALOG_API, {
      headers: {
        "User-Agent": "free-game-tracker/1.0 (github-actions)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) throw new Error(`GOG catalog HTTP ${res.status}`);
    const data = await res.json();

    const products = data?.products || [];

    for (const item of products) {
      // Only keep items where the final price is actually 0 (free)
      const finalPrice = item.price?.finalMoney?.amount;
      const basePrice = item.price?.baseMoney?.amount;
      if (finalPrice === undefined) continue;

      const isFree = parseFloat(finalPrice) === 0;
      if (!isFree) continue;

      // Skip items that are always free (no discount, base price also 0)
      // We only want temporarily-free promotional giveaways
      const isPromo = parseFloat(basePrice || "0") > 0;
      if (!isPromo) continue;

      const slug = item.slug || "";
      const image =
        item.coverHorizontal ||
        item.coverVertical ||
        (item.thumbnail ? `https://images.gog-statics.com/${item.thumbnail}_product_tile_304x172.webp` : "");

      games.push({
        id: `gog-${item.id || slug}`,
        store: "gog",
        storeName: "GOG",
        title: item.title || "Untitled",
        slug,
        storeUrl: slug ? `https://www.gog.com/en/game/${slug}` : "https://www.gog.com/en/games#discounted",
        seller: item.developers?.join(", ") || item.publisher || "GOG",
        description: item.description || item.summary || "",
        image: image ? (image.startsWith("http") ? image : `https:${image}`) : "",
        originalPrice: basePrice ? Math.round(parseFloat(basePrice) * 100) : null,
        discountPrice: 0,
        status: "free",
        offerStart: null, // GOG catalog API doesn't expose promo dates directly
        offerEnd: item.price?.discount?.endDate || null,
      });
    }
  } catch (err) {
    console.warn("  GOG catalog fetch failed:", err.message);
  }

  // Also check the GOG giveaway endpoint (their dedicated "free game" promotions)
  try {
    const res = await fetch("https://www.gog.com/en/games/ajax/filtered?mediaType=game&price=free&sort=popularity", {
      headers: {
        "User-Agent": "free-game-tracker/1.0 (github-actions)",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const products = data?.products || [];

      for (const item of products) {
        // Avoid duplicates
        const slug = item.slug || item.url?.split("/").pop() || "";
        const alreadyAdded = games.some((g) => g.slug === slug && g.store === "gog");
        if (alreadyAdded) continue;

        const originalPrice = item.price?.baseAmount
          ? Math.round(parseFloat(item.price.baseAmount) * 100)
          : null;

        // Only include if it actually has a non-zero base price (promo giveaway, not F2P)
        if (!originalPrice || originalPrice === 0) continue;

        const imageBase = item.image || "";
        const image = imageBase
          ? `https:${imageBase}_product_tile_304x172.webp`
          : "";

        games.push({
          id: `gog-${item.id || slug}`,
          store: "gog",
          storeName: "GOG",
          title: item.title || "Untitled",
          slug,
          storeUrl: `https://www.gog.com${item.url || `/en/game/${slug}`}`,
          seller: item.developer || item.publisher || "GOG",
          description: item.category || "",
          image,
          originalPrice,
          discountPrice: 0,
          status: "free",
          offerStart: null,
          offerEnd: null,
        });
      }
    }
  } catch (err) {
    console.warn("  GOG ajax fetch failed:", err.message);
  }

  console.log(`  → ${games.length} GOG free game(s) found`);
  return games;
}

// ─── PlayStation Plus ─────────────────────────────────────────────────────────
//
// Sony has no public unauthenticated API for PS Plus monthly games.
// The most reliable no-auth source is the PlayStation Blog RSS feed.
// We fetch the RSS, find the current month's PS Plus announcement post,
// then use Claude to extract structured game data from the post body.

// Use the PS Plus category feed — far fewer irrelevant posts than the main feed.
// Sony posts next month's games in the last week of the prior month,
// so we match by month NAME in the title, not the publish date.
const PS_BLOG_RSS = "https://blog.playstation.com/category/ps-plus/feed/";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Handles both plain tags and CDATA-wrapped content (WordPress style).
function extractTag(xml, tag) {
  const cdataOpen = `<${tag}><![CDATA[`;
  const cdataClose = `]]></${tag}>`;
  let start = xml.indexOf(cdataOpen);
  if (start !== -1) {
    start += cdataOpen.length;
    const end = xml.indexOf(cdataClose, start);
    if (end !== -1) return xml.slice(start, end).trim();
  }
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  start = xml.indexOf(open);
  if (start === -1) return "";
  start += open.length;
  const end = xml.indexOf(close, start);
  if (end === -1) return "";
  return xml.slice(start, end).trim();
}

function splitItems(xml) {
  const items = [];
  let pos = 0;
  while (true) {
    const start = xml.indexOf("<item>", pos);
    if (start === -1) break;
    const end = xml.indexOf("</item>", start);
    if (end === -1) break;
    items.push(xml.slice(start, end + "</item>".length));
    pos = end + 1;
  }
  return items;
}

async function fetchPSBlogRSS() {
  const res = await fetch(PS_BLOG_RSS, {
    headers: { "User-Agent": "free-game-tracker/1.0 (github-actions)" },
  });
  if (!res.ok) throw new Error(`PS Blog RSS HTTP ${res.status}`);
  return await res.text();
}

function findPsPlusPost(rssXml) {
  const items = splitItems(rssXml);
  const now = new Date();

  // Sony posts the NEXT month's games in the last week of the prior month.
  // Check both current month and next month in the title.
  const monthsToCheck = [0, 1].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return d.toLocaleString("en-US", { month: "long" });
  });

  console.log(`  Looking for PS Plus post mentioning: ${monthsToCheck.join(" or ")}`);

  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    const title = stripHtml(extractTag(item, "title"));
    const titleLower = title.toLowerCase();

    // Must be a monthly games post
    if (!/(monthly\s+games|monthly\s+free)/i.test(titleLower)) continue;
    if (!/playstation\s*plus|ps\s*plus/i.test(titleLower)) continue;

    let score = 0;
    for (let i = 0; i < monthsToCheck.length; i++) {
      if (titleLower.includes(monthsToCheck[i].toLowerCase())) {
        score = Math.max(score, 2 - i); // current month scores higher
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (!bestItem) return null;

  return {
    title: stripHtml(extractTag(bestItem, "title")),
    link: stripHtml(extractTag(bestItem, "link")),
    content: extractTag(bestItem, "content:encoded") || extractTag(bestItem, "description"),
    pubDate: stripHtml(extractTag(bestItem, "pubDate")),
  };
}

async function parseGamesWithClaude(postTitle, postText, postLink) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("  ANTHROPIC_API_KEY not set — skipping Claude parsing");
    return [];
  }

  const truncated = postText.slice(0, 8000); // stay well within context

  const prompt = `You are a data extraction assistant. Extract the PlayStation Plus monthly free games from the following PlayStation Blog post.

Post title: ${postTitle}
Post URL: ${postLink}

Post content (may contain HTML):
${truncated}

Return ONLY a JSON array (no markdown, no preamble) where each element has these exact fields:
- "title": the game title as a string
- "platforms": array of platform strings, e.g. ["PS5", "PS4"] — include all platforms mentioned for each game
- "description": a 1-2 sentence description of the game if available in the post, otherwise ""
- "storeUrl": the PlayStation Store URL for the game if linked in the post, otherwise "https://store.playstation.com"

Only include games that are part of the monthly PS Plus Essential free games (not Extra/Premium catalogue additions). If no games are found, return an empty array [].`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";

  // Strip markdown fences if present
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean);
}

async function fetchPSPlus() {
  console.log("Fetching PlayStation Plus data via PS Blog RSS…");

  try {
    const rssXml = await fetchPSBlogRSS();
    const post = findPsPlusPost(rssXml);

    if (!post) {
      console.warn("  Could not find this month's PS Plus post in the RSS feed.");
      return [];
    }

    console.log(`  Found post: "${post.title}"`);

    const postText = stripHtml(post.content || post.description);
    const parsed = await parseGamesWithClaude(post.title, postText, post.link);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn("  Claude returned no games from the post.");
      return [];
    }

    const games = parsed.map((item, i) => ({
      id: `psplus-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      store: "psplus",
      storeName: "PlayStation Plus",
      title: item.title || "Untitled",
      slug: "",
      storeUrl: item.storeUrl || "https://store.playstation.com",
      seller: item.platforms?.join(" / ") || "PS4 / PS5",
      description: item.description || "",
      image: "", // PS Blog doesn't expose per-game images in the RSS
      originalPrice: null,
      discountPrice: 0,
      status: "free",
      offerStart: post.pubDate ? new Date(post.pubDate).toISOString() : null,
      offerEnd: null, // PS Plus games rotate monthly; exact end date isn't in the RSS
      platforms: item.platforms || [],
      sourcePost: post.link,
    }));

    console.log(`  → ${games.length} PS Plus game(s) found`);
    return games;
  } catch (err) {
    console.warn("  PS Plus fetch failed:", err.message);
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = await Promise.allSettled([fetchEpic(), fetchGOG(), fetchPSPlus()]);

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
/**
 * fetch-games.js
 *
 * Fetches current and upcoming free game promotions from:
 *   - Epic Games Store
 *   - GOG
 *   - PlayStation Plus (via PlayStation Blog RSS, parsed directly)
 *
 * Writes the combined, normalized result to ../data/games.json
 * This script is run by GitHub Actions on a schedule.
 * No API keys or credentials required.
 */

import fetch from "node-fetch";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

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
      seller: "PC",
      platforms: ["PC"],
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

/**
 * Parse PS Plus games directly from the blog post — no external API needed.
 *
 * For each game the PS Blog post body follows this consistent structure:
 *
 *   <img src="https://blog.playstation.com/tachyon/...">   ← cover art
 *   ... (Sony image download overlay, safe to ignore) ...
 *   <h2><strong>Game Title | PS5, PS4</strong></h2>        ← title + platforms
 *   <p>Description paragraph...</p>                        ← description
 *
 * We find every H2 that matches the "Title | Platforms" pattern, then
 * look backward for the nearest tachyon image and forward for the first <p>.
 * A fallback title-from-post-title pass catches anything the heading scan misses.
 */
function parseGamesFromPost(postTitle, postHtml) {
  // ── Find all game heading positions ────────────────────────────────────────
  // Matches:  <h2><strong>Title | PS5, PS4</strong></h2>
  //       or  <h2>**Title | PS5**</h2>   (Markdown bold in HTML)
  //       or  plain <h2>Title | PS5</h2>

  const headingRe = /<h[23][^>]*>(?:<strong>|<b>)?\s*([^|<]+?)\s*\|\s*([^<]+?)\s*(?:<\/strong>|<\/b>)?\s*<\/h[23]>/gi;

  const entries = [];
  let m;
  while ((m = headingRe.exec(postHtml)) !== null) {
    const rawTitle = m[1].replace(/<[^>]+>/g, "").replace(/\*+/g, "").trim();
    const platformStr = m[2]
      .replace(/&amp;/gi, ",")
      .replace(/&/g, ",")
      .trim();

    const platforms = platformStr
      .split(/[,/]+/)
      .map((p) => p.trim())
      .filter((p) => /^PS/i.test(p));

    if (rawTitle.length < 3) continue;
    if (/^(last chance|about|note|download|\*)/i.test(rawTitle)) continue;

    entries.push({ title: rawTitle, platforms, headingIndex: m.index, headingEnd: m.index + m[0].length });
  }

  // ── For each heading: extract cover image and description from its own section ──
  //
  // The post structure per game is:
  //   <img src="tachyon/...">          ← game cover art
  //   <h2>Download the image</h2>      ← Sony download overlay (NOT a game heading)
  //   <p>...</p>                       ← overlay junk
  //   <h2><strong>Title | PS5</strong></h2>  ← actual game heading (already in entries[])
  //   <p>Description...</p>            ← game description
  //
  // Strategy: for each game heading, its "section" runs from the previous game
  // heading's end (or start of HTML) to just before this heading. We look for
  // a tachyon image within that section. Then description is the first real <p>
  // after the heading.

  const games = [];
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (seen.has(entry.title.toLowerCase())) continue;
    seen.add(entry.title.toLowerCase());

    // The section before this heading starts after the previous heading ends
    const sectionStart = i > 0 ? entries[i - 1].headingEnd : 0;
    const section = postHtml.slice(sectionStart, entry.headingIndex);

    // Find the LAST tachyon image in this section (closest to the heading).
    // The game cover art uses ?fit=1024%2C1024 (encoded comma).
    // Skip:
    //   - pslogo.png (PS logo)
    //   - ?fit=40 / ?fit=40%2C40 (tiny author avatars/icons)
    //   - ?fit=512 / ?fit=640 (small sidebar images)
    //   - ?resize= (hero/banner images at the very top of posts — wide crops)
    const imgRe = /<img[^>]+src="(https:\/\/blog\.playstation\.com\/tachyon\/[^"]+)"[^>]*>/gi;
    let coverImage = "";
    let im;
    while ((im = imgRe.exec(section)) !== null) {
      const url = im[1];
      if (/pslogo/i.test(url)) continue;
      if (/[?&]resize=/.test(url)) continue;                        // skip hero/banner crops
      if (/[?&]fit=(?:40|400|512|640)(?:[,%]|$)/i.test(url)) continue; // skip small icons
      // This is a game art image — keep it (strip query string for a clean URL)
      coverImage = url.split("?")[0];
    }

    // Description: grab the first substantial paragraph after this heading.
    // In the RSS feed the description is wrapped in <p>...</p>.
    // We look at the slice between this heading's end and the next heading (or 3000 chars).
    const nextHeadingStart = i + 1 < entries.length ? entries[i + 1].headingIndex : entry.headingEnd + 3000;
    const descSection = postHtml.slice(entry.headingEnd, nextHeadingStart);
    let description = "";
    // Try <p> tags first
    const paraRe = /<p[^>]*>([\s\S]+?)<\/p>/gi;
    let pm2;
    while ((pm2 = paraRe.exec(descSection)) !== null) {
      const text = pm2[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 60) { // skip short nav/footnote paragraphs
        description = text;
        break;
      }
    }

    // Fallback image lookup if none found before heading
    if (!coverImage) {
      const afterHeading = postHtml.slice(
        entry.headingEnd,
        entry.headingEnd + 4000
      );

      const fallbackImgMatch = afterHeading.match(
        /<img[^>]+src="(https:\/\/blog\.playstation\.com\/tachyon\/[^"]+)"/i
      );

      if (fallbackImgMatch) {
        const candidate = fallbackImgMatch[1];

        if (
          !/pslogo/i.test(candidate) &&
          !/[?&]resize=/.test(candidate) &&
          !/[?&]fit=(?:40|400|512|640)(?:[,%]|$)/i.test(candidate)
        ) {
          coverImage = candidate.split("?")[0];
        }
      }
    }

    games.push({
      title: entry.title,
      platforms: entry.platforms,
      image: coverImage,
      description
    });
  }

  // ── Fallback: titles from the post title string, in case heading scan missed any ──
  const titleMatch = postTitle.match(/for\s+\w+[:–—]\s*(.+)$/i);
  if (titleMatch) {
    const fallbackTitles = titleMatch[1]
      .split(/,\s*(?=[A-Z\u00C0-\u024F])| &amp; | & /)
      .map((t) => t.trim())
      .filter(Boolean);

    for (const title of fallbackTitles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      const alreadyCovered = [...seen].some((s) => s.includes(key) || key.includes(s));
      if (alreadyCovered) continue;
      seen.add(key);
      games.push({ title, platforms: [], image: "", description: "" });
    }
  }

  return games;
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

    const postHtml = post.content || "";
    const parsed = parseGamesFromPost(post.title, postHtml);

    if (parsed.length === 0) {
      console.warn("  Could not parse any games from the post.");
      return [];
    }

    // PS Plus monthly games always expire on the first Tuesday of next month.
    // This is more reliable than parsing ambiguous blog wording.

    const now = new Date();

    const nextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    // Find first Tuesday
    while (nextMonth.getDay() !== 2) {
      nextMonth.setDate(nextMonth.getDate() + 1);
    }

    nextMonth.setHours(0, 0, 0, 0);

    const offerEnd = nextMonth.toISOString();

    const games = parsed.map((item) => ({
      id: `psplus-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      store: "psplus",
      storeName: "PlayStation Plus",
      title: item.title,
      slug: "",
      storeUrl: "https://store.playstation.com",
      seller: item.platforms.length ? item.platforms.join(" / ") : "PS5 / PS4",
      description: item.description || "",
      image: item.image || "",
      originalPrice: null,
      discountPrice: 0,
      status: "free",
      offerStart: post.pubDate ? new Date(post.pubDate).toISOString() : null,
      offerEnd,
      platforms: item.platforms,
      sourcePost: post.link,
    }));

    console.log(`  → ${games.length} PS Plus game(s) found`);
    return games;
  } catch (err) {
    console.warn("  PS Plus fetch failed:", err.message);
    return [];
  }
}

// ─── Prime Gaming / Amazon Prime ─────────────────────────────────────────────

const PRIME_GAMING_URL = "https://gaming.amazon.com/home";

function cleanPrimeText(str) {
  return String(str || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPrimePlatform(item = {}) {
  const text = [
    item.offerTitle,
    item.description,
    item.externalPlatform,
    item.redemptionMethod,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("epic")) return "Epic Games";
  if (text.includes("gog")) return "GOG";
  if (text.includes("legacy")) return "Legacy Games";
  if (text.includes("xbox")) return "Xbox";
  if (text.includes("microsoft")) return "Microsoft Store";
  if (text.includes("ea app")) return "EA App";

  return "Amazon Games App";
}

async function fetchPrimeGaming() {
  console.log("Fetching Prime Gaming data…");

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage({
      userAgent: "free-game-tracker/1.0 (github-actions)",
    });

    await page.goto("https://gaming.amazon.com/home", {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    // Wait for offer cards to appear
    await page.waitForSelector('img[src*="media-amazon.com"]', {
      timeout: 30000,
    });

    // First collect basic card data from homepage
    const cards = await page.evaluate(() => {
      const cardEls = [
        ...document.querySelectorAll('[data-a-target="item-card"]'),
      ];

      const results = [];
      const seen = new Set();

      for (const card of cardEls) {
        const link = card.closest("a");
        if (!link) continue;

        const titleEl = card.querySelector("h3");
        const imgEl = card.querySelector("img");

        const title =
          titleEl?.textContent?.trim() ||
          imgEl?.alt?.trim();

        if (!title) continue;

        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        let href = link.href || "";

        if (href.startsWith("/")) {
          href = `https://gaming.amazon.com${href}`;
        }

        results.push({
          title,
          href,
        });
      }

      return results;
    });

    const games = [];

    for (const card of cards) {
      try {
        const gamePage = await browser.newPage();

        await gamePage.goto(card.href, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        try {
          await gamePage.waitForSelector(
            '[data-test-id="item_game_description_body"], #background_media_image',
            { timeout: 10000 }
          );
        } catch {
          await gamePage.waitForTimeout(3000);
        }

        const details = await gamePage.evaluate(() => {
          const title =
            document.querySelector("h1")?.textContent?.trim() ||
            document.title;

          let description = "";
          let image = "";

          // --------------------------------------------------
          // STANDARD PRIME GAMING PAGE
          // --------------------------------------------------

          const standardDesc =
            document.querySelector('[data-a-target="BodyText"]') ||
            document.querySelector(".about-the-game__content p");

          if (standardDesc) {
            description = standardDesc.textContent.trim();
          }

          const standardImg =
            document.querySelector('[data-a-target="responsive-media-image"]') ||
            document.querySelector('img[src*="media-amazon.com"]');

          if (standardImg) {
            image =
              standardImg.src ||
              standardImg.getAttribute("src") ||
              "";
          }

          // --------------------------------------------------
          // AMAZON LUNA PAGE FALLBACK
          // --------------------------------------------------

          if (!description) {
            const lunaDesc =
              document.querySelector(
                '[data-test-id="item_game_description_body"]'
              );

            if (lunaDesc) {
              description = lunaDesc.textContent
                .replace(/\s+/g, " ")
                .trim();
            }
          }

          if (!image) {
            const lunaImg =
              document.querySelector("#background_media_image");

            if (lunaImg) {
              image =
                lunaImg.src ||
                lunaImg.getAttribute("src") ||
                "";
            }
          }

          return {
            title,
            description,
            image,
          };
        });

        const lowerHref = card.href.toLowerCase();

        let platform = "Amazon Games App";

        if (
          lowerHref.includes("luna.amazon") ||
          lowerHref.includes("/game/")
        ) {
          platform = "Amazon Luna";
        } else if (lowerHref.includes("-gog")) {
          platform = "GOG";
        } else if (lowerHref.includes("-epic")) {
          platform = "Epic Games";
        } else if (lowerHref.includes("-legacy")) {
          platform = "Legacy Games";
        }

        games.push({
          id: `prime-${details.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,

          store: "prime",
          storeName: "Prime Gaming",

          title: details.title,

          slug: details.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-"),

          storeUrl: card.href,

          seller: "Prime Gaming",

          description:
            details.description ||
            `Free with Prime Gaming via ${platform}.`,

          image: details.image || "",

          originalPrice: null,

          discountPrice: 0,

          status: "free",

          offerStart: null,

          offerEnd: null,

          platforms: [platform],
        });

        await gamePage.close();

      } catch (err) {
        console.warn(`Failed to scrape Prime game page: ${card.title}`);
      }
    }


    console.log(`  → ${games.length} Prime Gaming offer(s) found`);

    return games;
  } catch (err) {
    console.warn("  Prime Gaming fetch failed:", err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = await Promise.allSettled([
    fetchEpic(),
    fetchGOG(),
    fetchPSPlus(),
    fetchPrimeGaming(),
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

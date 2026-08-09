/**
 * fetch-games.js
 *
 * Fetches current and upcoming free game promotions from:
 *   - Epic Games Store
 *   - GOG
 *   - PlayStation Plus (via PlayStation Blog RSS, parsed directly)
 *   - Prime Gaming (Amazon)
 *    - Steam (via SteamDB) - still in testing, may be unreliable
 *   - (more stores may be added in the future)
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
      item.catalogNs?.mappings?.[0]?.pageSlug ||
      item.urlSlug ||
      item.productSlug ||
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

async function fetchGOG() {
  console.log("Fetching GOG giveaway...");

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
    });

    await page.goto("https://www.gog.com/en/", {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    const giveawayExists = await page.locator("#giveaway").count();

    if (!giveawayExists) {
      console.log("  → No GOG giveaway active");
      return [];
    }

    const data = await page.evaluate(() => {
      const giveaway = document.querySelector("#giveaway");
      if (!giveaway) return null;

      const overlay =
        giveaway.querySelector(".giveaway__overlay-link");

      const header =
        giveaway.querySelector(".giveaway__content-header");

      const description =
        giveaway.querySelector(".giveaway__content-description");

      const countdown =
        giveaway.querySelector(".giveaway__countdown");

      const picture =
        giveaway.querySelector("picture");

      let image = "";

      if (picture) {
        const source =
          picture.querySelector('source[type="image/webp"]');

        if (source) {
          const srcset = source.getAttribute("srcset") || "";

          image = srcset.split(",")[0].trim();
        }
      }

      return {
        url: overlay?.href || "",
        header: header?.textContent?.trim() || "",
        description:
          description?.textContent?.trim() || "",
        countdown:
          countdown?.textContent?.trim() || "",
        image,
      };
    });

    if (!data) {
      return [];
    }

    let title = data.header;

    title = title
      .replace(/^Giveaway:\s*/i, "")
      .replace(/^Claim\s*/i, "")
      .replace(/\sand don't miss.*$/i, "")
      .trim();

    let offerEnd = null;

    const numbers = data.countdown.match(/\d+/g);

    if (numbers && numbers.length >= 3) {
      const [hours, minutes, seconds] = numbers.map(Number);

      offerEnd = new Date(
        Date.now() +
        hours * 3600000 +
        minutes * 60000 +
        seconds * 1000
      ).toISOString();
    }

    return [
      {
        id: `gog-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,

        store: "gog",

        storeName: "GOG",

        title,

        slug: data.url.split("/").pop(),

        storeUrl: data.url,

        seller: "GOG",

        description: data.description,

        image: data.image,

        originalPrice: null,

        discountPrice: 0,

        status: "free",

        offerStart: null,

        offerEnd,

        platforms: ["PC"],
      },
    ];
  } catch (err) {
    console.warn("  GOG fetch failed:", err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

function decodeHtmlEntities(text) {
  if (!text) return "";

  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeTitle(title) {
  return decodeHtmlEntities(title)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
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
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "Accept":
        "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://blog.playstation.com/"
    },
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

  // NOTE: we deliberately do NOT require a specific inner-tag shape (e.g. just
  // <strong>/<b>) around the "Title | Platforms" text. Sony sometimes wraps the
  // title itself in an <a> (or other) tag, and a regex that expects no nested
  // tags will silently fail to match that heading — dropping the game entirely
  // AND corrupting section-boundary detection for the games around it (their
  // images/descriptions leak across the "missing" boundary). Instead: grab the
  // whole heading block first, strip ALL inner tags, then parse the plain text.
  const headingBlockRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;

  const entries = [];
  let m;
  while ((m = headingBlockRe.exec(postHtml)) !== null) {
    const plainText = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\*+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!plainText.includes("|")) continue; // not a "Title | Platforms" heading

    // Split on the LAST pipe, in case a title ever legitimately contains one.
    const pipeIndex = plainText.lastIndexOf("|");
    const rawTitle = normalizeTitle(plainText.slice(0, pipeIndex).trim());
    const platformStr = plainText
      .slice(pipeIndex + 1)
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
    let coverImage = "";

    const images = [
      ...section.matchAll(
        /<img[^>]+src="([^"]+)"/gi
      )
    ];

    console.log(
      `----- ${entry.title} -----`
    );

    for (const img of images) {
      console.log(img[1]);
    }

    // Prefer scaled images if present
    for (const img of images) {
      const url = img[1];

      if (/pslogo/i.test(url)) continue;

      if (/-scaled\.(jpg|jpeg|png|webp)$/i.test(url)) {
        coverImage = url;
        break;
      }
    }

    // Fallback to first non-logo image
    if (!coverImage) {
      for (const img of images) {
        const url = img[1];

        if (/pslogo/i.test(url)) continue;

        coverImage = url;
        break;
      }
    }

    const nextHeadingStart =
      i + 1 < entries.length
        ? entries[i + 1].headingIndex
        : postHtml.length;


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
          coverImage = candidate;
        }
      }
    }
    console.log(
      `${entry.title}: ${coverImage}`
    );

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
      .map((t) => normalizeTitle(t))
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
    console.log(`  Parsed ${parsed.length} game heading(s) from post body: ${parsed.map((g) => g.title).join(", ")}`);

    if (parsed.length === 0) {
      console.warn("  Could not parse any games from the post.");
      return [];
    }

    // PS Plus monthly games always expire on the first Tuesday of next month.

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
      title: normalizeTitle(item.title),
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
    console.error("PS Plus fetch failed:");
    console.error(err);
    console.error(err.stack);
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

function detectPrimePlatformFromUrl(href) {
  const lower = (href || "").toLowerCase();

  // Native Luna streaming titles: luna.amazon.com/detail/{asin}
  if (/luna\.amazon\.com\/detail\//.test(lower)) {
    return "Amazon Luna";
  }

  // Claim-and-redeem titles: luna.amazon.com/claims/{slug}-{platformCode}/dp/...
  const claimMatch = lower.match(/\/claims\/([a-z0-9-]+)\/dp\//);
  if (claimMatch) {
    const slugWithCode = claimMatch[1];
    if (/-epic$/.test(slugWithCode)) return "Epic Games";
    if (/-gog$/.test(slugWithCode)) return "GOG";
    if (/-legacy$/.test(slugWithCode)) return "Legacy Games";
    if (/-aga$/.test(slugWithCode)) return "Amazon Games App"; // seen on Terraforming Mars, In Sound Mind
  }

  return "Amazon Luna"; // genuine fallback, e.g. unrecognized suffix
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

          // Prefer actual game artwork
          const standardImg =
            document.querySelector("#background_media_image") ||
            document.querySelector('[data-a-target="responsive-media-image"]') ||
            document.querySelector('meta[property="og:image"]') ||
            document.querySelector('meta[name="twitter:image"]') ||
            document.querySelector('img[src*="media-amazon.com"]');

          if (standardImg) {
            image =
              standardImg.content ||
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
            const candidates = [
              document.querySelector('meta[property="og:image"]'),
              document.querySelector('meta[name="twitter:image"]'),
              document.querySelector("#background_media_image"),
              document.querySelector('img[src*="media-amazon.com"]')
            ];

            for (const el of candidates) {
              if (!el) continue;

              const src =
                el.content ||
                el.src ||
                el.getAttribute("src") ||
                "";

              if (src) {
                image = src;
                break;
              }
            }
          }

          return {
            title,
            description,
            image,
          };
        });

        const platform = detectPrimePlatformFromUrl(card.href);

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

// ─── Steam ─────────────────────────────────────────────────────────────────────
//
// SteamDB sits behind Cloudflare bot-management specifically to stop
// scraping like this (confirmed by the "Just a moment..." challenge page
// showing up in the Actions log even after UA/webdriver spoofing). Rather
// than chase an arms race against that, we use Valve's own unauthenticated
// storefront API, which needs no browser at all and isn't gated.
//
// featuredcategories' "specials" list is Steam's current discounted-items
// feed. A discount_percent of 100 means the game is fully free to add to
// your library right now — the direct equivalent of what we were trying to
// scrape off SteamDB. (This does NOT catch temporary "Free Weekend" access
// promos, which don't change the listed price — only genuine free-to-keep
// giveaways.)

const STEAM_FEATURED_URL =
  "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";
const STEAM_API = "https://store.steampowered.com/api/appdetails?appids=";

async function fetchSteam() {
  console.log("Fetching Steam promotions via the official Steam Store API…");

  try {
    const res = await fetch(STEAM_FEATURED_URL, {
      headers: { "User-Agent": "freebie-tracker/1.0 (github-actions)" },
    });

    if (!res.ok) throw new Error(`Steam featuredcategories HTTP ${res.status}`);

    const data = await res.json();
    const specialItems = data?.specials?.items || [];

    const freeItems = specialItems.filter(
      (item) => item.discount_percent === 100 && item.final_price === 0
    );

    console.log(
      `  Found ${specialItems.length} item(s) in Specials, ${freeItems.length} fully free`
    );

    const games = [];

    for (const item of freeItems) {
      try {
        const detailRes = await fetch(`${STEAM_API}${item.id}`, {
          headers: { "User-Agent": "freebie-tracker/1.0 (github-actions)" },
        });

        if (!detailRes.ok) {
          console.warn(`  Steam API HTTP ${detailRes.status} for ${item.name}`);
          continue;
        }

        const json = await detailRes.json();
        const app = json[item.id];

        if (!app?.success || !app.data) {
          console.warn(`  Steam API returned no data for ${item.name}`);
          continue;
        }

        const detail = app.data;

        games.push({
          id: `steam-${item.id}`,
          store: "steam",
          storeName: "Steam",
          title: detail.name || item.name,
          slug: String(item.id),
          storeUrl: `https://store.steampowered.com/app/${item.id}/`,
          seller:
            detail.developers?.join(", ") ||
            detail.publishers?.join(", ") ||
            "Steam",
          description: detail.short_description || "",
          image:
            detail.header_image ||
            item.large_capsule_image ||
            item.small_capsule_image ||
            "",
          originalPrice: item.original_price ?? detail.price_overview?.initial ?? null,
          discountPrice: 0,
          status: "free",
          offerStart: null,
          // Steam includes a discount_expiration unix timestamp (seconds)
          // on time-limited specials when one applies; not every free item
          // has one (e.g. permanently free-to-keep re-releases).
          offerEnd: item.discount_expiration
            ? new Date(item.discount_expiration * 1000).toISOString()
            : null,
          platforms: [
            ...(detail.platforms?.windows ? ["Windows"] : []),
            ...(detail.platforms?.mac ? ["macOS"] : []),
            ...(detail.platforms?.linux ? ["Linux"] : []),
          ],
        });
      } catch (err) {
        console.warn(`  Steam detail fetch failed for ${item.name}:`, err.message);
      }
    }

    console.log(`  → ${games.length} Steam promotion(s) found`);
    return games;
  } catch (err) {
    console.warn("  Steam fetch failed:", err.message);
    return [];
  }
}



// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = await Promise.allSettled([
    fetchEpic(),
    fetchGOG(),
    fetchPSPlus(),
    fetchPrimeGaming(),
    fetchSteam(),
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
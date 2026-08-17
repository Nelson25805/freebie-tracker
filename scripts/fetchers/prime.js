/**
 * fetchers/prime.js
 *
 * Prime Gaming has no public API, so this scrapes the offer cards on
 * gaming.amazon.com/home with Playwright, then visits each individual
 * game page to pull description/image/redemption-platform. Likely the
 * most fragile fetcher here (selector-dependent + N page visits) — if
 * Amazon changes their markup, this is the only file to touch.
 */

import { chromium } from "playwright";

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

export async function fetchPrimeGaming() {
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

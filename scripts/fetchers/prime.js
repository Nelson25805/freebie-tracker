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

// Clicks the first visible match for `selector` within `timeout` ms.
// Returns true if something was clicked, false if it never became
// visible in time (not an error — most offers won't hit every step).
async function clickIfVisible(gamePage, selector, timeout) {
  try {
    const btn = gamePage.locator(selector).first();
    await btn.waitFor({ state: "visible", timeout });
    await btn.click({ timeout: 5000 });
    await gamePage.waitForTimeout(1000);
    return true;
  } catch {
    return false;
  }
}

// Amazon Luna shows a first-time-visitor onboarding flow ON TOP OF the
// real page: a "Welcome to Luna" video modal, then a "Luna Standard" info
// panel — and the real game content underneath doesn't finish loading
// until both are dismissed. A fresh Playwright context is a "new visitor"
// every run, so this fires every time, which is why scrapes were coming
// back with placeholder titles/descriptions instead of failing outright.
//
// Selectors below are the actual element ids from Luna's markup:
//   modal 1 ("Welcome to Luna" video) -> #item_ftue_jumanji_continue_button, labeled "Skip"
//   modal 2 ("Luna Standard" info)    -> #item_ftue_luna_standard, labeled "Close"
// Text-based fallbacks are tried second in case Amazon renames these ids.
async function dismissLunaOnboarding(gamePage) {
  const skipSelectors = [
    "#item_ftue_jumanji_continue_button",
    'button:has-text("Skip")',
  ];
  const closeSelectors = [
    "#item_ftue_luna_standard",
    'button:has-text("Close")',
  ];

  for (const sel of skipSelectors) {
    if (await clickIfVisible(gamePage, sel, 8000)) break;
  }

  for (const sel of closeSelectors) {
    if (await clickIfVisible(gamePage, sel, 5000)) break;
  }
}

// Two known ways an individual Luna page scrape comes back "successful"
// but wrong (e.g. if dismissLunaOnboarding above missed a step):
//  - The onboarding interstitial itself, if we read the page while a
//    modal is still up.
//  - Amazon's own "We're having technical difficulties" error page, if
//    the real page failed to load at all.
// Both produce a real, non-empty title string — just not the game's — so
// a plain "did we get *a* title" check doesn't catch them. Check the text.
const KNOWN_BAD_TITLE_RE = /use\s+phones?\s+as\s+controllers?|technical\s+difficult|welcome\s+to\s+luna/i;

function looksLikeBadScrape(details) {
  if (!details?.title) return true;
  return KNOWN_BAD_TITLE_RE.test(details.title);
}

async function scrapeGameDetails(gamePage) {
  return gamePage.evaluate(() => {
    const BAD_TITLE_RE = /use\s+phones?\s+as\s+controllers?|technical\s+difficult|welcome\s+to\s+luna/i;

    let title = document.querySelector("h1")?.textContent?.trim() || "";
    const ogTitle =
      document.querySelector('meta[property="og:title"]')?.content?.trim() || "";

    // Prefer the visible <h1>, but if it's empty or matches one of the
    // known placeholder/error strings, fall back to the SSR'd og:title
    // meta tag — it's present in the initial HTML before client-side JS
    // hydrates and swaps the real content in, so it's less likely to be
    // caught mid-interstitial than the h1 is.
    if (!title || BAD_TITLE_RE.test(title)) {
      title = ogTitle || title || document.title;
    }

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
      const lunaDesc = document.querySelector(
        '[data-test-id="item_game_description_body"]'
      );

      if (lunaDesc) {
        description = lunaDesc.textContent.replace(/\s+/g, " ").trim();
      }
    }

    if (!image) {
      const candidates = [
        document.querySelector('meta[property="og:image"]'),
        document.querySelector('meta[name="twitter:image"]'),
        document.querySelector("#background_media_image"),
        document.querySelector('img[src*="media-amazon.com"]'),
      ];

      for (const el of candidates) {
        if (!el) continue;

        const src = el.content || el.src || el.getAttribute("src") || "";

        if (src) {
          image = src;
          break;
        }
      }
    }

    return { title, description, image };
  });
}

// previousGames lets a run that hits a known-bad scrape (interstitial or
// error page, if dismissal didn't work) fall back to the last run's data
// for that same offer instead of publishing junk — matched by storeUrl,
// since that's stable across runs even when the scraped title isn't.
// Reusing the previous entry wholesale also keeps its `id` unchanged,
// which is what stops notify-newsletter.js from mistaking a bad
// re-scrape of an offer you already know about for a brand-new free
// game (and re-emailing it).
export async function fetchPrimeGaming(previousGames = []) {
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
      let gamePage;

      try {
        gamePage = await browser.newPage();

        await gamePage.goto(card.href, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        await dismissLunaOnboarding(gamePage);

        try {
          await gamePage.waitForSelector(
            '[data-test-id="item_game_description_body"], #background_media_image',
            { timeout: 10000 }
          );
        } catch {
          await gamePage.waitForTimeout(3000);
        }

        let details = await scrapeGameDetails(gamePage);

        // Still landed on a placeholder/error page — give the onboarding
        // dismissal and the real content one more chance before giving up.
        if (looksLikeBadScrape(details)) {
          console.warn(
            `  Prime: got a placeholder/error page for "${card.title}" — retrying once…`
          );

          await gamePage.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
          await dismissLunaOnboarding(gamePage);

          try {
            await gamePage.waitForSelector(
              '[data-test-id="item_game_description_body"], #background_media_image',
              { timeout: 10000 }
            );
          } catch {
            await gamePage.waitForTimeout(4000);
          }

          details = await scrapeGameDetails(gamePage);
        }

        if (looksLikeBadScrape(details)) {
          const previous = previousGames.find(
            (g) => g.store === "prime" && g.storeUrl === card.href
          );

          if (previous) {
            console.warn(
              `  Prime: still couldn't scrape "${card.title}" after retry — reusing last known-good data for it.`
            );
            games.push({ ...previous });
          } else {
            console.warn(
              `  Prime: still couldn't scrape "${card.title}" after retry and there's no previous data to fall back on — skipping it this run.`
            );
          }

          await gamePage.close();
          continue;
        }

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
        if (gamePage) await gamePage.close().catch(() => { });
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
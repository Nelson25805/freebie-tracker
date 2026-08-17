/**
 * fetchers/gog.js
 *
 * GOG only ever runs one giveaway at a time, shown as a banner on the
 * homepage. There's no public API for it, so this scrapes the rendered
 * page with Playwright. Fragile by nature — if GOG changes the
 * `#giveaway` markup, this is the only file that needs to change.
 */

import { chromium } from "playwright";

export async function fetchGOG(previousGames) {
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

    let title = data.header
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

    const previousGOG = previousGames.find((g) => g.store === "gog");
    const offerStart =
      previousGOG && previousGOG.title === title && previousGOG.offerStart
        ? previousGOG.offerStart
        : new Date().toISOString();

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

        offerStart,

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

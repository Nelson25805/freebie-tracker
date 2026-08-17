/**
 * fetchers/psplus.js
 *
 * Sony has no public unauthenticated API for PS Plus monthly games.
 * The most reliable no-auth source is the PlayStation Blog RSS feed.
 * We fetch the RSS, find the current month's PS Plus announcement post,
 * then parse structured game data directly out of the post body's HTML.
 *
 * This is the most "reverse-engineered markup structure" of all the
 * fetchers — if Sony changes their blog post template, this file (and
 * only this file) is what needs updating.
 */

import fetch from "node-fetch";
import { stripHtml, normalizeTitle, extractTag, splitItems } from "../utils/html.js";

// Use the PS Plus category feed — far fewer irrelevant posts than the main feed.
// Sony posts next month's games in the last week of the prior month,
// so we match by month NAME in the title, not the publish date.
const PS_BLOG_RSS = "https://blog.playstation.com/category/ps-plus/feed/";

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

export async function fetchPSPlus() {
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

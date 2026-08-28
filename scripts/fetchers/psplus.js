/**
 * fetchers/psplus.js
 *
 * Sony has no public unauthenticated API for PS Plus monthly games.
 * The primary source is the PlayStation Blog RSS feed. The RSS feed can
 * lag the live site by a day or more, though — Sony publishes next
 * month's "Monthly Games" post to blog.playstation.com well before the
 * category RSS feed picks it up. So when RSS doesn't have next month's
 * post yet, we fall back to scraping the blog HOMEPAGE for the same post
 * (it shows up there as a post-card almost immediately), grab its link,
 * fetch that post page directly, and parse it the same way.
 *
 * Either way, once we have the raw post HTML, we parse structured game
 * data directly out of it. This month's games become "free" entries;
 * next month's become "upcoming" entries — same as Epic's current/
 * upcoming split.
 *
 * This is the most "reverse-engineered markup structure" of all the
 * fetchers — if Sony changes their blog post/homepage template, this
 * file (and only this file) is what needs updating.
 */

import fetch from "node-fetch";
import { stripHtml, normalizeTitle, extractTag, splitItems, decodeHtmlEntities } from "../utils/html.js";

// Use the PS Plus category feed — far fewer irrelevant posts than the main feed.
const PS_BLOG_RSS = "https://blog.playstation.com/category/ps-plus/feed/";
const PS_BLOG_HOMEPAGE = "https://blog.playstation.com/";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Referer": "https://blog.playstation.com/",
};

async function fetchPSBlogRSS() {
  const res = await fetch(PS_BLOG_RSS, {
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`PS Blog RSS HTTP ${res.status}`);
  return await res.text();
}

async function fetchPSBlogHomepage() {
  const res = await fetch(PS_BLOG_HOMEPAGE, {
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`PS Blog homepage HTTP ${res.status}`);
  return await res.text();
}

async function fetchPsPlusPostPage(link) {
  const res = await fetch(link, {
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`PS Blog post page HTTP ${res.status}`);
  return await res.text();
}

// PS Plus monthly games always go live/expire on the first Tuesday of a
// month. Used both for "when does this month's lineup close" and "when
// does next month's lineup open/close".
function firstTuesdayOfMonth(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  while (d.getDay() !== 2) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function targetMonthNameForOffset(offset) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1)
    .toLocaleString("en-US", { month: "long" })
    .toLowerCase();
}

function isPsPlusMonthlyTitle(title, targetMonthName) {
  const titleLower = title.toLowerCase();
  if (!/(monthly\s+games|monthly\s+free)/i.test(titleLower)) return false;
  if (!/playstation\s*plus|ps\s*plus/i.test(titleLower)) return false;
  if (!titleLower.includes(targetMonthName)) return false;
  return true;
}

/**
 * Finds the best "PlayStation Plus Monthly Games" post in the RSS feed
 * whose title mentions the month at `offset` months from now (0 = this
 * month, 1 = next month). Returns null if the RSS feed doesn't have it
 * — either because Sony hasn't posted it yet, or (more often, for the
 * "next month" case) because the RSS feed just hasn't caught up to the
 * live site yet.
 */
function findPsPlusPostViaRSS(rssXml, offset) {
  const items = splitItems(rssXml);
  const targetMonthName = targetMonthNameForOffset(offset);

  const seenTitles = [];

  for (const item of items) {
    const rawTitle = stripHtml(extractTag(item, "title"));
    const title = decodeHtmlEntities(rawTitle).replace(/\s+/g, " ").trim();
    seenTitles.push(title);

    if (!isPsPlusMonthlyTitle(title, targetMonthName)) continue;

    return {
      title,
      link: stripHtml(extractTag(item, "link")),
      content: extractTag(item, "content:encoded") || extractTag(item, "description"),
      pubDate: stripHtml(extractTag(item, "pubDate")),
    };
  }

  console.warn(`  PS Plus: no post matched "${targetMonthName}" in RSS (offset ${offset}). Recent feed titles:`);
  for (const t of seenTitles.slice(0, 8)) console.warn(`    - ${t}`);

  return null;
}

/**
 * Scrapes the blog HOMEPAGE for a "Monthly Games" post-card matching the
 * target month, as a fallback for when the RSS feed hasn't caught up yet.
 * Homepage post-cards look like:
 *
 *   <h3 class="post-card__title">
 *     <a href="https://blog.playstation.com/2026/08/26/playstation-plus-monthly-games-for-september-.../"
 *        class="post-card__title-link">
 *        PlayStation Plus Monthly Games for September – ... </a>
 *   </h3>
 */
function findPsPlusLinkOnHomepage(homepageHtml, offset) {
  const targetMonthName = targetMonthNameForOffset(offset);
  const titleBlockRe =
    /<h3 class="post-card__title">\s*<a\s+href="([^"]+)"\s+class="post-card__title-link">\s*([\s\S]*?)\s*<\/a>\s*<\/h3>/gi;

  let m;
  while ((m = titleBlockRe.exec(homepageHtml)) !== null) {
    const link = m[1];
    const title = decodeHtmlEntities(stripHtml(m[2])).replace(/\s+/g, " ").trim();

    if (!isPsPlusMonthlyTitle(title, targetMonthName)) continue;

    return { title, link };
  }

  return null;
}

/**
 * Finds the PS Plus "Monthly Games" post for `offset` months from now.
 * Tries the RSS feed first (cheap, and gives us pubDate + content in one
 * request); if that comes up empty, falls back to scraping the blog
 * homepage for the post link and fetching that page directly.
 */
async function findPsPlusPost(rssXml, offset) {
  const viaRss = findPsPlusPostViaRSS(rssXml, offset);
  if (viaRss) return viaRss;

  try {
    const homepageHtml = await fetchPSBlogHomepage();
    const found = findPsPlusLinkOnHomepage(homepageHtml, offset);
    if (!found) return null;

    console.log(`  RSS feed didn't have it yet — found via blog homepage instead: "${found.title}"`);
    const postHtml = await fetchPsPlusPostPage(found.link);

    return {
      title: found.title,
      link: found.link,
      content: postHtml,
      pubDate: null, // not available from a homepage scrape
    };
  } catch (err) {
    console.warn(`  Homepage fallback failed for offset ${offset}:`, err.message);
    return null;
  }
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
 * A fallback title-from-post-title pass catches anything the heading scan missed.
 *
 * Works the same whether `postHtml` is just the RSS content:encoded body
 * or a full fetched page — the "Title | PS5, PS4" heading pattern is
 * specific enough that surrounding page chrome (nav, footer, etc.) won't
 * false-positive against it.
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

function buildPsPlusGame(item, { status, offerStart, offerEnd, sourcePost }) {
  return {
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
    status,
    offerStart,
    offerEnd,
    platforms: item.platforms,
    sourcePost,
  };
}

export async function fetchPSPlus() {
  console.log("Fetching PlayStation Plus data via PS Blog RSS…");

  try {
    const rssXml = await fetchPSBlogRSS();

    const currentPost = await findPsPlusPost(rssXml, 0);
    const nextPost = await findPsPlusPost(rssXml, 1);

    if (!currentPost && !nextPost) {
      console.warn("  Could not find any PS Plus monthly games post (RSS or homepage).");
      return [];
    }

    const now = new Date();
    // First Tuesday of next month: when this month's free lineup closes,
    // and (once announced) next month's lineup becomes claimable.
    const nextMonthFirstTuesday = firstTuesdayOfMonth(now.getFullYear(), now.getMonth() + 1);
    // First Tuesday of the month after that: when next month's lineup
    // would, in turn, close.
    const monthAfterNextFirstTuesday = firstTuesdayOfMonth(now.getFullYear(), now.getMonth() + 2);

    let games = [];

    if (currentPost) {
      console.log(`  Found current month's post: "${currentPost.title}"`);
      const parsed = parseGamesFromPost(currentPost.title, currentPost.content || "");
      console.log(`  Parsed ${parsed.length} game heading(s): ${parsed.map((g) => g.title).join(", ")}`);

      if (parsed.length) {
        games = games.concat(
          parsed.map((item) =>
            buildPsPlusGame(item, {
              status: "free",
              offerStart: currentPost.pubDate ? new Date(currentPost.pubDate).toISOString() : null,
              offerEnd: nextMonthFirstTuesday.toISOString(),
              sourcePost: currentPost.link,
            })
          )
        );
      } else {
        console.warn("  Could not parse any games from the current month's post.");
      }
    } else {
      console.warn("  Could not find this month's PS Plus post.");
    }

    if (nextPost) {
      console.log(`  Found next month's post: "${nextPost.title}"`);
      const parsedNext = parseGamesFromPost(nextPost.title, nextPost.content || "");
      console.log(`  Parsed ${parsedNext.length} upcoming game heading(s): ${parsedNext.map((g) => g.title).join(", ")}`);

      if (parsedNext.length) {
        games = games.concat(
          parsedNext.map((item) =>
            buildPsPlusGame(item, {
              status: "upcoming",
              // Becomes claimable once this month's lineup rotates out.
              offerStart: nextMonthFirstTuesday.toISOString(),
              offerEnd: monthAfterNextFirstTuesday.toISOString(),
              sourcePost: nextPost.link,
            })
          )
        );
      } else {
        console.warn("  Could not parse any games from next month's post.");
      }
    } else {
      console.log("  No next month's PS Plus post found yet (RSS or homepage) — will retry next run.");
    }

    console.log(
      `  → ${games.filter((g) => g.status === "free").length} free, ${games.filter((g) => g.status === "upcoming").length} upcoming PS Plus game(s) found`
    );
    return games;
  } catch (err) {
    console.error("PS Plus fetch failed:");
    console.error(err);
    console.error(err.stack);
    return [];
  }
}
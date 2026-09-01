/**
 * fetchers/psplus.js
 */

import fetch from "node-fetch";
import { stripHtml, normalizeTitle, extractTag, splitItems, decodeHtmlEntities } from "../utils/html.js";

const PS_BLOG_RSS = "https://blog.playstation.com/category/ps-plus/feed/";
const PS_BLOG_HOMEPAGE = "https://blog.playstation.com/";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Referer": "https://blog.playstation.com/",
};

// ─── PS Plus rollover time ──────────────────────────────────────────────
// PS Plus's monthly lineup rotates on the first Tuesday of each month,
// around midday Eastern Time — adjust these two constants if you find
// the real rollover is closer to 1:00 PM ET than noon.
const ROLLOVER_HOUR_ET = 12; // 12 = noon ET
const ROLLOVER_MINUTE_ET = 0;
const ROLLOVER_TIMEZONE = "America/New_York";

// UTC offset (in minutes) of `timeZone` at the instant `date` represents.
// Negative for zones behind UTC (-300 for EST, -240 for EDT). Derived from
// Intl's own tz database, so DST is handled automatically.
function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

// Converts a wall-clock date/time in `timeZone` into the equivalent UTC
// instant. Two passes so a naive guess landing on the "wrong side" of a
// DST transition still resolves correctly.
function zonedTimeToUtc(year, monthIndex, day, hour, minute, timeZone) {
  let utcMs = Date.UTC(year, monthIndex, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, monthIndex, day, hour, minute) - offsetMinutes * 60000;
  }
  return new Date(utcMs);
}

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

function firstTuesdayOfMonth(year, monthIndex) {
  // Find the calendar day in UTC first (day-of-week math doesn't care
  // about timezone as long as it's consistent).
  const d = new Date(Date.UTC(year, monthIndex, 1));
  while (d.getUTCDay() !== 2) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Then anchor that calendar day to noon ET, converted to the correct
  // UTC instant.
  return zonedTimeToUtc(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    ROLLOVER_HOUR_ET,
    ROLLOVER_MINUTE_ET,
    ROLLOVER_TIMEZONE
  );
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

function findTitleBlocks(postHtml, blockRe) {
  const entries = [];
  let m;
  while ((m = blockRe.exec(postHtml)) !== null) {
    const rawInner = m[m.length - 1]; // last capture group holds the inner text
    const plainText = rawInner
      .replace(/<[^>]+>/g, "")
      .replace(/\*+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (plainText.length > 150) continue;

    if (!plainText.includes("|")) continue; // not a "Title | Platforms" block

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
  return entries;
}

function isLikelyGameCoverImage(url) {
  if (!/^https:\/\/blog\.playstation\.com\/tachyon\//i.test(url)) return false;
  if (/pslogo|sonylogo/i.test(url)) return false;
  if (/[?&]fit=(?:40|180|200|270|280|281|300|400|401|512|640)(?:[,%]|$)/i.test(url)) return false;
  return true;
}

function isScaledImage(url) {
  return /-scaled\.(?:jpg|jpeg|png|webp)(?:[?&]|$)/i.test(url);
}

function parseGamesFromPost(postTitle, postHtml) {

  let entries = findTitleBlocks(postHtml, /<h[23][^>]*>([\s\S]{1,300}?)<\/h[23]>/gi);

  if (entries.length === 0) {
    entries = findTitleBlocks(postHtml, /<(?:strong|b)[^>]*>([\s\S]{1,300}?)<\/(?:strong|b)>/gi);
  }

  const games = [];
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (seen.has(entry.title.toLowerCase())) continue;
    seen.add(entry.title.toLowerCase());

    // The section before this entry starts after the previous entry's end
    const sectionStart = i > 0 ? entries[i - 1].headingEnd : 0;
    const section = postHtml.slice(sectionStart, entry.headingIndex);

    let coverImage = "";

    const images = [
      ...section.matchAll(
        /<img[^>]+src="([^"]+)"/gi
      )
    ];

    // Prefer scaled (full-resolution) images if present
    for (const img of images) {
      const url = img[1];
      if (!isLikelyGameCoverImage(url)) continue;
      if (isScaledImage(url)) {
        coverImage = url;
        break;
      }
    }

    // Fallback to first real (non-furniture) image in the section
    if (!coverImage) {
      for (const img of images) {
        const url = img[1];
        if (!isLikelyGameCoverImage(url)) continue;
        coverImage = url;
        break;
      }
    }

    // Fallback image lookup if none found before entry
    if (!coverImage) {
      const afterEntry = postHtml.slice(
        entry.headingEnd,
        entry.headingEnd + 4000
      );

      const fallbackImgMatch = afterEntry.match(
        /<img[^>]+src="(https:\/\/blog\.playstation\.com\/tachyon\/[^"]+)"/i
      );

      if (fallbackImgMatch && isLikelyGameCoverImage(fallbackImgMatch[1])) {
        coverImage = fallbackImgMatch[1];
      }
    }

    const nextEntryStart =
      i + 1 < entries.length
        ? entries[i + 1].headingIndex
        : postHtml.length;


    const descSection = postHtml.slice(entry.headingEnd, nextEntryStart);
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

    // Fallback image lookup if none found before entry
    if (!coverImage) {
      const afterEntry = postHtml.slice(
        entry.headingEnd,
        entry.headingEnd + 4000
      );

      const fallbackImgMatch = afterEntry.match(
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

  // ── Fallback: titles from the post title string, in case the scan missed any ──
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
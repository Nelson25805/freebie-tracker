/**
 * sw.js
 *
 * Service worker for Free Game Tracker. Two jobs:
 *  1. Precache the "app shell" (HTML/CSS/JS/icons) so the site loads and is
 *     installable even with no connection.
 *  2. Cache data/games.json and data/history/*.json separately, network-first,
 *     so the tracker shows the last data it saw when offline instead of a
 *     blank/error state — while still preferring fresh data whenever possible.
 *
 * BUMP THIS on any deploy that changes a precached file's contents. It forces
 * old caches to be dropped instead of served forever. You don't need to bump
 * it for data/games.json changes — that's handled by the network-first
 * strategy below regardless of version.
 */
const VERSION = "v1.2";
const STATIC_CACHE = `fgt-static-${VERSION}`;
const DATA_CACHE = `fgt-data-${VERSION}`;

// Everything needed to render each page and have it work offline. Add new
// pages/scripts/assets here whenever you add them to the site, or they
// won't be available offline until the visitor happens to open them once
// while online (stale-while-revalidate still caches them opportunistically,
// but they won't be there on a first-ever offline visit).
const APP_SHELL = [
  "./",
  "./index.html",
  "./backup.html",
  "./history.html",
  "./newsletter.html",
  "./offline.html",
  "./styles.css",
  "./manifest.json",

  "./js/main.js",
  "./js/dom.js",
  "./js/state.js",
  "./js/filters.js",
  "./js/actions.js",
  "./js/render.js",
  "./js/data.js",
  "./js/format.js",
  "./js/collected-store.js",
  "./js/backup-main.js",
  "./js/backup-dom.js",
  "./js/history-main.js",
  "./js/history-dom.js",
  "./js/history-state.js",
  "./js/history-data.js",
  "./js/history-render.js",
  "./js/register-sw.js",
  "./js/theme-init.js",
  "./js/theme.js",
  "./newsletter.js",

  "./assets/epicGamesLogo.svg",
  "./assets/gogLogo.svg",
  "./assets/playstationPlusLogo.svg",
  "./assets/amazonPrimeLogo.svg",
  "./assets/steamLogo.svg",

  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

// Matches ./data/games.json and ./data/history/<anything>.json, with or
// without a cache-busting "?t=..." query string.
const DATA_URL_PATTERN = /\/data\/(games\.json|history\/[^/]+\.json)(\?|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // Don't let one missing/renamed file fail the whole precache — add
      // what we can and log the rest, instead of the install silently
      // never completing.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url))).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.warn("SW install: couldn't precache", APP_SHELL[i], r.reason);
          }
        });
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch strategies ───────────────────────────────────────────────────────

// Data files (games.json, history/*.json): always try the network first so
// visitors see current data whenever they have a connection. Falls back to
// whatever was last cached when the network fails. Cached under the URL
// *without* its cache-busting query string, so every "?t=..." variant reads
// and writes the same entry instead of piling up a new cache row each time.
async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);
  const cacheKey = new Request(request.url.split("?")[0]);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

// Page navigations: try the network so visitors get the latest HTML, fall
// back to a cached copy of that exact page, then to the generic offline
// page if it's never been cached at all.
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match("./offline.html");
    if (offline) return offline;
    throw err;
  }
}

// Everything else (CSS/JS/SVGs/icons): serve the cached copy instantly if
// there is one, and refresh the cache in the background for next time. On
// first-ever install these are already precached, so this mostly matters
// for anything added to the shell later that a visitor already had a
// service worker running before the shell list caught up.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept POSTs (newsletter signup, etc.)

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin (Apps Script) requests alone

  if (DATA_URL_PATTERN.test(url.pathname)) {
    event.respondWith(networkFirstData(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

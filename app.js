const EPIC_API_URL =
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";
const EPIC_API_PROXY = `https://api.allorigins.win/raw?url=${encodeURIComponent(EPIC_API_URL)}`;

const PRIME_PAGE_URL =
    "https://clouddosage.com/gamelists/free-games-on-amazon-luna-with-amazon-prime/";
const PRIME_PAGE_PROXY = `https://api.allorigins.win/raw?url=${encodeURIComponent(PRIME_PAGE_URL)}`;

const STORAGE_KEY = "epic_free_games_collected_v1";
const CACHE_KEY = "free_games_multi_service_cache_v1";

const els = {
    grid: document.getElementById("gamesGrid"),
    emptyState: document.getElementById("emptyState"),
    searchInput: document.getElementById("searchInput"),
    serviceFilter: document.getElementById("serviceFilter"),
    statusFilter: document.getElementById("statusFilter"),
    sortFilter: document.getElementById("sortFilter"),
    hideClaimed: document.getElementById("hideClaimed"),
    refreshBtn: document.getElementById("refreshBtn"),
    resetBtn: document.getElementById("resetBtn"),
    markAllBtn: document.getElementById("markAllBtn"),
    currentCount: document.getElementById("currentCount"),
    upcomingCount: document.getElementById("upcomingCount"),
    primeCount: document.getElementById("primeCount"),
    claimedCount: document.getElementById("claimedCount"),
    lastUpdated: document.getElementById("lastUpdated"),
    statusText: document.getElementById("statusText"),
    statusDot: document.getElementById("statusDot"),
};

let allGames = [];
let collected = loadCollected();
let cachedGames = loadCachedGames();

function setStatus(text, mode = "idle") {
    els.statusText.textContent = text;
    els.statusDot.className =
        "dot" +
        (mode === "ok" ? " ok" : mode === "busy" ? " busy" : mode === "err" ? " err" : "");
}

function loadCollected() {
    try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
        return new Set();
    }
}

function saveCollected() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]));
    els.claimedCount.textContent = String(collected.size);
}

function loadCachedGames() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveCachedGames(games) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(games));
    } catch {
        // Ignore storage failures.
    }
}

function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function gameKey(game) {
    return `${game.source}:${game.id || game.slug || game.title}`;
}

function fmtDate(value) {
    if (!value) return "Unknown date";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(d);
}

function hoursLeft(value) {
    if (!value) return null;
    const end = new Date(value).getTime();
    if (Number.isNaN(end)) return null;
    return Math.max(0, Math.round((end - Date.now()) / 36e5));
}

function pickImage(game) {
    const images = game.keyImages || [];
    const preferred =
        images.find((img) => /offerimagewide|featuredmedia|thumbnail/i.test(img.type)) ||
        images[0];
    return preferred?.url || "";
}

function hasCurrentPromotion(game) {
    const promos = game.promotions?.promotionalOffers || [];
    return Array.isArray(promos) && promos.some((block) => Array.isArray(block.promotionalOffers) && block.promotionalOffers.length > 0);
}

function getCurrentOffer(game) {
    const promos = game.promotions?.promotionalOffers || [];
    for (const block of promos) {
        for (const offer of block.promotionalOffers || []) {
            if (offer.startDate && offer.endDate) return offer;
        }
    }
    return null;
}

function getUpcomingOffer(game) {
    const promos = game.promotions?.upcomingPromotionalOffers || [];
    for (const block of promos) {
        for (const offer of block.promotionalOffers || []) {
            if (offer.startDate && offer.endDate) return offer;
        }
    }
    return null;
}

function normalizeEpicGames(data) {
    const elements = data?.data?.Catalog?.searchStore?.elements || [];

    return elements
        .map((item) => {
            const currentOffer = getCurrentOffer(item);
            const upcomingOffer = getUpcomingOffer(item);
            const discountPrice = item.price?.totalPrice?.discountPrice;
            const originalPrice = item.price?.totalPrice?.originalPrice;
            const nowFree = typeof discountPrice === "number" && discountPrice === 0 && hasCurrentPromotion(item);
            const upcomingFree = !nowFree && !!upcomingOffer;
            const status = nowFree ? "free" : upcomingFree ? "upcoming" : "other";

            return {
                source: "epic",
                id: item.id,
                title: item.title || "Untitled",
                slug:
                    item.productSlug ||
                    item.urlSlug ||
                    item.catalogNs?.mappings?.[0]?.pageSlug ||
                    "",
                seller: item.seller?.name || "Epic Games Store",
                description: item.description || "",
                image: pickImage(item),
                currentOffer,
                upcomingOffer,
                originalPrice,
                discountPrice,
                status,
                openUrl: item.productSlug
                    ? `https://store.epicgames.com/p/${encodeURIComponent(item.productSlug)}`
                    : "https://store.epicgames.com/free-games",
                raw: item,
            };
        })
        .filter((game) => game.status !== "other");
}

function parsePrimeGamesFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const headings = [...doc.querySelectorAll("h3")];
    const games = [];

    for (const heading of headings) {
        const title = heading.textContent.trim();
        if (!title) continue;
        if (/showing\s+\d+/i.test(title)) continue;
        if (/our favorite gaming deals/i.test(title)) continue;
        if (/list of free games/i.test(title)) continue;

        const container = heading.closest("article, section, div") || heading.parentElement;
        const text = container?.innerText || heading.parentElement?.innerText || "";
        if (!/Release Date:/i.test(text) && !/Developer:/i.test(text)) continue;

        const getField = (label) => {
            const re = new RegExp(`${label}:\\s*([^\\n\\r]+)`, "i");
            const match = text.match(re);
            return match ? match[1].trim() : "";
        };

        const releaseDate = getField("Release Date");
        const developer = getField("Developer");
        const publisher = getField("Publisher");
        const genre = getField("Genre");
        const metascore = getField("Metascore");

        const image = container?.querySelector("img")?.src || "";

        games.push({
            source: "prime",
            id: `prime-${slugify(title)}`,
            title,
            seller: "Amazon Prime / Luna",
            description: [genre, developer ? `Developer: ${developer}` : "", publisher ? `Publisher: ${publisher}` : ""]
                .filter(Boolean)
                .join(" • "),
            image,
            currentOffer: null,
            upcomingOffer: null,
            originalPrice: null,
            discountPrice: 0,
            status: "prime",
            openUrl: PRIME_PAGE_URL,
            releaseDate,
            metascore,
            raw: { releaseDate, developer, publisher, genre, metascore },
        });
    }

    return games;
}

function formatMoney(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return "Unknown price";
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
    }).format(n / 100);
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function cardStatusText(game) {
    const key = gameKey(game);

    if (collected.has(key)) return { label: "Already collected", cls: "claimed" };
    if (game.source === "prime") return { label: "Included with Prime", cls: "prime" };
    if (game.status === "free") return { label: "Free now", cls: "free" };
    return { label: "Upcoming", cls: "upcoming" };
}

function getVisibleGames() {
    const q = els.searchInput.value.trim().toLowerCase();
    const service = els.serviceFilter.value;
    const status = els.statusFilter.value;
    const hideClaimed = els.hideClaimed.checked;
    const sort = els.sortFilter.value;

    let items = [...allGames];

    if (service !== "all") {
        items = items.filter((g) => g.source === service);
    }

    if (q) {
        items = items.filter((g) =>
            [g.title, g.seller, g.slug, g.description].join(" ").toLowerCase().includes(q)
        );
    }

    if (status !== "all") {
        if (status === "claimed") {
            items = items.filter((g) => collected.has(gameKey(g)));
        } else {
            items = items.filter((g) => g.status === status);
        }
    }

    if (hideClaimed) {
        items = items.filter((g) => !collected.has(gameKey(g)));
    }

    items.sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);

        if (sort === "newest") {
            const ad = new Date(a.raw.effectiveDate || a.releaseDate || 0).getTime();
            const bd = new Date(b.raw.effectiveDate || b.releaseDate || 0).getTime();
            return bd - ad;
        }

        const ae = new Date(a.currentOffer?.endDate || a.upcomingOffer?.startDate || 0).getTime();
        const be = new Date(b.currentOffer?.endDate || b.upcomingOffer?.startDate || 0).getTime();
        return ae - be;
    });

    return items;
}

function render() {
    const visible = getVisibleGames();
    els.grid.innerHTML = "";
    els.emptyState.hidden = visible.length !== 0;

    for (const game of visible) {
        const key = gameKey(game);
        const status = cardStatusText(game);
        const endDate = game.currentOffer?.endDate;
        const startDate = game.upcomingOffer?.startDate;
        const hours = game.status === "free" ? hoursLeft(endDate) : null;

        const card = document.createElement("article");
        card.className = "card game";

        const mainPill =
            game.source === "prime"
                ? `<span class="pill zero"><strong>Prime</strong> included</span>`
                : game.status === "free"
                    ? `<span class="pill zero"><strong>$0.00</strong> to claim</span>`
                    : "";

        const extraPills =
            game.source === "prime"
                ? `
          ${game.releaseDate ? `<span class="pill">Release ${fmtDate(game.releaseDate)}</span>` : ""}
          ${game.metascore ? `<span class="pill">Metascore <strong>${escapeHtml(game.metascore)}</strong></span>` : ""}
        `
                : `
          ${Number(game.originalPrice) > 0 ? `<span class="pill strike">Regular ${formatMoney(game.originalPrice)}</span>` : ""}
          ${hours !== null ? `<span class="pill">Ends in about <strong>${hours}h</strong></span>` : ""}
          ${game.status === "upcoming" ? `<span class="pill">Starts ${fmtDate(startDate)}</span>` : ""}
        `;

        card.innerHTML = `
      <div class="cover">
        ${game.image ? `<img src="${game.image}" alt="${escapeHtml(game.title)} cover" loading="lazy">` : ""}
        <div class="badge ${status.cls}">${status.label}</div>
      </div>
      <div class="content">
        <div class="title-row">
          <h3 class="title">${escapeHtml(game.title)}</h3>
        </div>
        <div class="meta">${escapeHtml(game.seller)}</div>
        <div class="prices">
          ${mainPill}
          ${extraPills}
        </div>
        <div class="meta">${game.description
                ? escapeHtml(game.description).slice(0, 160) + (game.description.length > 160 ? "…" : "")
                : game.source === "prime"
                    ? "Included with Prime."
                    : "No description available."
            }</div>
        <div class="actions">
          <button class="btn ${collected.has(key) ? "btn-danger" : "btn-ok"}" data-action="toggle-claimed" data-key="${key}">
            ${collected.has(key) ? "Unmark collected" : "Mark collected"}
          </button>
          <a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${game.openUrl}">
            Open source
          </a>
        </div>
      </div>
    `;

        els.grid.appendChild(card);
    }
}

async function fetchJsonThroughProxy(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function fetchTextThroughProxy(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

async function loadEpicGames() {
    const data = await fetchJsonThroughProxy(EPIC_API_PROXY);
    return normalizeEpicGames(data);
}

async function loadPrimeGames() {
    const html = await fetchTextThroughProxy(PRIME_PAGE_PROXY);
    return parsePrimeGamesFromHtml(html);
}

async function loadAllGames() {
    setStatus("Loading game offers…", "busy");
    els.refreshBtn.disabled = true;

    try {
        const res = await fetch("./data/offers.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        allGames = Array.isArray(data.games) ? data.games : [];
        cachedGames = allGames;
        saveCachedGames(allGames);

        els.currentCount.textContent = String(allGames.filter((g) => g.source === "epic" && g.status === "free").length);
        els.upcomingCount.textContent = String(allGames.filter((g) => g.source === "epic" && g.status === "upcoming").length);
        els.primeCount.textContent = String(allGames.filter((g) => g.source === "prime").length);
        els.claimedCount.textContent = String(collected.size);

        els.lastUpdated.textContent = `Last updated: ${new Intl.DateTimeFormat(undefined, {
            dateStyle: "full",
            timeStyle: "short",
        }).format(new Date())}`;

        setStatus(`Loaded ${allGames.length} offers.`, "ok");
        render();
    } catch (err) {
        console.error(err);

        if (cachedGames.length) {
            allGames = cachedGames;
            setStatus("Live data failed, showing cached results.", "err");
            render();
        } else {
            setStatus("No local offers file found yet.", "err");
            els.grid.innerHTML = `<div class="empty">No offers could be loaded yet.</div>`;
        }
    } finally {
        els.refreshBtn.disabled = false;
    }
}

saveCollected();
loadAllGames();

function toggleCollected(key) {
    if (collected.has(key)) collected.delete(key);
    else collected.add(key);

    saveCollected();
    render();
}

function markVisibleAsCollected() {
    for (const game of getVisibleGames()) {
        collected.add(gameKey(game));
    }

    saveCollected();
    render();
}

function clearCollected() {
    if (!confirm("Clear all collected marks from this browser?")) return;
    collected.clear();
    saveCollected();
    render();
}

document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="toggle-claimed"]');
    if (!btn) return;
    toggleCollected(btn.dataset.key);
});

[els.searchInput, els.serviceFilter, els.statusFilter, els.sortFilter, els.hideClaimed].forEach((el) => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
});

els.refreshBtn.addEventListener("click", loadAllGames);
els.resetBtn.addEventListener("click", clearCollected);
els.markAllBtn.addEventListener("click", markVisibleAsCollected);

saveCollected();
loadAllGames();
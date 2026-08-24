// format.js
// Pure formatting/label helpers — no app state, no side effects beyond a
// throwaway <textarea> for entity decoding. Safe to import from anywhere,
// including future unit tests.

export function fmtDate(value) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function fmtEndDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n / 100);
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function decodeHtmlEntities(text) {
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

// ─── Store labels & icons ───────────────────────────────────────────────────

// Store badge on the cover image uses the real brand SVGs from ./assets
// instead of hand-drawn placeholders. Paths are relative to index.html.
const STORE_ICON_SRC = {
  epic: "./assets/epicGamesLogo.svg",
  gog: "./assets/gogLogo.svg",
  psplus: "./assets/playstationPlusLogo.svg",
  prime: "./assets/amazonPrimeLogo.svg",
  steam: "./assets/steamLogo.svg",
};

function storeIconMarkup(store, storeName) {
  const src = STORE_ICON_SRC[store];
  if (!src) return "";
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(storeName)} logo" loading="lazy">`;
}

// Single source of truth for a store's display label, badge class, and
// icon. Add a new store here (and to STORE_ICON_SRC above) and every chip,
// card, and count label picks it up automatically.
const STORE_META = {
  epic: { label: "Epic", cls: "store-epic", storeName: "Epic Games Store" },
  gog: { label: "GOG", cls: "store-gog", storeName: "GOG" },
  psplus: { label: "PS Plus", cls: "store-psplus", storeName: "PlayStation Plus" },
  prime: { label: "Prime", cls: "store-prime", storeName: "Prime Gaming" },
  steam: { label: "Steam", cls: "store-steam", storeName: "Steam" },
};

export function storeLabel(store) {
  const meta = STORE_META[store];
  if (!meta) return { label: store, cls: "", icon: "" };
  return { label: meta.label, cls: meta.cls, icon: storeIconMarkup(store, meta.storeName) };
}

// Base (count-free) label for each store filter chip, keyed by chip's
// data-store value.
export function storeChipBaseLabel(store) {
  return storeLabel(store).label;
}

// ─── Offer progress (time-limited claim windows) ───────────────────────────

export function offerProgressPercent(game) {
  if (!game.offerStart || !game.offerEnd) return null;
  const start = new Date(game.offerStart).getTime();
  const end = new Date(game.offerEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const pct = ((Date.now() - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function offerProgressMarkup(game) {
  const pct = offerProgressPercent(game);
  if (pct === null) return "";
  const urgent = pct >= 85;
  return `
    <div class="offer-progress ${urgent ? "urgent" : ""}"
         data-start="${escapeHtml(game.offerStart)}"
         data-end="${escapeHtml(game.offerEnd)}"
         title="${Math.round(pct)}% of claim window elapsed">
      <div class="offer-progress-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>`;
}

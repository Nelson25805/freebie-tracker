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

export function formatTimeLeft(endValue) {
  if (!endValue) return null;
  const end = new Date(endValue).getTime();
  if (Number.isNaN(end)) return null;

  const diff = end - Date.now();
  if (diff <= 0) return "Offer ended";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return "Ending soon";
}

export function offerProgressMarkup(game) {
  const pct = offerProgressPercent(game);
  if (pct === null) return "";
  const urgent = pct >= 85;
  const timeLeft = formatTimeLeft(game.offerEnd);
  return `
    <div class="offer-progress-wrap">
      <div class="offer-progress ${urgent ? "urgent" : ""}"
           data-start="${escapeHtml(game.offerStart)}"
           data-end="${escapeHtml(game.offerEnd)}"
           title="${Math.round(pct)}% of claim window elapsed">
        <div class="offer-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      ${timeLeft ? `<span class="offer-countdown ${urgent ? "urgent" : ""}" data-end="${escapeHtml(game.offerEnd)}">${escapeHtml(timeLeft)}</span>` : ""}
    </div>`;
}

// ─── Backup status ──────────────────────────────────────────────────────────

export function fmtRelativeBackup(iso) {
  if (!iso) return "Never backed up";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never backed up";

  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);

  if (diffDays <= 0) return "Backed up today";
  if (diffDays === 1) return "Backed up 1 day ago";
  if (diffDays < 14) return `Backed up ${diffDays} days ago`;
  if (diffDays < 60) {
    const weeks = Math.floor(diffDays / 7);
    return `Backed up ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `Backed up ${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `Backed up ${years} year${years === 1 ? "" : "s"} ago`;
}

// A backup older than this (or missing) gets flagged in the UI.
export const BACKUP_STALE_DAYS = 30;

export function isBackupStale(iso) {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) / 86400000 > BACKUP_STALE_DAYS;
}
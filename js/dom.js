// dom.js
// Central place for every DOM reference the app needs. Import `els`
// wherever you'd otherwise call document.getElementById/querySelector, so
// there's exactly one place to update if an id/class in index.html changes.

export const els = {
  freeTab: document.getElementById("freeTab"),
  upcomingTab: document.getElementById("upcomingTab"),
  freePanel: document.getElementById("freePanel"),
  upcomingPanel: document.getElementById("upcomingPanel"),
  freeGrid: document.getElementById("freeGrid"),
  freeEmptyState: document.getElementById("freeEmptyState"),
  freeSectionCount: document.getElementById("freeSectionCount"),
  upcomingGrid: document.getElementById("upcomingGrid"),
  upcomingEmptyState: document.getElementById("upcomingEmptyState"),
  upcomingSectionCount: document.getElementById("upcomingSectionCount"),
  searchInput: document.getElementById("searchInput"),
  storeFilter: document.getElementById("storeFilter"),
  storeChips: Array.from(document.getElementById("storeFilter").querySelectorAll(".chip")),
  redeemChipRow: document.getElementById("redeemChipRow"),
  redeemFilter: document.getElementById("redeemFilter"),
  statusFilter: document.getElementById("statusFilter"),
  sortFilter: document.getElementById("sortFilter"),
  hideClaimed: document.getElementById("hideClaimed"),
  refreshBtn: document.getElementById("refreshBtn"),
  resetBtn: document.getElementById("resetBtn"),
  markAllBtn: document.getElementById("markAllBtn"),
  currentCount: document.getElementById("currentCount"),
  endingSoonCount: document.getElementById("endingSoonCount"),
  upcomingCount: document.getElementById("upcomingCount"),
  claimedCount: document.getElementById("claimedCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  statusText: document.getElementById("statusText"),
  statusDot: document.getElementById("statusDot"),
};

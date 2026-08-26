import { els } from "./history-dom.js";

export let currentMonth = null;
export function setCurrentMonth(m) { currentMonth = m; }

export let monthGames = [];
export function setMonthGames(games) { monthGames = games; }

export const storeAllChip = els.storeChips.find((c) => c.dataset.store === "all");
export const storeSpecificChips = els.storeChips.filter((c) => c.dataset.store !== "all");

export let selectedStores = new Set(storeSpecificChips.map((c) => c.dataset.store));
export function setSelectedStores(s) { selectedStores = s; }
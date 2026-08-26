import { els } from "./history-dom.js";
import { selectedStores, setSelectedStores, storeAllChip, storeSpecificChips } from "./history-state.js";
import { render } from "./history-render.js";
import { loadMonthIndex, loadMonth } from "./history-data.js";

function syncStoreChips() {
    const allSelected = selectedStores.size === storeSpecificChips.length;
    if (storeAllChip) storeAllChip.classList.toggle("active", allSelected);
    for (const chip of storeSpecificChips) {
        chip.classList.toggle("active", selectedStores.has(chip.dataset.store));
    }
}

els.storeChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        const store = chip.dataset.store;
        if (store === "all") {
            setSelectedStores(new Set(storeSpecificChips.map((c) => c.dataset.store)));
        } else if (selectedStores.size === storeSpecificChips.length) {
            setSelectedStores(new Set([store]));
        } else if (selectedStores.has(store)) {
            if (selectedStores.size > 1) selectedStores.delete(store);
        } else {
            selectedStores.add(store);
        }
        syncStoreChips();
        render();
    });
});

els.monthSelect.addEventListener("change", () => loadMonth(els.monthSelect.value));
els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);

syncStoreChips();
loadMonthIndex();
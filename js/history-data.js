import { els } from "./history-dom.js";
import { setCurrentMonth, setMonthGames } from "./history-state.js";
import { render } from "./history-render.js";

const HISTORY_DIR = "./data/history";

function setStatus(text, mode = "idle") {
    els.statusText.textContent = text;
    els.statusDot.className =
        "dot" + (mode === "ok" ? " ok" : mode === "busy" ? " busy" : mode === "err" ? " err" : "");
}

function monthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export async function loadMonthIndex() {
    setStatus("Loading available months…", "busy");
    try {
        const res = await fetch(`${HISTORY_DIR}/index.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const months = (payload.months || []).slice().sort().reverse(); // newest first

        if (!months.length) {
            setStatus("No archived months yet — check back after the next scheduled fetch.", "err");
            els.monthTitle.textContent = "No archive yet";
            return;
        }

        els.monthSelect.innerHTML = months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
        els.monthSelect.value = months[0];
        await loadMonth(months[0]);
    } catch (err) {
        console.error(err);
        setStatus("Could not load the archive index.", "err");
    }
}

export async function loadMonth(monthKey) {
    setStatus(`Loading ${monthLabel(monthKey)}…`, "busy");
    setCurrentMonth(monthKey);

    try {
        const res = await fetch(`${HISTORY_DIR}/${monthKey}.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const games = Object.values(payload.games || {});
        setMonthGames(games);

        els.monthTitle.textContent = monthLabel(monthKey);
        els.monthNote.textContent = payload.updatedAt
            ? `Archive last updated ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.updatedAt))}.`
            : "";

        setStatus(`${games.length} free game${games.length === 1 ? "" : "s"} archived for ${monthLabel(monthKey)}.`, "ok");
        render();
    } catch (err) {
        console.error(err);
        setStatus(`Could not load the archive for ${monthLabel(monthKey)}.`, "err");
        setMonthGames([]);
        render();
    }
}
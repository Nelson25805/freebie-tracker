const state = {
    offers: [],
    query: "",
    source: "all",
    type: "all",
};

const els = {
    offers: document.getElementById("offers"),
    template: document.getElementById("offer-template"),
    search: document.getElementById("search"),
    sourceFilter: document.getElementById("sourceFilter"),
    typeFilter: document.getElementById("typeFilter"),
    updatedAt: document.getElementById("updatedAt"),
    statTotal: document.getElementById("stat-total"),
    statLimited: document.getElementById("stat-limited"),
    statPermanent: document.getElementById("stat-permanent"),
};

const sourceNames = {
    gog: "GOG",
    epic: "Epic",
    steam: "Steam",
};

const fmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function normalize(text = "") {
    return text.replace(/\s+/g, " ").trim();
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function daysLeft(date) {
    if (!date) return null;
    const diff = date.getTime() - Date.now();
    return Math.ceil(diff / 86400000);
}

function formatWindow(offer) {
    if (offer.endsAt) {
        const d = parseDate(offer.endsAt);
        if (d) {
            const left = daysLeft(d);
            return `${fmt.format(d)}${left === 0 ? " (today)" : left === 1 ? " (1 day left)" : left > 1 ? ` (${left} days left)` : " (ended)"}`;
        }
        return offer.endsAtLabel || offer.endsAt;
    }
    return offer.startsAt ? `Starts ${offer.startsAt}` : "No expiry listed";
};
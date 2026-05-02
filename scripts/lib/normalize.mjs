export function makeOffer(input) {
    return {
        source: input.source,
        sourceLabel: input.sourceLabel,
        type: input.type,
        title: input.title,
        description: input.description || "",
        notes: input.notes || "",
        url: input.url,
        price: input.price || "Free",
        startsAt: input.startsAt || null,
        endsAt: input.endsAt || null,
        endsAtLabel: input.endsAtLabel || null,
        actionLabel: input.actionLabel || "Open store page",
        platform: input.platform || [],
        lastCheckedAt: input.lastCheckedAt || new Date().toISOString(),
    };
}

export function canonicalKey(offer) {
    return [offer.source, offer.type, offer.title.toLowerCase(), offer.url].join("|");
}
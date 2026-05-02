export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url, { retries = 2, timeoutMs = 20000, headers = {} } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "user-agent": "Mozilla/5.0 (compatible; FreeGameTracker/1.0; +https://github.com/)",
                    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    ...headers,
                },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            return await response.text();
        } catch (err) {
            lastError = err;
            if (attempt < retries) await sleep(750 * (attempt + 1));
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError;
}

export function absoluteUrl(base, href) {
    if (!href) return base;
    try {
        return new URL(href, base).href;
    } catch {
        return base;
    }
}

export function cleanText(text = "") {
    return text.replace(/\s+/g, " ").trim();
}

export function uniqBy(list, keyFn) {
    const seen = new Set();
    return list.filter((item) => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
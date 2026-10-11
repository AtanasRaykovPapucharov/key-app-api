const { getMarketChart } = require("./coingecko.js");
const { getHistoricalQuotes } = require("./coinmarketcap.js");

const PROVIDERS = {
    coingecko: getMarketChart,
    coinmarketcap: getHistoricalQuotes,
};

const AUTO_ORDER = ["coingecko", "coinmarketcap"];

/**
 * Price history from the first provider that answers.
 * `source` may be a provider name or "auto".
 */
async function getPriceHistory(
    coinId,
    { days = "max", vsCurrency = "usd", source = "auto" } = {},
) {
    const requested = String(source || "auto").toLowerCase();
    if (requested !== "auto" && !PROVIDERS[requested]) {
        const err = new Error(`Unknown source "${requested}"`);
        err.status = 400;
        throw err;
    }

    const order =
        requested === "auto"
            ? AUTO_ORDER
            : [requested, ...AUTO_ORDER.filter((p) => p !== requested)];

    const failures = [];
    for (const name of order) {
        try {
            const data = await PROVIDERS[name](coinId, { days, vsCurrency });
            if (data?.prices?.length)
                return { ...data, requestedSource: requested, failures };
            failures.push({ source: name, error: "empty response" });
        } catch (err) {
            failures.push({ source: name, error: err.message });
            if (err.status === 400) throw err;
        }
    }

    const err = new Error(
        `No provider returned data: ${failures
            .map((f) => `${f.source}: ${f.error}`)
            .join(" | ")}`,
    );
    err.status = 502;
    throw err;
}

module.exports = { getPriceHistory, SOURCES: Object.keys(PROVIDERS) };

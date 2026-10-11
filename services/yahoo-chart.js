/**
 * Price history straight from Yahoo's public chart endpoint.
 *
 * Unlike the yahoo-finance2 package, this endpoint does NOT need a
 * "crumb" (the step that was failing with 429 on Render), so it is
 * much less likely to be blocked. Results are cached for a long time.
 */
const axios = require("axios");
const { cached } = require("./cache");

const MINUTE = 60 * 1000;
const VALID_RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"];
const VALID_INTERVALS = ["1m", "5m", "15m", "30m", "60m", "1h", "1d", "1wk", "1mo"];

async function fetchChart(symbol, range, interval) {
    const res = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
        {
            params: { range, interval, includePrePost: false },
            headers: {
                // Yahoo rejects requests without a browser-like User-Agent
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                Accept: "application/json",
            },
            timeout: 15000,
        },
    );

    const result = res.data?.chart?.result?.[0];
    if (!result) {
        const message = res.data?.chart?.error?.description || "No chart data";
        throw new Error(message);
    }

    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};

    return timestamps
        .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString(),
            open: q.open?.[i] ?? null,
            high: q.high?.[i] ?? null,
            low: q.low?.[i] ?? null,
            close: q.close?.[i] ?? null,
            volume: q.volume?.[i] ?? null,
        }))
        .filter((point) => point.close !== null);
}

function getHistory(symbol, range = "1mo", interval = "1d") {
    const s = symbol.toUpperCase();
    const r = VALID_RANGES.includes(range) ? range : "1mo";
    const i = VALID_INTERVALS.includes(interval) ? interval : "1d";
    const ttl = ["1m", "5m", "15m", "30m"].includes(i) ? 5 * MINUTE : 60 * MINUTE;

    return cached(`yh:chart:${s}:${r}:${i}`, ttl, () => fetchChart(s, r, i));
}

module.exports = { getHistory };

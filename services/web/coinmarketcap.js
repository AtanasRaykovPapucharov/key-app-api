const axios = require("axios");

const BASE_URL = process.env.CMC_API_URL || "https://pro-api.coinmarketcap.com";
const API_KEY = process.env.CMC_API_KEY || null;

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

// CoinMarketCap addresses assets by ticker, CoinGecko by slug id.
const COIN_SYMBOLS = {
    bitcoin: "BTC",
    ethereum: "ETH",
    solana: "SOL",
    binancecoin: "BNB",
    ripple: "XRP",
    cardano: "ADA",
    stellar: "XLM",
    litecoin: "LTC",
    chainlink: "LINK",
    polkadot: "DOT",
    dogecoin: "DOGE",
    tron: "TRX",
    "avalanche-2": "AVAX",
};

const DAY_SECONDS = 24 * 3600;

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function request(path, params) {
    if (!API_KEY) throw fail("CoinMarketCap API key is not configured", 503);

    const cacheKey = `${path}?${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    try {
        const { data } = await axios.get(`${BASE_URL}${path}`, {
            params,
            headers: {
                "X-CMC_PRO_API_KEY": API_KEY,
                Accept: "application/json",
            },
            timeout: 15000,
        });
        cache.set(cacheKey, { at: Date.now(), data });
        return data;
    } catch (err) {
        if (cached) return cached.data;
        const status = err.response?.status;
        const message =
            err.response?.data?.status?.error_message ||
            err.message ||
            "CoinMarketCap request failed";
        // 402 means the historical endpoint is not included in the current plan.
        throw fail(message, status === 429 ? 429 : status === 402 ? 402 : 502);
    }
}

/**
 * Historical quotes shaped like the CoinGecko market chart response.
 * Requires a CoinMarketCap plan that includes historical data (Hobbyist or above).
 */
async function getHistoricalQuotes(
    coinId,
    { days = "365", vsCurrency = "usd" } = {},
) {
    const symbol = COIN_SYMBOLS[coinId];
    if (!symbol)
        throw fail(`Unsupported coin "${coinId}" for CoinMarketCap`, 404);

    const convert = String(vsCurrency || "usd").toUpperCase();
    const nowSec = Math.floor(Date.now() / 1000);
    // "max" is capped to CoinMarketCap's earliest supported date (2013-04-28).
    const startSec =
        days === "max" ? 1367107200 : nowSec - Number(days) * DAY_SECONDS;
    const spanDays = Math.ceil((nowSec - startSec) / DAY_SECONDS);
    const interval = spanDays > 730 ? "weekly" : "daily";

    const data = await request("/v2/cryptocurrency/quotes/historical", {
        symbol,
        convert,
        interval,
        time_start: new Date(startSec * 1000).toISOString(),
        time_end: new Date(nowSec * 1000).toISOString(),
        count: 10000,
    });

    const entry = data?.data?.[symbol];
    const quotes =
        (Array.isArray(entry) ? entry[0]?.quotes : entry?.quotes) || [];

    const series = quotes
        .map((q) => ({
            time: Math.floor(new Date(q.timestamp).getTime() / 1000),
            quote: q.quote?.[convert] || {},
        }))
        .filter((q) => Number.isFinite(q.time) && Number(q.quote.price) > 0)
        .sort((a, b) => a.time - b.time);

    return {
        id: coinId,
        vsCurrency: String(vsCurrency || "usd").toLowerCase(),
        days: String(days),
        source: "coinmarketcap",
        prices: series.map((s) => ({
            time: s.time,
            value: Number(s.quote.price),
        })),
        marketCaps: series
            .filter((s) => Number(s.quote.market_cap) > 0)
            .map((s) => ({ time: s.time, value: Number(s.quote.market_cap) })),
        volumes: series
            .filter((s) => Number(s.quote.volume_24h) > 0)
            .map((s) => ({ time: s.time, value: Number(s.quote.volume_24h) })),
    };
}

module.exports = { getHistoricalQuotes };

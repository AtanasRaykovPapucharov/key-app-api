const axios = require("axios");

const BASE_URL = process.env.BINANCE_URL || "https://api.binance.com/api/v3";
const QUOTE = "USDT";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

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

const INTERVAL_DAYS = { "1d": 1, "3d": 3, "1w": 7, "1M": 30 };
const MAX_CANDLES = 1000;

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

/** Largest candle size that keeps the range under Binance's 1000 candle cap. */
function pickInterval(days) {
    if (days === "max") return "1w";
    const span = Number(days);
    return (
        Object.keys(INTERVAL_DAYS).find(
            (key) => span / INTERVAL_DAYS[key] <= MAX_CANDLES,
        ) || "1M"
    );
}

/** Daily-or-coarser OHLCV candles covering multi-year ranges. */
async function getLongTermCandles(coinId, { days = "max", interval } = {}) {
    const symbol = COIN_SYMBOLS[coinId];
    if (!symbol) throw fail(`Unsupported coin "${coinId}"`, 404);

    const range = String(days || "max");
    const step = INTERVAL_DAYS[interval] ? interval : pickInterval(range);
    const limit =
        range === "max"
            ? MAX_CANDLES
            : Math.min(
                  MAX_CANDLES,
                  Math.ceil(Number(range) / INTERVAL_DAYS[step]),
              );

    const params = { symbol: `${symbol}${QUOTE}`, interval: step, limit };
    const cacheKey = JSON.stringify(params);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    let rows;
    try {
        const res = await axios.get(`${BASE_URL}/klines`, {
            params,
            timeout: 15000,
        });
        rows = res.data;
    } catch (err) {
        if (cached) return cached.data;
        throw fail(
            err.response?.data?.msg || err.message || "Binance request failed",
            err.response?.status === 429 ? 429 : 502,
        );
    }

    const payload = {
        id: coinId,
        symbol: `${symbol}${QUOTE}`,
        days: range,
        interval: step,
        source: "binance",
        candles: (rows || [])
            .filter((r) => Number(r[4]) > 0)
            .map((r) => ({
                time: Math.floor(r[0] / 1000),
                open: Number(r[1]),
                high: Number(r[2]),
                low: Number(r[3]),
                close: Number(r[4]),
                volume: Number(r[5]),
            })),
    };

    cache.set(cacheKey, { at: Date.now(), data: payload });
    return payload;
}

module.exports = { getLongTermCandles, INTERVALS: Object.keys(INTERVAL_DAYS) };

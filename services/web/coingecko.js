const axios = require("axios");

const BASE_URL =
    process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3";
const API_KEY = process.env.COINGECKO_API_KEY || null;

// CoinGecko's free tier allows ~10-30 calls/min, so responses are cached.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const COIN_ID = /^[a-z0-9][a-z0-9-]{0,64}$/;
const VS_CURRENCY = /^[a-z]{2,10}$/;
const ALLOWED_DAYS = new Set([
    "1",
    "7",
    "30",
    "90",
    "180",
    "365",
    "1825",
    "max",
]);

// CoinGecko's free tier only serves the last 365 days, so longer ranges come
// from Binance's keyless klines endpoint instead.
const FREE_HISTORY_DAYS = 365;
const BINANCE_URL = process.env.BINANCE_URL || "https://api.binance.com/api/v3";
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

function assertCoinId(coinId) {
    if (!COIN_ID.test(String(coinId || ""))) {
        const err = new Error("Invalid coin id");
        err.status = 400;
        throw err;
    }
    return String(coinId);
}

function assertVsCurrency(vsCurrency) {
    const value = String(vsCurrency || "usd").toLowerCase();
    if (!VS_CURRENCY.test(value)) {
        const err = new Error("Invalid vs_currency");
        err.status = 400;
        throw err;
    }
    return value;
}

function assertDays(days) {
    const value = String(days ?? "max").toLowerCase();
    if (!ALLOWED_DAYS.has(value)) {
        const err = new Error("Invalid days range");
        err.status = 400;
        throw err;
    }
    return value;
}

async function request(path, params, { baseUrl = BASE_URL } = {}) {
    const cacheKey = `${baseUrl}${path}?${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    const headers = { Accept: "application/json" };
    if (API_KEY && baseUrl === BASE_URL) headers["x-cg-demo-api-key"] = API_KEY;

    try {
        const { data } = await axios.get(`${baseUrl}${path}`, {
            params,
            headers,
            timeout: 15000,
        });
        cache.set(cacheKey, { at: Date.now(), data });
        return data;
    } catch (err) {
        // Serve stale data rather than failing when rate limited.
        if (cached) return cached.data;
        const status = err.response?.status === 429 ? 429 : 502;
        const wrapped = new Error(
            err.response?.data?.error ||
                err.message ||
                "CoinGecko request failed",
        );
        wrapped.status = status;
        throw wrapped;
    }
}

/**
 * Long term price / market cap / volume history.
 * Returns arrays of { time (unix seconds), value }.
 */
async function getMarketChart(
    coinId,
    { days = "max", vsCurrency = "usd" } = {},
) {
    const id = assertCoinId(coinId);
    const range = assertDays(days);
    const currency = assertVsCurrency(vsCurrency);

    if (range === "max" || Number(range) > FREE_HISTORY_DAYS) {
        return getLongHistory(id, range, currency);
    }

    // `interval` is a paid-plan parameter; the public API picks daily granularity above 90 days.
    const data = await request(`/coins/${id}/market_chart`, {
        vs_currency: currency,
        days: range,
    });
    const toSeries = (rows) =>
        (rows || []).map(([ms, value]) => ({
            time: Math.floor(ms / 1000),
            value: Number(value),
        }));

    return {
        id,
        vsCurrency: currency,
        days: range,
        source: "coingecko",
        prices: toSeries(data.prices),
        marketCaps: toSeries(data.market_caps),
        volumes: toSeries(data.total_volumes),
    };
}

/** Multi-year history from Binance klines (no API key required). */
async function getLongHistory(id, range, currency) {
    const symbol = COIN_SYMBOLS[id];
    if (!symbol || currency !== "usd") {
        const err = new Error(`No long term history available for "${id}"`);
        err.status = 404;
        throw err;
    }

    // 1000 candles max per request: 3-day candles cover 5 years, weekly covers the full listing.
    const interval = range === "max" ? "1w" : "3d";
    const limit = range === "max" ? 1000 : Math.ceil(Number(range) / 3);

    const rows = await request(
        "/klines",
        {
            symbol: `${symbol}USDT`,
            interval,
            limit,
        },
        { baseUrl: BINANCE_URL },
    );

    const candles = (rows || []).filter((r) => Number(r[4]) > 0);
    return {
        id,
        vsCurrency: currency,
        days: range,
        source: "binance",
        prices: candles.map((r) => ({
            time: Math.floor(r[0] / 1000),
            value: Number(r[4]),
        })),
        marketCaps: [],
        volumes: candles.map((r) => ({
            time: Math.floor(r[0] / 1000),
            value: Number(r[7]),
        })),
    };
}

/** Daily OHLC candles for the requested range. */
async function getOhlc(coinId, { days = "365", vsCurrency = "usd" } = {}) {
    const id = assertCoinId(coinId);
    const range = assertDays(days);
    const currency = assertVsCurrency(vsCurrency);

    const data = await request(`/coins/${id}/ohlc`, {
        vs_currency: currency,
        days: range,
    });

    return {
        id,
        vsCurrency: currency,
        days: range,
        candles: (data || []).map(([ms, open, high, low, close]) => ({
            time: Math.floor(ms / 1000),
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
        })),
    };
}

/** Market snapshot (ATH, ATL, supply, long range performance) for the given coins. */
async function getMarkets({ ids = [], vsCurrency = "usd", perPage = 50 } = {}) {
    const currency = assertVsCurrency(vsCurrency);
    const list = (Array.isArray(ids) ? ids : String(ids).split(","))
        .map((id) => String(id).trim().toLowerCase())
        .filter((id) => COIN_ID.test(id));

    const params = {
        vs_currency: currency,
        order: "market_cap_desc",
        per_page: Math.min(Math.max(Number(perPage) || 50, 1), 250),
        page: 1,
        sparkline: false,
        price_change_percentage: "30d,200d,1y",
    };
    if (list.length) params.ids = list.join(",");

    const data = await request("/coins/markets", params);
    return (data || []).map((coin) => ({
        id: coin.id,
        symbol: String(coin.symbol || "").toUpperCase(),
        name: coin.name,
        image: coin.image,
        price: coin.current_price,
        marketCap: coin.market_cap,
        marketCapRank: coin.market_cap_rank,
        volume: coin.total_volume,
        circulatingSupply: coin.circulating_supply,
        maxSupply: coin.max_supply,
        ath: coin.ath,
        athDate: coin.ath_date,
        athChangePct: coin.ath_change_percentage,
        atl: coin.atl,
        atlDate: coin.atl_date,
        atlChangePct: coin.atl_change_percentage,
        change30d: coin.price_change_percentage_30d_in_currency,
        change200d: coin.price_change_percentage_200d_in_currency,
        change1y: coin.price_change_percentage_1y_in_currency,
    }));
}

const TOP100_CRITERIA = {
    marketCap: { label: "Market cap", direction: "desc" },
    changePercent: { label: "Daily change", direction: "desc" },
    volume: { label: "Volume", direction: "desc" },
    athChangePct: { label: "Drop from all-time high", direction: "asc" },
    unlockedPct: { label: "Least unlocked supply", direction: "asc" },
};

/**
 * Top coins by market cap with the metrics needed for a leaderboard, plus a
 * supply-based "unlock progress" figure (circulating / total|max supply) used
 * as a free proxy for a real vesting/unlock calendar, which CoinGecko's
 * public API does not expose.
 */
async function getTop100({
    criterion = "marketCap",
    limit = 100,
    vsCurrency = "usd",
} = {}) {
    const currency = assertVsCurrency(vsCurrency);
    const key = TOP100_CRITERIA[criterion] ? criterion : "marketCap";
    const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);

    const data = await request("/coins/markets", {
        vs_currency: currency,
        order: "market_cap_desc",
        per_page: 250,
        page: 1,
        sparkline: false,
        price_change_percentage: "24h",
    });

    const coins = (data || []).map((coin) => {
        const totalSupply = coin.total_supply ?? coin.max_supply ?? null;
        const unlockedPct =
            totalSupply && coin.circulating_supply
                ? Number(
                      ((coin.circulating_supply / totalSupply) * 100).toFixed(
                          2,
                      ),
                  )
                : null;
        return {
            id: coin.id,
            symbol: String(coin.symbol || "").toUpperCase(),
            name: coin.name,
            image: coin.image,
            price: coin.current_price,
            changePercent:
                typeof coin.price_change_percentage_24h === "number"
                    ? Number(coin.price_change_percentage_24h.toFixed(2))
                    : null,
            marketCap: coin.market_cap,
            volume: coin.total_volume,
            circulatingSupply: coin.circulating_supply,
            totalSupply,
            maxSupply: coin.max_supply,
            unlockedPct,
            ath: coin.ath,
            athChangePct:
                typeof coin.ath_change_percentage === "number"
                    ? Number(coin.ath_change_percentage.toFixed(2))
                    : null,
        };
    });

    const direction = TOP100_CRITERIA[key].direction === "asc" ? 1 : -1;
    const ranked = coins
        .filter((coin) => coin[key] !== null && coin[key] !== undefined)
        .sort((left, right) => (left[key] - right[key]) * direction)
        .slice(0, cappedLimit)
        .map((coin, index) => ({ rank: index + 1, ...coin }));

    return {
        criterion: key,
        label: TOP100_CRITERIA[key].label,
        count: ranked.length,
        coins: ranked,
    };
}

module.exports = { getMarketChart, getOhlc, getMarkets, getTop100 };

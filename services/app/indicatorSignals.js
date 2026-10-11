const { Spot } = require("@binance/connector");
const { RSI, MACD, SMA } = require("technicalindicators");
const { voteSignals, composeSignal } = require("./confluenceIndicators");

const client = new Spot();

const INDICATOR_TYPES = ["rsi", "macd", "sma_cross", "confluence"];

const DEFAULT_PARAMS = {
    rsi: {
        period: 14,
        oversold: 30,
        overbought: 70,
        interval: "1h",
        limit: 100,
    },
    macd: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        interval: "1h",
        limit: 150,
    },
    sma_cross: { fastPeriod: 10, slowPeriod: 50, interval: "1h", limit: 150 },
    confluence: { interval: "1h", limit: 100 },
};

function withDefaults(indicatorType, params = {}) {
    return { ...DEFAULT_PARAMS[indicatorType], ...params };
}

async function getCloses(symbol, interval, limit) {
    const { data } = await client.klines(symbol, interval, { limit });
    // kline tuple: [openTime, open, high, low, close, volume, ...]
    return data.map((candle) => Number(candle[4]));
}

async function getCandles(symbol, interval, limit) {
    const { data } = await client.klines(symbol, interval, { limit });
    return data.map((candle) => ({
        time: candle[0],
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
        volume: Number(candle[5]),
    }));
}

async function rsiSignal(cryptoId, params) {
    const p = withDefaults("rsi", params);
    const closes = await getCloses(`${cryptoId}USDC`, p.interval, p.limit);
    const values = RSI.calculate({ period: p.period, values: closes });
    const latest = values[values.length - 1];
    if (latest == null) return { signal: "neutral", details: { latest } };

    if (latest <= p.oversold)
        return { signal: "buy", details: { rsi: latest } };
    if (latest >= p.overbought)
        return { signal: "sell", details: { rsi: latest } };
    return { signal: "neutral", details: { rsi: latest } };
}

async function macdSignal(cryptoId, params) {
    const p = withDefaults("macd", params);
    const closes = await getCloses(`${cryptoId}USDC`, p.interval, p.limit);
    const values = MACD.calculate({
        values: closes,
        fastPeriod: p.fastPeriod,
        slowPeriod: p.slowPeriod,
        signalPeriod: p.signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });

    const prev = values[values.length - 2];
    const latest = values[values.length - 1];
    if (
        !prev ||
        !latest ||
        prev.histogram == null ||
        latest.histogram == null
    ) {
        return { signal: "neutral", details: { latest } };
    }

    // Histogram crossing zero marks the MACD/signal-line crossover
    if (prev.histogram <= 0 && latest.histogram > 0) {
        return { signal: "buy", details: { macd: latest } };
    }
    if (prev.histogram >= 0 && latest.histogram < 0) {
        return { signal: "sell", details: { macd: latest } };
    }
    return { signal: "neutral", details: { macd: latest } };
}

async function smaCrossSignal(cryptoId, params) {
    const p = withDefaults("sma_cross", params);
    const closes = await getCloses(`${cryptoId}USDC`, p.interval, p.limit);
    const fast = SMA.calculate({ period: p.fastPeriod, values: closes });
    const slow = SMA.calculate({ period: p.slowPeriod, values: closes });
    if (fast.length < 2 || slow.length < 2)
        return { signal: "neutral", details: {} };

    const prevDiff = fast[fast.length - 2] - slow[slow.length - 2];
    const currDiff = fast[fast.length - 1] - slow[slow.length - 1];

    if (prevDiff <= 0 && currDiff > 0) {
        return {
            signal: "buy",
            details: {
                fast: fast[fast.length - 1],
                slow: slow[slow.length - 1],
            },
        };
    }
    if (prevDiff >= 0 && currDiff < 0) {
        return {
            signal: "sell",
            details: {
                fast: fast[fast.length - 1],
                slow: slow[slow.length - 1],
            },
        };
    }
    return { signal: "neutral", details: {} };
}

// Majority vote across MA/EMA/BB/SAR/SuperTrend, mirroring CryptoChart.vue's composite signal
async function confluenceSignal(cryptoId, params) {
    const p = withDefaults("confluence", params);
    const candles = await getCandles(`${cryptoId}USDC`, p.interval, p.limit);
    const votes = voteSignals(candles);
    const composite = composeSignal(votes);

    if (composite.label === "BUY") return { signal: "buy", details: composite };
    if (composite.label === "SELL")
        return { signal: "sell", details: composite };
    return { signal: "neutral", details: composite };
}

// Returns { signal: 'buy'|'sell'|'neutral', details } for the given indicator strategy
async function getIndicatorSignal(cryptoId, indicatorType, params) {
    if (!INDICATOR_TYPES.includes(indicatorType)) {
        throw new Error(`Unsupported indicator_type "${indicatorType}"`);
    }

    if (indicatorType === "rsi") return rsiSignal(cryptoId, params);
    if (indicatorType === "macd") return macdSignal(cryptoId, params);
    if (indicatorType === "confluence")
        return confluenceSignal(cryptoId, params);
    return smaCrossSignal(cryptoId, params);
}

module.exports = { getIndicatorSignal, INDICATOR_TYPES, DEFAULT_PARAMS };

// Server-side port of the pure indicator math used by client/src/services/algo.js,
// kept minimal to just what the MA/EMA/BB/SAR/SUPER confluence vote needs.

function movingAverageLast(closes, period) {
    if (closes.length < period) return null;
    let sum = 0;
    for (let i = closes.length - period; i < closes.length; i++)
        sum += closes[i];
    return sum / period;
}

function emaSeries(values, period) {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    let prev = 0;
    for (let i = 0; i < period; i++) prev += values[i];
    prev /= period;

    const result = [prev];
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        result.push(prev);
    }
    return result;
}

function bollingerLast(closes, period = 20, multiplier = 2) {
    if (closes.length < period) return null;
    const window = closes.slice(-period);
    const mean = window.reduce((sum, v) => sum + v, 0) / period;
    const variance =
        window.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / period;
    const sd = Math.sqrt(Math.max(variance, 0));
    return { upper: mean + multiplier * sd, lower: mean - multiplier * sd };
}

function parabolicSarLast(candles, step = 0.02, max = 0.2) {
    if (candles.length < 2) return null;
    let isBull = true;
    let af = step;
    let ep = candles[0].high;
    let sar = candles[0].low;

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const prev = candles[i - 1];
        let newSar = sar + af * (ep - sar);

        if (isBull) {
            newSar = Math.min(
                newSar,
                prev.low,
                i >= 2 ? candles[i - 2].low : prev.low,
            );
            if (c.low < newSar) {
                isBull = false;
                newSar = ep;
                ep = c.low;
                af = step;
            } else if (c.high > ep) {
                ep = c.high;
                af = Math.min(af + step, max);
            }
        } else {
            newSar = Math.max(
                newSar,
                prev.high,
                i >= 2 ? candles[i - 2].high : prev.high,
            );
            if (c.high > newSar) {
                isBull = true;
                newSar = ep;
                ep = c.high;
                af = step;
            } else if (c.low < ep) {
                ep = c.low;
                af = Math.min(af + step, max);
            }
        }
        sar = newSar;
    }
    return { isBull };
}

function supertrendLast(candles, period = 10, multiplier = 3) {
    if (candles.length < period + 1) return null;

    const tr = new Array(candles.length);
    tr[0] = candles[0].high - candles[0].low;
    for (let i = 1; i < candles.length; i++) {
        tr[i] = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close),
        );
    }

    let atr = 0;
    for (let i = 0; i < period; i++) atr += tr[i];
    atr /= period;

    const atrs = [atr];
    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
        atrs.push(atr);
    }

    let prevUpperBand = 0;
    let prevLowerBand = 0;
    let prevDirection = 1;
    let direction = 1;

    for (let i = period - 1; i < candles.length; i++) {
        const c = candles[i];
        const atrVal = atrs[i - (period - 1)];
        const hl2 = (c.high + c.low) / 2;

        let upperBand = hl2 + multiplier * atrVal;
        let lowerBand = hl2 - multiplier * atrVal;

        if (i > period - 1) {
            const pClose = candles[i - 1].close;
            lowerBand =
                lowerBand > prevLowerBand || pClose < prevLowerBand
                    ? lowerBand
                    : prevLowerBand;
            upperBand =
                upperBand < prevUpperBand || pClose > prevUpperBand
                    ? upperBand
                    : prevUpperBand;
        }

        if (i === period - 1) {
            direction = c.close <= upperBand ? 1 : -1;
        } else {
            direction =
                prevDirection === -1
                    ? c.close > prevUpperBand
                        ? 1
                        : -1
                    : c.close < prevLowerBand
                      ? -1
                      : 1;
        }

        prevUpperBand = upperBand;
        prevLowerBand = lowerBand;
        prevDirection = direction;
    }

    return { direction };
}

// Mirrors CryptoChart.vue's per-indicator vote: MA, EMA, BB, SAR, SUPER (AVL is
// always HOLD client-side too — it's a volume overlay, not a directional signal).
function voteSignals(candles) {
    const closes = candles.map((c) => c.close);
    const votes = {
        ma: "HOLD",
        ema: "HOLD",
        bb: "HOLD",
        sar: "HOLD",
        super: "HOLD",
        avl: "HOLD",
    };

    const maShort = movingAverageLast(closes, 5);
    const maLong = movingAverageLast(closes, 20);
    votes.ma =
        !maShort || !maLong
            ? "HOLD"
            : maShort > maLong
              ? "BUY"
              : maShort < maLong
                ? "SELL"
                : "HOLD";

    const emaShort = emaSeries(closes, 9).at(-1);
    const emaLong = emaSeries(closes, 21).at(-1);
    votes.ema =
        !emaShort || !emaLong
            ? "HOLD"
            : emaShort > emaLong
              ? "BUY"
              : emaShort < emaLong
                ? "SELL"
                : "HOLD";

    const bands = bollingerLast(closes, 20, 2);
    const lastPrice = closes.at(-1);
    votes.bb = !bands
        ? "HOLD"
        : lastPrice > bands.upper
          ? "SELL"
          : lastPrice < bands.lower
            ? "BUY"
            : "HOLD";

    const sar = parabolicSarLast(candles);
    votes.sar = !sar ? "HOLD" : sar.isBull ? "BUY" : "SELL";

    const superTrend = supertrendLast(candles);
    votes.super = !superTrend
        ? "HOLD"
        : superTrend.direction === 1
          ? "BUY"
          : "SELL";

    return votes;
}

// Same majority rule as CryptoChart.vue's `composite` computed property
function composeSignal(votes) {
    const keys = Object.keys(votes);
    const total = keys.length;
    let buys = 0;
    let sells = 0;
    for (const key of keys) {
        if (votes[key] === "BUY") buys++;
        else if (votes[key] === "SELL") sells++;
    }

    const holds = total - (buys + sells);
    let label = "HOLD";
    if (buys > sells && holds < buys) label = "BUY";
    else if (sells > buys && holds < sells) label = "SELL";

    return { label, votes, buys, sells, total };
}

module.exports = { voteSignals, composeSignal };

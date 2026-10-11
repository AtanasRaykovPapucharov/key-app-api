const { Spot } = require("@binance/connector");

// How often to re-poll each window
const POLL_INTERVALS = {
    "1w": 60 * 1000, // every 1 minute
    "1M": 5 * 60 * 1000, // every 5 minutes
};

function startPoller(broadcast, windowSize = "1w", pairs = []) {
    if (!POLL_INTERVALS[windowSize]) {
        throw new Error(
            `Invalid windowSize "${windowSize}" for poller. ` +
                `Supported: ${Object.keys(POLL_INTERVALS).join(", ")}`,
        );
    }

    const client = new Spot();
    const intervalMs = POLL_INTERVALS[windowSize];
    const latest = {};

    async function fetchPair(pair) {
        const symbol = pair.toUpperCase();

        try {
            if (windowSize === "1w") {
                // Binance rolling-window REST ticker (max 7d)
                const { data: d } = await client.ticker({
                    symbol,
                    windowSize: "7d",
                });

                latest[pair] = {
                    symbol,
                    price: d.lastPrice,
                    change: d.priceChangePercent,
                    high: d.highPrice,
                    low: d.lowPrice,
                    volume: d.quoteVolume,
                };
            } else {
                // 1M — derive stats from the current monthly kline
                const { data } = await client.klines(symbol, "1M", {
                    limit: 1,
                });
                const [open, high, low, close, , , , quoteVolume] =
                    data[0].slice(1);

                const changePercent = (
                    ((+close - +open) / +open) *
                    100
                ).toFixed(2);

                latest[pair] = {
                    symbol,
                    price: close,
                    change: changePercent,
                    high,
                    low,
                    volume: quoteVolume,
                };
            }
        } catch (err) {
            console.error(
                `[poller] Error fetching ${symbol} (${windowSize}):`,
                err?.message,
            );
        }
    }

    async function poll() {
        console.log(
            `[poller] Polling ${windowSize} data for ${pairs.length} pairs...`,
        );

        await Promise.allSettled(pairs.map(fetchPair));

        broadcast({
            type: "tickers",
            data: pairs.map((pair) => latest[pair] || null),
        });
    }

    // Run immediately, then on interval
    poll();
    const timer = setInterval(poll, intervalMs);

    return {
        stop: () => {
            clearInterval(timer);
            console.log(`[poller] Stopped ${windowSize} poller`);
        },
    };
}

module.exports = { startPoller, POLL_INTERVALS };

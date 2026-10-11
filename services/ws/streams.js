const { WebsocketStream } = require("@binance/connector");

// Supported window sizes and their Binance event names
const WS_WINDOWS = {
    "24h": { method: "ticker", event: "24hrTicker" },
    "1h": { method: "rollingWindowTicker", event: "1hTicker" },
    "4h": { method: "rollingWindowTicker", event: "4hTicker" },
    "1d": { method: "rollingWindowTicker", event: "1dTicker" },
};

const latest = {};
const MAX_RECONNECT_ATTEMPTS = 5;

function startStreams(
    broadcast,
    windowSize = "24h",
    pairs = [],
    reconnectAttempts = 0,
) {
    if (!WS_WINDOWS[windowSize]) {
        throw new Error(
            `Invalid windowSize "${windowSize}" for streams. ` +
                `Supported: ${Object.keys(WS_WINDOWS).join(", ")}`,
        );
    }

    const { method, event } = WS_WINDOWS[windowSize];
    let attempts = reconnectAttempts;

    const wsClient = new WebsocketStream({
        callbacks: {
            open: () => {
                attempts = 0;
                console.log(
                    `[streams] Binance WebSocket open (window: ${windowSize})`,
                );
            },

            message: (raw) => {
                let d;
                try {
                    d = JSON.parse(raw);
                } catch {
                    return;
                }

                if (d.e === event && d.s) {
                    const key = d.s.toLowerCase();

                    latest[key] = {
                        symbol: d.s,
                        price: d.c,
                        change: d.P,
                        high: d.h,
                        low: d.l,
                        volume: d.q,
                    };

                    broadcast({
                        type: "tickers",
                        data: pairs.map((pair) => latest[pair] || null),
                    });
                }
            },

            close: () => {
                attempts += 1;
                if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error("Server is not available.");
                    console.log("Server is not available.");
                    return;
                }

                console.log(
                    `[streams] Binance WS closed — restarting in 3s (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})...`,
                );
                setTimeout(
                    () => startStreams(broadcast, windowSize, pairs, attempts),
                    3000,
                );
            },

            error: (err) =>
                console.error("[streams] Binance WS error:", err?.message),
        },
    });

    pairs.forEach((pair) => {
        if (method === "rollingWindowTicker") {
            wsClient.rollingWindowTicker(pair, windowSize);
        } else {
            wsClient.ticker(pair);
        }
        console.log(`[streams] Subscribed to ${windowSize} ticker: ${pair}`);
    });

    return wsClient;
}

module.exports = { startStreams, WS_WINDOWS };

const { WebSocketServer } = require("ws");
const pool = require("./pool");
const { startStreams, WS_WINDOWS } = require("../services/ws/streams");
const { startPoller, POLL_INTERVALS } = require("../services/ws/poller");
const { verifyToken } = require("./auth");

const LEGACY_UID_AUTH = process.env.LEGACY_UID_AUTH === "true";

const WINDOW_SIZE = process.env.WINDOW_SIZE || "24h";
const PAIRS = [
    "btcusdc",
    "ethusdc",
    "solusdc",
    "bnbusdc",
    "adausdc",
    "linkusdc",
    "eurusdc",
];

function uniquePairs(pairs) {
    return [
        ...new Set(
            pairs
                .map((pair) =>
                    String(pair || "")
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    ];
}

let wss;

// Track active data source per connected user so we can stop it on disconnect
const activeSessions = new Map(); // ws → { stop }

function initWebSocket(server) {
    wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
        console.log(`Client connected. Total: ${wss.clients.size}`);

        ws.on("message", async (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch {
                return;
            }

            // Expect: { type: "auth", token, userId }. The user comes from the
            // verified token; a bare userId is only honoured in legacy mode.
            if (msg.type !== "auth") return;
            let userId = null;
            if (msg.token) {
                try {
                    userId = verifyToken(msg.token).id;
                } catch {
                    userId = null; // invalid/expired → public tickers only
                }
            } else if (LEGACY_UID_AUTH && msg.userId) {
                userId = msg.userId;
            }

            // Re-auth replaces the previous stream instead of leaking it
            activeSessions.get(ws)?.stop?.();
            activeSessions.delete(ws);
            await handleAuth(ws, userId);
        });

        ws.on("close", () => {
            // Stop this user's data source when they disconnect
            const session = activeSessions.get(ws);
            if (session?.stop) session.stop();
            activeSessions.delete(ws);

            console.log(`Client disconnected. Total: ${wss.clients.size}`);
        });
    });
}

async function handleAuth(ws, userId = null) {
    try {
        let pairs = PAIRS;
        if (userId) {
            const res = await pool.query(
                "SELECT watch_list FROM portfolio WHERE user_id = $1",
                [userId],
            );
            // console.log("RESP: ", res.rows);

            const fromWatchlist = res?.rows[0]?.watch_list;
            if (fromWatchlist?.length) {
                pairs = uniquePairs([...fromWatchlist, ...PAIRS]);
            }
        }

        if (!pairs.length) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "No pairs found for user",
                }),
            );
            return;
        }

        // Broadcast only to this specific client
        const broadcastToClient = (data) => {
            if (ws.readyState === 1) ws.send(JSON.stringify(data));
        };

        let session;
        if (WS_WINDOWS[WINDOW_SIZE]) {
            const wsClient = startStreams(
                broadcastToClient,
                WINDOW_SIZE,
                pairs,
            );
            session = { stop: () => wsClient.close?.() };
        } else {
            session = startPoller(broadcastToClient, WINDOW_SIZE, pairs);
        }

        activeSessions.set(ws, session);
        ws.send(JSON.stringify({ type: "auth_ok", pairs }));

        console.log(
            `[ws] User ${userId} authenticated with ${pairs.length} pairs`,
        );
    } catch (err) {
        console.error(`[ws] Auth error for user ${userId}:`, err.message);
        ws.send(JSON.stringify({ type: "error", message: "Auth failed" }));
    }
}

module.exports = { initWebSocket };

/**
 * Stock data routes (URLs kept as /api/yahoo/... so the frontend doesn't change).
 *
 * Data sources:
 *   - Finnhub (services/finnhub.js): quotes, top 100, company metrics, search
 *   - Yahoo chart endpoint (services/yahoo-chart.js): price history
 */
const express = require("express");
const router = express.Router();
const finnhub = require("../../services/finnhub");
const { getHistory } = require("../../services/yahoo-chart");

const topUniverse = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "AVGO",
    "TSLA",
    "GOOG",
    "BRK-B",
    "WMT",
    "LLY",
    "JPM",
    "V",
    "XOM",
    "JNJ",
    "MA",
    "ORCL",
    "COST",
    "HD",
    "PG",
    "NFLX",
    "BAC",
    "ABBV",
    "CRM",
    "CVX",
    "KO",
    "MRK",
    "AMD",
    "PEP",
    "TMO",
    "ADBE",
    "WFC",
    "ACN",
    "MCD",
    "LIN",
    "CSCO",
    "IBM",
    "ABT",
    "PM",
    "GE",
    "INTU",
    "ISRG",
    "CAT",
    "TXN",
    "QCOM",
    "VZ",
    "AMGN",
    "NOW",
    "PFE",
    "CMCSA",
    "UBER",
    "AMAT",
    "NEE",
    "RTX",
    "GS",
    "SPGI",
    "DIS",
    "LOW",
    "T",
    "HON",
    "BLK",
    "BKNG",
    "SYK",
    "ELV",
    "TJX",
    "VRTX",
    "ADP",
    "LMT",
    "DE",
    "MDT",
    "GILD",
    "MMC",
    "REGN",
    "SCHW",
    "C",
    "MO",
    "CB",
    "PGR",
    "SO",
    "CI",
    "ADI",
    "ETN",
    "BSX",
    "ZTS",
    "CME",
    "DUK",
    "ITW",
    "MU",
    "EQIX",
    "PYPL",
    "USB",
    "NKE",
    "COP",
    "MCO",
    "APD",
    "SHW",
    "ICE",
    "CL",
    "WM",
    "FDX",
    "MPC",
    "SBUX",
    "ORLY",
    "EOG",
    "GD",
];


const topCriteria = {
    marketCap: { label: "Market cap", direction: "desc" },
    changePercent: { label: "Daily change", direction: "desc" },
    volume: { label: "Volume", direction: "desc" },
    trailingPE: { label: "P/E", direction: "asc" },
    dividendYield: { label: "Dividend yield", direction: "desc" },
};

function errorResponse(res, message, error, status = 502) {
    return res.status(status).json({ error: message, details: error.message });
}

// ── Top 100: refreshed in the background ───────────────────────────────────
// Finnhub has no batch quote on the free plan, so the list is built one
// symbol at a time (~2 min for a refresh). Users always get the latest
// list immediately; it is refreshed every 30 minutes in the background.
const TOP_REFRESH_MS = 30 * 60 * 1000;
const TOP_RETRY_MS = 60 * 1000; // retry sooner if the last refresh failed
const top = { stocks: new Map(), refreshing: false, lastRun: 0, lastError: null, failed: 0 };

async function refreshTop() {
    if (top.refreshing) return;
    top.refreshing = true;
    top.lastError = null;
    top.failed = 0;
    try {
        for (const symbol of topUniverse) {
            try {
                const quote = await finnhub.getQuote(symbol, { priority: false });
                if (quote) top.stocks.set(symbol, quote);
            } catch (error) {
                top.failed += 1;
                top.lastError = error.message;
                console.error(`[top100] ${symbol}: ${error.message}`);
                // missing/invalid key: no point trying the other 100 symbols
                if (/FINNHUB_API_KEY/.test(error.message)) break;
            }
        }
    } finally {
        top.refreshing = false;
        top.lastRun = Date.now();
    }
}

function refreshTopIfStale() {
    const wait = top.stocks.size === 0 || top.lastError ? TOP_RETRY_MS : TOP_REFRESH_MS;
    if (!top.refreshing && Date.now() - top.lastRun > wait) {
        refreshTop().catch((error) => console.error("[top100]", error.message));
    }
}

// start filling the list as soon as the server starts
if (process.env.FINNHUB_API_KEY) refreshTopIfStale();

// ── Routes ──────────────────────────────────────────────────────────────────
router.get("/", (_req, res) => {
    res.json({
        name: "Stock Metrics API",
        endpoints: [
            "GET /api/yahoo/top100?criterion=marketCap&limit=100",
            "GET /api/yahoo/stock/:symbol",
            "GET /api/yahoo/stocks?symbols=AAPL,MSFT",
            "GET /api/yahoo/stock/:symbol/history?range=1mo&interval=1d",
            "GET /api/yahoo/stock/:symbol/summary",
            "GET /api/yahoo/search?q=apple",
        ],
        dataSource: "Finnhub (quotes, metrics, search) + Yahoo chart (history)",
    });
});

router.get("/stock/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const quote = await finnhub.getQuote(symbol);
        if (!quote)
            return res
                .status(404)
                .json({ error: `Symbol '${symbol}' not found` });
        res.json(quote);
    } catch (error) {
        errorResponse(res, "Failed to fetch stock data", error);
    }
});

router.get("/stocks", async (req, res) => {
    try {
        const symbols = String(req.query.symbols || "")
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean)
            .slice(0, 20); // each symbol costs Finnhub requests
        if (!symbols.length)
            return res
                .status(400)
                .json({ error: "Query param 'symbols' is required" });
        const quotes = await Promise.all(
            symbols.map((symbol) => finnhub.getQuote(symbol).catch(() => null)),
        );
        res.json(quotes.filter(Boolean));
    } catch (error) {
        errorResponse(res, "Failed to fetch stock data", error);
    }
});

router.get("/top100", (req, res) => {
    refreshTopIfStale();

    const criterion = topCriteria[req.query.criterion]
        ? req.query.criterion
        : "marketCap";
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 100)
        : 100;
    // Finnhub's free quote has no daily volume, so rank by 3-month average volume
    const sortKey = criterion === "volume" ? "avgVolume3Month" : criterion;
    const direction = topCriteria[criterion].direction === "asc" ? 1 : -1;

    const ranked = [...top.stocks.values()]
        .sort((left, right) => {
            const leftValue = left[sortKey];
            const rightValue = right[sortKey];
            if (leftValue === null || leftValue === undefined) return 1;
            if (rightValue === null || rightValue === undefined) return -1;
            return (leftValue - rightValue) * direction;
        })
        .slice(0, limit)
        .map((quote, index) => ({ rank: index + 1, ...quote }));

    res.json({
        criterion,
        label: topCriteria[criterion].label,
        count: ranked.length,
        stocks: ranked,
        // true while the list is still being filled (e.g. right after a restart)
        loading: top.refreshing,
        loaded: top.stocks.size,
        total: topUniverse.length,
        // shows why the list is empty or incomplete (e.g. missing API key)
        lastError: top.lastError,
    });
});

router.get("/stock/:symbol/history", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const range = req.query.range || "1mo";
        const interval = req.query.interval || "1d";
        const quotes = await getHistory(symbol, range, interval);
        res.json({ symbol, range, interval, points: quotes.length, quotes });
    } catch (error) {
        errorResponse(res, "Failed to fetch historical data", error);
    }
});

router.get("/stock/:symbol/summary", async (req, res) => {
    try {
        res.json(await finnhub.getSummary(req.params.symbol.toUpperCase()));
    } catch (error) {
        errorResponse(res, "Failed to fetch summary data", error);
    }
});

router.get("/search", async (req, res) => {
    try {
        const query = String(req.query.q || "").trim();
        if (!query)
            return res
                .status(400)
                .json({ error: "Query param 'q' is required" });
        res.json(await finnhub.search(query));
    } catch (error) {
        errorResponse(res, "Search failed", error);
    }
});

router.get("/btc-history", async (_req, res) => {
    try {
        const quotes = await getHistory("BTC-USD", "max", "1d");
        res.json(
            quotes.map((quote) => ({
                ...quote,
                date: quote.date.split("T")[0],
            })),
        );
    } catch (error) {
        errorResponse(res, "Failed to fetch Bitcoin history", error);
    }
});

module.exports = router;

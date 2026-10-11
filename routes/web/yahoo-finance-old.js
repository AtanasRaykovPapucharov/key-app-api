const express = require("express");
const router = express.Router();
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

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

function pct(value) {
    return typeof value === "number" ? Number((value * 100).toFixed(2)) : null;
}

function shapeQuote(quote) {
    return {
        symbol: quote.symbol,
        name: quote.longName || quote.shortName || quote.symbol,
        exchange: quote.fullExchangeName,
        currency: quote.currency,
        marketState: quote.marketState,
        price: quote.regularMarketPrice ?? null,
        change: quote.regularMarketChange ?? null,
        changePercent: quote.regularMarketChangePercent
            ? Number(quote.regularMarketChangePercent.toFixed(2))
            : null,
        open: quote.regularMarketOpen ?? null,
        dayHigh: quote.regularMarketDayHigh ?? null,
        dayLow: quote.regularMarketDayLow ?? null,
        previousClose: quote.regularMarketPreviousClose ?? null,
        volume: quote.regularMarketVolume ?? null,
        avgVolume3Month: quote.averageDailyVolume3Month ?? null,
        marketCap: quote.marketCap ?? null,
        trailingPE: quote.trailingPE ?? null,
        forwardPE: quote.forwardPE ?? null,
        epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths ?? null,
        epsForward: quote.epsForward ?? null,
        priceToBook: quote.priceToBook ?? null,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
        fiftyDayAverage: quote.fiftyDayAverage ?? null,
        twoHundredDayAverage: quote.twoHundredDayAverage ?? null,
        dividendYield: quote.trailingAnnualDividendYield
            ? pct(quote.trailingAnnualDividendYield)
            : null,
        dividendRate: quote.trailingAnnualDividendRate ?? null,
        beta: quote.beta ?? null,
        sharesOutstanding: quote.sharesOutstanding ?? null,
        bookValue: quote.bookValue ?? null,
        timestamp: new Date().toISOString(),
    };
}

function periodFromRange(range) {
    const date = new Date();
    const adjustments = {
        "1d": () => date.setDate(date.getDate() - 1),
        "5d": () => date.setDate(date.getDate() - 5),
        "1mo": () => date.setMonth(date.getMonth() - 1),
        "3mo": () => date.setMonth(date.getMonth() - 3),
        "6mo": () => date.setMonth(date.getMonth() - 6),
        "1y": () => date.setFullYear(date.getFullYear() - 1),
        "5y": () => date.setFullYear(date.getFullYear() - 5),
        max: () => date.setFullYear(date.getFullYear() - 20),
    };
    (adjustments[range] || adjustments["1mo"])();
    return date;
}

function errorResponse(res, message, error, status = 502) {
    return res.status(status).json({ error: message, details: error.message });
}

router.get("/", (_req, res) => {
    res.json({
        name: "Stock Metrics API",
        endpoints: [
            "GET /api/yahoo/stock/:symbol",
            "GET /api/yahoo/stocks?symbols=AAPL,MSFT",
            "GET /api/yahoo/stock/:symbol/history?range=1mo&interval=1d",
            "GET /api/yahoo/stock/:symbol/summary",
            "GET /api/yahoo/search?q=apple",
        ],
        dataSource: "Yahoo Finance public data feed",
    });
});

router.get("/stock/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const quote = await yahooFinance.quote(symbol);
        if (!quote)
            return res
                .status(404)
                .json({ error: `Symbol '${symbol}' not found` });
        res.json(shapeQuote(quote));
    } catch (error) {
        errorResponse(res, "Failed to fetch stock data", error);
    }
});

router.get("/stocks", async (req, res) => {
    try {
        const symbols = String(req.query.symbols || "")
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean);
        if (!symbols.length)
            return res
                .status(400)
                .json({ error: "Query param 'symbols' is required" });
        const quotes = await yahooFinance.quote(symbols);
        const list = Array.isArray(quotes) ? quotes : [quotes];
        res.json(list.filter(Boolean).map(shapeQuote));
    } catch (error) {
        errorResponse(res, "Failed to fetch stock data", error);
    }
});

router.get("/top100", async (req, res) => {
    try {
        const criterion = topCriteria[req.query.criterion]
            ? req.query.criterion
            : "marketCap";
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 100)
            : 100;
        const quotes = await yahooFinance.quote(topUniverse);
        const direction = topCriteria[criterion].direction === "asc" ? 1 : -1;
        const ranked = (Array.isArray(quotes) ? quotes : [quotes])
            .filter(Boolean)
            .map(shapeQuote)
            .sort((left, right) => {
                const leftValue = left[criterion];
                const rightValue = right[criterion];
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
        });
    } catch (error) {
        errorResponse(res, "Failed to fetch top stocks", error);
    }
});

router.get("/stock/:symbol/history", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const range = req.query.range || "1mo";
        const interval = req.query.interval || "1d";
        const result = await yahooFinance.chart(symbol, {
            period1: periodFromRange(range),
            period2: new Date(),
            interval,
        });
        const quotes = (result.quotes || []).map((quote) => ({
            date: quote.date,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            volume: quote.volume,
        }));
        res.json({ symbol, range, interval, points: quotes.length, quotes });
    } catch (error) {
        errorResponse(res, "Failed to fetch historical data", error);
    }
});

router.get("/stock/:symbol/summary", async (req, res) => {
    try {
        const modules = [
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "price",
            "assetProfile",
        ];
        res.json(
            await yahooFinance.quoteSummary(req.params.symbol.toUpperCase(), {
                modules,
            }),
        );
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
        const result = await yahooFinance.search(query);
        res.json(
            (result.quotes || [])
                .filter((quote) => quote.symbol)
                .map((quote) => ({
                    symbol: quote.symbol,
                    name: quote.shortname || quote.longname || quote.symbol,
                    exchange: quote.exchange,
                    type: quote.quoteType,
                })),
        );
    } catch (error) {
        errorResponse(res, "Search failed", error);
    }
});

router.get("/btc-history", async (_req, res) => {
    try {
        const result = await yahooFinance.chart("BTC-USD", {
            period1: "2014-09-17",
            period2: new Date(),
            interval: "1d",
        });
        res.json(
            (result.quotes || []).map((quote) => ({
                date: new Date(quote.date).toISOString().split("T")[0],
                open: quote.open,
                high: quote.high,
                low: quote.low,
                close: quote.close,
                volume: quote.volume,
            })),
        );
    } catch (error) {
        errorResponse(res, "Failed to fetch Bitcoin history", error);
    }
});

module.exports = router;

/**
 * Stock Metrics API
 * ------------------
 * Free, keyless stock data via Yahoo Finance's public JSON feed
 * (wrapped by the `yahoo-finance2` npm package). No API key or
 * account signup required.
 */
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

// ---------- Helpers ----------

function pct(n) {
    return typeof n === "number" ? Number((n * 100).toFixed(2)) : null;
}

function shapeQuote(q) {
    return {
        symbol: q.symbol,
        name: q.longName || q.shortName || q.symbol,
        exchange: q.fullExchangeName,
        currency: q.currency,
        marketState: q.marketState,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent
            ? Number(q.regularMarketChangePercent.toFixed(2))
            : null,
        open: q.regularMarketOpen ?? null,
        dayHigh: q.regularMarketDayHigh ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        volume: q.regularMarketVolume ?? null,
        avgVolume3Month: q.averageDailyVolume3Month ?? null,
        marketCap: q.marketCap ?? null,
        trailingPE: q.trailingPE ?? null,
        forwardPE: q.forwardPE ?? null,
        epsTrailingTwelveMonths: q.epsTrailingTwelveMonths ?? null,
        epsForward: q.epsForward ?? null,
        priceToBook: q.priceToBook ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
        fiftyDayAverage: q.fiftyDayAverage ?? null,
        twoHundredDayAverage: q.twoHundredDayAverage ?? null,
        dividendYield: q.trailingAnnualDividendYield
            ? pct(q.trailingAnnualDividendYield)
            : null,
        dividendRate: q.trailingAnnualDividendRate ?? null,
        beta: q.beta ?? null,
        sharesOutstanding: q.sharesOutstanding ?? null,
        bookValue: q.bookValue ?? null,
        timestamp: new Date().toISOString(),
    };
}

function parseRangeToPeriod1(range) {
    const now = new Date();
    const d = new Date(now);
    switch (range) {
        case "1d":
            d.setDate(d.getDate() - 1);
            break;
        case "5d":
            d.setDate(d.getDate() - 5);
            break;
        case "1mo":
            d.setMonth(d.getMonth() - 1);
            break;
        case "3mo":
            d.setMonth(d.getMonth() - 3);
            break;
        case "6mo":
            d.setMonth(d.getMonth() - 6);
            break;
        case "1y":
            d.setFullYear(d.getFullYear() - 1);
            break;
        case "5y":
            d.setFullYear(d.getFullYear() - 5);
            break;
        case "max":
            d.setFullYear(d.getFullYear() - 20);
            break;
        default:
            d.setMonth(d.getMonth() - 1); // default 1mo
    }
    return d;
}

// ---------- Routes ----------

app.get("/", (req, res) => {
    res.json({
        name: "Stock Metrics API",
        endpoints: {
            "GET /api/stock/:symbol":
                "Key metrics for a single symbol (e.g. AAPL)",
            "GET /api/stocks?symbols=AAPL,MSFT,GOOGL":
                "Key metrics for multiple symbols",
            "GET /api/stock/:symbol/history?range=1mo&interval=1d":
                "Historical OHLCV data",
            "GET /api/stock/:symbol/summary":
                "Extended fundamentals (financial data, key stats, summary detail)",
            "GET /api/search?q=apple": "Search for a symbol by company name",
        },
        dataSource: "Yahoo Finance public data feed (no API key required)",
    });
});

// Single stock metrics
app.get("/api/stock/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const quote = await yahooFinance.quote(symbol);
        if (!quote)
            return res
                .status(404)
                .json({ error: `Symbol '${symbol}' not found` });
        res.json(shapeQuote(quote));
    } catch (err) {
        res.status(502).json({
            error: "Failed to fetch stock data",
            details: err.message,
        });
    }
});

// Multiple stocks at once
app.get("/api/stocks", async (req, res) => {
    try {
        const symbolsParam = req.query.symbols;
        if (!symbolsParam) {
            return res.status(400).json({
                error: "Query param 'symbols' is required, e.g. ?symbols=AAPL,MSFT",
            });
        }
        const symbols = symbolsParam
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
        const quotes = await yahooFinance.quote(symbols);
        const list = Array.isArray(quotes) ? quotes : [quotes];
        res.json(list.filter(Boolean).map(shapeQuote));
    } catch (err) {
        res.status(502).json({
            error: "Failed to fetch stock data",
            details: err.message,
        });
    }
});

// Historical price data
app.get("/api/stock/:symbol/history", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const range = req.query.range || "1mo";
        const interval = req.query.interval || "1d"; // 1d, 1wk, 1mo

        const period1 = parseRangeToPeriod1(range);
        const period2 = new Date();

        const result = await yahooFinance.chart(symbol, {
            period1,
            period2,
            interval,
        });

        const quotes = (result.quotes || []).map((q) => ({
            date: q.date,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume,
        }));

        res.json({ symbol, range, interval, points: quotes.length, quotes });
    } catch (err) {
        res.status(502).json({
            error: "Failed to fetch historical data",
            details: err.message,
        });
    }
});

// Extended fundamentals (P/E, margins, growth, analyst targets, etc.)
app.get("/api/stock/:symbol/summary", async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const modules = [
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "price",
            "assetProfile",
        ];
        const result = await yahooFinance.quoteSummary(symbol, { modules });
        res.json(result);
    } catch (err) {
        res.status(502).json({
            error: "Failed to fetch summary data",
            details: err.message,
        });
    }
});

// Symbol search
app.get("/api/search", async (req, res) => {
    try {
        const q = req.query.q;
        if (!q)
            return res
                .status(400)
                .json({ error: "Query param 'q' is required, e.g. ?q=apple" });
        const result = await yahooFinance.search(q);
        const matches = (result.quotes || [])
            .filter((r) => r.symbol)
            .map((r) => ({
                symbol: r.symbol,
                name: r.shortname || r.longname,
                exchange: r.exchange,
                type: r.quoteType,
            }));
        res.json(matches);
    } catch (err) {
        res.status(502).json({ error: "Search failed", details: err.message });
    }
});

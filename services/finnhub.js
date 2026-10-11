/**
 * Finnhub data source (https://finnhub.io).
 *
 * Free plan: 60 requests/minute. All requests go through one queue that
 * sends at most ~50 per minute, so we never hit Finnhub's limit.
 * Results are cached (see services/cache.js), so most user requests
 * never reach Finnhub at all.
 *
 * Every function returns data in the SAME shape the old Yahoo routes
 * returned, so the frontend does not need any changes.
 */
const axios = require("axios");
const { cached } = require("./cache");

const BASE_URL = "https://finnhub.io/api/v1";
const API_KEY = process.env.FINNHUB_API_KEY;

const MINUTE = 60 * 1000;
const TTL = {
    quote: 10 * MINUTE, // price changes often
    profile: 24 * 60 * MINUTE, // name, exchange, market cap
    metric: 24 * 60 * MINUTE, // P/E, margins, 52w high/low...
    search: 24 * 60 * MINUTE,
};

// ── Request queue: max ~50 requests per minute ─────────────────────────────
const GAP_MS = 1200;
const queue = [];
let working = false;

function enqueue(task, priority = false) {
    return new Promise((resolve, reject) => {
        const job = { task, resolve, reject };
        // user-facing requests jump ahead of the background top-100 refresh
        if (priority) queue.unshift(job);
        else queue.push(job);
        runQueue();
    });
}

async function runQueue() {
    if (working) return;
    working = true;
    while (queue.length) {
        const job = queue.shift();
        try {
            job.resolve(await job.task());
        } catch (error) {
            job.reject(error);
        }
        await new Promise((r) => setTimeout(r, GAP_MS));
    }
    working = false;
}

function finnhubGet(path, params = {}, priority = false) {
    if (!API_KEY) {
        return Promise.reject(new Error("FINNHUB_API_KEY is not set on the server"));
    }
    return enqueue(async () => {
        try {
            const res = await axios.get(`${BASE_URL}${path}`, {
                params: { ...params, token: API_KEY },
                timeout: 10000,
            });
            return res.data;
        } catch (error) {
            const status = error.response?.status;
            if (status === 429) throw new Error("Finnhub rate limit reached (429)");
            if (status === 401 || status === 403) {
                throw new Error(`Finnhub refused the request (${status}) - check FINNHUB_API_KEY`);
            }
            throw error;
        }
    }, priority);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// Yahoo uses BRK-B, Finnhub uses BRK.B
const toFinnhub = (symbol) => symbol.toUpperCase().replace(/-/g, ".");
const toApp = (symbol) => symbol.toUpperCase().replace(/\./g, "-");

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const pick = (obj, keys) => {
    for (const key of keys) {
        const value = num(obj?.[key]);
        if (value !== null) return value;
    }
    return null;
};
const millions = (value) => (value === null ? null : value * 1e6);
const fraction = (value) => (value === null ? null : value / 100); // 45.2 (%) -> 0.452

// ── Raw Finnhub calls (cached) ─────────────────────────────────────────────
function getRawQuote(symbol, priority) {
    const s = toFinnhub(symbol);
    return cached(`fh:quote:${s}`, TTL.quote, () => finnhubGet("/quote", { symbol: s }, priority));
}

function getRawProfile(symbol, priority) {
    const s = toFinnhub(symbol);
    return cached(`fh:profile:${s}`, TTL.profile, () =>
        finnhubGet("/stock/profile2", { symbol: s }, priority),
    );
}

function getRawMetric(symbol, priority) {
    const s = toFinnhub(symbol);
    return cached(`fh:metric:${s}`, TTL.metric, async () => {
        const data = await finnhubGet("/stock/metric", { symbol: s, metric: "all" }, priority);
        return data?.metric || {};
    });
}

// ── Public API (same shapes as the old Yahoo routes) ───────────────────────

/** Same fields as shapeQuote() in the old Yahoo route. Returns null if not found. */
async function getQuote(symbol, { priority = true } = {}) {
    const [quote, profile, metric] = await Promise.all([
        getRawQuote(symbol, priority),
        getRawProfile(symbol, priority).catch(() => ({})),
        getRawMetric(symbol, priority).catch(() => ({})),
    ]);

    // Finnhub returns zeros for unknown symbols
    if (!quote || (!quote.c && !quote.pc)) return null;

    return {
        symbol: toApp(symbol),
        name: profile?.name || toApp(symbol),
        exchange: profile?.exchange || null,
        currency: profile?.currency || "USD",
        marketState: null,
        price: num(quote.c),
        change: num(quote.d),
        changePercent: num(quote.dp) === null ? null : Number(quote.dp.toFixed(2)),
        open: num(quote.o),
        dayHigh: num(quote.h),
        dayLow: num(quote.l),
        previousClose: num(quote.pc),
        volume: null, // not in Finnhub's free quote
        avgVolume3Month: millions(pick(metric, ["3MonthAverageTradingVolume"])),
        marketCap: millions(num(profile?.marketCapitalization)),
        trailingPE: pick(metric, ["peTTM", "peBasicExclExtraTTM", "peNormalizedAnnual"]),
        forwardPE: null,
        epsTrailingTwelveMonths: pick(metric, ["epsTTM", "epsBasicExclExtraItemsTTM"]),
        epsForward: null,
        priceToBook: pick(metric, ["pbQuarterly", "pbAnnual"]),
        fiftyTwoWeekHigh: pick(metric, ["52WeekHigh"]),
        fiftyTwoWeekLow: pick(metric, ["52WeekLow"]),
        fiftyDayAverage: null,
        twoHundredDayAverage: null,
        dividendYield: pick(metric, ["dividendYieldIndicatedAnnual", "currentDividendYieldTTM"]),
        dividendRate: pick(metric, ["dividendPerShareTTM", "dividendPerShareAnnual"]),
        beta: pick(metric, ["beta"]),
        sharesOutstanding: millions(num(profile?.shareOutstanding)),
        bookValue: pick(metric, ["bookValuePerShareQuarterly", "bookValuePerShareAnnual"]),
        timestamp: new Date().toISOString(),
    };
}

/**
 * Same structure as Yahoo's quoteSummary (summaryDetail, defaultKeyStatistics,
 * financialData, price, assetProfile). Fields Finnhub's free plan doesn't have
 * (totalDebt, ebitda, freeCashflow...) are left out, and the frontend keeps
 * those inputs manual.
 */
async function getSummary(symbol) {
    const [profile, metric] = await Promise.all([
        getRawProfile(symbol, true).catch(() => ({})),
        getRawMetric(symbol, true),
    ]);
    const marketCap = millions(num(profile?.marketCapitalization));
    const debtToEquity = pick(metric, ["totalDebt/totalEquityQuarterly", "totalDebt/totalEquityAnnual"]);

    return {
        summaryDetail: {
            marketCap,
            trailingPE: pick(metric, ["peTTM", "peBasicExclExtraTTM"]),
            priceToSalesTrailing12Months: pick(metric, ["psTTM", "psAnnual"]),
            beta: pick(metric, ["beta"]),
            dividendYield: fraction(pick(metric, ["dividendYieldIndicatedAnnual"])),
            fiftyTwoWeekHigh: pick(metric, ["52WeekHigh"]),
            fiftyTwoWeekLow: pick(metric, ["52WeekLow"]),
        },
        defaultKeyStatistics: {
            trailingEps: pick(metric, ["epsTTM", "epsBasicExclExtraItemsTTM"]),
            priceToBook: pick(metric, ["pbQuarterly", "pbAnnual"]),
            sharesOutstanding: millions(num(profile?.shareOutstanding)),
            enterpriseValue: millions(pick(metric, ["enterpriseValue"])),
            pegRatio: pick(metric, ["pegTTM"]),
        },
        financialData: {
            // Finnhub gives percentages (45.2), Yahoo gives fractions (0.452)
            profitMargins: fraction(pick(metric, ["netProfitMarginTTM", "netProfitMarginAnnual"])),
            operatingMargins: fraction(pick(metric, ["operatingMarginTTM", "operatingMarginAnnual"])),
            grossMargins: fraction(pick(metric, ["grossMarginTTM", "grossMarginAnnual"])),
            returnOnEquity: fraction(pick(metric, ["roeTTM", "roeRfy"])),
            returnOnAssets: fraction(pick(metric, ["roaTTM", "roaRfy"])),
            currentRatio: pick(metric, ["currentRatioQuarterly", "currentRatioAnnual"]),
            // Yahoo gives debt/equity x100 (150 = 1.5x), Finnhub gives the ratio
            debtToEquity: debtToEquity === null ? null : debtToEquity * 100,
        },
        price: {
            marketCap,
            longName: profile?.name || null,
            currency: profile?.currency || null,
        },
        assetProfile: {
            industry: profile?.finnhubIndustry || null,
            website: profile?.weburl || null,
            country: profile?.country || null,
        },
    };
}

async function search(query) {
    const q = query.trim().toLowerCase();
    const data = await cached(`fh:search:${q}`, TTL.search, () => finnhubGet("/search", { q }, true));
    return (data?.result || [])
        // keep US listings (AAPL, BRK.B), skip foreign ones like AAPL.MX
        .filter((item) => item.symbol && /^[A-Z]+(\.[A-Z])?$/.test(item.symbol))
        .slice(0, 20)
        .map((item) => ({
            symbol: toApp(item.symbol),
            name: item.description || item.symbol,
            exchange: null,
            type: item.type || null,
        }));
}

module.exports = { getQuote, getSummary, search };

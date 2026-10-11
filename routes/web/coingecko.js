const express = require("express");
const {
    getMarketChart,
    getOhlc,
    getMarkets,
    getTop100,
} = require("../../services/web/coingecko.js");

const router = express.Router();

function fail(res, err, fallback) {
    const status = err.status || 500;
    if (status >= 500) console.error(fallback, err.message);
    res.status(status).json({ error: err.message || fallback });
}

// Long term price / market cap / volume history
router.get("/market-chart/:coinId", async (req, res) => {
    try {
        const data = await getMarketChart(req.params.coinId, {
            days: req.query.days,
            vsCurrency: req.query.vs,
        });
        res.json(data);
    } catch (err) {
        fail(res, err, "Error getting long term market chart");
    }
});

// Daily OHLC candles
router.get("/ohlc/:coinId", async (req, res) => {
    try {
        const data = await getOhlc(req.params.coinId, {
            days: req.query.days,
            vsCurrency: req.query.vs,
        });
        res.json(data);
    } catch (err) {
        fail(res, err, "Error getting OHLC data");
    }
});

// Market snapshot (ATH/ATL, supply, long range performance)
router.get("/markets", async (req, res) => {
    try {
        const data = await getMarkets({
            ids: req.query.ids || [],
            vsCurrency: req.query.vs,
            perPage: req.query.perPage,
        });
        res.json(data);
    } catch (err) {
        fail(res, err, "Error getting markets data");
    }
});

// Top 100 coins by market cap, with a supply-based unlock-progress proxy
router.get("/top100", async (req, res) => {
    try {
        const data = await getTop100({
            criterion: req.query.criterion,
            limit: req.query.limit,
            vsCurrency: req.query.vs,
        });
        res.json(data);
    } catch (err) {
        fail(res, err, "Error getting top 100 coins");
    }
});

module.exports = router;

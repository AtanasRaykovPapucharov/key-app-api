const express = require("express");
const {
    getPriceHistory,
    SOURCES,
} = require("../../services/web/priceHistory.js");
const { getLongTermCandles } = require("../../services/web/klines.js");

const router = express.Router();

router.get("/sources", (req, res) => {
    res.json(["auto", ...SOURCES]);
});

router.get("/:coinId/candles", async (req, res) => {
    try {
        const data = await getLongTermCandles(req.params.coinId, {
            days: req.query.days,
            interval: req.query.interval,
        });
        res.json(data);
    } catch (err) {
        const status = err.status || 500;
        if (status >= 500)
            console.error("Error getting long term candles:", err.message);
        res.status(status).json({ error: err.message });
    }
});

router.get("/:coinId", async (req, res) => {
    try {
        const data = await getPriceHistory(req.params.coinId, {
            days: req.query.days,
            vsCurrency: req.query.vs,
            source: req.query.source,
        });
        res.json(data);
    } catch (err) {
        const status = err.status || 500;
        if (status >= 500)
            console.error("Error getting price history:", err.message);
        res.status(status).json({ error: err.message });
    }
});

module.exports = router;

const express = require("express");
const { getAll, upsert } = require("../../services/app/stocksAnalysis");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];
        if (!uid) return res.status(400).json({ error: "uid is required" });
        res.status(200).json(await getAll(uid));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error getting stock analyses" });
    }
});

router.post("/", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];
        const { symbol, company_name, year_founded, total_points, test } =
            req.body;

        if (!uid) return res.status(400).json({ error: "uid is required" });
        if (!symbol || !symbol.trim()) {
            return res.status(400).json({ error: "symbol is required" });
        }
        if (!company_name || !company_name.trim()) {
            return res.status(400).json({ error: "company_name is required" });
        }

        const row = await upsert({
            symbol: symbol.trim().toUpperCase(),
            company_name: company_name.trim(),
            year_founded,
            total_points,
            test,
            uid,
        });
        res.status(200).json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

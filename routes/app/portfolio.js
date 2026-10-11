const express = require("express");
const { pool } = require("../../services/db.js");

const router = express.Router();

const gameProfiles = {
    cryptoBoss: [
        { curr: "BTC", amount: 0 },
        { curr: "ETH", amount: 1 },
        { curr: "BNB", amount: 10 },
        { curr: "SOL", amount: 100 },
    ],
    moneyBoss: [
        { curr: "BTC", amount: 0.1 },
        { curr: "ETH", amount: 1 },
        { curr: "BNB", amount: 10 },
        { curr: "SOL", amount: 100 },
    ],
};

router.get("/", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];

        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });

        const result = await pool.query(
            "SELECT * FROM portfolio WHERE uid = $1::uuid",
            [uid],
        );
        res.status(200).json(result.rows[0] || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put("/", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];

        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });

        const result = await pool.query(
            "UPDATE portfolio SET watch_list = $1 WHERE uid = $2::uuid RETURNING *",
            [req.body.watch_list, uid],
        );
        res.status(200).json(result.rows[0] || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/game", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];
        const crypto = gameProfiles[req.body.game];

        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });
        if (!crypto)
            return res.status(400).json({
                error: "Unknown game",
            });

        const values = [uid, JSON.stringify(crypto), 10000, 0];
        const updated = await pool.query(
            `UPDATE portfolio
             SET crypto = $2::jsonb, fiat_amount = $3, stable_amount = $4
             WHERE uid = $1::uuid
             RETURNING *`,
            values,
        );

        if (updated.rowCount > 0) return res.status(200).json(updated.rows[0]);

        const inserted = await pool.query(
            `INSERT INTO portfolio (uid, crypto, fiat_curr, fiat_amount, stable_curr, stable_amount)
             VALUES ($1::uuid, $2::jsonb, 'EUR', $3, 'USDC', $4)
             RETURNING *`,
            values,
        );
        res.status(201).json(inserted.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

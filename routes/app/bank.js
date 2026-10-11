const express = require("express");
const { pool } = require("../../services/db.js");
const { getAll } = require("../../services/app/bankTransaction");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM bank WHERE id=1", []);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/transactions", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];
        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });

        const rows = await getAll(uid);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

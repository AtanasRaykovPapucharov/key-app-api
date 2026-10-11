const express = require("express");
const { pool } = require("../../services/db.js");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM daily", []);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;

const express = require("express");
const { pool } = require("../../services/db.js");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const token = req.headers["x-auth-token"];
        if (!token) res.status(401).json({ message: "No permissions!" });

        const result = await pool.query("SELECT * FROM users", []);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const token = req.headers["x-auth-token"];
        if (!token) res.status(401).json({ message: "No permissions!" });

        const result = await pool.query(
            "SELECT * FROM users WHERE userid = $1",
            [req.params.id],
        );
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ message: "Error while select user!" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const token = req.headers["x-auth-token"];
        if (!token) res.status(401).json({ message: "No permissions!" });

        const result = await pool.query(
            "UPDATE users SET deleted = TRUE WHERE userid = $1 RETURNING *",
            [req.params.id],
        );
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ message: "Error while delete user!" });
    }
});

module.exports = router;

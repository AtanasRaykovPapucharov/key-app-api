const express = require("express");
const { pool } = require("../../services/db.js");
const { requireAdmin, forgetUser } = require("../../config/auth.js");

const router = express.Router();

// Never select the password hash
const SAFE_COLUMNS = "userid, uid, username, admin, avatar, deleted";

// List all users — admins only
router.get("/", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${SAFE_COLUMNS} FROM users ORDER BY userid`,
        );
        res.json(result.rows);
    } catch (err) {
        console.error("[user:list]", err);
        res.status(500).json({ message: "Server error" });
    }
});

// One user — yourself, or anyone for admins
router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!req.auth.admin && id !== req.auth.id)
            return res.status(403).json({ message: "Not allowed." });

        const result = await pool.query(
            `SELECT ${SAFE_COLUMNS} FROM users WHERE userid = $1`,
            [id],
        );
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error("[user:get]", err);
        res.status(500).json({ message: "Error while selecting user" });
    }
});

// Delete (soft) — your own account, or any account for admins
router.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!req.auth.admin && id !== req.auth.id)
            return res.status(403).json({ message: "Not allowed." });

        const result = await pool.query(
            `UPDATE users SET deleted = TRUE WHERE userid = $1 RETURNING ${SAFE_COLUMNS}`,
            [id],
        );
        forgetUser(id); // its tokens stop working immediately
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error("[user:delete]", err);
        res.status(500).json({ message: "Error while deleting user" });
    }
});

module.exports = router;

const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const { pool } = require("../../services/db.js");
const { v4 } = require("uuid");

const router = express.Router();

// Register and auto-login
router.post("/register", async (req, res, next) => {
    const client = await pool.connect();

    try {
        const username = req.body.username?.trim();
        const { password } = req.body;
        if (!username || !password)
            return res
                .status(400)
                .json({ message: "Username and password required" });

        await client.query("BEGIN");

        const existingUser = await client.query(
            "SELECT 1 FROM users WHERE username = $1 LIMIT 1",
            [username],
        );
        if (existingUser.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Username already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await client.query(
            "INSERT INTO users (username, password, uid) VALUES ($1, $2, $3) RETURNING *",
            [username, hashedPassword, v4()],
        );
        const user = result.rows[0];

        await client.query(
            `INSERT INTO portfolio (user_id, uid, crypto, fiat_curr, fiat_amount, stable_curr, stable_amount)
             VALUES ($1, $2::uuid, $3::jsonb, $4, $5, $6, $7)`,
            [
                user.userid,
                user.uid,
                JSON.stringify([
                    { curr: "BTC", amount: 0 },
                    { curr: "ETH", amount: 0 },
                    { curr: "SOL", amount: 0 },
                    { curr: "ADA", amount: 0 },
                    { curr: "LINK", amount: 0 },
                    { curr: "BNB", amount: 0 },
                ]),
                "EUR",
                10000,
                "USDC",
                0,
            ],
        );

        await client.query("COMMIT");

        req.login(user, (err) => {
            if (err) return next(err);
            return res.json({
                message: "User registered and logged in",
                user: {
                    id: user.userid,
                    username: user.username,
                    admin: user.admin,
                    avatar: user.avatar,
                    uid: user.uid,
                },
            });
        });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "23505")
            return res.status(409).json({ message: "Username already taken" });
        res.status(500).json({ message: "Server error", error: err.message });
    } finally {
        client.release();
    }
});

// Login
router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ message: info.message });

        req.login(user, (err) => {
            if (err) return next(err);
            return res.json({
                message: "Login successful",
                user: {
                    id: user.userid,
                    username: user.username,
                    admin: user.admin,
                    avatar: user.avatar,
                    uid: user.uid,
                },
            });
        });
    })(req, res, next);
});

// Logout
router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.json({ message: "Logged out" });
    });
});

module.exports = router;

const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const { pool } = require("../../services/db.js");
const { v4 } = require("uuid");
const { publicUser, signToken } = require("../../config/auth.js");

const USERNAME_MIN = 3;
const PASSWORD_MIN = 8;

const router = express.Router();

// Register and auto-login
router.post("/register", async (req, res, next) => {
    const client = await pool.connect();

    try {
        const username = String(req.body.username ?? "").trim();
        const password = String(req.body.password ?? "");
        if (username.length < USERNAME_MIN || password.length < PASSWORD_MIN)
            return res.status(400).json({
                message: `Username needs at least ${USERNAME_MIN} characters and password at least ${PASSWORD_MIN}.`,
            });
        if (username.length > 50 || password.length > 200)
            return res.status(400).json({ message: "Username or password is too long." });

        await client.query("BEGIN");

        const existingUser = await client.query(
            "SELECT 1 FROM users WHERE username = $1 LIMIT 1",
            [username],
        );
        if (existingUser.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Username already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
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
            return res.status(201).json({
                message: "User registered and logged in",
                user: publicUser(user),
                token: signToken(user),
            });
        });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "23505")
            return res.status(409).json({ message: "Username already taken" });
        console.error("[register]", err);
        res.status(500).json({ message: "Server error" });
    } finally {
        client.release();
    }
});

// Login
router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        // Same message for unknown user and wrong password (no account probing)
        if (!user)
            return res
                .status(401)
                .json({ message: info?.message || "Incorrect username or password." });

        req.login(user, (err) => {
            if (err) return next(err);
            return res.json({
                message: "Login successful",
                user: publicUser(user),
                token: signToken(user),
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

/**
 * Authentication and account routes (mounted under /api).
 *
 * Public:     POST /register, /login, /logout, /verify-email,
 *             /resend-verification-public, /forgot-password, /reset-password
 * Logged in:  GET /me, POST /resend-verification,
 *             PUT /me/email, PUT /me/password, PUT /me/locale
 *
 * Every error has a machine-readable `code` the client translates.
 */
const express = require("express");
const passport = require("passport");
const pool = require("../../config/pool");
const { publicUser, signToken, requireAuth, forgetUser } = require("../../config/auth.js");
const accounts = require("../../services/auth/accounts.js");
const { issueToken, consumeToken, TTL } = require("../../services/auth/tokens.js");
const { sendMail, isMailConfigured } = require("../../services/mail/mailer.js");
const templates = require("../../services/mail/templates.js");

const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const REQUIRE_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

// Where the links in emails point (the client app), e.g. https://keyappui.vercel.app
const APP_URL = (process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:9000")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");

const router = express.Router();

const fail = (res, status, code, message) => res.status(status).json({ code, message });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validatePassword(password) {
    if (password.length < PASSWORD_MIN) return `Password needs at least ${PASSWORD_MIN} characters.`;
    if (password.length > PASSWORD_MAX) return "Password is too long.";
    return null;
}

async function findWithPassword(userid) {
    const { rows } = await pool.query(
        "SELECT userid, username, email, email_verified, password FROM users WHERE userid = $1 AND deleted = FALSE",
        [userid],
    );
    return rows[0] || null;
}

async function sendVerification(user, email) {
    const token = await issueToken(user.userid, "verify_email", { email });
    const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const msg = templates.verifyEmail({
        locale: user.locale,
        name: user.username,
        url,
        hours: TTL.verify_email / 3_600_000,
    });
    return sendMail({ to: email, ...msg });
}

async function notifyPasswordChanged(user) {
    if (!user.email) return;
    await sendMail({ to: user.email, ...templates.passwordChanged({ locale: user.locale, name: user.username }) });
}

const authResponse = (user, extra = {}) => ({ user: publicUser(user), token: signToken(user), ...extra });

// ── Register ────────────────────────────────────────────────────────────────
router.post(
    "/register",
    asyncRoute(async (req, res) => {
        const username = String(req.body.username ?? "").trim();
        const password = String(req.body.password ?? "");
        const email = accounts.normalizeEmail(req.body.email);
        const locale = accounts.normalizeLocale(req.body.locale || req.headers["accept-language"]);

        if (username.length < USERNAME_MIN || username.length > USERNAME_MAX)
            return fail(res, 400, "INVALID_USERNAME", `Username needs ${USERNAME_MIN}–${USERNAME_MAX} characters.`);
        // '@' is reserved so a username can never be mistaken for an email at login
        if (/[@\s]/.test(username))
            return fail(res, 400, "INVALID_USERNAME", "Username can’t contain spaces or @.");
        if (!accounts.isValidEmail(email)) return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address.");
        const pwError = validatePassword(password);
        if (pwError) return fail(res, 400, "INVALID_PASSWORD", pwError);

        if (await accounts.usernameTaken(username))
            return fail(res, 409, "USERNAME_TAKEN", "This username is already taken.");
        if (await accounts.emailTaken(email))
            return fail(res, 409, "EMAIL_TAKEN", "An account with this email already exists.");

        let user;
        try {
            user = await accounts.createAccount({ username, email, password, locale });
        } catch (err) {
            if (err.code === "23505") {
                return /email/i.test(`${err.constraint} ${err.detail}`)
                    ? fail(res, 409, "EMAIL_TAKEN", "An account with this email already exists.")
                    : fail(res, 409, "USERNAME_TAKEN", "This username is already taken.");
            }
            throw err;
        }

        const mail = await sendVerification(user, email);

        if (REQUIRE_VERIFICATION)
            return res.status(201).json({
                code: "VERIFY_EMAIL",
                message: "Account created. Check your email to confirm your address, then log in.",
                user: publicUser(user),
                emailSent: mail.sent,
            });

        return res.status(201).json(authResponse(user, { message: "Account created", emailSent: mail.sent }));
    }),
);

// ── Login (username or email) ───────────────────────────────────────────────
router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) return fail(res, 401, "INVALID_CREDENTIALS", info?.message || "Incorrect username or password.");
        if (REQUIRE_VERIFICATION && user.email && !user.email_verified)
            return fail(res, 403, "EMAIL_NOT_VERIFIED", "Confirm your email address before logging in.");

        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            return res.json(authResponse(user, { message: "Login successful" }));
        });
    })(req, res, next);
});

router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.json({ message: "Logged out" });
    });
});

// ── Email verification ─────────────────────────────────────────────────────
router.post(
    "/verify-email",
    asyncRoute(async (req, res) => {
        const row = await consumeToken(req.body.token, "verify_email");
        if (!row) return fail(res, 400, "INVALID_TOKEN", "This link is invalid or has expired.");
        const user = await accounts.markEmailVerified(row.userid, row.email);
        // The address was changed after the link was sent
        if (!user) return fail(res, 400, "INVALID_TOKEN", "This link is no longer valid for your account.");
        return res.json({ message: "Email confirmed", user: publicUser(user) });
    }),
);

router.post(
    "/resend-verification",
    requireAuth,
    asyncRoute(async (req, res) => {
        const user = await accounts.findById(req.auth.id);
        if (!user?.email) return fail(res, 400, "NO_EMAIL", "Add an email address first.");
        if (user.email_verified) return fail(res, 400, "ALREADY_VERIFIED", "Your email is already confirmed.");
        const mail = await sendVerification(user, user.email);
        if (!mail.sent) return fail(res, 503, "MAIL_UNAVAILABLE", "We couldn’t send the email. Try again later.");
        return res.json({ message: "Verification email sent" });
    }),
);

// For people who can't log in because verification is required
router.post(
    "/resend-verification-public",
    asyncRoute(async (req, res) => {
        const user = await accounts.findByEmail(req.body.email);
        if (user && !user.email_verified) await sendVerification(user, user.email);
        // Same answer either way: don't reveal which emails have accounts
        return res.json({ message: "If an unconfirmed account uses this email, we sent a new link." });
    }),
);

// ── Password reset ──────────────────────────────────────────────────────────
router.post(
    "/forgot-password",
    asyncRoute(async (req, res) => {
        const email = accounts.normalizeEmail(req.body.email);
        if (!accounts.isValidEmail(email)) return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address.");

        const user = await accounts.findByEmail(email);
        if (user) {
            const token = await issueToken(user.userid, "reset_password", { email });
            const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
            const msg = templates.resetPassword({
                locale: user.locale,
                name: user.username,
                url,
                minutes: TTL.reset_password / 60_000,
            });
            await sendMail({ to: email, ...msg });
        }
        // Same answer whether or not the account exists
        return res.json({
            message: "If an account uses this email, we sent a link to reset the password.",
            mailConfigured: isMailConfigured(),
        });
    }),
);

router.post(
    "/reset-password",
    asyncRoute(async (req, res) => {
        const password = String(req.body.password ?? "");
        const pwError = validatePassword(password);
        if (pwError) return fail(res, 400, "INVALID_PASSWORD", pwError);

        const row = await consumeToken(req.body.token, "reset_password");
        if (!row) return fail(res, 400, "INVALID_TOKEN", "This link is invalid or has expired.");

        // Using a link sent to the inbox also proves the address belongs to the user
        const user = await accounts.setPassword(row.userid, password, { verifyEmail: true });
        if (!user) return fail(res, 400, "INVALID_TOKEN", "This account no longer exists.");
        forgetUser(user.userid);
        await notifyPasswordChanged(user);
        return res.json({ message: "Password changed. You can log in now." });
    }),
);

// ── Current account ─────────────────────────────────────────────────────────
router.get(
    "/me",
    requireAuth,
    asyncRoute(async (req, res) => {
        const user = await accounts.findById(req.auth.id);
        if (!user) return fail(res, 401, "SESSION_EXPIRED", "Please log in again.");
        return res.json({ user: publicUser(user) });
    }),
);

// Add or change the email (requires the current password)
router.put(
    "/me/email",
    requireAuth,
    asyncRoute(async (req, res) => {
        const email = accounts.normalizeEmail(req.body.email);
        if (!accounts.isValidEmail(email)) return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address.");

        const me = await findWithPassword(req.auth.id);
        if (!(await accounts.checkPassword(me, req.body.password)))
            return fail(res, 403, "WRONG_PASSWORD", "Your current password is incorrect.");
        if (me.email && me.email.toLowerCase() === email && me.email_verified)
            return fail(res, 400, "SAME_EMAIL", "This is already your email address.");
        if (await accounts.emailTaken(email, req.auth.id))
            return fail(res, 409, "EMAIL_TAKEN", "An account with this email already exists.");

        let user;
        try {
            user = await accounts.setEmail(req.auth.id, email);
        } catch (err) {
            if (err.code === "23505") return fail(res, 409, "EMAIL_TAKEN", "An account with this email already exists.");
            throw err;
        }
        const mail = await sendVerification(user, email);
        return res.json({ message: "Check your inbox to confirm the new address.", user: publicUser(user), emailSent: mail.sent });
    }),
);

// Change password (requires the current one); signs out other devices
router.put(
    "/me/password",
    requireAuth,
    asyncRoute(async (req, res) => {
        const me = await findWithPassword(req.auth.id);
        if (!(await accounts.checkPassword(me, req.body.currentPassword)))
            return fail(res, 403, "WRONG_PASSWORD", "Your current password is incorrect.");
        const password = String(req.body.newPassword ?? "");
        const pwError = validatePassword(password);
        if (pwError) return fail(res, 400, "INVALID_PASSWORD", pwError);

        const user = await accounts.setPassword(req.auth.id, password);
        forgetUser(user.userid);
        await notifyPasswordChanged(user);
        // A fresh token keeps this device signed in
        return res.json(authResponse(user, { message: "Password changed" }));
    }),
);

router.put(
    "/me/locale",
    requireAuth,
    asyncRoute(async (req, res) => {
        await accounts.setLocale(req.auth.id, req.body.locale);
        return res.json({ message: "Saved" });
    }),
);

module.exports = router;

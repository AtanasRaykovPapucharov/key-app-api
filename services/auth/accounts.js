/**
 * Account data access: lookups, creation, email and password changes.
 * Never returns the password hash unless explicitly asked (withPassword).
 */
const bcrypt = require("bcrypt");
const { v4 } = require("uuid");
const pool = require("../../config/pool");

const BCRYPT_ROUNDS = 12;
const COLUMNS =
    "userid, uid, username, email, email_verified, admin, avatar, locale, token_version";

// Used when a login name doesn't exist, so the response takes as long as a
// real password check and can't be used to discover which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);

const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (email) => email.length <= 254 && EMAIL_RE.test(email);
const normalizeLocale = (l) => (String(l || "").toLowerCase().startsWith("bg") ? "bg" : "en");

async function findById(userid, { db = pool } = {}) {
    const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE userid = $1 AND deleted = FALSE`,
        [userid],
    );
    return rows[0] || null;
}

async function findByEmail(email, { db = pool } = {}) {
    const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE lower(email) = $1 AND deleted = FALSE`,
        [normalizeEmail(email)],
    );
    return rows[0] || null;
}

/** Username or email. An exact username match wins over an email match. */
async function findForLogin(identifier, { db = pool } = {}) {
    const id = String(identifier ?? "").trim();
    if (!id) return null;
    const { rows } = await db.query(
        `SELECT ${COLUMNS}, password FROM users
          WHERE deleted = FALSE AND (username = $1 OR lower(email) = lower($1))
          ORDER BY (username = $1) DESC
          LIMIT 1`,
        [id],
    );
    return rows[0] || null;
}

async function checkPassword(user, password) {
    const ok = await bcrypt.compare(String(password ?? ""), user?.password || DUMMY_HASH);
    return Boolean(user) && ok;
}

const STARTING_CRYPTO = ["BTC", "ETH", "SOL", "ADA", "LINK", "BNB"].map((curr) => ({ curr, amount: 0 }));

/** Create user + starting portfolio in one transaction. Throws { code: '23505' } on duplicates. */
async function createAccount({ username, email, password, locale }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const { rows } = await client.query(
            `INSERT INTO users (username, password, uid, email, locale)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${COLUMNS}`,
            [username, hashed, v4(), email || null, normalizeLocale(locale)],
        );
        const user = rows[0];
        await client.query(
            `INSERT INTO portfolio (user_id, uid, crypto, fiat_curr, fiat_amount, stable_curr, stable_amount)
             VALUES ($1, $2::uuid, $3::jsonb, $4, $5, $6, $7)`,
            [user.userid, user.uid, JSON.stringify(STARTING_CRYPTO), "EUR", 10000, "USDC", 0],
        );
        await client.query("COMMIT");
        return user;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function usernameTaken(username) {
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE username = $1 LIMIT 1", [username]);
    return rowCount > 0;
}

async function emailTaken(email, exceptUserid = null) {
    const { rowCount } = await pool.query(
        "SELECT 1 FROM users WHERE lower(email) = $1 AND deleted = FALSE AND ($2::int IS NULL OR userid <> $2) LIMIT 1",
        [normalizeEmail(email), exceptUserid],
    );
    return rowCount > 0;
}

async function setEmail(userid, email) {
    const { rows } = await pool.query(
        `UPDATE users SET email = $2, email_verified = FALSE, email_verified_at = NULL
          WHERE userid = $1 RETURNING ${COLUMNS}`,
        [userid, normalizeEmail(email)],
    );
    return rows[0] || null;
}

/** Mark verified only if the address is still the one the link was sent to. */
async function markEmailVerified(userid, email) {
    const { rows } = await pool.query(
        `UPDATE users SET email_verified = TRUE, email_verified_at = now()
          WHERE userid = $1 AND deleted = FALSE AND lower(email) = $2
          RETURNING ${COLUMNS}`,
        [userid, normalizeEmail(email)],
    );
    return rows[0] || null;
}

/** New password + bump token_version (signs out every device). */
async function setPassword(userid, password, { verifyEmail = false } = {}) {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await pool.query(
        `UPDATE users
            SET password = $2,
                token_version = token_version + 1,
                email_verified = CASE WHEN $3 AND email IS NOT NULL THEN TRUE ELSE email_verified END,
                email_verified_at = CASE WHEN $3 AND email IS NOT NULL AND NOT email_verified THEN now() ELSE email_verified_at END
          WHERE userid = $1 AND deleted = FALSE
          RETURNING ${COLUMNS}`,
        [userid, hashed, verifyEmail],
    );
    return rows[0] || null;
}

async function setLocale(userid, locale) {
    await pool.query("UPDATE users SET locale = $2 WHERE userid = $1", [userid, normalizeLocale(locale)]);
}

module.exports = {
    findById,
    findByEmail,
    findForLogin,
    checkPassword,
    createAccount,
    usernameTaken,
    emailTaken,
    setEmail,
    markEmailVerified,
    setPassword,
    setLocale,
    normalizeEmail,
    isValidEmail,
    normalizeLocale,
};

/**
 * Single-use tokens for links sent by email (verify email, reset password).
 * The raw token only exists in the email; the database stores its SHA-256.
 */
const crypto = require("crypto");
const pool = require("../../config/pool");

const TTL = {
    verify_email: 24 * 60 * 60 * 1000, // 24 hours
    reset_password: 60 * 60 * 1000, // 1 hour
};

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Create a token, invalidating earlier unused ones of the same purpose. */
async function issueToken(userid, purpose, { email = null, db = pool } = {}) {
    if (!TTL[purpose]) throw new Error(`Unknown token purpose: ${purpose}`);
    const token = crypto.randomBytes(32).toString("base64url");
    await db.query(
        "UPDATE auth_tokens SET used_at = now() WHERE userid = $1 AND purpose = $2 AND used_at IS NULL",
        [userid, purpose],
    );
    await db.query(
        `INSERT INTO auth_tokens (userid, purpose, token_hash, email, expires_at)
         VALUES ($1, $2, $3, $4, now() + ($5 || ' milliseconds')::interval)`,
        [userid, purpose, hash(token), email, String(TTL[purpose])],
    );
    return token;
}

/**
 * Atomically consume a valid token. Returns the token row ({ userid, email })
 * or null if it's unknown, expired, already used or for another purpose.
 */
async function consumeToken(token, purpose, { db = pool } = {}) {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const { rows } = await db.query(
        `UPDATE auth_tokens SET used_at = now()
          WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
          RETURNING userid, email`,
        [hash(token), purpose],
    );
    return rows[0] || null;
}

/** Remove expired/used tokens older than a week (called occasionally). */
async function purgeOldTokens({ db = pool } = {}) {
    await db.query(
        "DELETE FROM auth_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '7 days'",
    );
}

module.exports = { issueToken, consumeToken, purgeOldTokens, TTL };

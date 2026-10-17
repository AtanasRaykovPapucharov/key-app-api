/**
 * Central authentication.
 *
 * - Login/register issue a signed JWT ({ user, token }).
 * - `authenticate` runs on every request: it verifies the token and sets
 *   req.auth = { id, uid, admin }. It also REPLACES the `x-uid` header with
 *   the uid from the token, so every existing route that reads
 *   req.headers["x-uid"] gets a trustworthy value without being rewritten.
 *   A client can no longer act as another user by sending their uid.
 * - `requireAuth` → 401 when not logged in, `requireAdmin` → 403 for non-admins.
 *
 * Transition: LEGACY_UID_AUTH=true temporarily accepts the old clients that
 * send the user's uid as x-auth-token. It is INSECURE (anyone who knows a uid
 * can act as that user) — enable it only while old clients are still deployed.
 */
const jwt = require("jsonwebtoken");
const pool = require("./pool");

const SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const LEGACY_UID_AUTH = process.env.LEGACY_UID_AUTH === "true";
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!SECRET || SECRET.length < 32) {
    throw new Error(
        "JWT_SECRET must be set to a random string of at least 32 characters " +
            "(generate one with: openssl rand -hex 32)",
    );
}
if (LEGACY_UID_AUTH) {
    console.warn(
        "[auth] LEGACY_UID_AUTH is enabled: requests may authenticate with a bare uid. " +
            "Disable it as soon as all clients send tokens.",
    );
}

/** Fields that are safe to send to the browser. */
function publicUser(u) {
    return {
        id: u.userid,
        uid: u.uid,
        username: u.username,
        email: u.email ?? null,
        emailVerified: !!u.email_verified,
        admin: !!u.admin,
        avatar: u.avatar ?? null,
        locale: u.locale ?? "en",
    };
}

// `tv` (token version) lets a password change revoke every older token
function signToken(u) {
    return jwt.sign({ uid: u.uid, admin: !!u.admin, tv: u.token_version ?? 0 }, SECRET, {
        subject: String(u.userid),
        expiresIn: TOKEN_TTL,
    });
}

function verifyToken(token) {
    const payload = jwt.verify(token, SECRET);
    return { id: Number(payload.sub), uid: payload.uid, admin: !!payload.admin, tv: payload.tv ?? 0 };
}

function readToken(req) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) return header.slice(7).trim();
    return req.headers["x-auth-token"] || null;
}

// Short cache so deleted accounts / admin changes apply quickly without a DB hit per request
const USER_CACHE_MS = 60 * 1000;
const userCache = new Map(); // id -> { at, row }

async function loadUser(id) {
    const hit = userCache.get(id);
    if (hit && Date.now() - hit.at < USER_CACHE_MS) return hit.row;
    const { rows } = await pool.query(
        "SELECT userid, uid, username, admin, token_version FROM users WHERE userid = $1 AND deleted = FALSE",
        [id],
    );
    const row = rows[0] || null;
    userCache.set(id, { at: Date.now(), row });
    return row;
}

function forgetUser(id) {
    userCache.delete(Number(id));
}

async function loadUserByUid(uid) {
    const { rows } = await pool.query(
        "SELECT userid, uid, username, admin, token_version FROM users WHERE uid = $1::uuid AND deleted = FALSE",
        [uid],
    );
    return rows[0] || null;
}

async function authenticate(req, res, next) {
    // Never trust identity headers sent by the client
    delete req.headers["x-uid"];
    req.auth = null;

    try {
        const token = readToken(req);
        let row = null;

        if (token && !UUID_RE.test(token)) {
            try {
                const claims = verifyToken(token);
                row = await loadUser(claims.id);
                // Deleted user, uid mismatch, or a token issued before the
                // last password change → not authenticated
                if (row && (row.uid !== claims.uid || (row.token_version ?? 0) !== claims.tv)) row = null;
            } catch {
                row = null; // invalid or expired token
            }
        } else if (token && LEGACY_UID_AUTH) {
            row = await loadUserByUid(token);
        } else if (req.user?.userid) {
            // Same-site deployments can still use the Passport session cookie
            row = await loadUser(req.user.userid);
        }

        if (row) {
            req.auth = { id: row.userid, uid: row.uid, admin: !!row.admin };
            req.headers["x-uid"] = row.uid;
            // Existing code reads req.user (logs, scheduler admin flag)
            if (!req.user) req.user = { ...row, id: row.userid };
        }
        next();
    } catch (err) {
        next(err);
    }
}

function requireAuth(req, res, next) {
    if (!req.auth)
        return res.status(401).json({ message: "Please log in to continue." });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.auth)
        return res.status(401).json({ message: "Please log in to continue." });
    if (!req.auth.admin)
        return res.status(403).json({ message: "Admins only." });
    next();
}

module.exports = {
    publicUser,
    signToken,
    verifyToken,
    authenticate,
    requireAuth,
    requireAdmin,
    forgetUser,
    UUID_RE,
};

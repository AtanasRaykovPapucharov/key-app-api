/**
 * Security smoke test — runs the real Express app against an in-memory fake
 * of the Postgres pool (no database needed):  npm test
 */
process.env.JWT_SECRET = "test-secret-".padEnd(64, "x");
process.env.SESSION_SECRET_KEY = "test-session";
process.env.CORS_ORIGIN = "https://keyappui.vercel.app";
process.env.NODE_ENV = "test";
process.env.MAIL_CAPTURE = "true";
process.env.LOG_LEVEL = "silent";

const path = require("path");
const assert = require("assert");
const bcrypt = require("bcrypt");

// ── in-memory fake of config/pool.js ─────────────────────────────────────
const db = {
    users: [
        { userid: 1, uid: "11111111-1111-4111-8111-111111111111", username: "alice", password: bcrypt.hashSync("alicepass1", 4), admin: false, avatar: null, deleted: false },
        { userid: 2, uid: "22222222-2222-4222-8222-222222222222", username: "bob", password: bcrypt.hashSync("bobpass123", 4), admin: false, avatar: null, deleted: false },
        { userid: 3, uid: "33333333-3333-4333-8333-333333333333", username: "root", password: bcrypt.hashSync("rootpass12", 4), admin: true, avatar: null, deleted: false },
    ],
    portfolio: [
        { uid: "11111111-1111-4111-8111-111111111111", fiat_amount: 100 },
        { uid: "22222222-2222-4222-8222-222222222222", fiat_amount: 200 },
    ],
    orders: [
        { id: 10, uid: "11111111-1111-4111-8111-111111111111" },
        { id: 20, uid: "22222222-2222-4222-8222-222222222222" },
    ],
};
const rows = (r) => ({ rows: r, rowCount: r.length });
const fakePool = {
    async query(sql, p = []) {
        const q = sql.replace(/\s+/g, " ");
        if (/information_schema\.tables/.test(q)) return rows(["users", "portfolio", "trading_order", "bank"].map((table_name) => ({ table_name })));
        if (/INSERT INTO public\.logs|INSERT INTO logs/i.test(q)) return rows([]);
        if (/FROM users WHERE deleted = FALSE AND \(username = \$1 OR lower\(email\)/.test(q))
            return rows(db.users.filter((u) => !u.deleted && (u.username === p[0] || (u.email || "").toLowerCase() === String(p[0]).toLowerCase())));
        if (/FROM users WHERE lower\(email\) = \$1 AND deleted = FALSE AND/.test(q)) return rows(db.users.filter((u) => !u.deleted && (u.email || "") === p[0] && u.userid !== p[1]));
        if (/FROM users WHERE username = \$1/.test(q)) return rows(db.users.filter((u) => u.username === p[0] && !u.deleted));
        if (/INSERT INTO auth_tokens|UPDATE auth_tokens/.test(q)) return rows([]);
        if (/FROM users WHERE userid = \$1 AND deleted = FALSE/.test(q)) return rows(db.users.filter((u) => u.userid === Number(p[0]) && !u.deleted));
        if (/FROM users WHERE uid = \$1::uuid AND deleted = FALSE/.test(q)) return rows(db.users.filter((u) => u.uid === p[0] && !u.deleted));
        if (/SELECT .* FROM users ORDER BY userid/.test(q)) return rows(db.users.map(({ password, ...u }) => u));
        if (/^SELECT \* FROM users/.test(q.trim())) return rows(db.users);
        if (/UPDATE users SET deleted = TRUE WHERE userid = \$1/.test(q)) {
            const u = db.users.find((x) => x.userid === Number(p[0]));
            if (u) u.deleted = true;
            return rows(u ? [{ userid: u.userid }] : []);
        }
        if (/SELECT \* FROM portfolio WHERE uid = \$1::uuid/.test(q)) return rows(db.portfolio.filter((x) => x.uid === p[0]));
        if (/DELETE FROM public\.trading_order WHERE id = \$1 AND uid = \$2::uuid/.test(q)) {
            const i = db.orders.findIndex((o) => o.id === Number(p[0]) && o.uid === p[1]);
            return rows(i >= 0 ? db.orders.splice(i, 1) : []);
        }
        if (/^(BEGIN|COMMIT|ROLLBACK)/.test(q.trim())) return rows([]);
        if (/SELECT 1 FROM users WHERE username/.test(q)) return rows(db.users.filter((u) => u.username === p[0]));
        if (/INSERT INTO users/.test(q)) {
            const u = { userid: db.users.length + 1, username: p[0], password: p[1], uid: p[2], email: p[3], locale: p[4], admin: false, avatar: null, deleted: false, token_version: 0 };
            db.users.push(u);
            return rows([u]);
        }
        if (/INSERT INTO portfolio/.test(q)) return rows([]);
        if (/SELECT \* FROM .*bank/i.test(q)) return rows([{ id: 1, fee: 0.1 }]);
        return rows([]);
    },
    async connect() {
        return { query: fakePool.query, release() {} };
    },
};
const poolPath = path.resolve(__dirname, "../config/pool.js");
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: fakePool };

// ── start the real app ───────────────────────────────────────────────────
const express = require("express");
const app = express();
require("../config/express")(express, app);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(method, url, { token, headers = {}, body } = {}) {
    const h = { "Content-Type": "application/json", ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data, headers: res.headers };
}

const results = [];
async function check(name, fn) {
    try { await fn(); results.push(["PASS", name]); }
    catch (e) { results.push(["FAIL", name, e.message]); }
}

(async () => {
    await new Promise((r) => setTimeout(r, 200)); // dynamic table routes load async
    const alice = await call("POST", "/login", { body: { username: "alice", password: "alicepass1" } });
    const root = await call("POST", "/login", { body: { username: "root", password: "rootpass12" } });
    const A = alice.data?.token, R = root.data?.token;
    const BOB_UID = "22222222-2222-4222-8222-222222222222";

    await check("login returns { user, token } without the password hash", async () => {
        assert.equal(alice.status, 200);
        assert.ok(A && A.split(".").length === 3, "token is a JWT");
        assert.equal(alice.data.user.uid, "11111111-1111-4111-8111-111111111111");
        assert.equal(alice.data.user.password, undefined);
    });
    await check("wrong password and unknown user give the same message", async () => {
        const a = await call("POST", "/login", { body: { username: "alice", password: "nope" } });
        const b = await call("POST", "/login", { body: { username: "nobody", password: "nope" } });
        assert.equal(a.status, 401); assert.equal(b.status, 401);
        assert.equal(a.data.message, b.data.message);
    });
    await check("portfolio without a token → 401", async () => {
        assert.equal((await call("GET", "/portfolio")).status, 401);
    });
    await check("spoofed x-uid without a token → 401 (no data leak)", async () => {
        const r = await call("GET", "/portfolio", { headers: { "x-uid": BOB_UID } });
        assert.equal(r.status, 401);
    });
    await check("old-style x-auth-token = uid is rejected (legacy mode off)", async () => {
        const r = await call("GET", "/portfolio", { headers: { "x-auth-token": BOB_UID, "x-uid": BOB_UID } });
        assert.equal(r.status, 401);
    });
    await check("alice cannot read bob's portfolio by sending bob's x-uid", async () => {
        const r = await call("GET", "/portfolio", { token: A, headers: { "x-uid": BOB_UID } });
        assert.equal(r.status, 200);
        assert.equal(r.data.fiat_amount, 100, "got alice's own portfolio, not bob's");
    });
    await check("forged / tampered token → 401", async () => {
        const forged = A.slice(0, -4) + "AAAA";
        assert.equal((await call("GET", "/portfolio", { token: forged })).status, 401);
    });
    await check("GET /user (all users) → 401 anonymous, 403 for normal users", async () => {
        assert.equal((await call("GET", "/user", { headers: { "x-auth-token": "anything" } })).status, 401);
        assert.equal((await call("GET", "/user", { token: A })).status, 403);
    });
    await check("admin can list users and no password hashes are returned", async () => {
        const r = await call("GET", "/user", { token: R });
        assert.equal(r.status, 200);
        assert.ok(r.data.every((u) => u.password === undefined));
    });
    await check("alice cannot delete bob's account", async () => {
        assert.equal((await call("DELETE", "/user/2", { token: A })).status, 403);
        assert.equal(db.users[1].deleted, false);
    });
    await check("alice cannot delete bob's order", async () => {
        const r = await call("DELETE", "/trader/order", { token: A, body: { id: 20 } });
        assert.equal(r.status, 404);
        assert.ok(db.orders.some((o) => o.id === 20));
    });
    await check("alice can delete her own order", async () => {
        const r = await call("DELETE", "/trader/order", { token: A, body: { id: 10 } });
        assert.equal(r.status, 200);
    });
    await check("admin routes: 401 anonymous, 403 for normal users", async () => {
        assert.equal((await call("DELETE", "/admin/table/portfolio")).status, 401);
        assert.equal((await call("DELETE", "/admin/table/portfolio", { token: A })).status, 403);
        assert.equal((await call("GET", "/admin/logs", { token: A })).status, 403);
    });
    await check("generic table routes are admin-only", async () => {
        assert.equal((await call("GET", "/trading_order")).status, 401);
        assert.equal((await call("POST", "/trading_order", { token: A, body: { tableName: "users", row: { username: "x", admin: true } } })).status, 403);
    });
    await check("public data stays public (bank info, no token)", async () => {
        assert.equal((await call("GET", "/bank")).status, 200);
    });
    await check("register: short password rejected, valid one returns token", async () => {
        assert.equal((await call("POST", "/register", { body: { username: "carol", email: "carol@example.com", password: "123" } })).status, 400);
        const r = await call("POST", "/register", { body: { username: "carol", email: "carol@example.com", password: "carolpass1" } });
        assert.equal(r.status, 201);
        assert.ok(r.data.token);
        assert.equal((await call("GET", "/portfolio", { token: r.data.token })).status, 200);
    });
    await check("duplicate username → 409", async () => {
        assert.equal((await call("POST", "/register", { body: { username: "alice", email: "alice2@example.com", password: "whatever12" } })).status, 409);
    });
    await check("deleting your account invalidates your token immediately", async () => {
        const bob = await call("POST", "/login", { body: { username: "bob", password: "bobpass123" } });
        assert.equal((await call("DELETE", "/user/2", { token: bob.data.token })).status, 200);
        assert.equal((await call("GET", "/portfolio", { token: bob.data.token })).status, 401);
    });
    await check("CORS allows the configured site and refuses others", async () => {
        const ok = await fetch(base + "/bank", { headers: { Origin: "https://keyappui.vercel.app" } });
        const bad = await fetch(base + "/bank", { headers: { Origin: "https://evil.example" } });
        assert.equal(ok.headers.get("access-control-allow-origin"), "https://keyappui.vercel.app");
        assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
        assert.equal(bad.headers.get("access-control-allow-origin"), null);
    });

    server.close();
    for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? "\n      " + e : ""}`);
    const failed = results.filter((r) => r[0] === "FAIL").length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})();

/**
 * Email registration / verification / reset — integration test against a
 * REAL Postgres database. It recreates the tables, so it only runs when the
 * database name contains "test":
 *
 *   PG_DB_HOST=localhost PG_DB_PORT=5432 PG_DB_USER=postgres PG_DB_PASS=… \
 *   PG_DB_NAME=keyapp_test node test/email-auth.test.js
 *
 * Without PG_DB_NAME it is skipped (so `npm test` works anywhere).
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

if (!process.env.PG_DB_NAME || !/test/i.test(process.env.PG_DB_NAME)) {
    console.log("email-auth test skipped (set PG_DB_NAME to a database whose name contains 'test')");
    process.exit(0);
}
delete process.env.DATABASE_URL; // always the local test database
process.env.JWT_SECRET = "test-secret-".padEnd(64, "y");
process.env.SESSION_SECRET_KEY = "test-session";
process.env.CORS_ORIGIN = "http://localhost:9000";
process.env.APP_URL = "https://app.example";
process.env.MAIL_CAPTURE = "true";
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";

const pool = require("../config/pool");
const { migrate } = require("../config/migrate");
const { outbox } = require("../services/mail/mailer");

const results = [];
async function check(name, fn) {
    try { await fn(); results.push(["PASS", name]); }
    catch (e) { results.push(["FAIL", name, e.stack.split("\n").slice(0, 2).join(" ")]); }
}

(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, "schema.test.sql"), "utf8"));
    const applied = await migrate({ log: () => {} });
    const again = await migrate({ log: () => {} });

    const express = require("express");
    const app = express();
    require("../config/express")(express, app);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, url, { token, body } = {}) => {
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        let data = null;
        try { data = await res.json(); } catch { /* empty */ }
        return { status: res.status, data };
    };
    const lastMailTo = (to) => [...outbox].reverse().find((m) => m.to === to);
    const linkToken = (mail) => new URL(mail.text.match(/https:\/\/app\.example\S+/)[0]).searchParams.get("token");

    await check("migration applies once and is then up to date", async () => {
        assert.deepEqual(applied, ["001_email_auth.sql"]);
        assert.deepEqual(again, []);
    });

    await check("register rejects missing email, '@' in username and short password", async () => {
        assert.equal((await call("POST", "/register", { body: { username: "alice", password: "alicepass1" } })).data.code, "INVALID_EMAIL");
        assert.equal((await call("POST", "/register", { body: { username: "a@b", email: "a@b.co", password: "alicepass1" } })).data.code, "INVALID_USERNAME");
        assert.equal((await call("POST", "/register", { body: { username: "alice", email: "a@b.co", password: "short" } })).data.code, "INVALID_PASSWORD");
    });

    let alice;
    await check("register creates account + portfolio, returns token and sends verification", async () => {
        const r = await call("POST", "/register", { body: { username: "alice", email: "Alice@Example.com", password: "alicepass1" } });
        assert.equal(r.status, 201);
        assert.ok(r.data.token);
        assert.equal(r.data.user.email, "alice@example.com", "email stored lower-case");
        assert.equal(r.data.user.emailVerified, false);
        assert.equal(r.data.emailSent, true);
        alice = r.data;
        const mail = lastMailTo("alice@example.com");
        assert.match(mail.subject, /Confirm your email/);
        assert.ok(linkToken(mail));
        const pf = await pool.query("SELECT stable_amount, fiat_amount FROM portfolio WHERE uid = $1", [alice.user.uid]);
        assert.equal(Number(pf.rows[0].fiat_amount), 10000);
    });

    await check("duplicate email (any case) and duplicate username are refused", async () => {
        assert.equal((await call("POST", "/register", { body: { username: "alice2", email: "ALICE@example.com", password: "whatever12" } })).data.code, "EMAIL_TAKEN");
        assert.equal((await call("POST", "/register", { body: { username: "alice", email: "x@example.com", password: "whatever12" } })).data.code, "USERNAME_TAKEN");
    });

    await check("only a hash of the email link token is stored", async () => {
        const raw = linkToken(lastMailTo("alice@example.com"));
        const { rows } = await pool.query("SELECT token_hash FROM auth_tokens");
        assert.ok(rows.length && rows.every((r) => r.token_hash !== raw && r.token_hash.length === 64));
    });

    await check("login works with email (any case) and with username; wrong password is generic", async () => {
        assert.equal((await call("POST", "/login", { body: { username: "ALICE@EXAMPLE.COM", password: "alicepass1" } })).status, 200);
        assert.equal((await call("POST", "/login", { body: { username: "alice", password: "alicepass1" } })).status, 200);
        const bad = await call("POST", "/login", { body: { username: "alice@example.com", password: "nope-nope" } });
        const unknown = await call("POST", "/login", { body: { username: "ghost@example.com", password: "nope-nope" } });
        assert.equal(bad.status, 401);
        assert.equal(bad.data.message, unknown.data.message);
    });

    await check("verify link confirms the email once; reusing it fails", async () => {
        const token = linkToken(lastMailTo("alice@example.com"));
        const r = await call("POST", "/verify-email", { body: { token } });
        assert.equal(r.status, 200);
        assert.equal(r.data.user.emailVerified, true);
        assert.equal((await call("POST", "/verify-email", { body: { token } })).data.code, "INVALID_TOKEN");
        assert.equal((await call("GET", "/me", { token: alice.token })).data.user.emailVerified, true);
    });

    await check("forgot-password answers the same for unknown emails and sends nothing", async () => {
        const before = outbox.length;
        const unknown = await call("POST", "/forgot-password", { body: { email: "nobody@example.com" } });
        assert.equal(unknown.status, 200);
        assert.equal(outbox.length, before);
        const known = await call("POST", "/forgot-password", { body: { email: "alice@example.com" } });
        assert.equal(known.data.message, unknown.data.message);
        assert.match(lastMailTo("alice@example.com").subject, /Reset your Key App password/);
    });

    await check("reset: new password works, old one and old sessions stop working, link is single-use", async () => {
        const token = linkToken(lastMailTo("alice@example.com"));
        assert.equal((await call("POST", "/reset-password", { body: { token, password: "short" } })).data.code, "INVALID_PASSWORD");
        assert.equal((await call("POST", "/reset-password", { body: { token, password: "brandnewpass1" } })).status, 200);
        assert.equal((await call("GET", "/me", { token: alice.token })).status, 401, "old token revoked");
        assert.equal((await call("POST", "/login", { body: { username: "alice", password: "alicepass1" } })).status, 401);
        assert.equal((await call("POST", "/login", { body: { username: "alice", password: "brandnewpass1" } })).status, 200);
        assert.equal((await call("POST", "/reset-password", { body: { token, password: "another-pass1" } })).data.code, "INVALID_TOKEN");
        assert.match(lastMailTo("alice@example.com").subject, /password was changed/);
    });

    await check("an older reset link is invalidated when a newer one is requested", async () => {
        await call("POST", "/forgot-password", { body: { email: "alice@example.com" } });
        const first = linkToken(lastMailTo("alice@example.com"));
        await call("POST", "/forgot-password", { body: { email: "alice@example.com" } });
        assert.equal((await call("POST", "/reset-password", { body: { token: first, password: "zzzzzzzz1" } })).data.code, "INVALID_TOKEN");
    });

    let session;
    await check("change email needs the current password; a link for the old address can't verify the new one", async () => {
        session = (await call("POST", "/login", { body: { username: "alice", password: "brandnewpass1" } })).data;
        assert.equal((await call("PUT", "/me/email", { token: session.token, body: { email: "new@example.com", password: "wrong-pass" } })).status, 403);
        // a verification link for the CURRENT address, issued before the change…
        await pool.query("UPDATE users SET email_verified = FALSE WHERE username = 'alice'");
        await call("POST", "/resend-verification", { token: session.token });
        const oldLink = linkToken(lastMailTo("alice@example.com"));
        const r = await call("PUT", "/me/email", { token: session.token, body: { email: "New@Example.com", password: "brandnewpass1" } });
        assert.equal(r.status, 200);
        assert.equal(r.data.user.email, "new@example.com");
        assert.equal(r.data.user.emailVerified, false);
        // …must not mark the new address as verified
        assert.equal((await call("POST", "/verify-email", { body: { token: oldLink } })).data.code, "INVALID_TOKEN");
        assert.equal((await call("POST", "/verify-email", { body: { token: linkToken(lastMailTo("new@example.com")) } })).status, 200);
    });

    await check("change password returns a working token and revokes the old one", async () => {
        assert.equal((await call("PUT", "/me/password", { token: session.token, body: { currentPassword: "nope", newPassword: "x" } })).status, 403);
        const r = await call("PUT", "/me/password", { token: session.token, body: { currentPassword: "brandnewpass1", newPassword: "finalpass123" } });
        assert.equal(r.status, 200);
        assert.equal((await call("GET", "/me", { token: r.data.token })).status, 200);
        assert.equal((await call("GET", "/me", { token: session.token })).status, 401);
        session = r.data;
    });

    await check("emails go out in Bulgarian for Bulgarian users", async () => {
        await call("POST", "/register", { body: { username: "ivan", email: "ivan@example.bg", password: "ivanpass12", locale: "bg-BG" } });
        assert.match(lastMailTo("ivan@example.bg").subject, /Потвърдете имейла/);
    });

    await check("credential tables never get generic table routes, even for admins", async () => {
        await pool.query("UPDATE users SET admin = TRUE WHERE username = 'alice'");
        const admin = (await call("POST", "/login", { body: { username: "alice", password: "finalpass123" } })).data;
        assert.equal((await call("GET", "/auth_tokens", { token: admin.token })).status, 404);
        assert.equal((await call("GET", "/schema_migrations", { token: admin.token })).status, 404);
    });

    await check("unknown API routes and bad JSON return JSON errors", async () => {
        const nf = await call("GET", "/does-not-exist");
        assert.equal(nf.status, 404);
        assert.equal(nf.data.code, "NOT_FOUND");
        const res = await fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).code, "BAD_JSON");
    });

    server.close();
    await pool.end();
    for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? "\n      " + e : ""}`);
    const failed = results.filter((r) => r[0] === "FAIL").length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

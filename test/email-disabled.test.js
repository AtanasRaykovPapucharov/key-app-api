/**
 * Accounts without email: server has NO SMTP settings. Real Postgres test;
 * runs only against a database whose name contains "test" (see email-auth.test.js).
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

if (!process.env.PG_DB_NAME || !/test/i.test(process.env.PG_DB_NAME)) {
    console.log("email-disabled test skipped (set PG_DB_NAME to a database whose name contains 'test')");
    process.exit(0);
}
delete process.env.DATABASE_URL;
delete process.env.SMTP_HOST;
delete process.env.MAIL_CAPTURE;
process.env.REQUIRE_EMAIL_VERIFICATION = "true"; // must NOT lock anyone out without SMTP
process.env.JWT_SECRET = "test-secret-".padEnd(64, "z");
process.env.SESSION_SECRET_KEY = "test-session";
process.env.CORS_ORIGIN = "http://localhost:9000";
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";

// Capture console output to prove no email is printed
const printed = [];
const origLog = console.log;
console.log = (...a) => { printed.push(a.join(" ")); };

const pool = require("../config/pool");
const { migrate } = require("../config/migrate");

const results = [];
async function check(name, fn) {
    try { await fn(); results.push(["PASS", name]); }
    catch (e) { results.push(["FAIL", name, e.stack.split("\n").slice(0, 2).join(" ")]); }
}

(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, "schema.test.sql"), "utf8"));
    await migrate({ log: () => {} });
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

    await check("GET /config reports email disabled (so the client hides email features)", async () => {
        const r = await call("GET", "/config");
        assert.equal(r.status, 200);
        assert.deepEqual(r.data, { emailEnabled: false, emailVerificationRequired: false });
    });

    let noEmail;
    await check("register WITHOUT an email works and logs the user in", async () => {
        const r = await call("POST", "/register", { body: { username: "plain", password: "plainpass1" } });
        assert.equal(r.status, 201);
        assert.ok(r.data.token);
        assert.equal(r.data.user.email, null);
        noEmail = r.data;
        assert.equal((await call("GET", "/me", { token: noEmail.token })).status, 200);
    });

    await check("register WITH an email works too; the email is saved for later", async () => {
        const r = await call("POST", "/register", { body: { username: "withmail", email: "With@Mail.com", password: "withpass12" } });
        assert.equal(r.status, 201);
        assert.ok(r.data.token, "logged in even though verification is 'required' — no SMTP");
        assert.equal(r.data.user.email, "with@mail.com");
        assert.equal(r.data.emailSent, false);
    });

    await check("an invalid or duplicate email is still refused", async () => {
        assert.equal((await call("POST", "/register", { body: { username: "bad1", email: "not-an-email", password: "badpass123" } })).data.code, "INVALID_EMAIL");
        assert.equal((await call("POST", "/register", { body: { username: "bad2", email: "WITH@mail.com", password: "badpass123" } })).data.code, "EMAIL_TAKEN");
    });

    await check("login with username and with email works (verification not enforced)", async () => {
        assert.equal((await call("POST", "/login", { body: { username: "plain", password: "plainpass1" } })).status, 200);
        assert.equal((await call("POST", "/login", { body: { username: "with@mail.com", password: "withpass12" } })).status, 200);
    });

    await check("forgot-password and resend answer EMAIL_DISABLED", async () => {
        const f = await call("POST", "/forgot-password", { body: { email: "with@mail.com" } });
        assert.equal(f.status, 503);
        assert.equal(f.data.code, "EMAIL_DISABLED");
        assert.equal((await call("POST", "/resend-verification", { token: noEmail.token })).data.code, "EMAIL_DISABLED");
        assert.equal((await call("POST", "/resend-verification-public", { body: { email: "with@mail.com" } })).data.code, "EMAIL_DISABLED");
    });

    await check("adding an email and changing the password still work", async () => {
        const e = await call("PUT", "/me/email", { token: noEmail.token, body: { email: "plain@example.com", password: "plainpass1" } });
        assert.equal(e.status, 200);
        assert.equal(e.data.user.email, "plain@example.com");
        const p = await call("PUT", "/me/password", { token: noEmail.token, body: { currentPassword: "plainpass1", newPassword: "plainpass2" } });
        assert.equal(p.status, 200);
        assert.equal((await call("POST", "/login", { body: { username: "plain", password: "plainpass2" } })).status, 200);
    });

    await check("no email link tokens were created and nothing email-like was printed", async () => {
        const { rows } = await pool.query("SELECT count(*)::int n FROM auth_tokens");
        assert.equal(rows[0].n, 0);
        assert.ok(!printed.some((l) => /\[mail:dev\]|Subject:|token=/.test(l)), printed.join("\n"));
        assert.ok(printed.some((l) => /\[mail\] email disabled/.test(l)));
    });

    server.close();
    await pool.end();
    console.log = origLog;
    for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? "\n      " + e : ""}`);
    const failed = results.filter((r) => r[0] === "FAIL").length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((err) => { console.log = origLog; console.error(err); process.exit(1); });

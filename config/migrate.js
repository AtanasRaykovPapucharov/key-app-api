/**
 * Minimal SQL migration runner.
 *
 * Runs every migrations/NNN_name.sql file that hasn't been applied yet, in
 * name order, each in its own transaction, and records it in
 * schema_migrations.
 *
 * Concurrency: each migration takes a TRANSACTION-scoped advisory lock
 * (pg_advisory_xact_lock). Unlike session locks, it is released by COMMIT /
 * ROLLBACK on the same connection, so it also works through connection
 * poolers in transaction mode (Neon's "-pooler" URLs, PgBouncer), where a
 * session lock can be taken on one server connection and "released" on
 * another — leaving it held and making the next start wait forever.
 * lock_timeout guarantees startup never hangs indefinitely.
 *
 * Runs automatically at server start; `npm run migrate` runs it on demand.
 */
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const DIR = path.join(__dirname, "..", "migrations");
// New key (the first version used a session lock under another key that a
// pooler may have left held; this key is never blocked by it)
const LOCK_KEY = 74_201_456;
const LOCK_TIMEOUT = process.env.MIGRATION_LOCK_TIMEOUT || "60s";

const status = { applied: [], pending: [], error: null, finishedAt: null };

async function ensureTable(client) {
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name       TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
    } catch (err) {
        // Two instances creating it at the same moment: the other one won
        if (!["23505", "42P07"].includes(err.code)) throw err;
    }
}

async function migrate({ log = console.log } = {}) {
    const files = fs.existsSync(DIR)
        ? fs.readdirSync(DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
        : [];

    const client = await pool.connect();
    const applied = [];
    try {
        await ensureTable(client);
        for (const file of files) {
            await client.query("BEGIN");
            try {
                await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT.replace(/'/g, "")}'`);
                await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
                // Re-check under the lock: another instance may have just applied it
                const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
                if (done.rowCount) {
                    await client.query("COMMIT");
                    continue;
                }
                await client.query(fs.readFileSync(path.join(DIR, file), "utf8"));
                await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
                await client.query("COMMIT");
                applied.push(file);
                log(`[migrate] applied ${file}`);
            } catch (err) {
                await client.query("ROLLBACK").catch(() => {});
                err.message = `[migrate] ${file} failed: ${err.message}`;
                throw err;
            }
        }
        if (!applied.length) log("[migrate] database is up to date");
        status.applied = applied;
        status.error = null;
        return applied;
    } catch (err) {
        status.error = err.message;
        throw err;
    } finally {
        status.finishedAt = new Date().toISOString();
        client.release();
    }
}

module.exports = { migrate, migrationStatus: () => ({ ...status }) };

if (require.main === module) {
    migrate()
        .then(() => pool.end())
        .catch((err) => {
            console.error(err.message);
            process.exit(1);
        });
}

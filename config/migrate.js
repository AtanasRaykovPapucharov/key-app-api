/**
 * Minimal SQL migration runner.
 *
 * Runs every migrations/NNN_name.sql file that hasn't been applied yet, in
 * name order, each in its own transaction, and records it in
 * schema_migrations. A Postgres advisory lock makes concurrent server
 * instances wait for each other instead of applying a migration twice.
 *
 * Runs automatically at server start; `npm run migrate` runs it on demand.
 */
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const DIR = path.join(__dirname, "..", "migrations");
const LOCK_KEY = 74_201_455; // arbitrary, unique to this app

async function migrate({ log = console.log } = {}) {
    const files = fs.existsSync(DIR)
        ? fs.readdirSync(DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
        : [];

    const client = await pool.connect();
    try {
        await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name       TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
        const { rows } = await client.query("SELECT name FROM schema_migrations");
        const done = new Set(rows.map((r) => r.name));

        const applied = [];
        for (const file of files) {
            if (done.has(file)) continue;
            const sql = fs.readFileSync(path.join(DIR, file), "utf8");
            try {
                await client.query("BEGIN");
                await client.query(sql);
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
        return applied;
    } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
        client.release();
    }
}

module.exports = { migrate };

if (require.main === module) {
    migrate()
        .then(() => pool.end())
        .catch((err) => {
            console.error(err.message);
            process.exit(1);
        });
}

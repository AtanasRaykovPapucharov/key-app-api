/**
 * The single database pool used by the whole API.
 *
 * Chosen by configuration, not by NODE_ENV:
 *   - DATABASE_URL set   → Neon / any hosted Postgres (connection string, SSL)
 *   - DATABASE_URL empty → local Postgres from PG_DB_* variables
 *
 * For local development, leave DATABASE_URL out of your .env (or comment it).
 * Everything must import the pool from here (or via services/db.js) so that
 * login, the token check and the WebSocket always talk to the same database.
 */
require("dotenv").config();

const useHosted = Boolean(process.env.DATABASE_URL);

if (!useHosted && !process.env.PG_DB_HOST) {
    console.warn(
        "[db] Neither DATABASE_URL nor PG_DB_HOST is set — " +
            "falling back to a local Postgres on localhost.",
    );
}

// Only the selected module is loaded, so only one pool is ever created
const pool = useHosted ? require("./neon.js") : require("./postgre.js");

console.log(`[db] using ${useHosted ? "DATABASE_URL (hosted)" : "local PG_DB_* settings"}`);

module.exports = pool;

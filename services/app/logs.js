const { pool } = require("../db");

async function insertLog({
    level,
    message,
    method,
    path,
    status_code,
    response_time_ms,
    ip,
    user_id,
    meta,
}) {
    await pool.query(
        `INSERT INTO public.logs
            (level, message, method, path, status_code, response_time_ms, ip, user_id, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            level,
            message ?? null,
            method ?? null,
            path ?? null,
            status_code ?? null,
            response_time_ms ?? null,
            ip ?? null,
            user_id ?? null,
            meta ? JSON.stringify(meta) : null,
        ],
    );
}

async function getRecentLogs({ limit = 100, level } = {}) {
    const { rows } = await pool.query(
        `SELECT * FROM public.logs
         WHERE ($1::text IS NULL OR level = $1)
         ORDER BY created_at DESC
         LIMIT $2`,
        [level ?? null, limit],
    );
    return rows;
}

module.exports = { insertLog, getRecentLogs };

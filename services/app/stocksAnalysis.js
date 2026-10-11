const { pool } = require("../db");
async function getAll(uid) {
    const { rows } = await pool.query(
        `SELECT *
         FROM public.stocks_analysis
         WHERE uid = $1::uuid
         ORDER BY datetime_update DESC NULLS LAST, gid DESC`,
        [uid],
    );
    return rows;
}

async function upsert({
    symbol,
    company_name,
    year_founded,
    total_points,
    test,
    uid,
}) {
    const existing = await pool.query(
        `SELECT gid
         FROM public.stocks_analysis
         WHERE symbol = $1 AND uid = $2::uuid
         ORDER BY gid DESC
         LIMIT 1`,
        [symbol, uid],
    );

    if (existing.rows[0]) {
        const { rows } = await pool.query(
            `UPDATE public.stocks_analysis
             SET datetime_update = CURRENT_TIMESTAMP,
                 company_name = $2,
                 year_founded = $3,
                 total_points = $4,
                 test = $5::jsonb
             WHERE gid = $1
             RETURNING *`,
            [
                existing.rows[0].gid,
                company_name ?? null,
                year_founded ?? null,
                total_points ?? 0,
                JSON.stringify(test ?? null),
            ],
        );
        return rows[0];
    }

    const { rows } = await pool.query(
        `INSERT INTO public.stocks_analysis
            (datetime_insert, symbol, company_name, year_founded, total_points, test, uid)
         VALUES (CURRENT_TIMESTAMP, $1, $2, $3, $4, $5::jsonb, $6::uuid)
         RETURNING *`,
        [
            symbol,
            company_name ?? null,
            year_founded ?? null,
            total_points ?? 0,
            JSON.stringify(test ?? null),
            uid,
        ],
    );
    return rows[0];
}

module.exports = { getAll, upsert };

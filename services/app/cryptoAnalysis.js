const { pool } = require("../db");

async function getAll() {
    const { rows } = await pool.query("SELECT * FROM public.crypto_analysis");
    return rows;
}

async function upsert({
    crypto_id,
    project_name,
    project_year,
    total_points,
    test,
    uid,
}) {
    const { rows } = await pool.query(
        `INSERT INTO public.crypto_analysis
            (crypto_id, project_name, project_year, total_points, test, uid)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::uuid)
         ON CONFLICT (crypto_id)
         DO UPDATE SET
            datetime_update = CURRENT_TIMESTAMP,
            project_name = EXCLUDED.project_name,
            project_year = EXCLUDED.project_year,
            total_points = EXCLUDED.total_points,
            test = EXCLUDED.test,
            uid = EXCLUDED.uid
         RETURNING *`,
        [
            crypto_id,
            project_name ?? null,
            project_year ?? null,
            total_points ?? 0,
            JSON.stringify(test ?? null),
            uid,
        ],
    );
    return rows[0];
}

async function removeByCryptoId(crypto_id) {
    const { rows } = await pool.query(
        "DELETE FROM public.crypto_analysis WHERE crypto_id = $1 RETURNING *",
        [crypto_id],
    );
    return rows[0] ?? null;
}

module.exports = { getAll, upsert, removeByCryptoId };

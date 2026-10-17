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
    admin = false,
}) {
    // A coin has one shared analysis. The author keeps ownership: others
    // (except admins) can't overwrite it. The WHERE on DO UPDATE makes the
    // statement return no row when the caller isn't allowed to update.
    const { rows } = await pool.query(
        `INSERT INTO public.crypto_analysis AS ca
            (crypto_id, project_name, project_year, total_points, test, uid)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::uuid)
         ON CONFLICT (crypto_id)
         DO UPDATE SET
            datetime_update = CURRENT_TIMESTAMP,
            project_name = EXCLUDED.project_name,
            project_year = EXCLUDED.project_year,
            total_points = EXCLUDED.total_points,
            test = EXCLUDED.test
         WHERE ca.uid = EXCLUDED.uid OR $7::boolean
         RETURNING *`,
        [
            crypto_id,
            project_name ?? null,
            project_year ?? null,
            total_points ?? 0,
            JSON.stringify(test ?? null),
            uid,
            !!admin,
        ],
    );
    return rows[0] ?? null;
}

async function removeByCryptoId(crypto_id, { uid, admin = false } = {}) {
    const { rows } = await pool.query(
        `DELETE FROM public.crypto_analysis
          WHERE crypto_id = $1 AND ($3::boolean OR uid = $2::uuid)
          RETURNING *`,
        [crypto_id, uid ?? null, !!admin],
    );
    return rows[0] ?? null;
}

module.exports = { getAll, upsert, removeByCryptoId };

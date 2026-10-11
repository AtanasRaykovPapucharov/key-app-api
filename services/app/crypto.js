const { pool } = require("../db");

// ── READ ──────────────────────────────────────────────────────────────────────

async function getAll() {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto ORDER BY no",
    );
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

async function create({
    name,
    short_descr,
    long_descr,
    year,
    trading,
    staking,
    earning,
    all_time_high,
    all_time_low,
}) {
    const { rows } = await pool.query(
        `INSERT INTO public.crypto
       (name, short_descr, long_descr, year,
        trading, staking, earning,
        all_time_high, all_time_low)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
        [
            name,
            short_descr ?? null,
            long_descr ?? null,
            year ?? null,
            trading ?? false,
            staking ?? false,
            earning ?? false,
            all_time_high ?? null,
            all_time_low ?? null,
        ],
    );
    return rows[0];
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

async function update(
    id,
    {
        name,
        short_descr,
        long_descr,
        year,
        trading,
        staking,
        earning,
        all_time_high,
        all_time_low,
    },
) {
    const { rows } = await pool.query(
        `UPDATE public.crypto
     SET name          = COALESCE($1,  name),
         short_descr   = COALESCE($2,  short_descr),
         long_descr    = COALESCE($3,  long_descr),
         year          = COALESCE($4,  year),
         trading       = COALESCE($5,  trading),
         staking       = COALESCE($6,  staking),
         earning       = COALESCE($7,  earning),
         all_time_high = COALESCE($8,  all_time_high),
         all_time_low  = COALESCE($9,  all_time_low)
     WHERE id = $10
     RETURNING *`,
        [
            name,
            short_descr,
            long_descr,
            year,
            trading,
            staking,
            earning,
            all_time_high,
            all_time_low,
            id,
        ],
    );
    return rows[0] ?? null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function remove(id) {
    const { rows } = await pool.query(
        "DELETE FROM public.crypto WHERE id = $1 RETURNING *",
        [id],
    );
    return rows[0] ?? null;
}

module.exports = { getAll, getById, create, update, remove };

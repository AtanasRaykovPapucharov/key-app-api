const { pool } = require("../db");

// ── READ ──────────────────────────────────────────────────────────────────────

async function getAll() {
    const { rows } = await pool.query("SELECT * FROM public.bank ORDER BY id");
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(
        "SELECT * FROM public.bank WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

async function create({ fee, fee_accumulated }) {
    const { rows } = await pool.query(
        `INSERT INTO public.bank (fee, fee_accumulated)
     VALUES ($1, $2)
     RETURNING *`,
        [fee, fee_accumulated ?? 0],
    );
    return rows[0];
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

async function update(id, { fee, fee_accumulated }) {
    const { rows } = await pool.query(
        `UPDATE public.bank
     SET fee             = COALESCE($1, fee),
         fee_accumulated = COALESCE($2, fee_accumulated)
     WHERE id = $3
     RETURNING *`,
        [fee, fee_accumulated, id],
    );
    return rows[0] ?? null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function remove(id) {
    const { rows } = await pool.query(
        "DELETE FROM public.bank WHERE id = $1 RETURNING *",
        [id],
    );
    return rows[0] ?? null;
}

module.exports = { getAll, getById, create, update, remove };

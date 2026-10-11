const { pool } = require("../db");
// ── READ ──────────────────────────────────────────────────────────────────────

async function getAll() {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto_state ORDER BY id",
    );
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto_state WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

async function getByUserId(userId) {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto_state WHERE user_id = $1 ORDER BY dt_insert DESC",
        [userId],
    );
    return rows;
}

async function getByCryptoId(cryptoId) {
    const { rows } = await pool.query(
        "SELECT * FROM public.crypto_state WHERE crypto_id = $1 ORDER BY dt_insert DESC",
        [cryptoId],
    );
    return rows;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

async function create({
    crypto_id,
    buy_price,
    amount,
    user_id,
    dt_insert,
    order_id,
}) {
    const { rows } = await pool.query(
        `INSERT INTO public.crypto_state
       (crypto_id, buy_price, amount, user_id, dt_insert, order_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
        [
            crypto_id,
            buy_price,
            amount,
            user_id,
            dt_insert ?? new Date(),
            order_id ?? null,
        ],
    );
    return rows[0];
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

async function update(id, { crypto_id, buy_price, amount, user_id, order_id }) {
    const { rows } = await pool.query(
        `UPDATE public.crypto_state
     SET crypto_id = COALESCE($1, crypto_id),
         buy_price = COALESCE($2, buy_price),
         amount    = COALESCE($3, amount),
         user_id   = COALESCE($4, user_id),
         order_id  = COALESCE($5, order_id)
     WHERE id = $6
     RETURNING *`,
        [crypto_id, buy_price, amount, user_id, order_id, id],
    );
    return rows[0] ?? null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function remove(id) {
    const { rows } = await pool.query(
        "DELETE FROM public.crypto_state WHERE id = $1 RETURNING *",
        [id],
    );
    return rows[0] ?? null;
}

module.exports = {
    getAll,
    getById,
    getByUserId,
    getByCryptoId,
    create,
    update,
    remove,
};

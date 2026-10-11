const { pool } = require("../db");

async function getAll(uid) {
    const { rows } = await pool.query(
        `
            SELECT bf.*, 
                tr.is_crypto, tr.curr_price, tr.amount AS curr_amount,
                (tr.curr_price * tr.amount) AS curr_usdc
            FROM bank_fee bf
            INNER JOIN trading_order tr ON tr.id = bf.order_id
            INNER JOIN users u ON u.uid = tr.uid
            WHERE u.uid = $1::uuid
            GROUP BY bf.bank_fee_id, tr.is_crypto, tr.curr_price, tr.amount
        `,
        [uid],
    );
    return rows;
}

module.exports = { getAll };

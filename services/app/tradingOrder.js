const { AppError } = require("../errors");
const { pool } = require("../db");

const TRANSACTION_FEE_PERCENT = 0.0095;

// ── READ ──────────────────────────────────────────────────────────────────────

async function getAll() {
    const { rows } = await pool.query(
        "SELECT * FROM public.trading_order ORDER BY id",
    );
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(
        "SELECT * FROM public.trading_order WHERE id = $1",
        [id],
    );
    return rows[0] ?? null;
}

async function getByUserId(userId) {
    const { rows } = await pool.query(
        "SELECT * FROM public.trading_order WHERE user_id = $1 ORDER BY dt_insert DESC",
        [userId],
    );
    return rows;
}

async function getByCryptoId(cryptoId, uid, isTrading = true) {
    const { rows } = await pool.query(
        `
            SELECT *,
				
                CASE
                    WHEN order_type = 'buy' THEN amount
                    WHEN order_type = 'sell' THEN -amount
                    WHEN order_type = 'watch' THEN amount
                    ELSE 0
                END AS amount,
				
                CASE
                    WHEN order_type = 'buy' THEN -(curr_price * amount)
                    WHEN order_type = 'sell' THEN curr_price * amount
                    WHEN order_type = 'watch' THEN curr_price * amount
                    ELSE 0
                END AS total,

                SUM(
                    CASE
                        WHEN order_type = 'buy' THEN -(curr_price * amount)
                        WHEN order_type = 'sell' THEN curr_price * amount
                        WHEN order_type = 'watch' THEN curr_price * amount
                        ELSE 0
                    END
                ) OVER () AS sum_total,

                SUM(
                    CASE
                        WHEN order_type = 'buy' THEN amount
                        WHEN order_type = 'sell' THEN -amount
                        WHEN order_type = 'watch' THEN amount
                        ELSE 0
                    END
                ) OVER () AS sum_amount,

                SUM(
                    CASE
                        WHEN order_type = 'buy' THEN curr_price * amount
                        WHEN order_type = 'sell' THEN -(curr_price * amount)
                        WHEN order_type = 'watch' THEN curr_price * amount
                        ELSE 0
                    END
                ) OVER ()
                /
                NULLIF(
                    SUM(
                        CASE
                            WHEN order_type = 'buy' THEN amount
                            WHEN order_type = 'sell' THEN -amount
                            ELSE 0
                        END
                    ) OVER (),
                    0
                ) AS avg_price

            FROM trading_order
            WHERE is_crypto
                ${isTrading ? "AND order_type IN ('buy', 'sell')" : "AND order_type = 'watch'"}
                AND crypto_id = $1::text
                AND uid = $2::uuid
            ORDER BY dt_insert DESC;
        `,
        [cryptoId, uid],
    );
    return rows;
}

// async function getByCryptoId(cryptoId) {
//     // "SELECT * FROM public.trading_order WHERE crypto_id = $1 ORDER BY dt_insert DESC",
//     const { rows } = await pool.query(
//         "SELECT * FROM public.get_orders_by_crypto($1::text)",
//         [cryptoId],
//     );
//     return rows;
// }

async function getByOrderType(order_type) {
    const { rows } = await pool.query(
        "SELECT * FROM public.trading_order WHERE order_type = $1 ORDER BY dt_insert DESC",
        [order_type],
    );
    return rows;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

async function create({
    order_type,
    is_crypto,
    crypto_id,
    curr_price,
    amount,
    dt_insert,
    uid,
}) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const { rows } = await client.query(
            `INSERT INTO public.trading_order
           (order_type, is_crypto, crypto_id, curr_price, amount, uid)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
            [
                order_type,
                is_crypto ?? true,
                crypto_id ?? null,
                curr_price,
                amount,
                uid,
            ],
        );

        const order = rows[0];

        if (order_type === "buy" || order_type === "sell") {
            const portfolioResult = await client.query(
                `SELECT crypto, stable_amount, fiat_amount
                 FROM public.portfolio
                 WHERE uid = $1::uuid
                 FOR UPDATE`,
                [uid],
            );

            const userPortfolio = portfolioResult.rows[0];
            if (!userPortfolio) {
                throw new AppError(404, "PORTFOLIO_NOT_FOUND", "User portfolio not found");
            }

            const tradeAmount = Number(amount);
            const tradeTotal = Number(curr_price) * tradeAmount;
            const feeRate = TRANSACTION_FEE_PERCENT / 100;
            let feeAmount = tradeTotal * feeRate;
            const cryptoAssets = Array.isArray(userPortfolio.crypto)
                ? userPortfolio.crypto.map((asset) => ({ ...asset }))
                : [];
            const cryptoSymbol = String(crypto_id).toUpperCase();
            const cryptoAsset = cryptoAssets.find(
                (asset) => String(asset.curr).toUpperCase() === cryptoSymbol,
            );

            if (order_type === "buy" && is_crypto === false) {
                const fiatSpent = Number(amount);
                const stableReceived = fiatSpent * Number(curr_price || 1);

                if (Number(userPortfolio.fiat_amount || 0) < fiatSpent) {
                    throw new AppError(400, "INSUFFICIENT_FIAT", "Insufficient fiat balance");
                }

                await client.query(
                    `UPDATE public.portfolio
                     SET fiat_amount = COALESCE(fiat_amount, 0) - $1,
                         stable_amount = COALESCE(stable_amount, 0) + $2
                     WHERE uid = $3::uuid`,
                    [fiatSpent, stableReceived, uid],
                );
            } else if (order_type === "sell" && is_crypto === false) {
                feeAmount = tradeAmount * feeRate;

                if (Number(userPortfolio.stable_amount || 0) < tradeAmount) {
                    throw new AppError(400, "INSUFFICIENT_STABLE", "Insufficient stable balance");
                }

                const fiatReceived = tradeTotal - tradeTotal * feeRate;

                await client.query(
                    `UPDATE public.portfolio
                     SET stable_amount = COALESCE(stable_amount, 0) - $1,
                         fiat_amount = COALESCE(fiat_amount, 0) + $2
                     WHERE uid = $3::uuid`,
                    [tradeAmount, fiatReceived, uid],
                );
            } else if (order_type === "buy") {
                if (
                    Number(userPortfolio.stable_amount) <
                    tradeTotal + feeAmount
                ) {
                    throw new AppError(400, "INSUFFICIENT_STABLE", "Insufficient stable balance");
                }

                if (cryptoAsset) {
                    cryptoAsset.amount =
                        Number(cryptoAsset.amount || 0) + tradeAmount;
                } else {
                    cryptoAssets.push({
                        curr: cryptoSymbol,
                        amount: tradeAmount,
                    });
                }

                const stableChange = -(tradeTotal + feeAmount);
                await client.query(
                    `UPDATE public.portfolio
                     SET crypto = $1::jsonb,
                         stable_amount = COALESCE(stable_amount, 0) + $2
                     WHERE uid = $3::uuid`,
                    [JSON.stringify(cryptoAssets), stableChange, uid],
                );
            } else {
                if (
                    !cryptoAsset ||
                    Number(cryptoAsset.amount || 0) < tradeAmount
                ) {
                    throw new AppError(400, "INSUFFICIENT_CRYPTO", "Insufficient crypto balance");
                }

                cryptoAsset.amount = Number(cryptoAsset.amount) - tradeAmount;
                const stableChange = tradeTotal - feeAmount;
                await client.query(
                    `UPDATE public.portfolio
                     SET crypto = $1::jsonb,
                         stable_amount = COALESCE(stable_amount, 0) + $2
                     WHERE uid = $3::uuid`,
                    [JSON.stringify(cryptoAssets), stableChange, uid],
                );
            }

            await client.query("UPDATE public.bank SET fee = $1 WHERE id = 1", [
                TRANSACTION_FEE_PERCENT,
            ]);

            await client.query(
                `INSERT INTO public.bank_fee
                 (date, order_id, crypto_id, amount)
                 VALUES (CURRENT_DATE, $1, $2, $3)`,
                [order.id, crypto_id, feeAmount],
            );

            await client.query(
                `UPDATE public.bank
                 SET fee_accumulated = fee_accumulated + $1
                 WHERE id = 1`,
                [feeAmount],
            );
        }

        await client.query("COMMIT");
        return order;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

async function update(
    id,
    {
        order_type,
        is_crypto,
        crypto_id,
        curr_price,
        amount,
        average_price,
        user_id,
    },
) {
    const { rows } = await pool.query(
        `UPDATE public.trading_order
     SET order_type    = COALESCE($1, order_type),
         is_crypto     = COALESCE($2, is_crypto),
         crypto_id     = COALESCE($3, crypto_id),
         curr_price    = COALESCE($4, curr_price),
         amount        = COALESCE($5, amount),
         average_price = COALESCE($6, average_price),
         user_id       = COALESCE($7, user_id)
     WHERE id = $8
     RETURNING *`,
        [
            order_type,
            is_crypto,
            crypto_id,
            curr_price,
            amount,
            average_price,
            user_id,
            id,
        ],
    );
    return rows[0] ?? null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────

async function remove(id, uid) {
    const { rows } = await pool.query(
        "DELETE FROM public.trading_order WHERE id = $1 AND uid = $2::uuid RETURNING *",
        [id, uid],
    );
    return rows[0] ?? null;
}

module.exports = {
    getAll,
    getById,
    getByUserId,
    getByCryptoId,
    getByOrderType,
    create,
    update,
    remove,
};

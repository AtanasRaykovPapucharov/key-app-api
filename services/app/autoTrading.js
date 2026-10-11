const { pool } = require("../db");
const logger = require("../../config/logger");
const { getPrice } = require("../binance/binanceService");
const { getByCryptoId, create: createOrder } = require("./tradingOrder");
const { getIndicatorSignal, INDICATOR_TYPES } = require("./indicatorSignals");

const SELL_AMOUNT_TYPES = ["percent", "fixed"];

const normalizeRow = (row) => ({
    id: row.id,
    uid: row.uid,
    crypto_id: row.crypto_id,
    enabled: row.enabled,
    sell_enabled: row.sell_enabled,
    take_profit_percent:
        row.take_profit_percent === null
            ? null
            : Number(row.take_profit_percent),
    sell_amount_type: row.sell_amount_type,
    sell_amount_value:
        row.sell_amount_value === null ? null : Number(row.sell_amount_value),
    buy_enabled: row.buy_enabled,
    buy_drop_percent:
        row.buy_drop_percent === null ? null : Number(row.buy_drop_percent),
    buy_amount_usdc:
        row.buy_amount_usdc === null ? null : Number(row.buy_amount_usdc),
    reference_price:
        row.reference_price === null ? null : Number(row.reference_price),
    indicator_type: row.indicator_type || null,
    indicator_params: row.indicator_params || null,
    last_triggered_at: row.last_triggered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const validatePayload = (payload = {}) => {
    const crypto_id = String(payload.crypto_id ?? "")
        .trim()
        .toUpperCase();
    if (!crypto_id) throw new Error("crypto_id is required");

    const sell_amount_type = String(payload.sell_amount_type ?? "percent");
    if (!SELL_AMOUNT_TYPES.includes(sell_amount_type)) {
        throw new Error("Invalid sell_amount_type: use 'percent' or 'fixed'");
    }

    const sell_enabled = payload.sell_enabled !== false;
    const buy_enabled = payload.buy_enabled !== false;

    const indicator_type = payload.indicator_type
        ? String(payload.indicator_type)
        : null;
    if (indicator_type && !INDICATOR_TYPES.includes(indicator_type)) {
        throw new Error(
            `Invalid indicator_type: use one of ${INDICATOR_TYPES.join(", ")}`,
        );
    }
    const indicator_params =
        indicator_type && payload.indicator_params
            ? payload.indicator_params
            : null;
    const usesPercentTriggers = !indicator_type;

    const take_profit_percent =
        payload.take_profit_percent === null ||
        payload.take_profit_percent === undefined
            ? null
            : Number(payload.take_profit_percent);
    if (
        usesPercentTriggers &&
        sell_enabled &&
        (!Number.isFinite(take_profit_percent) || take_profit_percent <= 0)
    ) {
        throw new Error(
            "take_profit_percent must be a positive number when sell is enabled",
        );
    }

    const sell_amount_value =
        payload.sell_amount_value === null ||
        payload.sell_amount_value === undefined
            ? null
            : Number(payload.sell_amount_value);
    if (
        sell_enabled &&
        (!Number.isFinite(sell_amount_value) || sell_amount_value <= 0)
    ) {
        throw new Error(
            "sell_amount_value must be a positive number when sell is enabled",
        );
    }
    if (
        sell_enabled &&
        sell_amount_type === "percent" &&
        sell_amount_value > 100
    ) {
        throw new Error(
            "sell_amount_value cannot exceed 100 when sell_amount_type is 'percent'",
        );
    }

    const buy_drop_percent =
        payload.buy_drop_percent === null ||
        payload.buy_drop_percent === undefined
            ? null
            : Number(payload.buy_drop_percent);
    if (
        usesPercentTriggers &&
        buy_enabled &&
        (!Number.isFinite(buy_drop_percent) || buy_drop_percent <= 0)
    ) {
        throw new Error(
            "buy_drop_percent must be a positive number when buy is enabled",
        );
    }

    const buy_amount_usdc =
        payload.buy_amount_usdc === null ||
        payload.buy_amount_usdc === undefined
            ? null
            : Number(payload.buy_amount_usdc);
    if (
        buy_enabled &&
        (!Number.isFinite(buy_amount_usdc) || buy_amount_usdc <= 0)
    ) {
        throw new Error(
            "buy_amount_usdc must be a positive number when buy is enabled",
        );
    }

    return {
        crypto_id,
        enabled: payload.enabled !== false,
        sell_enabled,
        take_profit_percent,
        sell_amount_type,
        sell_amount_value,
        buy_enabled,
        buy_drop_percent,
        buy_amount_usdc,
        indicator_type,
        indicator_params,
    };
};

async function listByUser(uid) {
    const { rows } = await pool.query(
        `SELECT * FROM public.auto_trading_rules
         WHERE uid = $1::uuid
         ORDER BY created_at DESC, id DESC`,
        [uid],
    );
    return rows.map(normalizeRow);
}

async function create(uid, payload) {
    const v = validatePayload(payload);

    // reference_price anchors the drop% calculation for buy triggers
    let referencePrice = null;
    if (v.buy_enabled) {
        const ticker = await getPrice(`${v.crypto_id}USDC`);
        referencePrice = Number(ticker.price);
    }

    const { rows } = await pool.query(
        `INSERT INTO public.auto_trading_rules (
            uid, crypto_id, enabled, sell_enabled, take_profit_percent,
            sell_amount_type, sell_amount_value, buy_enabled, buy_drop_percent,
            buy_amount_usdc, reference_price, indicator_type, indicator_params
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
            uid,
            v.crypto_id,
            v.enabled,
            v.sell_enabled,
            v.take_profit_percent,
            v.sell_amount_type,
            v.sell_amount_value,
            v.buy_enabled,
            v.buy_drop_percent,
            v.buy_amount_usdc,
            referencePrice,
            v.indicator_type,
            v.indicator_params ? JSON.stringify(v.indicator_params) : null,
        ],
    );
    return normalizeRow(rows[0]);
}

async function update(id, uid, payload) {
    const v = validatePayload(payload);

    const { rows } = await pool.query(
        `UPDATE public.auto_trading_rules
         SET crypto_id = $1,
             enabled = $2,
             sell_enabled = $3,
             take_profit_percent = $4,
             sell_amount_type = $5,
             sell_amount_value = $6,
             buy_enabled = $7,
             buy_drop_percent = $8,
             buy_amount_usdc = $9,
             indicator_type = $10,
             indicator_params = $11,
             updated_at = NOW()
         WHERE id = $12 AND uid = $13::uuid
         RETURNING *`,
        [
            v.crypto_id,
            v.enabled,
            v.sell_enabled,
            v.take_profit_percent,
            v.sell_amount_type,
            v.sell_amount_value,
            v.buy_enabled,
            v.buy_drop_percent,
            v.buy_amount_usdc,
            v.indicator_type,
            v.indicator_params ? JSON.stringify(v.indicator_params) : null,
            id,
            uid,
        ],
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function remove(id, uid) {
    const { rows } = await pool.query(
        `DELETE FROM public.auto_trading_rules
         WHERE id = $1 AND uid = $2::uuid
         RETURNING id`,
        [id, uid],
    );
    return rows[0]?.id ?? null;
}

// Evaluates every enabled rule against the live price and places orders when triggered
async function evaluateAndExecuteAll() {
    const { rows } = await pool.query(
        `SELECT * FROM public.auto_trading_rules WHERE enabled = true`,
    );

    for (const raw of rows) {
        const rule = normalizeRow(raw);
        try {
            await evaluateRule(rule);
        } catch (err) {
            logger.error(
                { err, ruleId: rule.id },
                "Auto-trading rule evaluation failed",
            );
        }
    }
}

async function evaluateRule(rule) {
    const ticker = await getPrice(`${rule.crypto_id}USDC`);
    const currentPrice = Number(ticker.price);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    const holdings = await getByCryptoId(rule.crypto_id, rule.uid, true);
    const heldAmount = Number(holdings[0]?.sum_amount ?? 0);
    const avgBuyPrice = Number(holdings[0]?.avg_price ?? 0);

    if (rule.indicator_type) {
        await evaluateIndicatorRule(rule, currentPrice, heldAmount);
        return;
    }

    await evaluatePercentRule(rule, currentPrice, heldAmount, avgBuyPrice);
}

// Take-profit sell (% above avg buy price) and drop-percent buy (% below a rolling reference high)
async function evaluatePercentRule(
    rule,
    currentPrice,
    heldAmount,
    avgBuyPrice,
) {
    if (
        rule.sell_enabled &&
        heldAmount > 0 &&
        avgBuyPrice > 0 &&
        rule.take_profit_percent != null
    ) {
        const profitPercent =
            ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
        if (profitPercent >= rule.take_profit_percent) {
            const sellAmount =
                rule.sell_amount_type === "percent"
                    ? heldAmount * (rule.sell_amount_value / 100)
                    : Math.min(rule.sell_amount_value, heldAmount);

            if (sellAmount > 0) {
                await createOrder({
                    order_type: "sell",
                    is_crypto: true,
                    crypto_id: rule.crypto_id,
                    curr_price: currentPrice,
                    amount: sellAmount,
                    uid: rule.uid,
                });
                await markTriggered(rule.id);
                logger.info(
                    {
                        ruleId: rule.id,
                        crypto_id: rule.crypto_id,
                        sellAmount,
                        profitPercent,
                    },
                    "Auto-trading sell executed",
                );
            }
        }
    }

    if (rule.buy_enabled && rule.buy_drop_percent != null) {
        const referencePrice = rule.reference_price ?? currentPrice;
        const dropPercent =
            ((referencePrice - currentPrice) / referencePrice) * 100;

        if (dropPercent >= rule.buy_drop_percent) {
            const buyAmount = rule.buy_amount_usdc / currentPrice;
            await createOrder({
                order_type: "buy",
                is_crypto: true,
                crypto_id: rule.crypto_id,
                curr_price: currentPrice,
                amount: buyAmount,
                uid: rule.uid,
            });
            // reset the baseline so the drop% is measured from the new entry price
            await pool.query(
                `UPDATE public.auto_trading_rules
                 SET reference_price = $1, last_triggered_at = NOW()
                 WHERE id = $2`,
                [currentPrice, rule.id],
            );
            logger.info(
                {
                    ruleId: rule.id,
                    crypto_id: rule.crypto_id,
                    buyAmount,
                    dropPercent,
                },
                "Auto-trading buy executed",
            );
        } else if (currentPrice > referencePrice) {
            // price recovered above the baseline; track the new high as the reference
            await pool.query(
                `UPDATE public.auto_trading_rules SET reference_price = $1 WHERE id = $2`,
                [currentPrice, rule.id],
            );
        }
    }
}

// RSI / MACD / SMA-crossover signals drive both the sell and buy side of the rule
async function evaluateIndicatorRule(rule, currentPrice, heldAmount) {
    const { signal, details } = await getIndicatorSignal(
        rule.crypto_id,
        rule.indicator_type,
        rule.indicator_params || {},
    );

    if (signal === "sell" && rule.sell_enabled && heldAmount > 0) {
        const sellAmount =
            rule.sell_amount_type === "percent"
                ? heldAmount * (rule.sell_amount_value / 100)
                : Math.min(rule.sell_amount_value, heldAmount);

        if (sellAmount > 0) {
            await createOrder({
                order_type: "sell",
                is_crypto: true,
                crypto_id: rule.crypto_id,
                curr_price: currentPrice,
                amount: sellAmount,
                uid: rule.uid,
            });
            await markTriggered(rule.id);
            logger.info(
                {
                    ruleId: rule.id,
                    crypto_id: rule.crypto_id,
                    sellAmount,
                    details,
                },
                "Auto-trading indicator sell executed",
            );
        }
        return;
    }

    if (signal === "buy" && rule.buy_enabled && rule.buy_amount_usdc) {
        const buyAmount = rule.buy_amount_usdc / currentPrice;
        await createOrder({
            order_type: "buy",
            is_crypto: true,
            crypto_id: rule.crypto_id,
            curr_price: currentPrice,
            amount: buyAmount,
            uid: rule.uid,
        });
        await markTriggered(rule.id);
        logger.info(
            { ruleId: rule.id, crypto_id: rule.crypto_id, buyAmount, details },
            "Auto-trading indicator buy executed",
        );
    }
}

async function markTriggered(id) {
    await pool.query(
        `UPDATE public.auto_trading_rules SET last_triggered_at = NOW() WHERE id = $1`,
        [id],
    );
}

module.exports = {
    listByUser,
    create,
    update,
    remove,
    evaluateAndExecuteAll,
};

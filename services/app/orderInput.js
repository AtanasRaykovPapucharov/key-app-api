/**
 * Validates an order from the client and decides its execution price.
 *
 * Buy/sell orders execute at the SERVER's live Binance price — the price in
 * the request is ignored, so nobody can trade at a price they made up.
 * Watch orders (price alerts) keep the user's chosen target price.
 */
const { AppError } = require("../errors");
const { getPrice } = require("../binance/binanceService");

const MAX_AMOUNT = 1e9;
const CACHE_MS = 2000;
const cache = new Map(); // symbol -> { at, price }

async function livePrice(symbol, fetchPrice = getPrice) {
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.price;
    let price;
    try {
        price = Number((await fetchPrice(symbol))?.price);
    } catch {
        price = NaN;
    }
    if (!Number.isFinite(price) || price <= 0)
        throw new AppError(503, "PRICE_UNAVAILABLE", "The live price is unavailable right now. Try again in a moment.");
    cache.set(symbol, { at: Date.now(), price });
    return price;
}

/**
 * @returns {Promise<{order_type, is_crypto, crypto_id, curr_price, amount}>}
 */
async function prepareOrder(body, { fetchPrice = getPrice } = {}) {
    const orderType = String(body?.order_type ?? "").toLowerCase();
    if (!["buy", "sell", "watch"].includes(orderType))
        throw new AppError(400, "INVALID_ORDER_TYPE", "Order type must be buy, sell or watch.");

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT)
        throw new AppError(400, "INVALID_AMOUNT", "Amount must be a positive number.");

    const isCrypto = body?.is_crypto !== false;
    const cryptoId = String(body?.crypto_id ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]{2,15}$/.test(cryptoId))
        throw new AppError(400, "INVALID_ASSET", "Unknown asset.");

    let currPrice;
    if (orderType === "watch") {
        currPrice = Number(body?.curr_price);
        if (!Number.isFinite(currPrice) || currPrice <= 0)
            throw new AppError(400, "INVALID_PRICE", "Enter a valid price.");
    } else if (isCrypto) {
        currPrice = await livePrice(`${cryptoId.toUpperCase()}USDC`, fetchPrice);
    } else {
        // Fiat ⇄ stablecoin: buy = EUR → USDC at the EUR/USDC rate, sell = the inverse
        if (cryptoId !== "usdc") throw new AppError(400, "INVALID_ASSET", "Only EUR ⇄ USDC exchange is supported.");
        const eurUsdc = await livePrice("EURUSDC", fetchPrice);
        currPrice = orderType === "buy" ? eurUsdc : 1 / eurUsdc;
    }

    return {
        order_type: orderType,
        is_crypto: isCrypto,
        // keep the stored id format the rest of the app uses
        crypto_id: isCrypto ? cryptoId : "USDC",
        curr_price: currPrice,
        amount,
    };
}

module.exports = { prepareOrder, livePrice, _cache: cache };

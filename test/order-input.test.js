const assert = require("assert")
const { prepareOrder, _cache } = require("../services/app/orderInput.js")
const prices = { BTCUSDC: 65000, EURUSDC: 1.08 }
const fetchPrice = async (s) => { if (!(s in prices)) throw new Error("no market"); return { price: String(prices[s]) } }
const code = async (body) => { try { await prepareOrder(body, { fetchPrice }); return "OK" } catch (e) { return e.code } }
;(async () => {
  // client's price is ignored for buy/sell
  let o = await prepareOrder({ order_type: "buy", crypto_id: "btc", amount: 0.5, curr_price: 1 }, { fetchPrice })
  assert.equal(o.curr_price, 65000); assert.equal(o.crypto_id, "btc")
  // negative / zero / NaN / huge amounts rejected
  for (const amount of [-1, 0, "abc", Infinity, 2e9]) assert.equal(await code({ order_type: "buy", crypto_id: "btc", amount }), "INVALID_AMOUNT")
  assert.equal(await code({ order_type: "steal", crypto_id: "btc", amount: 1 }), "INVALID_ORDER_TYPE")
  assert.equal(await code({ order_type: "buy", crypto_id: "btc; drop", amount: 1 }), "INVALID_ASSET")
  // unknown market → 503, not a fake price
  _cache.clear(); assert.equal(await code({ order_type: "buy", crypto_id: "zzz", amount: 1 }), "PRICE_UNAVAILABLE")
  // EUR ⇄ USDC uses the server rate (buy = rate, sell = 1/rate)
  o = await prepareOrder({ order_type: "buy", is_crypto: false, crypto_id: "USDC", amount: 100, curr_price: 999 }, { fetchPrice })
  assert.equal(o.curr_price, 1.08); assert.equal(o.crypto_id, "USDC")
  o = await prepareOrder({ order_type: "sell", is_crypto: false, crypto_id: "USDC", amount: 100, curr_price: 999 }, { fetchPrice })
  assert.ok(Math.abs(o.curr_price - 1 / 1.08) < 1e-12)
  // watch keeps the user's target price but validates it
  o = await prepareOrder({ order_type: "watch", crypto_id: "eth", amount: 2, curr_price: 3000 }, { fetchPrice })
  assert.equal(o.curr_price, 3000)
  assert.equal(await code({ order_type: "watch", crypto_id: "eth", amount: 2, curr_price: -5 }), "INVALID_PRICE")
  console.log("order validation: all checks passed")
})().catch((e) => { console.error("FAIL", e); process.exit(1) })

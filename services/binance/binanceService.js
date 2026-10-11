const { Spot } = require("@binance/connector");

const client = new Spot(
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_SECRET_KEY,
);

// Get account balance
async function getAccountBalance() {
    const response = await client.account();
    const balances = response.data.balances.filter(
        (b) => parseFloat(b.free) > 0,
    );
    return balances;
}

// Get current price of a symbol
async function getPrice(symbol = "BTCUSDT") {
    const response = await client.tickerPrice(symbol);
    return response.data;
}

// Get open orders
async function getOpenOrders(symbol) {
    const response = await client.openOrders({ symbol });
    return response.data;
}

// Get trade history
async function getTradeHistory(symbol = "BTCUSDT") {
    const response = await client.myTrades(symbol);
    return response.data;
}

module.exports = {
    getAccountBalance,
    getPrice,
    getOpenOrders,
    getTradeHistory,
};

const { MainClient } = require("binance");
const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_SECRET_KEY;

const client = new MainClient({
    api_key: API_KEY,
    api_secret: API_SECRET,
    disableTimeSync: false, // let the client sync with Binance server time
    syncIntervalMs: 3600000,
    // Connect to testnet environment
    // testnet: true,
});

client
    .getAccountTradeList({ symbol: "ETHUSDC" })
    .then((result) => {
        console.log("getAccountTradeList result: ", result);
    })
    .catch((err) => {
        console.error("getAccountTradeList error: ", err);
    });

// client
//     .getExchangeInfo()
//     .then((result) => {
//         console.log("getExchangeInfo inverse result: ", result);
//     })
//     .catch((err) => {
//         console.error("getExchangeInfo inverse error: ", err);
//     });

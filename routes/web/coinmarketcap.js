const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/prices", async (req, res) => {
    try {
        const response = await axios.get(process.env.COIN_MARKET_CAP_LISTINGS, {
            headers: {
                "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
            },
            params: {
                symbol: "BTC,ETH,SOL,BNB,USDC,XRP,FET,LDO,XLM,STO,SAHARA,CHIP,KAT",
                convert: "USD",
            },
        });

        res.json(response.data.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

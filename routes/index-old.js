const express = require("express");

const { getAllTables } = require("../services/db.js");
const coinmarketcapRoutes = require("./web/coinmarketcap.js");
const coingeckoRoutes = require("./web/coingecko.js");
const priceHistoryRoutes = require("./web/price-history.js");
const yahooRoutes = require("./web/yahoo-finance.js");
const tbl = require("./admin/tbl.js");
const adminRoutes = require("./admin/admin.js");
const authRoutes = require("./user/auth.js");
const userRoutes = require("./user/user.js");
const settingsRoutes = require("./app/settings.js");
const cryptoRoutes = require("./app/crypto.js");
const cryptoAnalysisRoutes = require("./app/crypto-analysis.js");
const stocksAnalysisRoutes = require("./app/stocks-analysis.js");
const bankRoutes = require("./app/bank.js");
const dailyRoutes = require("./app/daily.js");
const traderRoutes = require("./app/trader.js");
const portfolioRoutes = require("./app/portfolio.js");
const musicNoteSheetRoutes = require("./app/music-note-sheet.js");
const schedulerRoutes = require("./app/scheduler.js");
const autoTradingRoutes = require("./app/autoTrading.js");

const router = express.Router();

// Mount each race under /api
router.use(authRoutes);
router.use("/yahoo", yahooRoutes);
router.use("/coinmarketcap", coinmarketcapRoutes);
router.use("/coingecko", coingeckoRoutes);
router.use("/price-history", priceHistoryRoutes);
router.use("/admin", adminRoutes);
router.use("/user", userRoutes);
router.use("/settings", settingsRoutes);
router.use("/crypto", cryptoRoutes);
router.use("/crypto-analysis", cryptoAnalysisRoutes);
router.use("/stocks-analysis", stocksAnalysisRoutes);
router.use("/bank", bankRoutes);
router.use("/daily", dailyRoutes);
router.use("/trader", traderRoutes);
router.use("/portfolio", portfolioRoutes);
router.use("/music-note-sheet", musicNoteSheetRoutes);
router.use("/scheduler", schedulerRoutes);
router.use("/auto-trading", autoTradingRoutes);

getAllTables()
    .then((tables) => {
        for (const name of tables) {
            if (name !== "users") router.use(`/${name}`, tbl(name));
        }
    })
    .catch((err) => {
        console.error("Failed to load dynamic table routes:", err);
        process.exit(1); // or notify your alerting system
    });

module.exports = router;

const express = require("express");
const { requireAuth, requireAdmin } = require("../config/auth.js");

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
const schedulerRoutes = require("./app/scheduler.js");
const autoTradingRoutes = require("./app/autoTrading.js");

const router = express.Router();

// ── Public ──────────────────────────────────────────────────────────────
router.use(authRoutes); // /login, /register, /logout
router.use("/yahoo", yahooRoutes);
router.use("/coinmarketcap", coinmarketcapRoutes);
router.use("/coingecko", coingeckoRoutes);
router.use("/price-history", priceHistoryRoutes);
router.use("/settings", settingsRoutes);
router.use("/crypto", cryptoRoutes);
router.use("/daily", dailyRoutes);
// mixed public / logged-in handlers: guarded inside the router
router.use("/bank", bankRoutes);
router.use("/crypto-analysis", cryptoAnalysisRoutes);

// ── Logged-in users (x-uid comes from the verified token) ────────────────
router.use("/user", requireAuth, userRoutes);
router.use("/stocks-analysis", requireAuth, stocksAnalysisRoutes);
router.use("/trader", requireAuth, traderRoutes);
router.use("/portfolio", requireAuth, portfolioRoutes);
router.use("/scheduler", requireAuth, schedulerRoutes);
router.use("/auto-trading", requireAuth, autoTradingRoutes);

// ── Admins only ──────────────────────────────────────────────────────────
router.use("/admin", requireAdmin, adminRoutes);

getAllTables()
    .then((tables) => {
        for (const name of tables) {
            // Tables with credentials or internals never get generic routes
            if (!["users", "auth_tokens", "schema_migrations"].includes(name))
                router.use(`/${name}`, requireAdmin, tbl(name));
        }
    })
    .catch((err) => {
        console.error("Failed to load dynamic table routes:", err);
        process.exit(1); // or notify your alerting system
    });

module.exports = router;

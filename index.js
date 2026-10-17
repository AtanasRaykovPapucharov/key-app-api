require("dotenv").config();
const http = require("http");
const express = require("express");
const { initWebSocket } = require("./config/websocket");
const { schedule } = require("./services/cronJobs/scheduler");
const { evaluateAndExecuteAll } = require("./services/app/autoTrading");

const { migrate } = require("./config/migrate");
const { purgeOldTokens } = require("./services/auth/tokens");

const app = express();
require("./config/express")(express, app);

const server = http.createServer(app);

async function start() {
    // Bring the database schema up to date before accepting requests
    await migrate();

    initWebSocket(server);

    // Check auto-trading rules against live prices every minute
    schedule("*/1 * * * *", evaluateAndExecuteAll);
    // Clean up expired email links once a day
    schedule("17 3 * * *", () => purgeOldTokens().catch((e) => console.error("[tokens]", e.message)));

    // Hosting providers assign the port through PORT
    const PORT = Number(process.env.PORT) || 3000;
    server.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

start().catch((err) => {
    console.error("[startup]", err.message);
    process.exit(1);
});

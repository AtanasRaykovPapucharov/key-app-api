require("dotenv").config();
const http = require("http");
const express = require("express");
const { initWebSocket } = require("./config/websocket");
const { schedule } = require("./services/cronJobs/scheduler");
const { evaluateAndExecuteAll } = require("./services/app/autoTrading");

const app = express();
require("./config/express")(express, app);

const server = http.createServer(app);

initWebSocket(server);

// Check auto-trading rules against live prices every minute
schedule("*/1 * * * *", evaluateAndExecuteAll);

// Hosting providers assign the port through PORT
const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
});

const pino = require("pino");

const isProd = process.env.NODE_ENV === "production";

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport: isProd ? undefined : { target: "pino-pretty" },
});

module.exports = logger;

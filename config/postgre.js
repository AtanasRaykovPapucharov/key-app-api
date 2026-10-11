const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    user: process.env.PG_DB_USER,
    host: process.env.PG_DB_HOST,
    database: process.env.PG_DB_NAME,
    password: process.env.PG_DB_PASS,
    port: process.env.PG_DB_PORT,
});

module.exports = pool;

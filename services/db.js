const format = require("pg-format");
const pool = require("../config/neon.js");
// const pool = require("../config/postgre.js");

async function getAllTables() {
    const query = `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    `;
    const res = await pool.query(query);
    return res.rows?.map((t) => t.table_name);
}

async function getTableColumns(tableName) {
    const query = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `;
    const res = await pool.query(query, [tableName]);
    return res.rows;
}

async function allFromTable(tableName) {
    const query = format("SELECT * FROM %I", tableName);
    const res = await pool.query(query);
    return res.rows;
}

async function createNewTable(tableName) {
    // construct field names
    const idField = `${tableName}id`;
    const nameField = `${tableName}name`;

    // safely build SQL with pg-format
    const query = format(
        `CREATE TABLE IF NOT EXISTS %I (%I SERIAL PRIMARY KEY, %I TEXT)`,
        tableName,
        idField,
        nameField,
    );

    const res = await pool.query(query);
    console.log(`Create table if not exists ${res}`);
    return res;
}

async function dropTable(tableName) {
    const query = format("DROP TABLE IF EXISTS %I", tableName);

    try {
        await pool.query(query);
        return `Table "${tableName}" deleted (if existed).`;
    } catch (error) {
        return `error: ${error}`;
    }
}

async function addColumn(
    tableName,
    columnName,
    columnType,
    defaultValue = null,
) {
    const query = format(
        "ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %s",
        tableName,
        columnName,
        columnType,
    );

    if (defaultValue !== null) {
        query += ` DEFAULT ${defaultValue}`;
    }
    return await pool.query(query);
}

async function dropColumn(tableName, columnName) {
    const query = format(
        "ALTER TABLE %I DROP COLUMN IF EXISTS %I",
        tableName,
        columnName,
    );

    await pool.query(query);
    console.log(
        `Column "${columnName}" deleted from table "${tableName}" (if existed).`,
    );
    return `Column "${columnName}" deleted from table "${tableName}" (if existed).`;
}

module.exports = {
    allFromTable,
    getAllTables,
    getTableColumns,
    createNewTable,
    addColumn,
    dropColumn,
    dropTable,
    pool,
};

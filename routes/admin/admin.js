const express = require("express");
const {
    getAllTables,
    getTableColumns,
    createNewTable,
    addColumn,
    dropColumn,
    dropTable,
} = require("../../services/db.js");
const { getRecentLogs } = require("../../services/app/logs.js");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        res.status(201).send("Hi Admin!");
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.get("/logs", async (req, res) => {
    try {
        const { limit, level } = req.query;
        const logs = await getRecentLogs({
            limit: limit ? Number(limit) : undefined,
            level,
        });
        res.status(200).json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.get("/tables", async (req, res) => {
    try {
        const tables = await getAllTables();
        res.status(201).json({ tables });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.get("/:table", async (req, res) => {
    try {
        const fields = await getTableColumns(req.params.table);
        res.status(201).json({ tab: req.params.table, cols: fields });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.post("/column", async (req, res) => {
    try {
        const { table, column, type } = req.body;
        const result = await addColumn(table, column, type);
        res.status(201).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

router.post("/table", async (req, res) => {
    try {
        const { tableName } = req.body;
        const result = await createNewTable(tableName);
        res.status(201).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error posting table");
    }
});

router.delete("/column/:table/:column", async (req, res) => {
    try {
        const { table, column } = req.params;
        const result = await dropColumn(table, column);
        res.status(201).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting column");
    }
});

router.delete("/table/:tableName", async (req, res) => {
    try {
        const { tableName } = req.params;
        const result = await dropTable(tableName);
        res.status(200).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting table");
    }
});

module.exports = router;

const express = require("express");
const {
    allFromTable,
    getAllTables,
    getTableColumns,
    createNewTable,
    addColumn,
    dropColumn,
    dropTable,
} = require("../../services/db.js");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const rows = await allFromTable("settings");
        console.log("settings: ", rows);
        res.status(200).json({ data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error getting crypto data");
    }
});

module.exports = router;

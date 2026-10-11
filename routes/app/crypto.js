const express = require("express");
const { getTableColumns } = require("../../services/db.js");
const { getAll } = require("../../services/app/crypto");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const rows = await getAll();
        console.log(rows);
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error getting crypto data");
    }
});

router.get("/:id", async (req, res) => {
    try {
        const fields = await getTableColumns(req.params.id);
        res.status(200).json({ tab: req.params.id, cols: fields });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error getting table");
    }
});

module.exports = router;

const express = require("express");
const {
    getAll,
    upsert,
    removeByCryptoId,
} = require("../../services/app/cryptoAnalysis");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const rows = await getAll();
        res.status(200).json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error getting crypto analyses");
    }
});

router.post("/", async (req, res) => {
    try {
        const uid = req.headers["x-uid"];
        const { crypto_id, project_name, project_year, total_points, test } =
            req.body;

        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });
        if (!crypto_id)
            return res.status(400).json({
                error: "crypto_id is required",
            });
        if (!project_name || !project_name.trim())
            return res.status(400).json({
                error: "project_name is required",
            });

        const row = await upsert({
            crypto_id: crypto_id.toLowerCase(),
            project_name,
            project_year,
            total_points,
            test,
            uid,
        });
        res.status(200).json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.delete("/:crypto_id", async (req, res) => {
    try {
        const cryptoId = req.params.crypto_id?.trim().toLowerCase();
        if (!cryptoId)
            return res.status(400).json({
                error: "crypto_id is required",
            });

        const row = await removeByCryptoId(cryptoId);
        if (!row) return res.status(404).json({ error: "Analysis not found" });

        res.status(200).json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error deleting crypto analysis" });
    }
});

module.exports = router;

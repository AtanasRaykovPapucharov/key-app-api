const express = require("express");
const {
    listByUser,
    create,
    update,
    remove,
} = require("../../services/app/autoTrading");
const {
    INDICATOR_TYPES,
    DEFAULT_PARAMS,
} = require("../../services/app/indicatorSignals");

const router = express.Router();

const getUid = (req, res) => {
    const uid = req.headers["x-uid"];
    if (!uid) {
        res.status(400).json({ error: "uid is required" });
        return null;
    }
    return uid;
};

router.get("/indicators", (req, res) => {
    res.status(200).json({
        types: INDICATOR_TYPES,
        defaults: DEFAULT_PARAMS,
    });
});

router.get("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const rows = await listByUser(uid);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({
            error: err.message || "Failed to fetch auto-trading rules",
        });
    }
});

router.post("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const row = await create(uid, req.body);
        res.status(201).json({ data: row });
    } catch (err) {
        const status =
            err.message?.includes("required") ||
            err.message?.includes("must be")
                ? 400
                : 500;
        res.status(status).json({
            error: err.message || "Failed to create auto-trading rule",
        });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const row = await update(req.params.id, uid, req.body);
        if (!row) {
            return res
                .status(404)
                .json({ error: "Auto-trading rule not found" });
        }
        res.status(200).json({ data: row });
    } catch (err) {
        const status =
            err.message?.includes("required") ||
            err.message?.includes("must be")
                ? 400
                : 500;
        res.status(status).json({
            error: err.message || "Failed to update auto-trading rule",
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const deletedId = await remove(req.params.id, uid);
        if (!deletedId) {
            return res
                .status(404)
                .json({ error: "Auto-trading rule not found" });
        }
        res.status(200).json({ deleted: true, id: deletedId });
    } catch (err) {
        res.status(500).json({
            error: err.message || "Failed to delete auto-trading rule",
        });
    }
});

module.exports = router;

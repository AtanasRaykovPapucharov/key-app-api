const express = require("express");
const {
    listByUser,
    create,
    update,
    remove,
} = require("../../services/app/scheduler");

const router = express.Router();

const getUid = (req, res) => {
    const uid = req.headers["x-uid"];
    if (!uid) {
        res.status(400).json({ error: "uid is required" });
        return null;
    }
    return uid;
};

router.get("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const rows = await listByUser(uid);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({
            error: err.message || "Failed to fetch scheduler entries",
        });
    }
});

router.post("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const row = await create({
            uid,
            ...req.body,
            isAdmin: req.user?.admin === true,
        });
        res.status(201).json({ data: row });
    } catch (err) {
        const status =
            err.statusCode ||
            (err.message?.startsWith("Invalid") ||
            err.message?.includes("required")
                ? 400
                : 500);
        res.status(status).json({
            error: err.message || "Failed to create scheduler entry",
        });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const row = await update(req.params.id, uid, req.body, {
            isAdmin: req.user?.admin === true,
        });
        if (!row) {
            return res.status(404).json({ error: "Scheduler entry not found" });
        }

        res.status(200).json({ data: row });
    } catch (err) {
        const status =
            err.statusCode ||
            (err.message?.startsWith("Invalid") ||
            err.message?.includes("required")
                ? 400
                : 500);
        res.status(status).json({
            error: err.message || "Failed to update scheduler entry",
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const deletedId = await remove(req.params.id, uid);
        if (!deletedId) {
            return res.status(404).json({ error: "Scheduler entry not found" });
        }

        res.status(200).json({ deleted: true, id: deletedId });
    } catch (err) {
        res.status(500).json({
            error: err.message || "Failed to delete scheduler entry",
        });
    }
});

module.exports = router;

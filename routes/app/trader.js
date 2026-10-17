const express = require("express");
const {
    getByCryptoId,
    create,
    remove,
} = require("../../services/app/tradingOrder");

const router = express.Router();

router.get("/order/:cryptoId", async (req, res) => {
    try {
        const { cryptoId } = req.params;
        const uid = req.headers["x-uid"];
        const isTrading = req.headers["x-watched"] !== "true";

        if (!uid)
            return res.status(400).json({
                error: "uid is required",
            });

        const orders = await getByCryptoId(cryptoId, uid, isTrading);
        res.status(200).json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/order", async (req, res) => {
    try {
        // The order always belongs to the logged-in user, whatever the body says
        const respData = await create({ ...req.body, uid: req.auth.uid });
        res.status(200).json({
            message: "Order created successfully",
            data: respData,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete("/order", async (req, res) => {
    try {
        const { id } = req.body;

        if (!id)
            return res.status(400).json({
                error: "order id is required",
            });

        const respData = await remove(id, req.auth.uid);
        if (!respData)
            return res.status(404).json({ error: "Order not found" });
        res.status(200).json({
            message: "Order deleted successfully",
            data: respData,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/order", async (req, res) => {
    try {
        // The order always belongs to the logged-in user, whatever the body says
        const respData = await create({ ...req.body, uid: req.auth.uid });
        res.status(200).json({
            message: "Order created successfully",
            data: respData,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

//===========================================================

// Not implemented yet: answer instead of logging the request and hanging
router.post("/buy", (req, res) => res.status(501).json({ error: "Not implemented" }));
router.post("/sell", (req, res) => res.status(501).json({ error: "Not implemented" }));

module.exports = router;

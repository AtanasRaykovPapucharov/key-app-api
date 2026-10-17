const { sendError } = require("../../services/errors");
const express = require("express");
const { prepareOrder } = require("../../services/app/orderInput");
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
        sendError(res, e, "trader");
    }
});

router.post("/order", async (req, res) => {
    try {
        // Validated input, server-side price, and always the logged-in user's order
        const order = await prepareOrder(req.body);
        const respData = await create({ ...order, uid: req.auth.uid });
        res.status(200).json({
            message: "Order created successfully",
            data: respData,
        });
    } catch (e) {
        sendError(res, e, "trader");
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
        sendError(res, e, "trader");
    }
});

//===========================================================

// Not implemented yet: answer instead of logging the request and hanging
router.post("/buy", (req, res) => res.status(501).json({ error: "Not implemented" }));
router.post("/sell", (req, res) => res.status(501).json({ error: "Not implemented" }));

module.exports = router;

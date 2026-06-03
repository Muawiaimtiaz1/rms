const express = require("express");
const infraService = require("../services/InfrastructureService");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/kds — Fetches active orders for the Kitchen Display System
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const kitchenId = req.session.user.role === 'kitchen' ? req.session.user.id : null;
  const orders = await infraService.listActiveKitchenOrders(shopId, kitchenId);
  res.json(orders);
});

// PATCH /api/kds/:id/status — Updates an order status
router.patch("/:id/status", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  await infraService.updateOrderStatus(req.params.id, req.body.status, shopId, req.session.user.id);
  res.json({ success: true, status: req.body.status });
});

module.exports = router;

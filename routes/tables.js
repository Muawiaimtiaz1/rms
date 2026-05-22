const express = require("express");
const infraService = require("../services/InfrastructureService");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/tables/floors
router.get("/floors", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const floors = await infraService.listFloors(shopId);
  res.json(floors);
});

// POST /api/tables/floors
router.post("/floors", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const id = await infraService.createFloor(req.body.name, shopId);
  res.json({ id, shop_id: shopId, name: req.body.name });
});

// DELETE /api/tables/floors/:id
router.delete("/floors/:id", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  await infraService.deleteFloor(req.params.id, shopId);
  res.json({ success: true });
});

// GET /api/tables
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const tables = await infraService.listTables(shopId);
  res.json(tables);
});

// POST /api/tables
router.post("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const id = await infraService.createTable(req.body, shopId);
  res.json({ id, shop_id: shopId, ...req.body, status: 'available' });
});

// PATCH /api/tables/:id/status
router.patch("/:id/status", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  await infraService.updateTableStatus(req.params.id, req.body.status, shopId);
  res.json({ success: true, status: req.body.status });
});

module.exports = router;

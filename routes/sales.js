const express = require("express");
const salesService = require("../services/SalesService");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// POST /api/sales — create a sale (checkout)
router.post("/", requireAuth, async (req, res) => {
  const result = await salesService.createSale(req.body, req.session.user.shop_id, req.session.user.id);
  res.json({ ok: true, ...result });
});

// PUT /api/sales/:id/items — update an existing sale items/details
router.put("/:id/items", requireAuth, async (req, res) => {
  const result = await salesService.updateSaleItems(req.params.id, req.body, req.session.user.shop_id, req.session.user.id);
  res.json({ ok: true, ...result });
});

// GET /api/sales — list sales for current shop
router.get("/", requireAuth, async (req, res) => {
  const sales = await salesService.getSales(req.session.user.shop_id, req.session.user);
  res.json(sales);
});

// PATCH /api/sales/:id/pay — record payment / update received amount
router.patch("/:id/pay", requireAuth, async (req, res) => {
  const { amount, note } = req.body;
  const finalAmount = await salesService.payDue(req.params.id, req.session.user.shop_id, req.session.user.id, amount, note);
  res.json({ ok: true, amount_received: finalAmount });
});

// PATCH /api/sales/:id/details — update sale details
router.patch("/:id/details", requireAuth, async (req, res) => {
  await salesService.updateDetails(req.params.id, req.session.user.shop_id, req.body, req.session.user.id);
  res.json({ ok: true });
});

// GET /api/sales/:id/bill — get full bill details
router.get("/:id/bill", requireAuth, async (req, res) => {
  const details = await salesService.getBill(req.params.id, req.session.user.shop_id);
  if (!details) return res.status(404).json({ error: "Sale not found" });
  res.json(details);
});

// POST /api/sales/:id/return — process a return
router.post("/:id/return", requireAuth, async (req, res) => {
  const result = await salesService.processReturn(req.params.id, req.session.user.shop_id, req.session.user.id, req.body);
  res.json({ ok: true, ...result });
});

// GET /api/sales/returns/:id/receipt — get return receipt data
router.get("/returns/:id/receipt", requireAuth, async (req, res) => {
  const data = await salesService.getReturnReceipt(req.params.id, req.session.user.shop_id);
  if (!data) return res.status(404).json({ error: "Return not found" });
  res.json(data);
});

module.exports = router;

const express = require("express");
const db = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/kds — Fetches active orders for the Kitchen Display System
router.get("/", requireAuth, (req, res) => {
  try {
    const activeOrders = db
      .prepare(`
        SELECT s.id, s.order_type, s.order_status, s.table_id, s.token_number, s.guest_count, s.created_at,
               t.table_number, u.name as waiter_name, s.special_instructions as order_notes
        FROM sales s
        LEFT JOIN tables t ON s.table_id = t.id
        LEFT JOIN users u ON s.waiter_id = u.id
        WHERE s.shop_id = ? AND s.order_status IN ('pending', 'preparing', 'ready')
        ORDER BY s.created_at ASC
      `)
      .all(req.session.user.shop_id);

    // Attach items to each order
    for (let order of activeOrders) {
      const items = db.prepare(`
        SELECT si.id, si.quantity, si.custom_name, si.special_instructions, si.variants_json, si.addons_json,
               COALESCE(p.name, si.custom_name) as product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ?
      `).all(order.id);
      
      // Parse JSONs
      order.items = items.map(item => ({
        ...item,
        variants: item.variants_json ? JSON.parse(item.variants_json) : null,
        addons: item.addons_json ? JSON.parse(item.addons_json) : null
      }));
    }

    res.json(activeOrders);
  } catch (err) {
    console.error("KDS Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch kitchen orders" });
  }
});

// PATCH /api/kds/:id/status — Updates an order status
router.patch("/:id/status", requireAuth, (req, res) => {
  const { status } = req.body;
  if (!["pending", "preparing", "ready", "completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    db.prepare("UPDATE sales SET order_status = ? WHERE id = ? AND shop_id = ?")
      .run(status, req.params.id, req.session.user.shop_id);
    
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

module.exports = router;

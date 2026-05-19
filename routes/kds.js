const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/kds — Fetches active orders for the Kitchen Display System
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();
  try {
    let query = `
        SELECT s.id, s.order_type, s.order_status, s.table_id, s.token_number, s.guest_count, s.created_at,
               t.table_number, u.name as waiter_name, s.special_instructions as order_notes
        FROM sales s
        LEFT JOIN tables t ON s.table_id = t.id
        LEFT JOIN users u ON s.waiter_id = u.id
        WHERE s.shop_id = ${isPostgres ? '$1' : '?'} AND s.order_status IN ('pending', 'preparing', 'ready', 'completed')
    `;
    const params = [shopId];

    if (req.session.user.role === 'kitchen') {
      query += ` AND s.kitchen_id = ${isPostgres ? '$2' : '?'}`;
      params.push(req.session.user.id);
    }

    query += " ORDER BY s.created_at ASC";

    let activeOrders;
    if (isPostgres) activeOrders = (await getPostgres().query(query, params)).rows;
    else activeOrders = getSqlite().prepare(query).all(...params);

    // Attach items to each order
    for (let order of activeOrders) {
      const itemQ = `
        SELECT si.id, si.quantity, si.custom_name, si.special_instructions, si.variants_json, si.addons_json,
               COALESCE(p.name, si.custom_name) as product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ${isPostgres ? '$1' : '?'}
      `;
      let items;
      if (isPostgres) items = (await getPostgres().query(itemQ, [order.id])).rows;
      else items = getSqlite().prepare(itemQ).all(order.id);
      
      const parseJson = (val) => {
          if (typeof val === 'string') { try { return JSON.parse(val); } catch (e) { return null; } }
          return val;
      };

      order.items = items.map(item => ({
        ...item,
        variants: parseJson(item.variants_json),
        addons: parseJson(item.addons_json)
      }));
    }

    res.json(activeOrders);
  } catch (err) {
    console.error("KDS Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch kitchen orders" });
  }
});

// PATCH /api/kds/:id/status — Updates an order status
router.patch("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const saleId = req.params.id;
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  if (!["pending", "preparing", "ready", "completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const query = isPostgres 
        ? "UPDATE sales SET order_status = $1 WHERE id = $2 AND shop_id = $3"
        : "UPDATE sales SET order_status = ? WHERE id = ? AND shop_id = ?";
    if (isPostgres) await getPostgres().query(query, [status, saleId, shopId]);
    else getSqlite().prepare(query).run(status, saleId, shopId);
    
    res.json({ success: true, status });
  } catch (err) {
    console.error("KDS Status Update Error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

module.exports = router;

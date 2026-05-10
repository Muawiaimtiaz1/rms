const express = require("express");
const db = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/tables
router.get("/", requireAuth, (req, res) => {
  try {
    const tables = db
      .prepare("SELECT * FROM tables WHERE shop_id = ? ORDER BY id ASC")
      .all(req.session.user.shop_id);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tables" });
  }
});

// POST /api/tables
router.post("/", requireAuth, (req, res) => {
  const { table_number, capacity } = req.body;
  if (!table_number) return res.status(400).json({ error: "Table number is required" });

  try {
    const info = db
      .prepare(
        "INSERT INTO tables (shop_id, table_number, capacity) VALUES (?, ?, ?)"
      )
      .run(req.session.user.shop_id, table_number, capacity || 4);

    res.json({ id: info.lastInsertRowid, shop_id: req.session.user.shop_id, table_number, capacity, status: 'available' });
  } catch (err) {
    res.status(500).json({ error: "Failed to create table" });
  }
});

// PATCH /api/tables/:id/status
router.patch("/:id/status", requireAuth, (req, res) => {
  const { status } = req.body;
  if (!["available", "occupied", "reserved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    db.prepare("UPDATE tables SET status = ? WHERE id = ? AND shop_id = ?")
      .run(status, req.params.id, req.session.user.shop_id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: "Failed to update table status" });
  }
});

module.exports = router;

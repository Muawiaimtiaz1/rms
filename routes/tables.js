const express = require("express");
const db = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/floors
router.get("/floors", requireAuth, (req, res) => {
  try {
    const floors = db
      .prepare("SELECT * FROM floors WHERE shop_id = ? ORDER BY id ASC")
      .all(req.session.user.shop_id);
    res.json(floors);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch floors" });
  }
});

// POST /api/floors
router.post("/floors", requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Floor name is required" });

  try {
    const info = db
      .prepare("INSERT INTO floors (shop_id, name) VALUES (?, ?)")
      .run(req.session.user.shop_id, name);

    res.json({ id: info.lastInsertRowid, shop_id: req.session.user.shop_id, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to create floor" });
  }
});

// DELETE /api/floors/:id
router.delete("/floors/:id", requireAuth, (req, res) => {
  try {
    db.prepare("DELETE FROM floors WHERE id = ? AND shop_id = ?")
      .run(req.params.id, req.session.user.shop_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete floor" });
  }
});

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
  const { table_number, capacity, floor_id } = req.body;
  if (!table_number) return res.status(400).json({ error: "Table number is required" });

  try {
    const info = db
      .prepare(
        "INSERT INTO tables (shop_id, table_number, capacity, floor_id) VALUES (?, ?, ?, ?)"
      )
      .run(req.session.user.shop_id, table_number, capacity || 4, floor_id || null);

    res.json({ id: info.lastInsertRowid, shop_id: req.session.user.shop_id, table_number, capacity, floor_id, status: 'available' });
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

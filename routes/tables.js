const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// GET /api/tables/floors
router.get("/floors", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();
  try {
    const query = isPostgres ? "SELECT * FROM floors WHERE shop_id = $1 ORDER BY id ASC" : "SELECT * FROM floors WHERE shop_id = ? ORDER BY id ASC";
    let floors;
    if (isPostgres) floors = (await getPostgres().query(query, [shopId])).rows;
    else floors = getSqlite().prepare(query).all(shopId);
    res.json(floors);
  } catch (err) {
    console.error("Fetch floors error:", err);
    res.status(500).json({ error: "Failed to fetch floors" });
  }
});

// POST /api/tables/floors
router.post("/floors", requireAuth, async (req, res) => {
  const { name } = req.body;
  const shopId = req.session.user.shop_id;
  if (!name) return res.status(400).json({ error: "Floor name is required" });

  try {
    const isPostgres = usePostgres();
    const query = isPostgres ? "INSERT INTO floors (shop_id, name) VALUES ($1, $2) RETURNING id" : "INSERT INTO floors (shop_id, name) VALUES (?, ?)";
    let id;
    if (isPostgres) id = (await getPostgres().query(query, [shopId, name])).rows[0].id;
    else id = getSqlite().prepare(query).run(shopId, name).lastInsertRowid;
    res.json({ id, shop_id: shopId, name });
  } catch (err) {
    console.error("Create floor error:", err);
    res.status(500).json({ error: "Failed to create floor" });
  }
});

// DELETE /api/tables/floors/:id
router.delete("/floors/:id", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();
  try {
    const q = isPostgres ? "DELETE FROM floors WHERE id = $1 AND shop_id = $2" : "DELETE FROM floors WHERE id = ? AND shop_id = ?";
    if (isPostgres) await getPostgres().query(q, [req.params.id, shopId]);
    else getSqlite().prepare(q).run(req.params.id, shopId);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete floor error:", err);
    res.status(500).json({ error: "Failed to delete floor" });
  }
});

// GET /api/tables
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();
  try {
    const query = isPostgres ? "SELECT * FROM tables WHERE shop_id = $1 ORDER BY id ASC" : "SELECT * FROM tables WHERE shop_id = ? ORDER BY id ASC";
    let tables;
    if (isPostgres) tables = (await getPostgres().query(query, [shopId])).rows;
    else tables = getSqlite().prepare(query).all(shopId);
    res.json(tables);
  } catch (err) {
    console.error("Fetch tables error:", err);
    res.status(500).json({ error: "Failed to fetch tables" });
  }
});

// POST /api/tables
router.post("/", requireAuth, async (req, res) => {
  const { table_number, capacity, floor_id } = req.body;
  const shopId = req.session.user.shop_id;
  if (!table_number) return res.status(400).json({ error: "Table number is required" });

  try {
    const isPostgres = usePostgres();
    const query = isPostgres 
      ? "INSERT INTO tables (shop_id, table_number, capacity, floor_id) VALUES ($1, $2, $3, $4) RETURNING id"
      : "INSERT INTO tables (shop_id, table_number, capacity, floor_id) VALUES (?, ?, ?, ?)";
    const params = [shopId, table_number, capacity || 4, floor_id || null];
    let id;
    if (isPostgres) id = (await getPostgres().query(query, params)).rows[0].id;
    else id = getSqlite().prepare(query).run(...params).lastInsertRowid;
    res.json({ id, shop_id: shopId, table_number, capacity, floor_id, status: 'available' });
  } catch (err) {
    console.error("Create table error:", err);
    res.status(500).json({ error: "Failed to create table" });
  }
});

// PATCH /api/tables/:id/status
router.patch("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  if (!["available", "occupied", "reserved"].includes(status)) return res.status(400).json({ error: "Invalid status" });

  try {
    const q = isPostgres ? "UPDATE tables SET status = $1 WHERE id = $2 AND shop_id = $3" : "UPDATE tables SET status = ? WHERE id = ? AND shop_id = ?";
    if (isPostgres) await getPostgres().query(q, [status, req.params.id, shopId]);
    else getSqlite().prepare(q).run(status, req.params.id, shopId);
    res.json({ success: true, status });
  } catch (err) {
    console.error("Update table status error:", err);
    res.status(500).json({ error: "Failed to update table status" });
  }
});

module.exports = router;

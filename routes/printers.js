const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');

// GET all printers for this shop
router.get('/', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  try {
    const printers = await db('printers').where({ shop_id: shopId }).orderBy('display_name', 'asc');
    res.json(printers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new printer
router.post('/', requireAuth, async (req, res) => {
  const { display_name, system_name } = req.body;
  const shopId = req.session.user.shop_id;
  if (!display_name || !system_name) return res.status(400).json({ error: "Display name and System name required" });

  try {
    const [printer] = await db('printers').insert({
      shop_id: shopId,
      display_name,
      system_name
    }).returning('*');
    res.json(printer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE printer
router.delete('/:id', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const { id } = req.params;
  try {
    await db('printers').where({ id, shop_id: shopId }).del();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const salesService = require('../services/SalesService');
const { requireAuth } = require('../middleware/auth');

/**
 * Poll for pending print jobs (Used by Local Print Agent)
 */
router.get('/poll', async (req, res) => {
  const { shop_id, api_key } = req.query;
  
  if (!shop_id) return res.status(400).json({ error: "shop_id required" });

  // Simple authentication: Check if shop exists
  // In a real world, we'd use a dedicated API KEY for the printer agent
  const shop = await db('shops').where({ id: shop_id }).first();
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  try {
    const jobs = await db('print_queue')
      .where({ shop_id, status: 'pending' })
      .orderBy('created_at', 'asc')
      .limit(10);

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Queue a receipt print from the browser UI.
 * If no matching printer is configured, the browser should fall back to its own print dialog.
 */
router.post('/queue', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id || req.body.shop_id;
  const { sale_id, format } = req.body;

  if (!shopId) return res.status(400).json({ error: "shop_id required" });
  if (!sale_id) return res.status(400).json({ error: "sale_id required" });

  const result = await salesService.queueReceiptPrint(sale_id, shopId, format);
  res.json({
    ok: true,
    queued: result.queued,
    printer_configured: result.printer_configured
  });
});

/**
 * Mark job as printed
 */
router.post('/:id/confirm', async (req, res) => {
  const { id } = req.params;
  try {
    await db('print_queue').where({ id }).update({ status: 'printed' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

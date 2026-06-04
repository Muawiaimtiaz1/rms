const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { usePostgres } = require('../db/runtime');
const wasteService = require('../services/WasteService');
const activityLogService = require('../services/ActivityLogService');

const router = express.Router();

function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveShopId(req, required = true) {
  const user = req.session.user;
  if (user.role === 'superadmin') {
    const requestedShopId = parseId(req.query.shop_id || req.query.shopId || req.body.shop_id || req.body.shopId);
    if (requestedShopId) return requestedShopId;
    if (!required) return null;
  }

  return parseId(user.shop_id);
}

function requirePostgresWaste(req, res, next) {
  if (!usePostgres()) {
    return res.status(503).json({ error: 'Unified waste management is available in Postgres mode only.' });
  }
  next();
}

router.use(requireAuth, requirePostgresWaste);

// GET /api/waste/context
// Loads selectable products, ingredients, recipes, recent sales, and recent returns.
router.get('/context', async (req, res) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) return res.status(400).json({ error: 'Shop is required.' });

    const context = await wasteService.getContext(shopId);
    res.json(context);
  } catch (err) {
    console.error('[Waste] Context error:', err);
    res.status(500).json({ error: err.message || 'Failed to load waste context.' });
  }
});

// GET /api/waste
// Lists unified waste events.
router.get('/', async (req, res) => {
  try {
    const shopId = resolveShopId(req, false);
    const rows = await wasteService.list(shopId, req.query, req.session.user);
    res.json(rows);
  } catch (err) {
    console.error('[Waste] List error:', err);
    res.status(500).json({ error: err.message || 'Failed to load waste records.' });
  }
});

// POST /api/waste
// Records product, raw ingredient, recipe/prepared, order, or return waste.
router.post('/', async (req, res) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) return res.status(400).json({ error: 'Shop is required.' });

    const user = req.session.user;
    const result = await wasteService.record(shopId, user.id, req.body);

    await activityLogService.log(shopId, user.id, 'WASTE_RECORDED', {
      waste_event_id: result.id,
      source_type: req.body.source_type,
      waste_type: req.body.waste_type,
      quantity: req.body.quantity,
      stock_action: req.body.stock_action,
      reason_code: req.body.reason_code,
      cost_amount: result.cost_amount
    }, result.id, 'waste_event');

    res.json(result);
  } catch (err) {
    console.error('[Waste] Record error:', err);
    res.status(400).json({ error: err.message || 'Failed to record waste.' });
  }
});

module.exports = router;

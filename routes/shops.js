const express = require('express');
const shopService = require('../services/ShopService');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/shops
router.get('/', requireSuperAdmin, async (req, res) => {
    const shops = await shopService.listShops();
    res.json(shops);
});

// POST /api/shops
router.post('/', requireSuperAdmin, async (req, res) => {
    const id = await shopService.createShop(req.body);
    res.json({ ok: true, id });
});

// PATCH /api/shops/:id
router.patch('/:id', requireSuperAdmin, async (req, res) => {
    await shopService.updateShop(req.params.id, req.body);
    res.json({ ok: true });
});

// DELETE /api/shops/:id
router.delete('/:id', requireSuperAdmin, async (req, res) => {
    await shopService.deleteShop(req.params.id);
    res.json({ ok: true });
});

module.exports = router;

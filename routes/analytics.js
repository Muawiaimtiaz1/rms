const express = require('express');
const analyticsService = require('../services/AnalyticsService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const db = require('../db/knex');

// GET /api/analytics/dashboard-data
router.get('/dashboard-data', requireAuth, async (req, res) => {
    const user = req.session.user;
    const shopId = user.shop_id;
    const targetShopId = user.role === 'superadmin' ? (req.query.shop_id ? parseInt(req.query.shop_id, 10) : null) : shopId;
    
    if (!targetShopId && user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const data = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

// GET /api/analytics - Global Overview (Superadmin)
router.get('/', requireAuth, async (req, res) => {
    if (req.session.user.role === 'superadmin') {
        const stats = await analyticsService.getGlobalStats();
        return res.json({ isGlobal: true, ...stats });
    }

    // Legacy support for shop-specific analytics via the new service
    const data = await analyticsService.getDashboardData(req.session.user.shop_id, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

module.exports = router;

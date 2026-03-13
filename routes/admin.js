const express = require('express');
const db = require('../db/db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/admin/store-stats - Aggregated platform statistics
router.get('/store-stats', requireSuperAdmin, (req, res) => {
    try {
        const stats = {
            totalStores: 0,
            activeStores: 0,
            suspendedStores: 0,
            totalUsers: 0,
            totalProducts: 0,
            recentStores: []
        };

        // Store counts
        const shopsResult = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as suspended
            FROM shops
        `).get();

        stats.totalStores = shopsResult.total || 0;
        stats.activeStores = shopsResult.active || 0;
        stats.suspendedStores = shopsResult.suspended || 0;

        // User count (excluding superadmin)
        const usersResult = db.prepare("SELECT COUNT(*) as total FROM users WHERE role != 'superadmin'").get();
        stats.totalUsers = usersResult.total || 0;

        // Product count
        const productsResult = db.prepare("SELECT COUNT(*) as total FROM products").get();
        stats.totalProducts = productsResult.total || 0;

        // Metrics for Charts (Store Growth over time - grouped by month)
        const growthResult = db.prepare(`
            SELECT 
                strftime('%Y-%m', created_at) as month,
                COUNT(*) as count
            FROM shops
            GROUP BY month
            ORDER BY month ASC
            LIMIT 12
        `).all();
        stats.growth = growthResult;

        // Metrics for Charts (Users per store top 5)
        const topStoresResult = db.prepare(`
            SELECT s.name, COUNT(u.id) as user_count
            FROM shops s
            LEFT JOIN users u ON s.id = u.shop_id
            GROUP BY s.id
            ORDER BY user_count DESC
            LIMIT 5
        `).all();
        stats.topStoresByUsers = topStoresResult;

        res.json(stats);
    } catch (e) {
        console.error('Store stats fetch error:', e);
        res.status(500).json({ error: 'Database error fetching stats' });
    }
});

// GET /api/admin/stores - List all stores with extended details
router.get('/stores', requireSuperAdmin, (req, res) => {
    try {
        const stores = db.prepare(`
            SELECT 
                s.id, 
                s.name as store_name, 
                s.status, 
                s.created_at,
                (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
                (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                u.name as owner_name,
                u.username as owner_email,
                sub.type as subscription_plan
            FROM shops s
            LEFT JOIN users u ON s.id = u.shop_id AND u.role = 'admin'
            LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= date('now'))
            GROUP BY s.id
            ORDER BY s.created_at DESC
        `).all();

        res.json(stores);
    } catch (e) {
        console.error('Stores fetch error:', e);
        res.status(500).json({ error: 'Database error fetching stores' });
    }
});

// PATCH /api/admin/store/:id/status - Toggle store status
router.patch('/store/:id/status', requireSuperAdmin, (req, res) => {
    const shopId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['active', 'blocked'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shopId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('Store status update error:', e);
        res.status(500).json({ error: 'Database error updating store status' });
    }
});

module.exports = router;

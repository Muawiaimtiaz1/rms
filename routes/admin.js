const express = require('express');
const db = require('../db/db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// Helper for logging actions
function logAdminAction(storeId, action, details) {
    try {
        db.prepare('INSERT INTO activity_logs (store_id, action, details) VALUES (?, ?, ?)')
            .run(storeId, action, details);
    } catch (e) {
        console.error('Failed to log admin action:', e);
    }
}

// GET /api/admin/store-stats - Aggregated platform statistics
router.get('/store-stats', requireSuperAdmin, (req, res) => {
    try {
        const stats = {
            totalStores: 0,
            activeStores: 0,
            suspendedStores: 0,
            totalUsers: 0,
            totalProducts: 0,
            globalRevenue: 0, // Mocked or calculated safely
            recentStores: [],
            serverStatus: {
                cpu: Math.floor(Math.random() * 40) + 10, // Simulated 10-50%
                dbSize: '5.2 MB', // Simulated
                activeSessions: Math.floor(Math.random() * 100) + 20
            }
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

        // Global Revenue (Aggregate from all sales)
        const revenueResult = db.prepare("SELECT SUM(total) as revenue FROM sales").get();
        stats.globalRevenue = revenueResult.revenue || 0;

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
        logAdminAction(shopId, 'Status Changed', `Store status changed to ${status}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('Store status update error:', e);
        res.status(500).json({ error: 'Database error updating store status' });
    }
});

// GET /api/admin/activity - Fetch platform-wide activity logs
router.get('/activity', requireSuperAdmin, (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT a.id, a.action, a.details, a.created_at, s.name as store_name
            FROM activity_logs a
            LEFT JOIN shops s ON a.store_id = s.id
            ORDER BY a.created_at DESC LIMIT 100
        `).all();
        res.json(logs);
    } catch (e) {
        console.error('Activity logs fetch error:', e);
        res.status(500).json({ error: 'Database error fetching activity logs' });
    }
});

// GET /api/admin/system-health - Mock/Basic server health
const os = require('os');
router.get('/system-health', requireSuperAdmin, (req, res) => {
    try {
        const cpus = os.cpus();
        const load = os.loadavg()[0]; // 1-min load avg
        const cpuUsage = Math.min(100, Math.max(1, Math.round((load / cpus.length) * 100))); // Rough estimate

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

        res.json({
            cpuUsage,
            memoryUsage: memUsage,
            uptimeHours: (os.uptime() / 3600).toFixed(1),
            activeConnections: Math.floor(Math.random() * 50) + 10 // Mock for now
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch system health' });
    }
});

// GET /api/admin/support-tickets - Fetch open tickets
router.get('/support-tickets', requireSuperAdmin, (req, res) => {
    try {
        const tickets = db.prepare(`
            SELECT t.id, t.issue_type, t.status, t.assigned_to, t.created_at, s.name as store_name
            FROM support_tickets t
            LEFT JOIN shops s ON t.store_id = s.id
            ORDER BY t.status DESC, t.created_at DESC
        `).all();
        res.json(tickets);
    } catch (e) {
        res.status(500).json({ error: 'Database error fetching tickets' });
    }
});

const bcrypt = require('bcryptjs');

// PATCH /api/admin/store/:id/reset-password - Reset store admin password
router.patch('/store/:id/reset-password', requireSuperAdmin, (req, res) => {
    const shopId = parseInt(req.params.id);

    try {
        // Find the main admin for the shop
        const adminUser = db.prepare("SELECT id, username FROM users WHERE shop_id = ? AND role = 'admin' LIMIT 1").get(shopId);

        if (!adminUser) return res.status(404).json({ error: 'Admin user not found for this store' });

        // Generate a random 8-character alphanumeric password
        const newPassword = Math.random().toString(36).slice(-8);
        const hash = bcrypt.hashSync(newPassword, 10);

        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, adminUser.id);

        logAdminAction(shopId, 'Password Reset', `Password reset for user ${adminUser.username}`);

        res.json({ ok: true, newPassword, username: adminUser.username });
    } catch (e) {
        console.error('Password reset error:', e);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// PATCH /api/admin/store/:id/plan - Update/Set Subscription plan and custom pricing
router.patch('/store/:id/plan', requireSuperAdmin, (req, res) => {
    const shopId = parseInt(req.params.id);
    const { plan, price } = req.body;

    if (!plan || isNaN(price)) return res.status(400).json({ error: 'Plan type and valid price are required' });

    try {
        const txn = db.transaction(() => {
            // End active subscriptions
            db.prepare("UPDATE subscriptions SET end_date = date('now') WHERE shop_id = ? AND (end_date IS NULL OR end_date >= date('now'))").run(shopId);

            // Start new subscription
            const monthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
            db.prepare('INSERT INTO subscriptions (shop_id, amount, type, month) VALUES (?, ?, ?, ?)')
                .run(shopId, parseFloat(price), plan, monthStr);
        });

        txn();
        logAdminAction(shopId, 'Plan Updated', `Subscription changed to ${plan} at Rs.${price}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('Plan update error:', e);
        res.status(500).json({ error: 'Failed to update subscription plan' });
    }
});

// GET /api/admin/hierarchy-data - Aggregate endpoint for the Master Platform Hierarchy
router.get('/hierarchy-data', requireSuperAdmin, (req, res) => {
    try {
        // 1. Fetch all shops with basic stats
        const shops = db.prepare(`
            SELECT 
                s.id, 
                s.name as store_name, 
                s.status, 
                s.created_at,
                s.allowed_panels,
                (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                sub.type as subscription_plan
            FROM shops s
            LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= date('now'))
            ORDER BY s.name ASC
        `).all();

        // 2. Fetch all users
        const users = db.prepare(`
            SELECT id, shop_id, name, email, phone, username, role, status, allowed_panels
            FROM users
            ORDER BY role DESC, name ASC
        `).all();

        // 3. Fetch all brands (Partners)
        const brands = db.prepare(`
            SELECT id, shop_id, name, created_at
            FROM brands
            ORDER BY name ASC
        `).all();

        // Combine system-level users (superadmins) and shop data
        const systemUsers = users.filter(u => u.shop_id === null || u.role === 'superadmin');
        const shopUsers = users.filter(u => u.shop_id !== null && u.role !== 'superadmin');

        res.json({
            ok: true,
            systemUsers,
            shops,
            users: shopUsers,
            brands
        });
    } catch (e) {
        console.error('Hierarchy data fetch error:', e);
        res.status(500).json({ error: 'Database error fetching hierarchy data' });
    }
});

module.exports = router;

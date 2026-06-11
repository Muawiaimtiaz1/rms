const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const os = require('os');
const bcrypt = require('bcryptjs');
const platformPaymentService = require('../services/PlatformPaymentService');
const { sendError } = require('../utils/error-response');
const router = express.Router();

// Helper for logging actions
async function logAdminAction(shopId, action, details) {
    try {
        const isPostgres = usePostgres();
        const q = isPostgres ? 'INSERT INTO activity_logs (shop_id, action, details) VALUES ($1, $2, $3)' : 'INSERT INTO activity_logs (shop_id, action, details) VALUES (?, ?, ?)';
        if (isPostgres) await getPostgres().query(q, [shopId, action, details]);
        else getSqlite().prepare(q).run(shopId, action, details);
    } catch (e) {
        console.error('Failed to log admin action:', e);
    }
}

// GET /api/admin/store-stats
router.get('/store-stats', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        const stats = {
            totalStores: 0, activeStores: 0, suspendedStores: 0,
            totalUsers: 0, totalProducts: 0,
            globalSales: 0, // What shops are making
            platformRevenue: 0, // What System Owner is making (SaaS Profit)
            mrr: 0, // Monthly Recurring Revenue
            serverStatus: { cpu: Math.floor(Math.random() * 40) + 10, dbSize: '5.2 MB', activeSessions: Math.floor(Math.random() * 100) + 20 }
        };

        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        await platformPaymentService.ensureLedgerReady();

        if (isPostgres) {
            const pg = getPostgres();

            // Shop Counts
            const shops = (await pg.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as suspended FROM shops")).rows[0];
            stats.totalStores = parseInt(shops.total) || 0;
            stats.activeStores = parseInt(shops.active) || 0;
            stats.suspendedStores = parseInt(shops.suspended) || 0;

            // Financials
            stats.globalSales = parseFloat((await pg.query("SELECT SUM(total) as revenue FROM sales")).rows[0].revenue) || 0;
            const subRevenue = parseFloat((await pg.query("SELECT SUM(amount) as revenue FROM saas_financial_logs WHERE category = 'subscription'")).rows[0].revenue) || 0;
            const setupFees = parseFloat((await pg.query("SELECT SUM(amount) as fee FROM saas_financial_logs WHERE category = 'setup'")).rows[0].fee) || 0;
            const otherIncome = parseFloat((await pg.query("SELECT SUM(amount) as extra FROM saas_financial_logs WHERE category NOT IN ('subscription', 'setup')")).rows[0].extra) || 0;

            stats.subRevenueTotal = subRevenue;
            stats.setupFeesTotal = setupFees;
            stats.platformRevenue = subRevenue + setupFees + otherIncome;
            stats.mrr = parseFloat((await pg.query("SELECT SUM(amount) as revenue FROM subscriptions WHERE month = $1", [currentMonth])).rows[0].revenue) || 0;

            // Totals
            stats.totalUsers = parseInt((await pg.query("SELECT SUM(user_count) as total FROM shops")).rows[0].total) || 0;
            stats.totalProducts = parseInt((await pg.query("SELECT SUM(product_count) as total FROM shops")).rows[0].total) || 0;

            // Growth Trend (Last 12 Months)
            stats.growth = (await pg.query(`
                SELECT TO_CHAR(paid_at, 'YYYY-MM') as month,
                       COUNT(DISTINCT shop_id) as store_count,
                       SUM(amount) as revenue
                FROM subscriptions
                GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
                ORDER BY month ASC
                LIMIT 12
            `)).rows.map(r => ({
                month: r.month,
                count: parseInt(r.store_count),
                revenue: parseFloat(r.revenue) || 0
            }));

            stats.topStoresByUsers = (await pg.query("SELECT name, user_count FROM shops ORDER BY user_count DESC LIMIT 5")).rows;
        } else {
            const db = getSqlite();

            const shops = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as suspended FROM shops").get();
            stats.totalStores = shops.total || 0;
            stats.activeStores = shops.active || 0;
            stats.suspendedStores = shops.suspended || 0;

            stats.globalSales = db.prepare("SELECT SUM(total) as revenue FROM sales").get().revenue || 0;
            const subRevenue = db.prepare("SELECT SUM(amount) as revenue FROM saas_financial_logs WHERE category = 'subscription'").get().revenue || 0;
            const setupFees = db.prepare("SELECT SUM(amount) as fee FROM saas_financial_logs WHERE category = 'setup'").get().fee || 0;
            const otherIncome = db.prepare("SELECT SUM(amount) as extra FROM saas_financial_logs WHERE category NOT IN ('subscription', 'setup')").get().extra || 0;

            stats.subRevenueTotal = subRevenue;
            stats.setupFeesTotal = setupFees;
            stats.platformRevenue = subRevenue + setupFees + otherIncome;
            stats.mrr = db.prepare("SELECT SUM(amount) as revenue FROM subscriptions WHERE month = ?").get(currentMonth).revenue || 0;

            stats.totalUsers = db.prepare("SELECT SUM(user_count) as total FROM shops").get().total || 0;
            stats.totalProducts = db.prepare("SELECT SUM(product_count) as total FROM shops").get().total || 0;

            stats.growth = db.prepare(`
                SELECT strftime('%Y-%m', paid_at) as month,
                       COUNT(DISTINCT shop_id) as store_count,
                       SUM(amount) as revenue
                FROM subscriptions
                GROUP BY month
                ORDER BY month ASC
                LIMIT 12
            `).all().map(r => ({
                month: r.month,
                count: r.store_count,
                revenue: r.revenue || 0
            }));

            stats.topStoresByUsers = db.prepare("SELECT name, user_count FROM shops ORDER BY user_count DESC LIMIT 5").all();
        }
        res.json(stats);
    } catch (e) {
        console.error('Store stats fetch error:', e);
        res.status(500).json({ error: 'Database error fetching stats' });
    }
});

// GET /api/admin/stores
router.get('/stores', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || '';

        let query;
        if (isPostgres) {
            query = `
                SELECT s.id, s.name as store_name, s.status, s.created_at,
                       s.user_count, s.product_count,
                       u.name as owner_name, u.username as owner_email, sub.type as subscription_plan
                FROM shops s
                LEFT JOIN users u ON s.id = u.shop_id AND u.role = 'admin'
                LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
                WHERE s.name ILIKE $1
                ORDER BY s.created_at DESC
                LIMIT $2 OFFSET $3
            `;
        } else {
            query = `
                SELECT s.id, s.name as store_name, s.status, s.created_at,
                       s.user_count, s.product_count,
                       u.name as owner_name, u.username as owner_email, sub.type as subscription_plan
                FROM shops s
                LEFT JOIN users u ON s.id = u.shop_id AND u.role = 'admin'
                LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= date('now'))
                WHERE s.name LIKE ?
                GROUP BY s.id ORDER BY s.created_at DESC
                LIMIT ? OFFSET ?
            `;
        }

        let stores;
        const searchParam = `%${search}%`;
        if (isPostgres) {
            stores = (await getPostgres().query(query, [searchParam, limit, offset])).rows;
        } else {
            stores = getSqlite().prepare(query).all(searchParam, limit, offset);
        }

        // Also get total count for pagination UI
        const countQuery = isPostgres
            ? 'SELECT COUNT(*) as count FROM shops WHERE name ILIKE $1'
            : 'SELECT COUNT(*) as count FROM shops WHERE name LIKE ?';

        let total;
        if (isPostgres) total = parseInt((await getPostgres().query(countQuery, [searchParam])).rows[0].count);
        else total = getSqlite().prepare(countQuery).get(searchParam).count;

        res.json({ stores, total, limit, offset });
    } catch (e) {
        console.error('Stores fetch error:', e);
        res.status(500).json({ error: 'Database error fetching stores' });
    }
});

// PATCH /api/admin/store/:id/status
router.patch('/store/:id/status', requireSuperAdmin, async (req, res) => {
    const shopId = req.params.id;
    const { status } = req.body;
    if (!['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const isPostgres = usePostgres();
        const q = isPostgres ? 'UPDATE shops SET status = $1 WHERE id = $2' : 'UPDATE shops SET status = ? WHERE id = ?';
        let changed;
        if (isPostgres) changed = (await getPostgres().query(q, [status, shopId])).rowCount > 0;
        else changed = getSqlite().prepare(q).run(status, shopId).changes > 0;

        if (!changed) return res.status(404).json({ error: 'Store not found' });
        await logAdminAction(shopId, 'Status Changed', `Store status changed to ${status}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('Store status update error:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/admin/activity
router.get('/activity', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        const q = 'SELECT a.id, a.action, a.details, a.created_at, s.name as store_name FROM activity_logs a LEFT JOIN shops s ON a.shop_id = s.id ORDER BY a.created_at DESC LIMIT 100';
        let logs;
        if (isPostgres) logs = (await getPostgres().query(q)).rows;
        else logs = getSqlite().prepare(q).all();
        res.json(logs);
    } catch (e) {
        console.error('Activity logs fetch error:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/admin/system-health
router.get('/system-health', requireSuperAdmin, (req, res) => {
    try {
        const cpus = os.cpus();
        const load = os.loadavg()[0];
        const cpuUsage = Math.min(100, Math.max(1, Math.round((load / cpus.length) * 100)));
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
        res.json({ cpuUsage, memoryUsage: memUsage, uptimeHours: (os.uptime() / 3600).toFixed(1), activeConnections: 25 });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch health' }); }
});



// PATCH /api/admin/store/:id/reset-password
router.patch('/store/:id/reset-password', requireSuperAdmin, async (req, res) => {
    const shopId = req.params.id;
    try {
        const isPostgres = usePostgres();
        const qFind = isPostgres ? "SELECT id, username FROM users WHERE shop_id = $1 AND role = 'admin' LIMIT 1" : "SELECT id, username FROM users WHERE shop_id = ? AND role = 'admin' LIMIT 1";
        let adminUser;
        if (isPostgres) adminUser = (await getPostgres().query(qFind, [shopId])).rows[0];
        else adminUser = getSqlite().prepare(qFind).get(shopId);
        if (!adminUser) return res.status(404).json({ error: 'Admin not found' });

        const newPass = Math.random().toString(36).slice(-8);
        const hash = bcrypt.hashSync(newPass, 10);
        const qUpd = isPostgres ? 'UPDATE users SET password_hash = $1 WHERE id = $2' : 'UPDATE users SET password_hash = ? WHERE id = ?';
        if (isPostgres) await getPostgres().query(qUpd, [hash, adminUser.id]);
        else getSqlite().prepare(qUpd).run(hash, adminUser.id);

        await logAdminAction(shopId, 'Password Reset', `Password reset for user ${adminUser.username}`);
        res.json({ ok: true, newPassword: newPass, username: adminUser.username });
    } catch (e) {
        console.error('Password reset error:', e);
        res.status(500).json({ error: 'Failed' });
    }
});

// PATCH /api/admin/store/:id/plan
router.patch('/store/:id/plan', requireSuperAdmin, async (req, res) => {
    res.status(410).json({
        error: 'Subscription payments are now managed from Settings > Platform Payments.'
    });
});

// GET /api/admin/hierarchy-data
router.get('/hierarchy-data', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        let shops, users, brands;
        if (isPostgres) {
            const pg = getPostgres();
            shops = (await pg.query(`
                SELECT s.id, s.name, s.name as store_name, s.status, s.created_at, s.allowed_panels, s.shop_type,
                       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                       sub.type as subscription_plan FROM shops s
                LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
                ORDER BY s.name ASC
            `)).rows;
            users = (await pg.query("SELECT id, shop_id, name, email, phone, username, role, status, allowed_panels FROM users ORDER BY role DESC, name ASC")).rows;
            brands = (await pg.query("SELECT id, shop_id, name, created_at FROM brands ORDER BY name ASC")).rows;
        } else {
            const db = getSqlite();
            shops = db.prepare(`
                SELECT s.id, s.name, s.name as store_name, s.status, s.created_at, s.allowed_panels, s.shop_type,
                       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                       sub.type as subscription_plan FROM shops s
                LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= date('now'))
                ORDER BY s.name ASC
            `).all();
            users = db.prepare("SELECT id, shop_id, name, email, phone, username, role, status, allowed_panels FROM users ORDER BY role DESC, name ASC").all();
            brands = db.prepare("SELECT id, shop_id, name, created_at FROM brands ORDER BY name ASC").all();
        }
        res.json({ ok: true, systemUsers: users.filter(u => !u.shop_id || u.role === 'superadmin'), shops, users: users.filter(u => u.shop_id && u.role !== 'superadmin'), brands });
    } catch (e) {
        console.error('Hierarchy data error:', e);
        res.status(500).json({ error: 'Failed' });
    }
});

// GET /api/admin/financial-logs
router.get('/financial-logs', requireSuperAdmin, async (req, res) => {
    try {
        const logs = await platformPaymentService.list();
        res.json({ ok: true, logs });
    } catch (e) {
        console.error('Logs fetch error:', e);
        sendError(res, e, 'Failed to fetch platform payments');
    }
});

// POST /api/admin/financial-logs
router.post('/financial-logs', requireSuperAdmin, async (req, res) => {
    try {
        const id = await platformPaymentService.create(req.body);
        res.json({ ok: true, id });
    } catch (e) {
        console.error('Logs insert error:', e);
        sendError(res, e, 'Failed to record platform payment');
    }
});

// PATCH /api/admin/financial-logs/:id
router.patch('/financial-logs/:id', requireSuperAdmin, async (req, res) => {
    try {
        await platformPaymentService.update(req.params.id, req.body);
        res.json({ ok: true });
    } catch (e) {
        console.error('Logs patch error:', e);
        sendError(res, e, 'Failed to update platform payment');
    }
});

// DELETE /api/admin/financial-logs/:id
router.delete('/financial-logs/:id', requireSuperAdmin, async (req, res) => {
    try {
        await platformPaymentService.delete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        console.error('Logs delete error:', e);
        sendError(res, e, 'Failed to delete platform payment');
    }
});

module.exports = router;

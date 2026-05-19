const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const os = require('os');
const bcrypt = require('bcryptjs');
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
            totalStores: 0, activeStores: 0, suspendedStores: 0, totalUsers: 0, totalProducts: 0, globalRevenue: 0,
            serverStatus: { cpu: Math.floor(Math.random() * 40) + 10, dbSize: '5.2 MB', activeSessions: Math.floor(Math.random() * 100) + 20 }
        };

        if (isPostgres) {
            const pg = getPostgres();
            const shops = (await pg.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as suspended FROM shops")).rows[0];
            stats.totalStores = parseInt(shops.total) || 0;
            stats.activeStores = parseInt(shops.active) || 0;
            stats.suspendedStores = parseInt(shops.suspended) || 0;
            stats.globalRevenue = parseFloat((await pg.query("SELECT SUM(total) as revenue FROM sales")).rows[0].revenue) || 0;
            stats.totalUsers = parseInt((await pg.query("SELECT COUNT(*) as total FROM users WHERE role != 'superadmin'")).rows[0].total) || 0;
            stats.totalProducts = parseInt((await pg.query("SELECT COUNT(*) as total FROM products")).rows[0].total) || 0;
            stats.growth = (await pg.query("SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count FROM shops GROUP BY month ORDER BY month ASC LIMIT 12")).rows.map(r => ({ month: r.month, count: parseInt(r.count) }));
            stats.topStoresByUsers = (await pg.query("SELECT s.name, COUNT(u.id) as user_count FROM shops s LEFT JOIN users u ON s.id = u.shop_id GROUP BY s.id, s.name ORDER BY user_count DESC LIMIT 5")).rows.map(r => ({ name: r.name, user_count: parseInt(r.user_count) }));
        } else {
            const db = getSqlite();
            const shops = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as suspended FROM shops").get();
            stats.totalStores = shops.total || 0;
            stats.activeStores = shops.active || 0;
            stats.suspendedStores = shops.suspended || 0;
            stats.globalRevenue = db.prepare("SELECT SUM(total) as revenue FROM sales").get().revenue || 0;
            stats.totalUsers = db.prepare("SELECT COUNT(*) as total FROM users WHERE role != 'superadmin'").get().total || 0;
            stats.totalProducts = db.prepare("SELECT COUNT(*) as total FROM products").get().total || 0;
            stats.growth = db.prepare("SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM shops GROUP BY month ORDER BY month ASC LIMIT 12").all();
            stats.topStoresByUsers = db.prepare("SELECT s.name, COUNT(u.id) as user_count FROM shops s LEFT JOIN users u ON s.id = u.shop_id GROUP BY s.id ORDER BY user_count DESC LIMIT 5").all();
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
        const query = isPostgres ? `
            SELECT s.id, s.name as store_name, s.status, s.created_at,
                   (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
                   (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                   u.name as owner_name, u.username as owner_email, sub.type as subscription_plan
            FROM shops s
            LEFT JOIN users u ON s.id = u.shop_id AND u.role = 'admin'
            LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
            ORDER BY s.created_at DESC
        ` : `
            SELECT s.id, s.name as store_name, s.status, s.created_at,
                   (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
                   (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
                   u.name as owner_name, u.username as owner_email, sub.type as subscription_plan
            FROM shops s
            LEFT JOIN users u ON s.id = u.shop_id AND u.role = 'admin'
            LEFT JOIN subscriptions sub ON s.id = sub.shop_id AND (sub.end_date IS NULL OR sub.end_date >= date('now'))
            GROUP BY s.id ORDER BY s.created_at DESC
        `;
        let stores;
        if (isPostgres) stores = (await getPostgres().query(query)).rows;
        else stores = getSqlite().prepare(query).all();
        res.json(stores);
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

// GET /api/admin/support-tickets
router.get('/support-tickets', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        const q = 'SELECT t.id, t.issue_type, t.status, t.assigned_to, t.created_at, s.name as store_name FROM support_tickets t LEFT JOIN shops s ON t.shop_id = s.id ORDER BY t.status DESC, t.created_at DESC';
        let tickets;
        if (isPostgres) tickets = (await getPostgres().query(q)).rows;
        else tickets = getSqlite().prepare(q).all();
        res.json(tickets);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
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
    const shopId = req.params.id;
    const { plan, price } = req.body;
    if (!plan || isNaN(price)) return res.status(400).json({ error: 'Invalid plan or price' });

    try {
        const isPostgres = usePostgres();
        const monthStr = new Date().toISOString().slice(0, 7);
        if (isPostgres) {
            await getPostgres().withTransaction(async (client) => {
                await client.query("UPDATE subscriptions SET end_date = CURRENT_DATE WHERE shop_id = $1 AND (end_date IS NULL OR end_date >= CURRENT_DATE)", [shopId]);
                await client.query('INSERT INTO subscriptions (shop_id, amount, type, month) VALUES ($1, $2, $3, $4)', [shopId, parseFloat(price), plan, monthStr]);
            });
        } else {
            const db = getSqlite();
            db.transaction(() => {
                db.prepare("UPDATE subscriptions SET end_date = date('now') WHERE shop_id = ? AND (end_date IS NULL OR end_date >= date('now'))").run(shopId);
                db.prepare('INSERT INTO subscriptions (shop_id, amount, type, month) VALUES (?, ?, ?, ?)').run(shopId, parseFloat(price), plan, monthStr);
            })();
        }
        await logAdminAction(shopId, 'Plan Updated', `Plan to ${plan} @ ${price}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('Plan update error:', e);
        res.status(500).json({ error: 'Failed' });
    }
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

module.exports = router;

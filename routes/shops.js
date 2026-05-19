const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

// GET /api/shops — superadmin only
router.get('/', requireSuperAdmin, async (req, res) => {
    try {
        const isPostgres = usePostgres();
        let shops;
        const q = 'SELECT id, name, status, allowed_panels, created_at FROM shops ORDER BY created_at DESC';
        if (isPostgres) shops = (await getPostgres().query(q)).rows;
        else shops = getSqlite().prepare(q).all();
        
        shops.forEach(s => s.allowed_panels = s.allowed_panels ? JSON.parse(s.allowed_panels) : []);
        res.json(shops);
    } catch (e) {
        console.error('Shops fetch error:', e);
        res.status(500).json({ error: 'Database error fetching shops' });
    }
});

// POST /api/shops — superadmin creates a shop + initial admin
router.post('/', requireSuperAdmin, async (req, res) => {
    const { name, shop_type, allowed_panels, adminUsername, adminPassword } = req.body;
    if (!name) return res.status(400).json({ error: 'Shop name required' });
    if (!adminUsername || !adminPassword) return res.status(400).json({ error: 'Admin credentials required' });

    const panelsJson = JSON.stringify(allowed_panels || []);
    const type = shop_type || 'retail';
    const isPostgres = usePostgres();

    try {
        if (isPostgres) {
            const pg = getPostgres();
            const shopId = await pg.withTransaction(async (client) => {
                const shopRes = await client.query('INSERT INTO shops (name, allowed_panels, shop_type) VALUES ($1, $2, $3) RETURNING id', [name, panelsJson, type]);
                const sid = shopRes.rows[0].id;

                const hash = bcrypt.hashSync(adminPassword, 10);
                await client.query('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES ($1, $2, $3, $4, $5, $6)', [`${name} Admin`, adminUsername, hash, 'admin', sid, panelsJson]);

                if (Array.isArray(req.body.employees)) {
                    for (const emp of req.body.employees) {
                        const empHash = emp.password ? bcrypt.hashSync(emp.password, 10) : null;
                        await client.query('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES ($1, $2, $3, $4, $5, $6)', [emp.name, emp.username, empHash, emp.role || 'user', sid, JSON.stringify(emp.allowed_panels || [])]);
                    }
                }
                if (Array.isArray(req.body.kitchens)) {
                    for (const kit of req.body.kitchens) {
                        const kitHash = kit.password ? bcrypt.hashSync(kit.password, 10) : null;
                        await client.query('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES ($1, $2, $3, $4, $5, $6)', [kit.name, kit.username, kitHash, 'kitchen', sid, JSON.stringify(kit.allowed_panels || [])]);
                    }
                }
                await client.query('INSERT INTO activity_logs (shop_id, action, details) VALUES ($1, $2, $3)', [sid, 'Store Created', `Store ${name} created`]);
                return sid;
            });
            res.json({ ok: true, id: shopId });
        } else {
            const db = getSqlite();
            const sid = db.transaction(() => {
                const res = db.prepare('INSERT INTO shops (name, allowed_panels, shop_type) VALUES (?, ?, ?)').run(name, panelsJson, type);
                const sid = res.lastInsertRowid;
                const hash = bcrypt.hashSync(adminPassword, 10);
                db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES (?, ?, ?, ?, ?, ?)').run(`${name} Admin`, adminUsername, hash, 'admin', sid, panelsJson);
                if (Array.isArray(req.body.employees)) {
                    const stmt = db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES (?, ?, ?, ?, ?, ?)');
                    req.body.employees.forEach(emp => {
                        stmt.run(emp.name, emp.username, emp.password ? bcrypt.hashSync(emp.password, 10) : null, emp.role || 'user', sid, JSON.stringify(emp.allowed_panels || []));
                    });
                }
                if (Array.isArray(req.body.kitchens)) {
                    const stmt = db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES (?, ?, ?, ?, ?, ?)');
                    req.body.kitchens.forEach(kit => {
                        stmt.run(kit.name, kit.username, kit.password ? bcrypt.hashSync(kit.password, 10) : null, 'kitchen', sid, JSON.stringify(kit.allowed_panels || []));
                    });
                }
                db.prepare('INSERT INTO activity_logs (shop_id, action, details) VALUES (?, ?, ?)').run(sid, 'Store Created', `Store ${name} created`);
                return sid;
            })();
            res.json({ ok: true, id: sid });
        }
    } catch (e) {
        console.error('Shop creation error:', e);
        if (e.message.includes('UNIQUE') || e.message.includes('duplicate')) return res.status(400).json({ error: 'Username already taken' });
        res.status(500).json({ error: 'Failed to create shop: ' + e.message });
    }
});

// PATCH /api/shops/:id
router.patch('/:id', requireSuperAdmin, async (req, res) => {
    const { status, allowed_panels, name } = req.body;
    const shopId = req.params.id;
    const isPostgres = usePostgres();
    if (status && !['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        if (isPostgres) {
            const pg = getPostgres();
            if (name) await pg.query('UPDATE shops SET name = $1 WHERE id = $2', [name, shopId]);
            if (status) await pg.query('UPDATE shops SET status = $1 WHERE id = $2', [status, shopId]);
            if (allowed_panels) await pg.query('UPDATE shops SET allowed_panels = $1 WHERE id = $2', [JSON.stringify(allowed_panels), shopId]);
        } else {
            const db = getSqlite();
            if (name) db.prepare('UPDATE shops SET name = ? WHERE id = ?').run(name, shopId);
            if (status) db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shopId);
            if (allowed_panels) db.prepare('UPDATE shops SET allowed_panels = ? WHERE id = ?').run(JSON.stringify(allowed_panels), shopId);
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/shops/:id
router.delete('/:id', requireSuperAdmin, async (req, res) => {
    const shopId = req.params.id;
    const isPostgres = usePostgres();
    try {
        if (isPostgres) await getPostgres().query('DELETE FROM shops WHERE id = $1', [shopId]);
        else getSqlite().prepare('DELETE FROM shops WHERE id = ?').run(shopId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

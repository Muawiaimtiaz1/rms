const express = require('express');
const db = require('../db/db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/shops — superadmin only
router.get('/', requireSuperAdmin, (req, res) => {
    try {
        const shops = db.prepare('SELECT id, name, status, allowed_panels, created_at FROM shops ORDER BY created_at DESC').all();
        shops.forEach(s => s.allowed_panels = s.allowed_panels ? JSON.parse(s.allowed_panels) : []);
        res.json(shops);
    } catch (e) {
        console.error('Shops fetch error:', e);
        res.status(500).json({ error: 'Database error fetching shops' });
    }
});

const bcrypt = require('bcryptjs');

// POST /api/shops — superadmin creates a shop + initial admin
router.post('/', requireSuperAdmin, async (req, res) => {
    const { name, shop_type, allowed_panels, adminUsername, adminPassword } = req.body;
    if (!name) return res.status(400).json({ error: 'Shop name required' });
    if (!adminUsername || !adminPassword) return res.status(400).json({ error: 'Admin credentials required' });

    const panelsJson = JSON.stringify(allowed_panels || []);
    const type = shop_type || 'retail';

    try {
        const transaction = db.transaction(() => {
            // 1. Create the Shop
            const shopResult = db.prepare('INSERT INTO shops (name, allowed_panels, shop_type) VALUES (?, ?, ?)').run(name, panelsJson, type);
            const shopId = shopResult.lastInsertRowid;

            // 2. Create the Shop Admin
            const hash = bcrypt.hashSync(adminPassword, 10);
            db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES (?, ?, ?, ?, ?, ?)')
                .run(`${name} Admin`, adminUsername, hash, 'admin', shopId, panelsJson);

            // 3. Log the creation in Activity Logs
            db.prepare('INSERT INTO activity_logs (shop_id, action, details) VALUES (?, ?, ?)')
                .run(shopId, 'Store Created', `Store ${name} created by System Owner`);

            return shopId;
        });

        const shopId = transaction();
        res.json({ ok: true, id: shopId });
    } catch (e) {
        console.error('Shop creation error:', e);
        if (e.message.includes('UNIQUE constraint failed: users.username')) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        res.status(500).json({ error: 'Failed to create shop and admin' });
    }
});

// PATCH /api/shops/:id — status/panels update
router.patch('/:id', requireSuperAdmin, (req, res) => {
    const { status, allowed_panels, name } = req.body;
    const shopId = parseInt(req.params.id);

    if (status && !['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    if (name) db.prepare('UPDATE shops SET name = ? WHERE id = ?').run(name, shopId);
    if (status) db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shopId);
    if (allowed_panels) db.prepare('UPDATE shops SET allowed_panels = ? WHERE id = ?').run(JSON.stringify(allowed_panels), shopId);

    res.json({ ok: true });
});

// DELETE /api/shops/:id
router.delete('/:id', requireSuperAdmin, (req, res) => {
    const shopId = parseInt(req.params.id);
    db.prepare('DELETE FROM shops WHERE id = ?').run(shopId);
    res.json({ ok: true });
});

module.exports = router;

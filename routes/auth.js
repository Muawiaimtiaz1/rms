const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'blocked') {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact your administrator.' });
    }

    // ─── SaaS Restrictions ──────────────────────────────────────────
    if (user.role !== 'superadmin') {
        const shop = db.prepare('SELECT status FROM shops WHERE id = ?').get(user.shop_id);
        if (!shop) return res.status(403).json({ error: 'Shop not found' });
        if (shop.status === 'blocked') return res.status(403).json({ error: 'Shop access is blocked by administrator' });

        // Check Subscription
        const now = new Date().toISOString().split('T')[0];
        const sub = db.prepare(`
            SELECT end_date FROM subscriptions 
            WHERE shop_id = ? AND end_date >= ?
            ORDER BY end_date DESC LIMIT 1
        `).get(user.shop_id, now);

        if (!sub) return res.status(403).json({ error: 'No active subscription. Please contact administrator.' });
    }

    // ─── Panel Permissions ──────────────────────────────────────────
    let allowedPanels = user.allowed_panels ? JSON.parse(user.allowed_panels) : [];
    if (user.role !== 'superadmin') {
        const shop = db.prepare('SELECT allowed_panels FROM shops WHERE id = ?').get(user.shop_id);
        if (!shop) return res.status(403).json({ error: 'Shop not found' });

        // Filter user panels by what the shop actually has access to
        const shopPanels = shop.allowed_panels ? JSON.parse(shop.allowed_panels) : [];
        if (user.role === 'admin') {
            allowedPanels = shopPanels;
        } else {
            allowedPanels = allowedPanels.filter(p => shopPanels.includes(p));
        }
    }

    req.session.user = {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        shop_id: user.shop_id,
        allowed_panels: allowedPanels
    };
    res.json({ ok: true, user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    
    let total_users = 1;
    let total_brands = 1;

    try {
        if (req.session.user.shop_id) {
            total_users = db.prepare('SELECT COUNT(*) as c FROM users WHERE shop_id = ?').get(req.session.user.shop_id).c;
            total_brands = db.prepare('SELECT COUNT(*) as c FROM brands WHERE shop_id = ?').get(req.session.user.shop_id).c;
        } else {
            total_users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
            total_brands = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
        }
    } catch(e) { console.error('Error fetching counts', e); }

    res.json({ user: req.session.user, total_users, total_brands });
});

// POST /api/auth/forgot-password  (superadmin resets password for a user by username)
router.post('/forgot-password', requireSuperAdmin, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate a temporary password
    const tempPassword = 'Reset@' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const hash = bcrypt.hashSync(tempPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

    res.json({ ok: true, tempPassword, message: 'Password reset. Share the temp password with the user.' });
});

module.exports = router;

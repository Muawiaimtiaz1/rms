const express = require('express');
const authService = require('../services/AuthService');
const db = require('../db/knex');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await authService.login(username, password);
    
    req.session.user = user;
    res.json({ ok: true, user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    
    const freshUser = await authService.getProfile(req.session.user.id);
    if (!freshUser) return res.status(401).json({ error: 'User no longer exists' });

    // Sync session
    req.session.user = {
        ...req.session.user,
        allowed_panels: freshUser.allowed_panels,
        shop_name: freshUser.shop_name,
        shop_type: freshUser.shop_type,
        shop_status: freshUser.shop_status,
        shop_created_at: freshUser.shop_created_at,
        shop_phone: freshUser.shop_phone,
        shop_address: freshUser.shop_address,
        subscription: freshUser.subscription,
        name: freshUser.name,
        role: freshUser.role,
        can_manage_register: freshUser.can_manage_register
    };

    // Statistical counts for dashboard
    const counts = { total_users: 0, total_brands: 0 };
    const shopId = req.session.user.shop_id;

    const userCount = await db('users')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as c').first();
    counts.total_users = parseInt(userCount.c);

    const brandCount = await db('brands')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as c').first();
    counts.total_brands = parseInt(brandCount.c);

    res.json({ user: req.session.user, ...counts });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', requireSuperAdmin, async (req, res) => {
    const tempPassword = await authService.resetPassword(req.body.username);
    res.json({ ok: true, tempPassword, message: 'Password reset successful.' });
});

module.exports = router;

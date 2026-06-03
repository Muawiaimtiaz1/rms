const express = require('express');
const userService = require('../services/UserService');
const db = require('../db/knex');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users/assignable — minimal same-shop users for order assignment
router.get('/assignable', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.json([]);

    const users = await db('users')
        .select('id', 'name', 'role', 'phone')
        .where({ shop_id: shopId })
        .whereNot('role', 'superadmin')
        .where(function () {
            this.whereNull('status').orWhere('status', 'active');
        })
        .orderBy('name', 'asc');

    res.json(users);
});

// GET /api/users
router.get('/', requireAdmin, async (req, res) => {
    const users = await userService.listUsers(req.session.user);
    res.json(users);
});

// POST /api/users
router.post('/', requireSuperAdmin, async (req, res) => {
    const id = await userService.createUser(req.body, req.session.user);
    res.json({ ok: true, id });
});

// PUT /api/users/:id
router.put('/:id', requireAdmin, async (req, res) => {
    await userService.updateUser(req.params.id, req.body, req.session.user);
    res.json({ ok: true });
});

// DELETE /api/users/:id
router.delete('/:id', requireSuperAdmin, async (req, res) => {
    await userService.deleteUser(req.params.id, req.session.user);
    res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth'); // Added requireSuperAdmin
const router = express.Router();

// GET /api/users — admin only
router.get('/', requireAdmin, (req, res) => {
    let users;
    if (req.session.user.role === 'superadmin') {
        // Superadmin can see all users, including shop names
        users = db.prepare(`
            SELECT u.id, u.name, u.email, u.phone, u.username, u.role, u.status, u.shop_id, u.allowed_panels, u.created_at, s.name as shop_name 
            FROM users u 
            LEFT JOIN shops s ON u.shop_id = s.id 
            ORDER BY u.created_at DESC
        `).all();
    } else {
        // Shop admins should only see users in their own shop AND should NOT see superadmins OR users with no shop
        users = db.prepare('SELECT id, name, email, phone, username, role, status, shop_id, allowed_panels, created_at FROM users WHERE shop_id = ? AND role != \'superadmin\' AND shop_id IS NOT NULL ORDER BY created_at DESC').all(req.session.user.shop_id);
    }
    users.forEach(u => u.allowed_panels = u.allowed_panels ? JSON.parse(u.allowed_panels) : []);
    res.json(users);
});

// POST /api/users — admin creates a user
router.post('/', requireAdmin, (req, res) => {
    const { name, username, password, role, shop_id, allowed_panels, email, phone, status } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, and password required' });

    const currentUser = req.session.user;

    // Security Checks
    if (role === 'superadmin') return res.status(403).json({ error: 'Cannot create Super Admins' });
    if (role === 'admin' && currentUser.role !== 'superadmin') return res.status(403).json({ error: 'Only Super Admin can create Shop Admins' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const panelsJson = JSON.stringify(allowed_panels || []);

    // Determine shop_id
    let targetShopId;
    if (currentUser.role === 'superadmin') {
        targetShopId = shop_id || null;
    } else {
        targetShopId = currentUser.shop_id;
        if (!targetShopId) return res.status(403).json({ error: 'Standalone admins cannot create users' });
    }

    const result = db.prepare(
        'INSERT INTO users (name, email, phone, username, password_hash, role, status, allowed_panels, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, email || null, phone || null, username, hash, role || 'pos_user', 'active', panelsJson, targetShopId);

    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/users/:id — admin updates user details
router.put('/:id', requireAdmin, (req, res) => {
    const { name, email, phone, role, status, password, allowed_panels, shop_id } = req.body;
    const userId = parseInt(req.params.id);
    const currentUser = req.session.user;

    const userToEdit = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userToEdit) return res.status(404).json({ error: 'User not found' });

    // Isolation Check
    if (currentUser.role !== 'superadmin') {
        if (userToEdit.shop_id !== currentUser.shop_id) return res.status(403).json({ error: 'Access denied: User belongs to another shop' });
        if (userToEdit.role === 'superadmin' || userToEdit.role === 'admin') {
            // Admin can't edit other admins or superadmins (unless it's themselves maybe? But usually admin management is master-only)
            if (userToEdit.id !== currentUser.id) return res.status(403).json({ error: 'Cannot edit other admin accounts' });
        }
    }

    const panelsJson = JSON.stringify(allowed_panels || []);
    const isSuper = userToEdit.role === 'superadmin';
    const targetRole = (currentUser.role === 'superadmin' && !isSuper) ? (role || userToEdit.role) : (userToEdit.role);
    const targetShopId = (currentUser.role === 'superadmin' && !isSuper) ? (shop_id || userToEdit.shop_id) : (userToEdit.shop_id);
    const targetStatus = (isSuper) ? 'active' : (status && ['active', 'blocked'].includes(status) ? status : userToEdit.status);

    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, status=?, password_hash=?, allowed_panels=?, shop_id=? WHERE id=?')
            .run(name, email || null, phone || null, targetRole, targetStatus, hash, panelsJson, targetShopId, userId);
    } else {
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, status=?, allowed_panels=?, shop_id=? WHERE id=?')
            .run(name, email || null, phone || null, targetRole, targetStatus, panelsJson, targetShopId, userId);
    }

    res.json({ ok: true });
});

// DELETE /api/users/:id — admin deletes user
router.delete('/:id', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    const currentUser = req.session.user;

    // Prevent deleting self
    if (userId === currentUser.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    const userToDelete = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userToDelete) return res.status(404).json({ error: 'User not found' });

    // Permanent Protections
    if (userToDelete.role === 'superadmin') return res.status(403).json({ error: 'The Master Owner account cannot be deleted' });

    // Isolation Check
    if (currentUser.role !== 'superadmin') {
        if (userToDelete.shop_id !== currentUser.shop_id) return res.status(403).json({ error: 'Access denied' });
        if (userToDelete.role === 'admin' || userToDelete.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete admin accounts' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ ok: true });
});

module.exports = router;

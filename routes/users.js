const express = require('express');
const bcrypt = require('bcryptjs');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users — admin only
router.get('/', requireAdmin, async (req, res) => {
    const isPostgres = usePostgres();
    const shopId = req.session.user.shop_id;
    const isSuper = req.session.user.role === 'superadmin';

    try {
        let users;
        const query = isSuper ? `
            SELECT u.id, u.name, u.email, u.phone, u.username, u.role, u.status, u.shop_id, u.allowed_panels, u.created_at, s.name as shop_name 
            FROM users u 
            LEFT JOIN shops s ON u.shop_id = s.id 
            ORDER BY u.created_at DESC
        ` : `
            SELECT id, name, email, phone, username, role, status, shop_id, allowed_panels, created_at 
            FROM users 
            WHERE shop_id = ${isPostgres ? '$1' : '?'} AND role != 'superadmin' AND shop_id IS NOT NULL 
            ORDER BY created_at DESC
        `;

        if (isPostgres) {
            const { rows } = await getPostgres().query(query, isSuper ? [] : [shopId]);
            users = rows;
        } else {
            users = getSqlite().prepare(query).all(...(isSuper ? [] : [shopId]));
        }

        users.forEach(u => u.allowed_panels = u.allowed_panels ? JSON.parse(u.allowed_panels) : []);
        res.json(users);
    } catch (err) {
        console.error("Users fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/users — admin creates a user
router.post('/', requireAdmin, async (req, res) => {
    const { name, username, password, role, shop_id, allowed_panels, email, phone } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, and password required' });

    const currentUser = req.session.user;
    if (role === 'superadmin') return res.status(403).json({ error: 'Cannot create Super Admins' });
    if (role === 'admin' && currentUser.role !== 'superadmin') return res.status(403).json({ error: 'Only Super Admin can create Shop Admins' });

    try {
        const isPostgres = usePostgres();
        let existing;
        if (isPostgres) {
            const { rows } = await getPostgres().query('SELECT id FROM users WHERE username = $1', [username]);
            existing = rows[0];
        } else {
            existing = getSqlite().prepare('SELECT id FROM users WHERE username = ?').get(username);
        }
        if (existing) return res.status(409).json({ error: 'Username already taken' });

        const hash = bcrypt.hashSync(password, 10);
        const panelsJson = JSON.stringify(allowed_panels || []);

        let targetShopId = (currentUser.role === 'superadmin') ? (shop_id || null) : currentUser.shop_id;
        if (!targetShopId && currentUser.role !== 'superadmin') return res.status(403).json({ error: 'Standalone admins cannot create users' });

        const insertQ = isPostgres 
            ? 'INSERT INTO users (name, email, phone, username, password_hash, role, status, allowed_panels, shop_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id'
            : 'INSERT INTO users (name, email, phone, username, password_hash, role, status, allowed_panels, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [name, email || null, phone || null, username, hash, role || 'pos_user', 'active', panelsJson, targetShopId];

        if (isPostgres) {
            const { rows } = await getPostgres().query(insertQ, params);
            res.json({ ok: true, id: rows[0].id });
        } else {
            const result = getSqlite().prepare(insertQ).run(...params);
            res.json({ ok: true, id: result.lastInsertRowid });
        }
    } catch (err) {
        console.error("User create error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/users/:id — admin updates user details
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, email, phone, role, status, password, allowed_panels, shop_id } = req.body;
    const userId = parseInt(req.params.id);
    const currentUser = req.session.user;
    const isPostgres = usePostgres();

    try {
        let userToEdit;
        if (isPostgres) {
            const { rows } = await getPostgres().query('SELECT * FROM users WHERE id = $1', [userId]);
            userToEdit = rows[0];
        } else {
            userToEdit = getSqlite().prepare('SELECT * FROM users WHERE id = ?').get(userId);
        }
        if (!userToEdit) return res.status(404).json({ error: 'User not found' });

        if (currentUser.role !== 'superadmin') {
            if (userToEdit.shop_id !== currentUser.shop_id) return res.status(403).json({ error: 'Access denied' });
            if ((userToEdit.role === 'superadmin' || userToEdit.role === 'admin') && userToEdit.id !== currentUser.id) {
                return res.status(403).json({ error: 'Cannot edit other admin accounts' });
            }
        }

        const panelsJson = JSON.stringify(allowed_panels || []);
        const isSuper = userToEdit.role === 'superadmin';
        const targetRole = (currentUser.role === 'superadmin' && !isSuper) ? (role || userToEdit.role) : (userToEdit.role);
        const targetShopId = (currentUser.role === 'superadmin' && !isSuper) ? (shop_id || userToEdit.shop_id) : (userToEdit.shop_id);
        const targetStatus = (isSuper) ? 'active' : (status && ['active', 'blocked'].includes(status) ? status : userToEdit.status);

        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            const q = isPostgres 
                ? 'UPDATE users SET name=$1, email=$2, phone=$3, role=$4, status=$5, password_hash=$6, allowed_panels=$7, shop_id=$8 WHERE id=$9'
                : 'UPDATE users SET name=?, email=?, phone=?, role=?, status=?, password_hash=?, allowed_panels=?, shop_id=? WHERE id=?';
            const p = [name, email || null, phone || null, targetRole, targetStatus, hash, panelsJson, targetShopId, userId];
            if (isPostgres) await getPostgres().query(q, p); else getSqlite().prepare(q).run(...p);
        } else {
            const q = isPostgres
                ? 'UPDATE users SET name=$1, email=$2, phone=$3, role=$4, status=$5, allowed_panels=$6, shop_id=$7 WHERE id=$8'
                : 'UPDATE users SET name=?, email=?, phone=?, role=?, status=?, allowed_panels=?, shop_id=? WHERE id=?';
            const p = [name, email || null, phone || null, targetRole, targetStatus, panelsJson, targetShopId, userId];
            if (isPostgres) await getPostgres().query(q, p); else getSqlite().prepare(q).run(...p);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error("User update error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/users/:id — admin deletes user
router.delete('/:id', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const currentUser = req.session.user;
    const isPostgres = usePostgres();

    if (userId === currentUser.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    try {
        let userToDelete;
        if (isPostgres) userToDelete = (await getPostgres().query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
        else userToDelete = getSqlite().prepare('SELECT * FROM users WHERE id = ?').get(userId);

        if (!userToDelete) return res.status(404).json({ error: 'User not found' });
        if (userToDelete.role === 'superadmin') return res.status(403).json({ error: 'The Master Owner account cannot be deleted' });

        if (currentUser.role !== 'superadmin') {
            if (userToDelete.shop_id !== currentUser.shop_id) return res.status(403).json({ error: 'Access denied' });
            if (userToDelete.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts' });
        }

        const q = isPostgres ? 'DELETE FROM users WHERE id = $1' : 'DELETE FROM users WHERE id = ?';
        if (isPostgres) await getPostgres().query(q, [userId]);
        else getSqlite().prepare(q).run(userId);
        res.json({ ok: true });
    } catch (err) {
        console.error("User delete error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users — admin only
router.get('/', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, name, email, phone, username, role, allowed_panels, created_at FROM users ORDER BY created_at DESC').all();
    users.forEach(u => u.allowed_panels = u.allowed_panels ? JSON.parse(u.allowed_panels) : []);
    res.json(users);
});

// POST /api/users — admin creates a user
router.post('/', requireAdmin, (req, res) => {
    const { name, email, phone, username, password, role, allowed_panels } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password required' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const panelsJson = JSON.stringify(allowed_panels || []);
    const result = db.prepare(
        'INSERT INTO users (name, email, phone, username, password_hash, role, allowed_panels) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name, email || null, phone || null, username, hash, role === 'admin' ? 'admin' : 'user', panelsJson);

    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/users/:id — admin updates user details
router.put('/:id', requireAdmin, (req, res) => {
    const { name, email, phone, role, password, allowed_panels } = req.body;
    const userId = parseInt(req.params.id);
    const panelsJson = JSON.stringify(allowed_panels || []);

    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, password_hash=?, allowed_panels=? WHERE id=?')
            .run(name, email || null, phone || null, role === 'admin' ? 'admin' : 'user', hash, panelsJson, userId);
    } else {
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, allowed_panels=? WHERE id=?')
            .run(name, email || null, phone || null, role === 'admin' ? 'admin' : 'user', panelsJson, userId);
    }

    res.json({ ok: true });
});

// DELETE /api/users/:id — admin deletes user
router.delete('/:id', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    // Prevent deleting self
    if (userId === req.session.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ ok: true });
});

module.exports = router;

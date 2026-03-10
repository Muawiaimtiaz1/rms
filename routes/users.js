const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users — admin only
router.get('/', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, name, email, phone, username, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
});

// POST /api/users — admin creates a user
router.post('/', requireAdmin, (req, res) => {
    const { name, email, phone, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password required' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO users (name, email, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email || null, phone || null, username, hash, role === 'admin' ? 'admin' : 'user');

    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/users/:id — admin updates user details
router.put('/:id', requireAdmin, (req, res) => {
    const { name, email, phone, role, password } = req.body;
    const userId = parseInt(req.params.id);

    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, password_hash=? WHERE id=?')
            .run(name, email || null, phone || null, role === 'admin' ? 'admin' : 'user', hash, userId);
    } else {
        db.prepare('UPDATE users SET name=?, email=?, phone=?, role=? WHERE id=?')
            .run(name, email || null, phone || null, role === 'admin' ? 'admin' : 'user', userId);
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

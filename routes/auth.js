const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role, allowed_panels: user.allowed_panels ? JSON.parse(user.allowed_panels) : [] };
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
    res.json({ user: req.session.user });
});

// POST /api/auth/forgot-password  (admin resets password for a user by username)
router.post('/forgot-password', (req, res) => {
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

const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/expense-categories
router.get('/', requireAuth, (req, res) => {
    const categories = db.prepare('SELECT * FROM expense_categories WHERE shop_id = ?').all(req.session.user.shop_id);
    res.json(categories);
});

// POST /api/expense-categories
router.post('/', requireAuth, (req, res) => {
    const { name, emoji, color_class } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = db.prepare(
        'INSERT INTO expense_categories (shop_id, name, emoji, color_class) VALUES (?, ?, ?, ?)'
    ).run(req.session.user.shop_id, name, emoji || '📦', color_class || 'bg-slate-700 text-slate-300');

    res.json({ ok: true, id: result.lastInsertRowid });
});

// DELETE /api/expense-categories/:id
router.delete('/:id', requireAuth, (req, res) => {
    const catId = parseInt(req.params.id);
    const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ? AND shop_id = ?').get(catId, req.session.user.shop_id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    // Check if category is in use
    const categoryName = db.prepare('SELECT name FROM expense_categories WHERE id = ?').get(catId).name;
    const count = db.prepare('SELECT COUNT(*) as count FROM expenses WHERE category = ? AND shop_id = ?').get(categoryName, req.session.user.shop_id).count;

    if (count > 0) {
        return res.status(400).json({ error: 'Category is in use by expenses and cannot be deleted.' });
    }

    db.prepare('DELETE FROM expense_categories WHERE id = ? AND shop_id = ?').run(catId, req.session.user.shop_id);
    res.json({ ok: true });
});

module.exports = router;

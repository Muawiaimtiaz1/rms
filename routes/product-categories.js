const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/product-categories
router.get('/', requireAuth, (req, res) => {
    try {
        const categories = db.prepare('SELECT * FROM product_categories WHERE shop_id = ?').all(req.session.user.shop_id);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/product-categories
router.post('/', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
        const result = db.prepare(
            'INSERT INTO product_categories (shop_id, name) VALUES (?, ?)'
        ).run(req.session.user.shop_id, name);

        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/product-categories/:id
router.delete('/:id', requireAuth, (req, res) => {
    const catId = parseInt(req.params.id);
    try {
        const cat = db.prepare('SELECT id, name FROM product_categories WHERE id = ? AND shop_id = ?').get(catId, req.session.user.shop_id);
        if (!cat) return res.status(404).json({ error: 'Category not found' });

        // Check if category is in use by products
        const count = db.prepare('SELECT COUNT(*) as count FROM products WHERE category = ? AND shop_id = ?').get(cat.name, req.session.user.shop_id).count;

        if (count > 0) {
            return res.status(400).json({ error: 'Category is in use by products and cannot be deleted.' });
        }

        db.prepare('DELETE FROM product_categories WHERE id = ? AND shop_id = ?').run(catId, req.session.user.shop_id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

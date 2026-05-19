const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/product-categories
router.get('/', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        const query = isPostgres ? 'SELECT * FROM product_categories WHERE shop_id = $1 ORDER BY id ASC' : 'SELECT * FROM product_categories WHERE shop_id = ? ORDER BY id ASC';
        let categories;
        if (isPostgres) categories = (await getPostgres().query(query, [shopId])).rows;
        else categories = getSqlite().prepare(query).all(shopId);
        res.json(categories);
    } catch (err) {
        console.error("Fetch categories error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/product-categories
router.post('/', requireAuth, async (req, res) => {
    const { name } = req.body;
    const shopId = req.session.user.shop_id;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
        const isPostgres = usePostgres();
        const query = isPostgres ? 'INSERT INTO product_categories (shop_id, name) VALUES ($1, $2) RETURNING id' : 'INSERT INTO product_categories (shop_id, name) VALUES (?, ?)';
        if (isPostgres) {
            const { rows } = await getPostgres().query(query, [shopId, name]);
            res.json({ ok: true, id: rows[0].id });
        } else {
            const result = getSqlite().prepare(query).run(shopId, name);
            res.json({ ok: true, id: result.lastInsertRowid });
        }
    } catch (err) {
        console.error("Create category error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/product-categories/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const catId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        let cat;
        if (isPostgres) cat = (await getPostgres().query('SELECT id, name FROM product_categories WHERE id = $1 AND shop_id = $2', [catId, shopId])).rows[0];
        else cat = getSqlite().prepare('SELECT id, name FROM product_categories WHERE id = ? AND shop_id = ?').get(catId, shopId);
        
        if (!cat) return res.status(404).json({ error: 'Category not found' });

        const countQ = isPostgres 
            ? 'SELECT COUNT(*)::int as count FROM products WHERE category = $1 AND shop_id = $2'
            : 'SELECT COUNT(*) as count FROM products WHERE category = ? AND shop_id = ?';
        let count;
        if (isPostgres) count = (await getPostgres().query(countQ, [cat.name, shopId])).rows[0].count;
        else count = getSqlite().prepare(countQ).get(cat.name, shopId).count;

        if (count > 0) return res.status(400).json({ error: 'Category is in use by products and cannot be deleted.' });

        const delQ = isPostgres ? 'DELETE FROM product_categories WHERE id = $1 AND shop_id = $2' : 'DELETE FROM product_categories WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(delQ, [catId, shopId]);
        else getSqlite().prepare(delQ).run(catId, shopId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Delete category error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

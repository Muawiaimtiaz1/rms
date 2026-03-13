const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/products
router.get('/', requireAuth, (req, res) => {
    const products = db.prepare(`
    SELECT p.*, b.name as brand_name
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE p.shop_id = ?
    ORDER BY p.name ASC
  `).all(req.session.user.shop_id);
    res.json(products);
});

// POST /api/products
router.post('/', requireAuth, (req, res) => {
    const { sku, name, category, description, brand_id, buying_price, stock, min_stock_level } = req.body;
    if (!sku || !name || !category || !brand_id) return res.status(400).json({ error: 'sku, name, category, and brand_id required' });

    // Ensure brand belongs to shop
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND shop_id = ?').get(brand_id, req.session.user.shop_id);
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });

    const result = db.prepare(
        'INSERT INTO products (sku, name, category, description, brand_id, user_id, shop_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(sku, name, category, description || null, brand_id, req.session.user.id, req.session.user.shop_id, buying_price || 0, stock || 0, min_stock_level || 0);

    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/products/:id
router.put('/:id', requireAuth, (req, res) => {
    const { sku, name, category, description, brand_id, buying_price, stock, min_stock_level } = req.body;
    const productId = parseInt(req.params.id);

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?').get(productId, req.session.user.shop_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    db.prepare(
        'UPDATE products SET sku=?, name=?, category=?, description=?, brand_id=?, buying_price=?, stock=?, min_stock_level=? WHERE id=? AND shop_id=?'
    ).run(sku, name, category, description || null, brand_id, buying_price || 0, stock ?? product.stock, min_stock_level || 0, productId, req.session.user.shop_id);

    res.json({ ok: true });
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, (req, res) => {
    const productId = parseInt(req.params.id);
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?').get(productId, req.session.user.shop_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Prevent deletion if product has sales history
    const hasSales = db.prepare('SELECT 1 FROM sale_items WHERE product_id = ? LIMIT 1').get(productId);
    if (hasSales) {
        return res.status(400).json({ error: 'Cannot delete product with sales history. Please archive it or zero out stock instead.' });
    }

    db.prepare('DELETE FROM products WHERE id = ? AND shop_id = ?').run(productId, req.session.user.shop_id);
    res.json({ ok: true });

});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', requireAuth, (req, res) => {
    const { delta } = req.body; // +N or -N
    const productId = parseInt(req.params.id);
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?').get(productId, req.session.user.shop_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const newStock = Math.max(0, product.stock + parseInt(delta || 0));
    db.prepare('UPDATE products SET stock = ? WHERE id = ? AND shop_id = ?').run(newStock, productId, req.session.user.shop_id);
    res.json({ ok: true, stock: newStock });
});

module.exports = router;

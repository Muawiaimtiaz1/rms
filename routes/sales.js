const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// POST /api/sales — create a sale (checkout)
router.post('/', requireAuth, (req, res) => {
    console.log("DEBUG: Checkout payload received:", req.body);
    const { items, discount = 0, tax_percentage = 0, payment_method = 'cash', amount_received = 0, customer_name = '', customer_phone = '' } = req.body; // [{product_id, quantity, selling_price}]
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    const insertSale = db.transaction((cartItems) => {
        let subtotal = 0;
        const resolved = [];

        for (const item of cartItems) {
            const product = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
                .get(item.product_id, req.session.user.shop_id);
            if (!product) throw new Error(`Product ${item.product_id} not found`);
            if (product.stock < item.quantity) throw new Error(`Insufficient stock for "${product.name}"`);

            // Validate that we got a selling price
            if (item.selling_price === undefined || item.selling_price < 0) {
                throw new Error(`Invalid selling price for "${product.name}"`);
            }

            resolved.push({ product, quantity: item.quantity, selling_price: item.selling_price });
            subtotal += item.selling_price * item.quantity;
        }

        const taxAmount = (subtotal - discount) * (tax_percentage / 100);
        const grandTotal = subtotal - discount + taxAmount;

        const saleResult = db.prepare(
            'INSERT INTO sales (shop_id, user_id, customer_name, customer_phone, total, discount, tax_percentage, payment_method, amount_received) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.session.user.shop_id, req.session.user.id, customer_name, customer_phone, grandTotal, discount, tax_percentage, payment_method, amount_received);
        const saleId = saleResult.lastInsertRowid;

        for (const { product, quantity, selling_price } of resolved) {
            db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)')
                .run(saleId, product.id, quantity, selling_price);
            db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND shop_id = ?').run(quantity, product.id, req.session.user.shop_id);
        }

        return { saleId, total: grandTotal };
    });

    try {
        const result = insertSale(items);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/sales — list sales for current shop
router.get('/', requireAuth, (req, res) => {
    const sales = db.prepare('SELECT * FROM sales WHERE shop_id = ? ORDER BY created_at DESC LIMIT 100').all(req.session.user.shop_id);
    res.json(sales);
});

// PATCH /api/sales/:id/pay — mark sale as fully paid
router.patch('/:id/pay', requireAuth, (req, res) => {
    const { amount } = req.body;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.session.user.shop_id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    // If no specific amount was provided, we assume marking full grand total as received
    const finalAmount = amount !== undefined ? parseFloat(amount) : sale.total;

    db.prepare('UPDATE sales SET amount_received = ? WHERE id = ? AND shop_id = ?').run(finalAmount, sale.id, req.session.user.shop_id);
    res.json({ ok: true, amount_received: finalAmount });
});

// GET /api/sales/:id/bill — get full bill details
router.get('/:id/bill', requireAuth, (req, res) => {
    const saleId = parseInt(req.params.id);
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(saleId, req.session.user.shop_id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = db.prepare(`
    SELECT si.*, p.name as product_name, b.name as brand_name
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE si.sale_id = ?
  `).all(saleId);

    const seller = db.prepare('SELECT name FROM users WHERE id = ?').get(sale.user_id);

    res.json({ sale, items, seller });
});

module.exports = router;

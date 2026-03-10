const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/brands — list current user's brands
router.get('/', requireAuth, (req, res) => {
    const brands = db.prepare('SELECT * FROM brands WHERE user_id = ? ORDER BY name ASC').all(req.session.user.id);
    res.json(brands);
});

// POST /api/brands — create brand
router.post('/', requireAuth, (req, res) => {
    return res.status(403).json({ error: 'Adding new brands is disabled.' });
});

// PUT /api/brands/:id
router.put('/:id', requireAuth, (req, res) => {
    const { name } = req.body;
    const brandId = parseInt(req.params.id);

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, req.session.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    db.prepare('UPDATE brands SET name = ? WHERE id = ?').run(name, brandId);
    res.json({ ok: true });
});

// DELETE /api/brands/:id
router.delete('/:id', requireAuth, (req, res) => {
    const brandId = parseInt(req.params.id);

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?').get(brandId, req.session.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    db.prepare('DELETE FROM brands WHERE id = ?').run(brandId);
    res.json({ ok: true });
});
// GET /api/brands/expense-shares
router.get('/expense-shares', requireAuth, (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const userId = req.session.user.id;

    // Get total expenses for the month
    const totalExpQuery = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as val 
        FROM expenses 
        WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    `).get(userId, month);
    const totalExp = totalExpQuery.val;

    // Get all brands
    const brands = db.prepare('SELECT id, name FROM brands WHERE user_id = ?').all(userId);
    const brandCount = brands.length;

    // Per brand share
    const sharePerBrand = brandCount > 0 ? (totalExp / brandCount) : 0;

    // Get payments for the month
    const payments = db.prepare(`
        SELECT brand_expense_payments.brand_id, COALESCE(SUM(brand_expense_payments.amount), 0) as paid 
        FROM brand_expense_payments 
        JOIN brands ON brands.id = brand_expense_payments.brand_id
        WHERE brands.user_id = ? AND brand_expense_payments.month = ?
        GROUP BY brand_expense_payments.brand_id
    `).all(userId, month);

    const paymentMap = {};
    payments.forEach(p => paymentMap[p.brand_id] = p.paid);

    const shares = brands.map(b => ({
        brand_id: b.id,
        brand_name: b.name,
        total_share: sharePerBrand,
        paid: paymentMap[b.id] || 0,
        due: sharePerBrand - (paymentMap[b.id] || 0)
    }));

    res.json({ month, totalExpenses: totalExp, brandCount, shares });
});

// POST /api/brands/expense-payments
router.post('/expense-payments', requireAuth, (req, res) => {
    const { brand_id, amount, month } = req.body;
    if (!brand_id || !amount || !month) return res.status(400).json({ error: 'brand_id, amount, month required' });

    // Validate brand belongs to user
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').get(brand_id, req.session.user.id);
    if (!brand) return res.status(403).json({ error: 'Unauthorized brand' });

    db.prepare('INSERT INTO brand_expense_payments (brand_id, amount, month) VALUES (?, ?, ?)')
        .run(brand_id, parseFloat(amount), month);

    res.json({ ok: true });
});

module.exports = router;

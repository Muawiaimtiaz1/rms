const express = require('express');
const db = require('../db/db');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/subscriptions — superadmin only
router.get('/', requireSuperAdmin, (req, res) => {
    const subs = db.prepare(`
        SELECT s.*, sh.name as shop_name 
        FROM subscriptions s 
        JOIN shops sh ON s.shop_id = sh.id 
        ORDER BY s.month DESC, s.paid_at DESC
    `).all();
    res.json(subs);
});

// POST /api/subscriptions — record a payment
router.post('/', requireSuperAdmin, (req, res) => {
    const { shop_id, amount, month, type } = req.body;
    if (!shop_id || !amount || !month) return res.status(400).json({ error: 'Missing payment details' });

    const subType = type || '1_month';
    const durationMap = {
        '1_month': 1,
        '3_months': 3,
        '6_months': 6,
        '1_year': 12,
        '2_years': 24
    };
    const monthsToAdd = durationMap[subType] || 1;

    const startDate = req.body.start_date ? new Date(req.body.start_date) : new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + monthsToAdd);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    db.transaction(() => {
        db.prepare(`
            INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) 
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(shop_id, amount, subType, startDateStr, endDateStr, month);

        // Auto-activate the shop upon payment
        db.prepare('UPDATE shops SET status = ? WHERE id = ?').run('active', shop_id);
    })();

    res.json({ ok: true });
});

module.exports = router;

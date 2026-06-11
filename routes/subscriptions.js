const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/subscriptions — superadmin only
router.get('/', requireSuperAdmin, async (req, res) => {
    const isPostgres = usePostgres();
    const query = `
        SELECT s.*, sh.name as shop_name 
        FROM subscriptions s 
        JOIN shops sh ON s.shop_id = sh.id 
        ORDER BY s.month DESC, s.paid_at DESC
    `;
    try {
        let subs;
        if (isPostgres) subs = (await getPostgres().query(query)).rows;
        else subs = getSqlite().prepare(query).all();
        res.json(subs);
    } catch (e) {
        console.error("Fetch subscriptions error:", e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/subscriptions — record a payment
router.post('/', requireSuperAdmin, async (req, res) => {
    const { shop_id, amount, month, type } = req.body;
    if (!shop_id || amount === undefined || amount === null || !month) return res.status(400).json({ error: 'Missing payment details' });

    const subType = type || '1_month';

    const startDate = req.body.start_date ? new Date(req.body.start_date) : new Date();
    let endDate;
    if (subType === 'lifetime') {
        endDate = new Date('2099-12-31T00:00:00');
    } else {
        const durationMap = { '1_month': 1, '3_months': 3, '6_months': 6, '1_year': 12, '2_years': 24 };
        const monthsToAdd = durationMap[subType] || 1;
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + monthsToAdd);
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    try {
        const performSub = async (client) => {
            const isPostgres = usePostgres();
            const insertQ = isPostgres 
                ? 'INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES ($1, $2, $3, $4, $5, $6)'
                : 'INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES (?, ?, ?, ?, ?, ?)';
            const params = [shop_id, amount, subType, startDateStr, endDateStr, month];
            
            if (isPostgres) {
                await client.query(insertQ, params);
                await client.query('UPDATE shops SET status = $1 WHERE id = $2', ['active', shop_id]);
            } else {
                client.prepare(insertQ).run(...params);
                client.prepare('UPDATE shops SET status = ? WHERE id = ?').run('active', shop_id);
            }
        };

        if (usePostgres()) await getPostgres().withTransaction(performSub);
        else getSqlite().transaction(() => performSub(getSqlite()))();

        res.json({ ok: true });
    } catch (e) {
        console.error("Subscription record error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

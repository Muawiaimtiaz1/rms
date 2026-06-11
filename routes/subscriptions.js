const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/error-response');
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
        sendError(res, e, "Failed to fetch subscriptions");
    }
});

// POST /api/subscriptions — legacy write path
router.post('/', requireSuperAdmin, async (req, res) => {
    res.status(410).json({
        error: 'Subscription payments are now managed from Settings > Platform Payments.'
    });
});

module.exports = router;

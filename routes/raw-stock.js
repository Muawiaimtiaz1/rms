const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/raw-stock
router.get('/', requireAuth, (req, res) => {
    try {
        const stocks = db.prepare(`
            SELECT rs.*,
            (SELECT buying_price FROM raw_stock_batches WHERE raw_stock_id = rs.id ORDER BY id DESC LIMIT 1) as buying_price,
            (
                SELECT json_group_array(
                    json_object(
                        'id', rsb.id,
                        'buying_price', rsb.buying_price,
                        'quantity', rsb.quantity,
                        'created_at', rsb.created_at
                    )
                )
                FROM raw_stock_batches rsb
                WHERE rsb.raw_stock_id = rs.id AND rsb.quantity > 0
            ) as batches
            FROM raw_stocks rs
            WHERE rs.shop_id = ? AND rs.is_deleted = 0
            ORDER BY rs.name ASC
        `).all(req.session.user.shop_id);

        stocks.forEach(s => {
            try {
                s.batches = JSON.parse(s.batches);
            } catch (e) { s.batches = []; }
        });

        res.json(stocks);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/raw-stock
router.post('/', requireAuth, (req, res) => {
    const { name, unit, min_stock_level, initial_stock, buying_price } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'Name and unit are required' });

    try {
        const transaction = db.transaction(() => {
            const result = db.prepare(
                'INSERT INTO raw_stocks (shop_id, name, unit, current_stock, min_stock_level) VALUES (?, ?, ?, ?, ?)'
            ).run(req.session.user.shop_id, name, unit, initial_stock || 0, min_stock_level || 0);

            const stockId = result.lastInsertRowid;

            if (initial_stock > 0) {
                db.prepare(
                    'INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)'
                ).run(stockId, req.session.user.shop_id, buying_price || 0, initial_stock);
            }

            return stockId;
        });

        const id = transaction();
        res.json({ ok: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/raw-stock/:id/stock
router.patch('/:id/stock', requireAuth, (req, res) => {
    const { delta, buying_price } = req.body; // delta can be + or -
    const stockId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;

    try {
        const transaction = db.transaction(() => {
            const stock = db.prepare('SELECT current_stock FROM raw_stocks WHERE id = ? AND shop_id = ?').get(stockId, shopId);
            if (!stock) throw new Error('Ingredient not found');

            const diff = parseFloat(delta || 0);
            const price = parseFloat(buying_price || 0);

            if (diff > 0) {
                // Adding stock
                db.prepare('INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)')
                  .run(stockId, shopId, price, diff);
            } else if (diff < 0) {
                // Reducing stock (FIFO)
                let toRemove = Math.abs(diff);
                const batches = db.prepare('SELECT * FROM raw_stock_batches WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(stockId, shopId);
                
                for (const b of batches) {
                    if (toRemove <= 0) break;
                    const take = Math.min(b.quantity, toRemove);
                    db.prepare('UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                    toRemove -= take;
                }
            }

            db.prepare('UPDATE raw_stocks SET current_stock = current_stock + ? WHERE id = ? AND shop_id = ?')
              .run(diff, stockId, shopId);

            return true;
        });

        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/raw-stock/waste
router.post('/waste', requireAuth, (req, res) => {
    const { raw_stock_id, quantity, reason } = req.body;
    if (!raw_stock_id || !quantity) return res.status(400).json({ error: 'Ingredient ID and quantity required' });

    try {
        const transaction = db.transaction(() => {
            const stock = db.prepare('SELECT current_stock FROM raw_stocks WHERE id = ? AND shop_id = ?').get(raw_stock_id, req.session.user.shop_id);
            if (!stock) throw new Error('Ingredient not found');

            // Record waste
            db.prepare(
                'INSERT INTO raw_stock_waste (raw_stock_id, shop_id, user_id, quantity, reason) VALUES (?, ?, ?, ?, ?)'
            ).run(raw_stock_id, req.session.user.shop_id, req.session.user.id, quantity, reason || '');

            // Deduct from stock (FIFO)
            let toRemove = parseFloat(quantity);
            const batches = db.prepare('SELECT * FROM raw_stock_batches WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(raw_stock_id, req.session.user.shop_id);
            
            for (const b of batches) {
                if (toRemove <= 0) break;
                const take = Math.min(b.quantity, toRemove);
                db.prepare('UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                toRemove -= take;
            }

            db.prepare('UPDATE raw_stocks SET current_stock = current_stock - ? WHERE id = ? AND shop_id = ?')
              .run(quantity, raw_stock_id, req.session.user.shop_id);

            return true;
        });

        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/raw-stock/waste
router.get('/waste-history', requireAuth, (req, res) => {
    try {
        const history = db.prepare(`
            SELECT w.*, rs.name as ingredient_name, u.name as user_name
            FROM raw_stock_waste w
            JOIN raw_stocks rs ON w.raw_stock_id = rs.id
            JOIN users u ON w.user_id = u.id
            WHERE w.shop_id = ?
            ORDER BY w.created_at DESC
        `).all(req.session.user.shop_id);
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

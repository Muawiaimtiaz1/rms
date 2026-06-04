const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const wasteService = require('../services/WasteService');
const router = express.Router();

// GET /api/raw-stock
router.get('/', requireAuth, async (req, res) => {
    const isPostgres = usePostgres();
    const shopId = req.session.user.shop_id;
    try {
        const query = isPostgres ? `
            SELECT rs.*,
            (SELECT buying_price FROM raw_stock_batches WHERE raw_stock_id = rs.id ORDER BY id DESC LIMIT 1) as buying_price,
            (
                SELECT json_agg(
                    json_build_object(
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
            WHERE rs.shop_id = $1 AND rs.is_deleted = 0
            ORDER BY rs.name ASC
        ` : `
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
        `;

        let stocks;
        if (isPostgres) {
            const { rows } = await getPostgres().query(query, [shopId]);
            stocks = rows;
        } else {
            stocks = getSqlite().prepare(query).all(shopId);
        }

        stocks.forEach(s => {
            const parseJson = (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return null; }
                }
                return val;
            };
            s.batches = parseJson(s.batches);
            if (!Array.isArray(s.batches) || s.batches.length === 0) s.batches = [];
        });

        res.json(stocks);
    } catch (e) {
        console.error("Raw stock fetch error:", e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/raw-stock
router.post('/', requireAuth, async (req, res) => {
    const { name, unit, usage_unit, conversion_factor, min_stock_level, initial_stock, buying_price } = req.body;
    const shopId = req.session.user.shop_id;
    if (!name || !unit) return res.status(400).json({ error: 'Name and unit are required' });

    try {
        let stockId;
        if (usePostgres()) {
            stockId = await getPostgres().withTransaction(async (client) => {
                const { rows } = await client.query(
                    'INSERT INTO raw_stocks (shop_id, name, unit, usage_unit, conversion_factor, current_stock, min_stock_level) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                    [shopId, name, unit, usage_unit || null, conversion_factor || 1, initial_stock || 0, min_stock_level || 0]
                );
                const sid = rows[0].id;
                if (initial_stock > 0) {
                    await client.query('INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES ($1, $2, $3, $4)', [sid, shopId, buying_price || 0, initial_stock]);
                }
                return sid;
            });
        } else {
            stockId = getSqlite().transaction(() => {
                const result = getSqlite().prepare(
                    'INSERT INTO raw_stocks (shop_id, name, unit, usage_unit, conversion_factor, current_stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(shopId, name, unit, usage_unit || null, conversion_factor || 1, initial_stock || 0, min_stock_level || 0);
                const sid = result.lastInsertRowid;
                if (initial_stock > 0) {
                    getSqlite().prepare('INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)').run(sid, shopId, buying_price || 0, initial_stock);
                }
                return sid;
            })();
        }
        res.json({ ok: true, id: stockId });
    } catch (e) {
        console.error("Raw stock create error:", e);
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/raw-stock/:id/stock
router.patch('/:id/stock', requireAuth, async (req, res) => {
    const { delta, buying_price } = req.body;
    const stockId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();

    try {
        const performUpdate = async (client) => {
            let stock;
            if (isPostgres) {
                const { rows } = await client.query('SELECT current_stock FROM raw_stocks WHERE id = $1 AND shop_id = $2', [stockId, shopId]);
                stock = rows[0];
            } else {
                stock = client.prepare('SELECT current_stock FROM raw_stocks WHERE id = ? AND shop_id = ?').get(stockId, shopId);
            }
            if (!stock) throw new Error('Ingredient not found');

            const diff = parseFloat(delta || 0);
            const price = parseFloat(buying_price || 0);

            if (diff > 0) {
                if (isPostgres) await client.query('INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES ($1, $2, $3, $4)', [stockId, shopId, price, diff]);
                else client.prepare('INSERT INTO raw_stock_batches (raw_stock_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)').run(stockId, shopId, price, diff);
            } else if (diff < 0) {
                let toRemove = Math.abs(diff);
                let batches;
                if (isPostgres) batches = (await client.query('SELECT * FROM raw_stock_batches WHERE raw_stock_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC', [stockId, shopId])).rows;
                else batches = client.prepare('SELECT * FROM raw_stock_batches WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(stockId, shopId);
                
                for (const b of batches) {
                    if (toRemove <= 0) break;
                    const take = Math.min(b.quantity, toRemove);
                    if (isPostgres) await client.query('UPDATE raw_stock_batches SET quantity = quantity - $1 WHERE id = $2', [take, b.id]);
                    else client.prepare('UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                    toRemove -= take;
                }
            }

            if (isPostgres) await client.query('UPDATE raw_stocks SET current_stock = current_stock + $1 WHERE id = $2 AND shop_id = $3', [diff, stockId, shopId]);
            else client.prepare('UPDATE raw_stocks SET current_stock = current_stock + ? WHERE id = ? AND shop_id = ?').run(diff, stockId, shopId);
        };

        if (isPostgres) await getPostgres().withTransaction(performUpdate);
        else getSqlite().transaction(() => performUpdate(getSqlite()))();

        res.json({ ok: true });
    } catch (e) {
        console.error("Raw stock update error:", e);
        res.status(400).json({ error: e.message });
    }
});

// POST /api/raw-stock/waste
router.post('/waste', requireAuth, async (req, res) => {
    const { raw_stock_id, quantity, reason } = req.body;
    const shopId = req.session.user.shop_id;
    const userId = req.session.user.id;
    const isPostgres = usePostgres();

    if (!raw_stock_id || !quantity) return res.status(400).json({ error: 'Ingredient ID and quantity required' });

    try {
        if (isPostgres) {
            const result = await wasteService.record(shopId, userId, {
                source_type: 'raw_ingredient',
                raw_stock_id,
                quantity,
                reason,
                stock_action: 'deduct'
            });
            return res.json(result);
        }

        const performWaste = (client) => {
            const stock = client.prepare('SELECT current_stock FROM raw_stocks WHERE id = ? AND shop_id = ?').get(raw_stock_id, shopId);
            
            if (!stock) throw new Error('Ingredient not found');

            client.prepare('INSERT INTO raw_stock_waste (raw_stock_id, shop_id, user_id, quantity, reason) VALUES (?, ?, ?, ?, ?)').run(raw_stock_id, shopId, userId, quantity, reason || '');

            let toRemove = parseFloat(quantity);
            const batches = client.prepare('SELECT * FROM raw_stock_batches WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(raw_stock_id, shopId);
            
            for (const b of batches) {
                if (toRemove <= 0) break;
                const take = Math.min(b.quantity, toRemove);
                client.prepare('UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                toRemove -= take;
            }

            client.prepare('UPDATE raw_stocks SET current_stock = current_stock - ? WHERE id = ? AND shop_id = ?').run(quantity, raw_stock_id, shopId);
        };

        getSqlite().transaction(() => performWaste(getSqlite()))();

        res.json({ ok: true });
    } catch (e) {
        console.error("Raw stock waste error:", e);
        res.status(400).json({ error: e.message });
    }
});

// GET /api/raw-stock/waste-history
router.get('/waste-history', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        const query = `
            SELECT w.*, rs.name as ingredient_name, u.name as user_name
            FROM raw_stock_waste w
            JOIN raw_stocks rs ON w.raw_stock_id = rs.id
            JOIN users u ON w.user_id = u.id
            WHERE w.shop_id = ${isPostgres ? '$1' : '?'}
            ORDER BY w.created_at DESC
        `;
        let history;
        if (isPostgres) history = (await getPostgres().query(query, [shopId])).rows;
        else history = getSqlite().prepare(query).all(shopId);
        res.json(history);
    } catch (e) {
        console.error("Waste history error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

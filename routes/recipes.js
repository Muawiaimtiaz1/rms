const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/recipes
router.get('/', requireAuth, async (req, res) => {
    const isPostgres = usePostgres();
    const shopId = req.session.user.shop_id;
    try {
        const query = isPostgres ? `
            SELECT r.*,
            (
                SELECT json_agg(
                    json_build_object(
                        'id', ri.id,
                        'raw_stock_id', ri.raw_stock_id,
                        'ingredient_name', rs.name,
                        'unit', rs.unit,
                        'usage_unit', rs.usage_unit,
                        'quantity', ri.quantity
                    )
                )
                FROM recipe_ingredients ri
                JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
                WHERE ri.recipe_id = r.id
            ) as ingredients
            FROM recipes r
            WHERE r.shop_id = $1
            ORDER BY r.name ASC
        ` : `
            SELECT r.*,
            (
                SELECT json_group_array(
                    json_object(
                        'id', ri.id,
                        'raw_stock_id', ri.raw_stock_id,
                        'ingredient_name', rs.name,
                        'unit', rs.unit,
                        'usage_unit', rs.usage_unit,
                        'quantity', ri.quantity
                    )
                )
                FROM recipe_ingredients ri
                JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
                WHERE ri.recipe_id = r.id
            ) as ingredients
            FROM recipes r
            WHERE r.shop_id = ?
            ORDER BY r.name ASC
        `;

        let recipes;
        if (isPostgres) {
            const { rows } = await getPostgres().query(query, [shopId]);
            recipes = rows;
        } else {
            recipes = getSqlite().prepare(query).all(shopId);
        }

        recipes.forEach(r => {
            const parseJson = (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return null; }
                }
                return val;
            };
            r.ingredients = parseJson(r.ingredients);
            if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) r.ingredients = [];
        });

        res.json(recipes);
    } catch (e) {
        console.error("Recipes fetch error:", e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/recipes
router.post('/', requireAuth, async (req, res) => {
    const { name, description, ingredients } = req.body;
    const shopId = req.session.user.shop_id;
    if (!name || !Array.isArray(ingredients)) return res.status(400).json({ error: 'Name and ingredients array required' });

    try {
        let recipeId;
        if (usePostgres()) {
            recipeId = await getPostgres().withTransaction(async (client) => {
                const { rows } = await client.query(
                    'INSERT INTO recipes (shop_id, name, description) VALUES ($1, $2, $3) RETURNING id',
                    [shopId, name, description || '']
                );
                const rid = rows[0].id;
                for (const ing of ingredients) {
                    await client.query('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES ($1, $2, $3)', [rid, ing.raw_stock_id, ing.quantity]);
                }
                return rid;
            });
        } else {
            recipeId = getSqlite().transaction(() => {
                const result = getSqlite().prepare(
                    'INSERT INTO recipes (shop_id, name, description) VALUES (?, ?, ?)'
                ).run(shopId, name, description || '');
                const rid = result.lastInsertRowid;
                const insertIng = getSqlite().prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
                for (const ing of ingredients) insertIng.run(rid, ing.raw_stock_id, ing.quantity);
                return rid;
            })();
        }
        res.json({ ok: true, id: recipeId });
    } catch (e) {
        console.error("Recipe create error:", e);
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/recipes/:id
router.put('/:id', requireAuth, async (req, res) => {
    const { name, description, ingredients } = req.body;
    const recipeId = req.params.id;
    const shopId = req.session.user.shop_id;

    try {
        const performUpdate = async (client) => {
            const isPostgres = usePostgres();
            if (isPostgres) {
                await client.query('UPDATE recipes SET name = $1, description = $2 WHERE id = $3 AND shop_id = $4', [name, description || '', recipeId, shopId]);
                await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
                for (const ing of ingredients) {
                    await client.query('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES ($1, $2, $3)', [recipeId, ing.raw_stock_id, ing.quantity]);
                }
            } else {
                client.prepare('UPDATE recipes SET name = ?, description = ? WHERE id = ? AND shop_id = ?').run(name, description || '', recipeId, shopId);
                client.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
                const insertIng = client.prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
                for (const ing of ingredients) insertIng.run(recipeId, ing.raw_stock_id, ing.quantity);
            }
        };

        if (usePostgres()) await getPostgres().withTransaction(performUpdate);
        else getSqlite().transaction(() => performUpdate(getSqlite()))();

        res.json({ ok: true });
    } catch (e) {
        console.error("Recipe update error:", e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/recipes/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    const recipeId = req.params.id;
    const isPostgres = usePostgres();
    try {
        const query = isPostgres ? 'DELETE FROM recipes WHERE id = $1 AND shop_id = $2' : 'DELETE FROM recipes WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(query, [recipeId, shopId]);
        else getSqlite().prepare(query).run(recipeId, shopId);
        res.json({ ok: true });
    } catch (e) {
        console.error("Recipe delete error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- Product Mapping ---

// POST /api/recipes/link-product
router.post('/link-product', requireAuth, async (req, res) => {
    const { product_id, recipe_id, variant_name } = req.body;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!product_id || !recipe_id) return res.status(400).json({ error: 'product_id and recipe_id required' });

    try {
        const query = isPostgres ? 'INSERT INTO product_recipe_links (shop_id, product_id, recipe_id, variant_name) VALUES ($1, $2, $3, $4)' : 'INSERT INTO product_recipe_links (shop_id, product_id, recipe_id, variant_name) VALUES (?, ?, ?, ?)';
        const params = [shopId, product_id, recipe_id, variant_name || null];
        if (isPostgres) await getPostgres().query(query, params);
        else getSqlite().prepare(query).run(...params);
        res.json({ ok: true });
    } catch (e) {
        console.error("Link product error:", e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/recipes/product-links/:productId
router.get('/product-links/:productId', requireAuth, async (req, res) => {
    const productId = req.params.productId;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        const query = `
            SELECT prl.*, r.name as recipe_name
            FROM product_recipe_links prl
            JOIN recipes r ON prl.recipe_id = r.id
            WHERE prl.product_id = ${isPostgres?'$1':'?'} AND prl.shop_id = ${isPostgres?'$2':'?'}
        `;
        let links;
        if (isPostgres) links = (await getPostgres().query(query, [productId, shopId])).rows;
        else links = getSqlite().prepare(query).all(productId, shopId);
        res.json(links);
    } catch (e) {
        console.error("Fetch links error:", e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/recipes/product-links/:linkId
router.delete('/product-links/:linkId', requireAuth, async (req, res) => {
    const linkId = req.params.linkId;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        const query = isPostgres ? 'DELETE FROM product_recipe_links WHERE id = $1 AND shop_id = $2' : 'DELETE FROM product_recipe_links WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(query, [linkId, shopId]);
        else getSqlite().prepare(query).run(linkId, shopId);
        res.json({ ok: true });
    } catch (e) {
        console.error("Delete link error:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

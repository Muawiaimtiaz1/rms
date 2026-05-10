const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/recipes
router.get('/', requireAuth, (req, res) => {
    try {
        const recipes = db.prepare(`
            SELECT r.*,
            (
                SELECT json_group_array(
                    json_object(
                        'id', ri.id,
                        'raw_stock_id', ri.raw_stock_id,
                        'ingredient_name', rs.name,
                        'unit', rs.unit,
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
        `).all(req.session.user.shop_id);

        recipes.forEach(r => {
            try {
                r.ingredients = JSON.parse(r.ingredients);
            } catch (e) { r.ingredients = []; }
        });

        res.json(recipes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/recipes
router.post('/', requireAuth, (req, res) => {
    const { name, description, ingredients } = req.body;
    if (!name || !Array.isArray(ingredients)) return res.status(400).json({ error: 'Name and ingredients array required' });

    try {
        const transaction = db.transaction(() => {
            const result = db.prepare(
                'INSERT INTO recipes (shop_id, name, description) VALUES (?, ?, ?)'
            ).run(req.session.user.shop_id, name, description || '');

            const recipeId = result.lastInsertRowid;

            const insertIng = db.prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
            for (const ing of ingredients) {
                insertIng.run(recipeId, ing.raw_stock_id, ing.quantity);
            }

            return recipeId;
        });

        const id = transaction();
        res.json({ ok: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/recipes/:id
router.put('/:id', requireAuth, (req, res) => {
    const { name, description, ingredients } = req.body;
    const recipeId = req.params.id;

    try {
        const transaction = db.transaction(() => {
            db.prepare('UPDATE recipes SET name = ?, description = ? WHERE id = ? AND shop_id = ?')
              .run(name, description || '', recipeId, req.session.user.shop_id);

            db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);

            const insertIng = db.prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
            for (const ing of ingredients) {
                insertIng.run(recipeId, ing.raw_stock_id, ing.quantity);
            }
        });

        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/recipes/:id
router.delete('/:id', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM recipes WHERE id = ? AND shop_id = ?').run(req.params.id, req.session.user.shop_id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Product Mapping ---

// POST /api/recipes/link-product
router.post('/link-product', requireAuth, (req, res) => {
    const { product_id, recipe_id, variant_name } = req.body;
    if (!product_id || !recipe_id) return res.status(400).json({ error: 'product_id and recipe_id required' });

    try {
        db.prepare(
            'INSERT INTO product_recipe_links (shop_id, product_id, recipe_id, variant_name) VALUES (?, ?, ?, ?)'
        ).run(req.session.user.shop_id, product_id, recipe_id, variant_name || null);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/recipes/product-links/:productId
router.get('/product-links/:productId', requireAuth, (req, res) => {
    try {
        const links = db.prepare(`
            SELECT prl.*, r.name as recipe_name
            FROM product_recipe_links prl
            JOIN recipes r ON prl.recipe_id = r.id
            WHERE prl.product_id = ? AND prl.shop_id = ?
        `).all(req.params.productId, req.session.user.shop_id);
        res.json(links);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/recipes/product-links/:linkId
router.delete('/product-links/:linkId', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM product_recipe_links WHERE id = ? AND shop_id = ?').run(req.params.linkId, req.session.user.shop_id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// MULTER CONFIG FOR PRODUCT IMAGES
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, "..", "public", "uploads", "products");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `prod-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only images (jpg, png, webp) allowed"));
    }
  },
});

// GET /api/products
router.get('/', requireAuth, async (req, res) => {
    const isPostgres = usePostgres();
    const shopId = req.session.user.shop_id;

    const query = isPostgres ? `
    SELECT p.*, b.name as brand_name,
    (
      SELECT json_agg(
        json_build_object(
          'id', pc.component_product_id,
          'name', COALESCE(cp.name, pc.custom_name),
          'quantity', pc.quantity,
          'price', pc.price,
          'sku', cp.sku,
          'stock', cp.stock
        )
      )
      FROM product_compositions pc
      LEFT JOIN products cp ON pc.component_product_id = cp.id
      WHERE pc.parent_product_id = p.id
    ) as components,
    (
      SELECT json_agg(
        json_build_object(
          'id', ri.raw_stock_id,
          'name', rs.name,
          'unit', rs.unit,
          'quantity', ri.quantity,
          'cost', (SELECT buying_price FROM raw_stock_batches WHERE raw_stock_id = rs.id ORDER BY id DESC LIMIT 1)
        )
      )
      FROM product_recipe_links prl
      JOIN recipe_ingredients ri ON prl.recipe_id = ri.recipe_id
      JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
      WHERE prl.product_id = p.id
    ) as ingredients,
    (
      SELECT json_agg(
        json_build_object(
          'id', pb.id,
          'buying_price', pb.buying_price,
          'quantity', pb.quantity,
          'damaged_quantity', pb.damaged_quantity,
          'created_at', pb.created_at
        )
      )
      FROM product_batches pb
      WHERE pb.product_id = p.id AND pb.quantity > 0
    ) as batches
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE p.shop_id = $1 AND p.is_deleted = 0
    ORDER BY p.name ASC
  ` : `
    SELECT p.*, b.name as brand_name,
    (
      SELECT json_group_array(
        json_object(
          'id', pc.component_product_id,
          'name', COALESCE(cp.name, pc.custom_name),
          'quantity', pc.quantity,
          'price', pc.price,
          'sku', cp.sku,
          'stock', cp.stock
        )
      )
      FROM product_compositions pc
      LEFT JOIN products cp ON pc.component_product_id = cp.id
      WHERE pc.parent_product_id = p.id
    ) as components,
    (
      SELECT json_group_array(
        json_object(
          'id', ri.raw_stock_id,
          'name', rs.name,
          'unit', rs.unit,
          'quantity', ri.quantity,
          'cost', (SELECT buying_price FROM raw_stock_batches WHERE raw_stock_id = rs.id ORDER BY id DESC LIMIT 1)
        )
      )
      FROM product_recipe_links prl
      JOIN recipe_ingredients ri ON prl.recipe_id = ri.recipe_id
      JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
      WHERE prl.product_id = p.id
    ) as ingredients,
    (
      SELECT json_group_array(
        json_object(
          'id', pb.id,
          'buying_price', pb.buying_price,
          'quantity', pb.quantity,
          'damaged_quantity', pb.damaged_quantity,
          'created_at', pb.created_at
        )
      )
      FROM product_batches pb
      WHERE pb.product_id = p.id AND pb.quantity > 0
    ) as batches
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE p.shop_id = ? AND p.is_deleted = 0
    ORDER BY p.name ASC
  `;

    try {
        let products;
        if (isPostgres) {
            const { rows } = await getPostgres().query(query, [shopId]);
            products = rows;
        } else {
            products = getSqlite().prepare(query).all(shopId);
        }

        // Parse components JSON & format images
        products.forEach(p => {
            if (p.image_path) p.image_url = p.image_path;
            
            // PostgreSQL's json_agg returns objects directly, SQLite returns strings
            const parseJson = (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return null; }
                }
                return val;
            };

            p.components = parseJson(p.components);
            if (!Array.isArray(p.components) || p.components.length === 0) p.components = null;

            p.ingredients = parseJson(p.ingredients);
            if (!Array.isArray(p.ingredients) || p.ingredients.length === 0) p.ingredients = null;

            p.batches = parseJson(p.batches);
            if (!Array.isArray(p.batches) || p.batches.length === 0) p.batches = [];
        });

        res.json(products);
    } catch (e) {
        console.error("Products fetch error:", e);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// POST /api/products
router.post('/', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            console.error("[UPLOAD ERROR]", err);
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    let { sku, name, category, description, brand_id, buying_price, selling_price, stock, min_stock_level, components, ingredients } = req.body;
    const shopId = req.session.user.shop_id;
    const userId = req.session.user.id;

    brand_id = parseInt(brand_id) || 0;
    buying_price = parseFloat(buying_price) || 0;
    selling_price = parseFloat(selling_price) || 0;
    stock = parseInt(stock) || 0;
    min_stock_level = parseInt(min_stock_level) || 0;
    if (typeof components === 'string') { try { components = JSON.parse(components); } catch(e) { components = []; } }
    if (typeof ingredients === 'string') { try { ingredients = JSON.parse(ingredients); } catch(e) { ingredients = []; } }

    const hasIngredients = Array.isArray(ingredients) && ingredients.length > 0;

    if (!sku || !name || !category || !brand_id) return res.status(400).json({ error: 'SKU, name, category, and brand are required' });
    if (selling_price <= 0) return res.status(400).json({ error: 'Selling price must be greater than 0' });
    if (!hasIngredients && buying_price <= 0) return res.status(400).json({ error: 'Cost price must be greater than 0 (or add ingredients to auto-calculate)' });
    if (!hasIngredients && selling_price < buying_price) return res.status(400).json({ error: 'Selling price cannot be less than cost price' });

    try {
        let brand;
        if (usePostgres()) {
            const { rows } = await getPostgres().query('SELECT id FROM brands WHERE id = $1 AND shop_id = $2', [brand_id, shopId]);
            brand = rows[0];
        } else {
            brand = getSqlite().prepare('SELECT id FROM brands WHERE id = ? AND shop_id = ?').get(brand_id, shopId);
        }
        if (!brand) return res.status(400).json({ error: 'Invalid brand' });

        const image_path = req.file ? "/uploads/products/" + req.file.filename : null;

        let productId;
        if (usePostgres()) {
            productId = await getPostgres().withTransaction(async (client) => {
                const { rows } = await client.query(
                    'INSERT INTO products (sku, name, category, description, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, image_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
                    [sku, name, category, description || null, brand_id, userId, shopId, buying_price || 0, selling_price || 0, stock || 0, min_stock_level || 0, image_path]
                );
                const pid = rows[0].id;

                if (stock > 0) {
                    await client.query('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES ($1, $2, $3, $4)', [pid, shopId, buying_price || 0, stock]);
                }

                if (Array.isArray(ingredients) && ingredients.length > 0) {
                    const rRes = await client.query('INSERT INTO recipes (shop_id, name) VALUES ($1, $2) RETURNING id', [shopId, `Recipe: ${name}`]);
                    const recipeId = rRes.rows[0].id;
                    await client.query('INSERT INTO product_recipe_links (shop_id, product_id, recipe_id) VALUES ($1, $2, $3)', [shopId, pid, recipeId]);
                    for (const ing of ingredients) {
                        await client.query('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES ($1, $2, $3)', [recipeId, ing.raw_stock_id, ing.quantity]);
                    }
                }

                const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
                if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
                    for (const comp of components) {
                        let linkedId = comp.id || null;
                        if (!linkedId && comp.name) {
                            const uniquePartName = `${name} - ${comp.name}`;
                            const { rows: mRows } = await client.query('SELECT id FROM products WHERE (name = $1 OR sku = $2) AND shop_id = $3 AND is_deleted = 0 LIMIT 1', [uniquePartName, uniquePartName, shopId]);
                            if (mRows[0]) linkedId = mRows[0].id;
                            else {
                                const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
                                const { rows: nRows } = await client.query('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 1) RETURNING id', [partSku, uniquePartName, category, brand_id, userId, shopId, comp.cost || 0, comp.price || 0]);
                                linkedId = nRows[0].id;
                            }
                        }
                        if (linkedId) {
                            await client.query('UPDATE products SET buying_price = $1, selling_price = $2 WHERE id = $3', [comp.cost || 0, comp.price || 0, linkedId]);
                            await client.query('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES ($1, $2, $3, $4, $5, $6)', [pid, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0]);
                        }
                    }
                }
                return pid;
            });
        } else {
            productId = getSqlite().transaction(() => {
                const result = getSqlite().prepare(
                    'INSERT INTO products (sku, name, category, description, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).run(sku, name, category, description || null, brand_id, userId, shopId, buying_price || 0, selling_price || 0, stock || 0, min_stock_level || 0, image_path);
                const pid = result.lastInsertRowid;

                if (stock > 0) {
                    getSqlite().prepare('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)').run(pid, shopId, buying_price || 0, stock);
                }

                if (Array.isArray(ingredients) && ingredients.length > 0) {
                    const rRes = getSqlite().prepare('INSERT INTO recipes (shop_id, name) VALUES (?, ?)').run(shopId, `Recipe: ${name}`);
                    const recipeId = rRes.lastInsertRowid;
                    getSqlite().prepare('INSERT INTO product_recipe_links (shop_id, product_id, recipe_id) VALUES (?, ?, ?)').run(shopId, pid, recipeId);
                    const insertIng = getSqlite().prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
                    for (const ing of ingredients) insertIng.run(recipeId, ing.raw_stock_id, ing.quantity);
                }

                const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
                if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
                    const insertComp = getSqlite().prepare('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
                    const findProduct = getSqlite().prepare('SELECT id FROM products WHERE (name = ? OR sku = ?) AND shop_id = ? AND is_deleted = 0 LIMIT 1');
                    const createProduct = getSqlite().prepare('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)');
                    const updateProductPrice = getSqlite().prepare('UPDATE products SET buying_price = ?, selling_price = ? WHERE id = ?');

                    for (const comp of components) {
                        let linkedId = comp.id || null;
                        if (!linkedId && comp.name) {
                            const uniquePartName = `${name} - ${comp.name}`;
                            const match = findProduct.get(uniquePartName, uniquePartName, shopId);
                            if (match) linkedId = match.id;
                            else {
                                const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
                                const nPart = createProduct.run(partSku, uniquePartName, category, brand_id, userId, shopId, comp.cost || 0, comp.price || 0);
                                linkedId = nPart.lastInsertRowid;
                            }
                        }
                        if (linkedId) {
                            updateProductPrice.run(comp.cost || 0, comp.price || 0, linkedId);
                            insertComp.run(pid, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0);
                        }
                    }
                }
                return pid;
            })();
        }
        res.json({ ok: true, id: productId });
    } catch (e) {
        console.error("Product create error:", e);
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/products/:id
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
    let { sku, name, category, description, brand_id, buying_price, selling_price, stock, min_stock_level, components, ingredients } = req.body;
    const shopId = req.session.user.shop_id;
    const userId = req.session.user.id;
    const productId = parseInt(req.params.id);

    brand_id = parseInt(brand_id) || 0;
    buying_price = parseFloat(buying_price) || 0;
    selling_price = parseFloat(selling_price) || 0;
    stock = stock !== undefined ? parseInt(stock) : undefined;
    min_stock_level = parseInt(min_stock_level) || 0;
    if (typeof components === 'string') { try { components = JSON.parse(components); } catch(e) { components = []; } }
    if (typeof ingredients === 'string') { try { ingredients = JSON.parse(ingredients); } catch(e) { ingredients = []; } }

    try {
        let product;
        if (usePostgres()) {
            const { rows } = await getPostgres().query('SELECT * FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
            product = rows[0];
        } else {
            product = getSqlite().prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
        }
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const hasIngredients = Array.isArray(ingredients) && ingredients.length > 0;
        if (selling_price <= 0) return res.status(400).json({ error: 'Selling price must be greater than 0' });
        if (!hasIngredients && buying_price <= 0) return res.status(400).json({ error: 'Cost price must be greater than 0' });

        let image_path = product.image_path;
        if (req.file) {
            if (product.image_path) {
                const oldPath = path.join(__dirname, '..', 'public', product.image_path);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            image_path = "/uploads/products/" + req.file.filename;
        }

        if (usePostgres()) {
            await getPostgres().withTransaction(async (client) => {
                await client.query(
                    'UPDATE products SET sku=$1, name=$2, category=$3, description=$4, brand_id=$5, buying_price=$6, selling_price=$7, stock=$8, min_stock_level=$9, image_path=$10 WHERE id=$11 AND shop_id=$12',
                    [sku, name, category, description || null, brand_id, buying_price, selling_price, stock ?? product.stock, min_stock_level, image_path, productId, shopId]
                );

                if (Array.isArray(ingredients)) {
                    const { rows: lRows } = await client.query('SELECT recipe_id FROM product_recipe_links WHERE product_id = $1', [productId]);
                    let recipeId;
                    if (lRows[0]) {
                        recipeId = lRows[0].recipe_id;
                        await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
                    } else if (ingredients.length > 0) {
                        const { rows: rRows } = await client.query('INSERT INTO recipes (shop_id, name) VALUES ($1, $2) RETURNING id', [shopId, `Recipe: ${name}`]);
                        recipeId = rRows[0].id;
                        await client.query('INSERT INTO product_recipe_links (shop_id, product_id, recipe_id) VALUES ($1, $2, $3)', [shopId, productId, recipeId]);
                    }
                    if (recipeId && ingredients.length > 0) {
                        for (const ing of ingredients) {
                            await client.query('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES ($1, $2, $3)', [recipeId, ing.raw_stock_id, ing.quantity]);
                        }
                    } else if (recipeId) {
                        await client.query('DELETE FROM product_recipe_links WHERE product_id = $1', [productId]);
                    }
                }

                await client.query('DELETE FROM product_compositions WHERE parent_product_id = $1', [productId]);
                const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
                if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
                    for (const comp of components) {
                        let linkedId = comp.id || null;
                        if (!linkedId && comp.name) {
                            const uniquePartName = `${name} - ${comp.name}`;
                            const { rows: mRows } = await client.query('SELECT id FROM products WHERE (name = $1 OR sku = $2) AND shop_id = $3 AND is_deleted = 0 LIMIT 1', [uniquePartName, uniquePartName, shopId]);
                            if (mRows[0]) linkedId = mRows[0].id;
                            else {
                                const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
                                const { rows: nRows } = await client.query('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 1) RETURNING id', [partSku, uniquePartName, category || product.category, brand_id || product.brand_id, userId, shopId, comp.cost || 0, comp.price || 0]);
                                linkedId = nRows[0].id;
                            }
                        }
                        if (linkedId) {
                            await client.query('UPDATE products SET buying_price = $1, selling_price = $2 WHERE id = $3', [comp.cost || 0, comp.price || 0, linkedId]);
                            await client.query('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES ($1, $2, $3, $4, $5, $6)', [productId, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0]);
                        }
                    }
                }
            });
        } else {
            getSqlite().transaction(() => {
                getSqlite().prepare(
                    'UPDATE products SET sku=?, name=?, category=?, description=?, brand_id=?, buying_price=?, selling_price=?, stock=?, min_stock_level=?, image_path=? WHERE id=? AND shop_id=?'
                ).run(sku, name, category, description || null, brand_id, buying_price, selling_price, stock ?? product.stock, min_stock_level, image_path, productId, shopId);

                if (Array.isArray(ingredients)) {
                    const existingLink = getSqlite().prepare('SELECT recipe_id FROM product_recipe_links WHERE product_id = ?').get(productId);
                    let recipeId;
                    if (existingLink) {
                        recipeId = existingLink.recipe_id;
                        getSqlite().prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
                    } else if (ingredients.length > 0) {
                        const rRes = getSqlite().prepare('INSERT INTO recipes (shop_id, name) VALUES (?, ?)').run(shopId, `Recipe: ${name}`);
                        recipeId = rRes.lastInsertRowid;
                        getSqlite().prepare('INSERT INTO product_recipe_links (shop_id, product_id, recipe_id) VALUES (?, ?, ?)').run(shopId, productId, recipeId);
                    }
                    if (recipeId && ingredients.length > 0) {
                        const insertIng = getSqlite().prepare('INSERT INTO recipe_ingredients (recipe_id, raw_stock_id, quantity) VALUES (?, ?, ?)');
                        for (const ing of ingredients) insertIng.run(recipeId, ing.raw_stock_id, ing.quantity);
                    } else if (recipeId) {
                        getSqlite().prepare('DELETE FROM product_recipe_links WHERE product_id = ?').run(productId);
                    }
                }

                getSqlite().prepare('DELETE FROM product_compositions WHERE parent_product_id = ?').run(productId);
                const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
                if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
                    const insertComp = getSqlite().prepare('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
                    const findProduct = getSqlite().prepare('SELECT id FROM products WHERE (name = ? OR sku = ?) AND shop_id = ? AND is_deleted = 0 LIMIT 1');
                    const createProduct = getSqlite().prepare('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)');
                    const updateProductPrice = getSqlite().prepare('UPDATE products SET buying_price = ?, selling_price = ? WHERE id = ?');
                    for (const comp of components) {
                        let linkedId = comp.id || null;
                        if (!linkedId && comp.name) {
                            const uniquePartName = `${name} - ${comp.name}`;
                            const match = findProduct.get(uniquePartName, uniquePartName, shopId);
                            if (match) linkedId = match.id;
                            else {
                                const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
                                const nPart = createProduct.run(partSku, uniquePartName, category || product.category, brand_id || product.brand_id, userId, shopId, comp.cost || 0, comp.price || 0);
                                linkedId = nPart.lastInsertRowid;
                            }
                        }
                        if (linkedId) {
                            updateProductPrice.run(comp.cost || 0, comp.price || 0, linkedId);
                            insertComp.run(productId, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0);
                        }
                    }
                }
            })();
        }
        res.json({ ok: true });
    } catch (e) {
        console.error("Product update error:", e);
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', requireAuth, async (req, res) => {
    const { delta, buying_price } = req.body;
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;

    try {
        let newStock;
        if (usePostgres()) {
            newStock = await getPostgres().withTransaction(async (client) => {
                const { rows } = await client.query('SELECT stock, buying_price FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
                const product = rows[0];
                if (!product) throw new Error('Product not found');
                const diff = parseInt(delta || 0);
                const nBP = buying_price !== undefined ? parseFloat(buying_price) : product.buying_price;
                if (diff > 0) {
                    await client.query('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES ($1, $2, $3, $4)', [productId, shopId, nBP, diff]);
                } else if (diff < 0) {
                    let toRemove = Math.abs(diff);
                    const { rows: batches } = await client.query('SELECT * FROM product_batches WHERE product_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC', [productId, shopId]);
                    for (const b of batches) {
                        if (toRemove <= 0) break;
                        const take = Math.min(b.quantity, toRemove);
                        await client.query('UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2', [take, b.id]);
                        toRemove -= take;
                    }
                }
                await client.query('UPDATE products SET stock = stock + $1, buying_price = $2 WHERE id = $3 AND shop_id = $4', [diff, nBP, productId, shopId]);
                const { rows: uRows } = await client.query('SELECT stock FROM products WHERE id = $1', [productId]);
                return uRows[0].stock;
            });
        } else {
            newStock = getSqlite().transaction(() => {
                const product = getSqlite().prepare('SELECT stock, buying_price FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
                if (!product) throw new Error('Product not found');
                const diff = parseInt(delta || 0);
                const nBP = buying_price !== undefined ? parseFloat(buying_price) : product.buying_price;
                if (diff > 0) getSqlite().prepare('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)').run(productId, shopId, nBP, diff);
                else if (diff < 0) {
                    let toRemove = Math.abs(diff);
                    const batches = getSqlite().prepare('SELECT * FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(productId, shopId);
                    for (const b of batches) {
                        if (toRemove <= 0) break;
                        const take = Math.min(b.quantity, toRemove);
                        getSqlite().prepare('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                        toRemove -= take;
                    }
                }
                getSqlite().prepare('UPDATE products SET stock = stock + ?, buying_price = ? WHERE id = ? AND shop_id = ?').run(diff, nBP, productId, shopId);
                return getSqlite().prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock;
            })();
        }
        res.json({ ok: true, stock: newStock });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/products/:id/harvest — break down units into components
router.post('/:id/harvest', requireAuth, async (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { count = 1 } = req.body;

    try {
        let finalStock;
        if (usePostgres()) {
            finalStock = await getPostgres().withTransaction(async (client) => {
                const { rows: pRows } = await client.query('SELECT stock, name, buying_price FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
                const product = pRows[0];
                if (!product) throw new Error('Product not found');
                if (product.stock < count) throw new Error(`Not enough stock of "${product.name}"`);
                
                let toRemove = count, totalCost = 0;
                const { rows: batches } = await client.query('SELECT * FROM product_batches WHERE product_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC', [productId, shopId]);
                for (const b of batches) {
                    if (toRemove <= 0) break;
                    const take = Math.min(b.quantity, toRemove);
                    await client.query('UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2', [take, b.id]);
                    totalCost += (take * b.buying_price);
                    toRemove -= take;
                }
                await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [count, productId]);
                const avgCost = count > 0 ? (totalCost / count) : product.buying_price;
                const { rows: components } = await client.query('SELECT component_product_id, quantity, cost FROM product_compositions WHERE parent_product_id = $1', [productId]);
                for (const comp of components) {
                    if (comp.component_product_id) {
                        const qty = count * comp.quantity;
                        const cost = comp.cost || (avgCost / (comp.quantity || 1));
                        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, comp.component_product_id]);
                        await client.query('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES ($1, $2, $3, $4)', [comp.component_product_id, shopId, cost, qty]);
                    }
                }
                return product.stock - count;
            });
        } else {
            finalStock = getSqlite().transaction(() => {
                const product = getSqlite().prepare('SELECT stock, name, buying_price FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
                if (!product) throw new Error('Product not found');
                if (product.stock < count) throw new Error(`Not enough stock of "${product.name}"`);
                let toRemove = count, totalCost = 0;
                const batches = getSqlite().prepare('SELECT * FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(productId, shopId);
                for (const b of batches) {
                    if (toRemove <= 0) break;
                    const take = Math.min(b.quantity, toRemove);
                    getSqlite().prepare('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                    totalCost += (take * b.buying_price);
                    toRemove -= take;
                }
                getSqlite().prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(count, productId);
                const avgCost = count > 0 ? (totalCost / count) : product.buying_price;
                const components = getSqlite().prepare('SELECT component_product_id, quantity, cost FROM product_compositions WHERE parent_product_id = ?').all(productId);
                for (const comp of components) {
                    if (comp.component_product_id) {
                        const qty = count * comp.quantity;
                        const cost = comp.cost || (avgCost / (comp.quantity || 1));
                        getSqlite().prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, comp.component_product_id);
                        getSqlite().prepare('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)').run(comp.component_product_id, shopId, cost, qty);
                    }
                }
                return product.stock - count;
            })();
        }
        res.json({ ok: true, new_stock: finalStock });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/products/:id/damage/loss
router.patch('/:id/damage/loss', requireAuth, async (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { damage_count, manual_loss_amount, batch_id } = req.body;
    const count = parseInt(damage_count) || 0;
    const manualLoss = parseFloat(manual_loss_amount) || 0;
    const selectedBatchId = batch_id ? parseInt(batch_id) : null;

    if (count <= 0 && manualLoss <= 0) return res.status(400).json({ error: 'Either loss count or loss amount must be > 0' });

    try {
        if (usePostgres()) {
            await getPostgres().withTransaction(async (client) => {
                const { rows: pRows } = await client.query('SELECT stock FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
                if (!pRows[0]) throw new Error('Product not found');
                if (count > 0 && pRows[0].stock < count) throw new Error('Not enough stock');
                let actualLossCost = manualLoss;
                if (count > 0) {
                    if (selectedBatchId) {
                        const { rows: bRows } = await client.query('SELECT quantity, buying_price FROM product_batches WHERE id = $1', [selectedBatchId]);
                        if (!bRows[0] || bRows[0].quantity < count) throw new Error('Not enough stock in batch');
                        await client.query('UPDATE product_batches SET quantity = quantity - $1, damaged_quantity = damaged_quantity + $2 WHERE id = $3', [count, count, selectedBatchId]);
                        actualLossCost += (count * bRows[0].buying_price);
                    } else {
                        let toRemove = count;
                        const { rows: batches } = await client.query('SELECT * FROM product_batches WHERE product_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC', [productId, shopId]);
                        for (const b of batches) {
                            if (toRemove <= 0) break;
                            const take = Math.min(b.quantity, toRemove);
                            await client.query('UPDATE product_batches SET quantity = quantity - $1, damaged_quantity = damaged_quantity + $2 WHERE id = $3', [take, take, b.id]);
                            actualLossCost += (take * b.buying_price);
                            toRemove -= take;
                        }
                    }
                }
                await client.query('UPDATE products SET stock = stock - $1, damage_stock = damage_stock + $2, manual_damage_loss = manual_damage_loss + $3 WHERE id = $4 AND shop_id = $5', [count, count, actualLossCost, productId, shopId]);
            });
        } else {
            getSqlite().transaction(() => {
                const product = getSqlite().prepare('SELECT stock FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
                if (!product) throw new Error('Product not found');
                if (count > 0 && product.stock < count) throw new Error('Not enough stock');
                let actualLossCost = manualLoss;
                if (count > 0) {
                    if (selectedBatchId) {
                        const batch = getSqlite().prepare('SELECT quantity, buying_price FROM product_batches WHERE id = ?').get(selectedBatchId);
                        if (!batch || batch.quantity < count) throw new Error('Not enough stock in batch');
                        getSqlite().prepare('UPDATE product_batches SET quantity = quantity - ?, damaged_quantity = damaged_quantity + ? WHERE id = ?').run(count, count, selectedBatchId);
                        actualLossCost += (count * batch.buying_price);
                    } else {
                        let toRemove = count;
                        const batches = getSqlite().prepare('SELECT * FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(productId, shopId);
                        for (const b of batches) {
                            if (toRemove <= 0) break;
                            const take = Math.min(b.quantity, toRemove);
                            getSqlite().prepare('UPDATE product_batches SET quantity = quantity - ?, damaged_quantity = damaged_quantity + ? WHERE id = ?').run(take, take, b.id);
                            actualLossCost += (take * b.buying_price);
                            toRemove -= take;
                        }
                    }
                }
                getSqlite().prepare('UPDATE products SET stock = stock - ?, damage_stock = damage_stock + ?, manual_damage_loss = manual_damage_loss + ? WHERE id = ? AND shop_id = ?').run(count, count, actualLossCost, productId, shopId);
            })();
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/products/:id/damage/recovery
router.patch('/:id/damage/recovery', requireAuth, async (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { recovery_count, recovery_amount, batch_id, is_restocking } = req.body;
    const count = parseInt(recovery_count) || 0;
    const amount = parseFloat(recovery_amount) || 0;
    const selectedBatchId = batch_id ? parseInt(batch_id) : null;
    const shouldRestock = is_restocking === true;

    if (count <= 0 && amount <= 0) return res.status(400).json({ error: 'Either recovery count or recovery amount must be > 0' });

    try {
        if (usePostgres()) {
            await getPostgres().withTransaction(async (client) => {
                const { rows: pRows } = await client.query('SELECT damage_stock FROM products WHERE id = $1 AND shop_id = $2', [productId, shopId]);
                if (!pRows[0]) throw new Error('Product not found');
                if (count > 0 && pRows[0].damage_stock < count) throw new Error('Not enough damaged stock');
                let costReduction = 0;
                if (count > 0) {
                    if (selectedBatchId) {
                        const { rows: bRows } = await client.query('SELECT damaged_quantity, buying_price FROM product_batches WHERE id = $1', [selectedBatchId]);
                        if (!bRows[0] || bRows[0].damaged_quantity < count) throw new Error('Not enough damaged stock in batch');
                        if (shouldRestock) await client.query('UPDATE product_batches SET quantity = quantity + $1, damaged_quantity = damaged_quantity - $2 WHERE id = $3', [count, count, selectedBatchId]);
                        else await client.query('UPDATE product_batches SET damaged_quantity = damaged_quantity - $1 WHERE id = $2', [count, selectedBatchId]);
                        costReduction = (count * bRows[0].buying_price);
                    } else {
                        const { rows: nRows } = await client.query('SELECT id, buying_price FROM product_batches WHERE product_id = $1 AND shop_id = $2 ORDER BY created_at DESC LIMIT 1', [productId, shopId]);
                        if (nRows[0]) {
                            if (shouldRestock) await client.query('UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2', [count, nRows[0].id]);
                            costReduction = (count * nRows[0].buying_price);
                        }
                    }
                }
                await client.query('UPDATE products SET stock = stock + $1, damage_stock = damage_stock - $2, manual_damage_loss = manual_damage_loss - $3, recovered_damage_amount = recovered_damage_amount + $4, recovered_damage_quantity = recovered_damage_quantity + $5 WHERE id = $6 AND shop_id = $7', [shouldRestock ? count : 0, count, costReduction, amount, count, productId, shopId]);
            });
        } else {
            getSqlite().transaction(() => {
                const product = getSqlite().prepare('SELECT damage_stock FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
                if (!product) throw new Error('Product not found');
                if (count > 0 && product.damage_stock < count) throw new Error('Not enough damaged stock');
                let costReduction = 0;
                if (count > 0) {
                    if (selectedBatchId) {
                        const batch = getSqlite().prepare('SELECT damaged_quantity, buying_price FROM product_batches WHERE id = ?').get(selectedBatchId);
                        if (!batch || batch.damaged_quantity < count) throw new Error('Not enough damaged stock in batch');
                        if (shouldRestock) getSqlite().prepare('UPDATE product_batches SET quantity = quantity + ?, damaged_quantity = damaged_quantity - ? WHERE id = ?').run(count, count, selectedBatchId);
                        else getSqlite().prepare('UPDATE product_batches SET damaged_quantity = damaged_quantity - ? WHERE id = ?').run(count, selectedBatchId);
                        costReduction = (count * batch.buying_price);
                    } else {
                        const newestBatch = getSqlite().prepare('SELECT id, buying_price FROM product_batches WHERE product_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT 1').get(productId, shopId);
                        if (newestBatch) {
                            if (shouldRestock) getSqlite().prepare('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?').run(count, newestBatch.id);
                            costReduction = (count * newestBatch.buying_price);
                        }
                    }
                }
                getSqlite().prepare('UPDATE products SET stock = stock + ?, damage_stock = damage_stock - ?, manual_damage_loss = manual_damage_loss - ?, recovered_damage_amount = recovered_damage_amount + ?, recovered_damage_quantity = recovered_damage_quantity + ? WHERE id = ? AND shop_id = ?').run(shouldRestock ? count : 0, count, costReduction, amount, count, productId, shopId);
            })();
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;

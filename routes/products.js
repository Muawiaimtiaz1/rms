const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/products
router.get('/', requireAuth, (req, res) => {
    const products = db.prepare(`
    SELECT p.*, b.name as brand_name,
    (
      SELECT json_group_array(
        json_object(
          'id', pc.component_product_id,
          'name', COALESCE(cp.name, pc.custom_name),
          'quantity', pc.quantity,
          'price', pc.price,
          'sku', cp.sku
        )
      )
      FROM product_compositions pc
      LEFT JOIN products cp ON pc.component_product_id = cp.id
      WHERE pc.parent_product_id = p.id
    ) as components,
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
  `).all(req.session.user.shop_id);

    // Parse components JSON
    products.forEach(p => {
        try {
            p.components = JSON.parse(p.components);
            if (!Array.isArray(p.components) || p.components.length === 0) p.components = null;
        } catch (e) { p.components = null; }

        try {
            p.batches = JSON.parse(p.batches);
            if (!Array.isArray(p.batches) || p.batches.length === 0) p.batches = [];
        } catch (e) { p.batches = []; }
    });

    res.json(products);
});

// POST /api/products
router.post('/', requireAuth, (req, res) => {
    const { sku, name, category, description, brand_id, buying_price, selling_price, stock, min_stock_level, components } = req.body;
    if (!sku || !name || !category || !brand_id) return res.status(400).json({ error: 'sku, name, category, and brand_id required' });
    if (buying_price <= 0 || selling_price <= 0) return res.status(400).json({ error: 'Cost price and selling price must be greater than 0' });
    if (selling_price < buying_price) return res.status(400).json({ error: 'Selling price cannot be less than cost price' });

    // Ensure brand belongs to shop
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND shop_id = ?').get(brand_id, req.session.user.shop_id);
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });

    const transaction = db.transaction(() => {
        const result = db.prepare(
            'INSERT INTO products (sku, name, category, description, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(sku, name, category, description || null, brand_id, req.session.user.id, req.session.user.shop_id, buying_price || 0, selling_price || 0, stock || 0, min_stock_level || 0);

        const productId = result.lastInsertRowid;

        // Create initial batch
        if (stock > 0) {
            db.prepare('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)')
              .run(productId, req.session.user.shop_id, buying_price || 0, stock);
        }

        const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
        if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
            const insertComp = db.prepare('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
            const findProduct = db.prepare('SELECT id FROM products WHERE (name = ? OR sku = ?) AND shop_id = ? AND is_deleted = 0 LIMIT 1');
            const createProduct = db.prepare('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)');
            const updateProductPrice = db.prepare('UPDATE products SET buying_price = ?, selling_price = ? WHERE id = ?');

            for (const comp of components) {
                let linkedId = comp.id || null;
                // Auto-link or Auto-create if name matches a product and no ID was provided
                if (!linkedId && comp.name) {
                    const uniquePartName = `${name} - ${comp.name}`;
                    const match = findProduct.get(uniquePartName, uniquePartName, req.session.user.shop_id);
                    if (match) {
                        linkedId = match.id;
                    } else {
                        // Auto-create missing component product with UNIQUE NAME
                        const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 1000)}`;
                        const newPart = createProduct.run(partSku, uniquePartName, category, brand_id, req.session.user.id, req.session.user.shop_id, comp.cost || 0, comp.price || 0);
                        linkedId = newPart.lastInsertRowid;
                    }
                }
                
                // Sync prices to the linked component product
                if (linkedId) {
                    updateProductPrice.run(comp.cost || 0, comp.price || 0, linkedId);
                }

                insertComp.run(productId, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0);
            }
        }
        return productId;
    });

    try {
        const productId = transaction();
        res.json({ ok: true, id: productId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/products/:id
router.put('/:id', requireAuth, (req, res) => {
    const { sku, name, category, description, brand_id, buying_price, selling_price, stock, min_stock_level, components } = req.body;
    const productId = parseInt(req.params.id);

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?').get(productId, req.session.user.shop_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (buying_price <= 0 || selling_price <= 0) return res.status(400).json({ error: 'Cost price and selling price must be greater than 0' });
    if (selling_price < buying_price) return res.status(400).json({ error: 'Selling price cannot be less than cost price' });

    const transaction = db.transaction(() => {
        db.prepare(
            'UPDATE products SET sku=?, name=?, category=?, description=?, brand_id=?, buying_price=?, selling_price=?, stock=?, min_stock_level=? WHERE id=? AND shop_id=?'
        ).run(sku, name, category, description || null, brand_id, buying_price || 0, selling_price || 0, stock ?? product.stock, min_stock_level || 0, productId, req.session.user.shop_id);

        // Update composition
        db.prepare('DELETE FROM product_compositions WHERE parent_product_id = ?').run(productId);
        const hasCompositePermission = req.session.user.allowed_panels && req.session.user.allowed_panels.includes('composite_products');
        if (hasCompositePermission && Array.isArray(components) && components.length > 0) {
            const insertComp = db.prepare('INSERT INTO product_compositions (parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
            const findProduct = db.prepare('SELECT id FROM products WHERE (name = ? OR sku = ?) AND shop_id = ? AND is_deleted = 0 LIMIT 1');
            const createProduct = db.prepare('INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, selling_price, stock, min_stock_level, is_component) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)');
            const updateProductPrice = db.prepare('UPDATE products SET buying_price = ?, selling_price = ? WHERE id = ?');

            for (const comp of components) {
                let linkedId = comp.id || null;
                if (!linkedId && comp.name) {
                    const uniquePartName = `${name} - ${comp.name}`;
                    const match = findProduct.get(uniquePartName, uniquePartName, req.session.user.shop_id);
                    if (match) {
                        linkedId = match.id;
                    } else {
                        // Auto-create missing component product with UNIQUE NAME
                        const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 1000)}`;
                        const newPart = createProduct.run(partSku, uniquePartName, category || product.category, brand_id || product.brand_id, req.session.user.id, req.session.user.shop_id, comp.cost || 0, comp.price || 0);
                        linkedId = newPart.lastInsertRowid;
                    }
                }

                // Sync prices to the linked component product
                if (linkedId) {
                    updateProductPrice.run(comp.cost || 0, comp.price || 0, linkedId);
                }

                insertComp.run(productId, linkedId, comp.name || '', comp.quantity || 1, comp.price || 0, comp.cost || 0);
            }
        }
    });

    try {
        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// PATCH /api/products/:id/stock
router.patch('/:id/stock', requireAuth, (req, res) => {
    const { delta, buying_price } = req.body; // +N or -N
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;

    try {
        const transaction = db.transaction(() => {
            const product = db.prepare('SELECT stock, buying_price FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
            if (!product) throw new Error('Product not found');

            const diff = parseInt(delta || 0);
            const newBuyingPrice = buying_price !== undefined ? parseFloat(buying_price) : product.buying_price;

            if (diff > 0) {
                // ADDING STOCK: Create a new batch
                db.prepare('INSERT INTO product_batches (product_id, shop_id, buying_price, quantity) VALUES (?, ?, ?, ?)')
                  .run(productId, shopId, newBuyingPrice, diff);
            } else if (diff < 0) {
                // REDUCING STOCK: Remove from batches (FIFO)
                let toRemove = Math.abs(diff);
                const batches = db.prepare('SELECT * FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(productId, shopId);
                
                for (const b of batches) {
                    if (toRemove <= 0) break;
                    const take = Math.min(b.quantity, toRemove);
                    db.prepare('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?').run(take, b.id);
                    toRemove -= take;
                }
            }

            // Sync main product stock and buying price
            db.prepare('UPDATE products SET stock = stock + ?, buying_price = ? WHERE id = ? AND shop_id = ?')
              .run(diff, newBuyingPrice, productId, shopId);

            const updated = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
            return updated.stock;
        });

        const newStock = transaction();
        res.json({ ok: true, stock: newStock });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/products/:id/harvest — break down units into components
router.post('/:id/harvest', requireAuth, (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { count = 1 } = req.body;

    const transaction = db.transaction(() => {
        const product = db.prepare('SELECT stock, name FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
        if (!product) throw new Error('Product not found');
        if (product.stock < count) throw new Error(`Not enough stock of "${product.name}" to break down ${count} units`);

        // Get components
        const components = db.prepare('SELECT component_product_id, quantity FROM product_compositions WHERE parent_product_id = ?').all(productId);
        
        // Deduct from parent
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(count, productId);

        // Increase components
        for (const comp of components) {
            if (comp.component_product_id) {
                db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(count * comp.quantity, comp.component_product_id);
            }
        }
        
        return product.stock - count;
    });

    try {
        const newStock = transaction();
        res.json({ ok: true, new_stock: newStock });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/products/:id/damage/loss
router.patch('/:id/damage/loss', requireAuth, (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { damage_count, manual_loss_amount, batch_id } = req.body;

    const count = parseInt(damage_count) || 0;
    const manualLoss = parseFloat(manual_loss_amount) || 0;
    const selectedBatchId = batch_id ? parseInt(batch_id) : null;

    if (count <= 0 && manualLoss <= 0) {
        return res.status(400).json({ error: 'Either loss count or loss amount must be > 0' });
    }

    try {
        const transaction = db.transaction(() => {
            const product = db.prepare('SELECT stock FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
            if (!product) throw new Error('Product not found');
            if (count > 0 && product.stock < count) throw new Error('Not enough fine stock to mark as damaged');

            let actualLossCost = manualLoss;

            if (count > 0) {
                if (selectedBatchId) {
                    const batch = db.prepare('SELECT quantity, buying_price FROM product_batches WHERE id = ?').get(selectedBatchId);
                    if (!batch || batch.quantity < count) throw new Error('Selected batch does not have enough stock');
                    db.prepare('UPDATE product_batches SET quantity = quantity - ?, damaged_quantity = damaged_quantity + ? WHERE id = ?').run(count, count, selectedBatchId);
                    actualLossCost += (count * batch.buying_price);
                } else {
                    // Fallback to FIFO
                    let toRemove = count;
                    const batches = db.prepare('SELECT * FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC').all(productId, shopId);
                    for (const b of batches) {
                        if (toRemove <= 0) break;
                        const take = Math.min(b.quantity, toRemove);
                        db.prepare('UPDATE product_batches SET quantity = quantity - ?, damaged_quantity = damaged_quantity + ? WHERE id = ?').run(take, take, b.id);
                        actualLossCost += (take * b.buying_price);
                        toRemove -= take;
                    }
                }
            }

            db.prepare(`
                UPDATE products 
                SET stock = stock - ?, 
                    damage_stock = damage_stock + ?, 
                    manual_damage_loss = manual_damage_loss + ?
                WHERE id = ? AND shop_id = ?
            `).run(count, count, actualLossCost, productId, shopId);
            
            return { ok: true };
        });

        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/products/:id/damage/recovery
router.patch('/:id/damage/recovery', requireAuth, (req, res) => {
    const productId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const { recovery_count, recovery_amount, batch_id, is_restocking } = req.body;

    const count = parseInt(recovery_count) || 0;
    const amount = parseFloat(recovery_amount) || 0;
    const selectedBatchId = batch_id ? parseInt(batch_id) : null;
    const shouldRestock = is_restocking === true;

    if (count <= 0 && amount <= 0) {
        return res.status(400).json({ error: 'Either recovery count or recovery amount must be > 0' });
    }

    try {
        const transaction = db.transaction(() => {
            const product = db.prepare('SELECT damage_stock, manual_damage_loss FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
            if (!product) throw new Error('Product not found');
            if (count > 0 && product.damage_stock < count) throw new Error('Not enough damaged stock to recover');

            let recoveryCostReduction = 0;

            if (count > 0) {
                // Restore specifically to batch
                if (selectedBatchId) {
                    const batch = db.prepare('SELECT damaged_quantity, buying_price FROM product_batches WHERE id = ?').get(selectedBatchId);
                    if (!batch || batch.damaged_quantity < count) throw new Error('Selected batch does not have enough damaged stock');
                    
                    if (shouldRestock) {
                        db.prepare('UPDATE product_batches SET quantity = quantity + ?, damaged_quantity = damaged_quantity - ? WHERE id = ?').run(count, count, selectedBatchId);
                    } else {
                        db.prepare('UPDATE product_batches SET damaged_quantity = damaged_quantity - ? WHERE id = ?').run(count, selectedBatchId);
                    }
                    recoveryCostReduction = (count * batch.buying_price);
                } else {
                    // Fallback to newest batch
                    const newestBatch = db.prepare('SELECT id, buying_price FROM product_batches WHERE product_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT 1').get(productId, shopId);
                    if (newestBatch) {
                        if (shouldRestock) {
                            db.prepare("UPDATE product_batches SET quantity = quantity + ? WHERE id = ?").run(count, newestBatch.id);
                        }
                        // We can't safely decrement damaged_quantity on a random newest batch if we didn't select one, 
                        // but since damage_stock is tracked globally in products, we just proceed.
                        recoveryCostReduction = (count * newestBatch.buying_price);
                    }
                }
            }

            db.prepare(`
                UPDATE products 
                SET stock = stock + ?, 
                    damage_stock = damage_stock - ?, 
                    manual_damage_loss = manual_damage_loss - ?,
                    recovered_damage_amount = recovered_damage_amount + ?,
                    recovered_damage_quantity = recovered_damage_quantity + ?
                WHERE id = ? AND shop_id = ?
            `).run(shouldRestock ? count : 0, count, recoveryCostReduction, amount, count, productId, shopId);
            
            return { ok: true };
        });

        transaction();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;

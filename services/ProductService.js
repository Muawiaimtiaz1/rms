const db = require('../db/knex');
const { z } = require('zod');

// Validation Schemas
const productSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().nullable().optional(),
  brand_id: z.number().int().positive("Brand is required"),
  buying_price: z.number().nonnegative().optional().default(0),
  selling_price: z.number().positive("Selling price must be greater than 0"),
  stock: z.number().int().default(0),
  min_stock_level: z.number().int().default(0),
  image_path: z.string().nullable().optional(),
  components: z.array(z.any()).nullable().optional(),
  ingredients: z.array(z.any()).nullable().optional(),
});


class ProductService {
  /**
   * Get all products for a shop with their brands, components, ingredients, and batches.
   */
  async getAllProducts(shopId) {
    const isPostgres = db.client.config.client === 'pg';

    // Helper for JSON aggregation based on database engine
    const jsonAgg = (sql, alias) => {
      return isPostgres 
        ? db.raw(`(SELECT json_agg(row_to_json(t)) FROM (${sql}) t) as ${alias}`)
        : db.raw(`(SELECT json_group_array(json(t)) FROM (${sql}) t) as ${alias}`);
    };

    // Note: Due to the complexity of the existing subqueries, we'll start with clean Knex queries 
    // but keep the same data structure.
    
    const products = await db('products as p')
      .select('p.*', 'b.name as brand_name')
      .leftJoin('brands as b', 'p.brand_id', 'b.id')
      .where('p.shop_id', shopId)
      .where('p.is_deleted', 0)
      .orderBy('p.name', 'asc');

    // To prevent the "n+1" query problem while maintaining the complex structure, 
    // we'll fetch related data in separate queries and merge them.
    // In a mature ERP, we'd use more optimized joins or specialized views.

    for (let p of products) {
      // Components
      p.components = await db('product_compositions as pc')
        .select('pc.component_product_id as id', db.raw('COALESCE(cp.name, pc.custom_name) as name'), 'pc.quantity', 'pc.price', 'cp.sku', 'cp.stock')
        .leftJoin('products as cp', 'pc.component_product_id', 'cp.id')
        .where('pc.parent_product_id', p.id);

      // Ingredients
      p.ingredients = await db('product_recipe_links as prl')
        .select('ri.raw_stock_id as id', 'rs.name', 'rs.unit', 'rs.usage_unit', 'rs.conversion_factor', 'ri.quantity')
        .join('recipe_ingredients as ri', 'prl.recipe_id', 'ri.recipe_id')
        .join('raw_stocks as rs', 'ri.raw_stock_id', 'rs.id')
        .where('prl.product_id', p.id);

      // Batches
      p.batches = await db('product_batches')
        .where('product_id', p.id)
        .where('quantity', '>', 0)
        .orderBy('created_at', 'asc');
      
      // Formatting
      if (p.image_path) p.image_url = p.image_path;
    }

    return products;
  }

  /**
   * Create a new product with its related entities (batches, recipes, compositions).
   */
  async createProduct(data, shopId, userId) {
    const validatedData = productSchema.parse(data);
    
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      
      // 1. Insert Product
      const [productIdObj] = await trx('products')
        .insert({
          ...productData,
          shop_id: shopId,
          user_id: userId,
          is_deleted: 0
        })
        .returning('id');
      
      const productId = typeof productIdObj === 'object' ? productIdObj.id : productIdObj;

      // 2. Initial Batch
      if (productData.stock > 0) {
        await trx('product_batches').insert({
          product_id: productId,
          shop_id: shopId,
          buying_price: productData.buying_price,
          quantity: productData.stock
        });
      }

      // 3. Recipes/Ingredients
      if (ingredients && ingredients.length > 0) {
        const [recipeIdObj] = await trx('recipes')
          .insert({ shop_id: shopId, name: `Recipe: ${productData.name}` })
          .returning('id');
        const recipeId = typeof recipeIdObj === 'object' ? recipeIdObj.id : recipeIdObj;

        await trx('product_recipe_links').insert({
          shop_id: shopId,
          product_id: productId,
          recipe_id: recipeId
        });

        const ingredientRows = ingredients.map(ing => ({
          recipe_id: recipeId,
          raw_stock_id: ing.raw_stock_id,
          quantity: ing.quantity
        }));
        await trx('recipe_ingredients').insert(ingredientRows);
      }

      // 4. Composite Products
      if (components && components.length > 0) {
        for (const comp of components) {
          let linkedId = comp.id || null;
          if (!linkedId && comp.name) {
            const uniquePartName = `${productData.name} - ${comp.name}`;
            const existing = await trx('products')
              .where({ name: uniquePartName, shop_id: shopId, is_deleted: 0 })
              .first();
            
            if (existing) {
              linkedId = existing.id;
            } else {
              const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
              const [newPartIdObj] = await trx('products')
                .insert({
                  sku: partSku,
                  name: uniquePartName,
                  category: productData.category,
                  brand_id: productData.brand_id,
                  user_id: userId,
                  shop_id: shopId,
                  buying_price: comp.cost || 0,
                  selling_price: comp.price || 0,
                  stock: 0,
                  is_component: 1
                })
                .returning('id');
              linkedId = typeof newPartIdObj === 'object' ? newPartIdObj.id : newPartIdObj;
            }
          }

          if (linkedId) {
            await trx('product_compositions').insert({
              parent_product_id: productId,
              component_product_id: linkedId,
              custom_name: comp.name || '',
              quantity: comp.quantity || 1,
              price: comp.price || 0,
              cost: comp.cost || 0
            });
          }
        }
      }

      await trx('shops').where({ id: shopId }).increment('product_count', 1);

      return productId;
    });
  }

  async setDeleted(productId, shopId) {
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      const affected = await trx('products')
        .where({ id: productId, shop_id: shopId, is_deleted: 0 })
        .update({ is_deleted: 1 });
      
      if (affected > 0) {
        await trx('shops').where({ id: shopId }).decrement('product_count', 1);
      }
      return affected;
    });
  }

  /**
   * Update an existing product.
   */
  async updateProduct(productId, data, shopId, userId) {
    const validatedData = productSchema.partial().parse(data);
    
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      // Update basic fields
      await trx('products')
        .where({ id: productId })
        .update({
          ...productData,
          updated_at: db.fn.now()
        });

      // Handle Ingredients/Recipes
      if (ingredients !== undefined) {
        const existingLink = await trx('product_recipe_links').where({ product_id: productId }).first();
        let recipeId;
        
        if (existingLink) {
          recipeId = existingLink.recipe_id;
          await trx('recipe_ingredients').where({ recipe_id: recipeId }).delete();
        } else if (ingredients.length > 0) {
          const [rIdObj] = await trx('recipes').insert({ shop_id: shopId, name: `Recipe: ${product.name}` }).returning('id');
          recipeId = typeof rIdObj === 'object' ? rIdObj.id : rIdObj;
          await trx('product_recipe_links').insert({ shop_id: shopId, product_id: productId, recipe_id: recipeId });
        }

        if (recipeId && ingredients.length > 0) {
          const rows = ingredients.map(ing => ({ recipe_id: recipeId, raw_stock_id: ing.raw_stock_id, quantity: ing.quantity }));
          await trx('recipe_ingredients').insert(rows);
        } else if (recipeId && ingredients.length === 0) {
          await trx('product_recipe_links').where({ product_id: productId }).delete();
        }
      }

      // Handle Compositions (Composite products)
      if (components !== undefined) {
        await trx('product_compositions').where({ parent_product_id: productId }).delete();
        for (const comp of components) {
          let linkedId = comp.id || null;
          if (!linkedId && comp.name) {
            const uniquePartName = `${product.name} - ${comp.name}`;
            const existing = await trx('products').where({ name: uniquePartName, shop_id: shopId, is_deleted: 0 }).first();
            if (existing) linkedId = existing.id;
            else {
              const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
              const [newIdObj] = await trx('products').insert({
                sku: partSku, name: uniquePartName, category: productData.category || product.category,
                brand_id: productData.brand_id || product.brand_id, user_id: userId, shop_id: shopId,
                buying_price: comp.cost || 0, selling_price: comp.price || 0, stock: 0, is_component: 1
              }).returning('id');
              linkedId = typeof newIdObj === 'object' ? newIdObj.id : newIdObj;
            }
          }
          if (linkedId) {
            await trx('product_compositions').insert({
              parent_product_id: productId, component_product_id: linkedId,
              custom_name: comp.name || '', quantity: comp.quantity || 1, price: comp.price || 0, cost: comp.cost || 0
            });
          }
        }
      }
    });
  }


  /**
   * Adjust stock manually with FIFO batch handling.
   */
  async adjustStock(productId, shopId, { delta, buying_price }) {
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const diff = parseInt(delta || 0);
      const nBP = buying_price !== undefined ? parseFloat(buying_price) : product.buying_price;

      if (diff > 0) {
        await trx('product_batches').insert({ product_id: productId, shop_id: shopId, buying_price: nBP, quantity: diff });
      } else if (diff < 0) {
        let toRemove = Math.abs(diff);
        const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
        for (const b of batches) {
          if (toRemove <= 0) break;
          const take = Math.min(b.quantity, toRemove);
          await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
          toRemove -= take;
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock + ?', [diff]),
        buying_price: nBP
      });

      const updated = await trx('products').select('stock').where({ id: productId }).first();
      return updated.stock;
    });
  }

  /**
   * Record damage loss.
   */
  async recordLoss(productId, shopId, { damage_count, manual_loss_amount, batch_id }) {
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const count = parseInt(damage_count) || 0;
      const manualLoss = parseFloat(manual_loss_amount) || 0;
      let actualLossCost = manualLoss;

      if (count > 0) {
        if (product.stock < count) throw new Error('Not enough stock');
        if (batch_id) {
          const batch = await trx('product_batches').where({ id: batch_id }).first();
          if (!batch || batch.quantity < count) throw new Error('Not enough stock in batch');
          await trx('product_batches').where({ id: batch_id }).update({
            quantity: db.raw('quantity - ?', [count]),
            damaged_quantity: db.raw('damaged_quantity + ?', [count])
          });
          actualLossCost += (count * batch.buying_price);
        } else {
          let toRemove = count;
          const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
          for (const b of batches) {
            if (toRemove <= 0) break;
            const take = Math.min(b.quantity, toRemove);
            await trx('product_batches').where({ id: b.id }).update({
              quantity: db.raw('quantity - ?', [take]),
              damaged_quantity: db.raw('damaged_quantity + ?', [take])
            });
            actualLossCost += (take * b.buying_price);
            toRemove -= take;
          }
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock - ?', [count]),
        damage_stock: db.raw('damage_stock + ?', [count]),
        manual_damage_loss: db.raw('manual_damage_loss + ?', [actualLossCost])
      });
    });
  }

  /**
   * Record recovery from damage.
   */
  async recordRecovery(productId, shopId, { recovery_count, recovery_amount, batch_id, is_restocking }) {
    return await db.transaction(async (trx) => {
      const { components, ingredients, ...productData } = validatedData;
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const count = parseInt(recovery_count) || 0;
      const amount = parseFloat(recovery_amount) || 0;
      const shouldRestock = is_restocking === true;
      let costReduction = 0;

      if (count > 0) {
        if (product.damage_stock < count) throw new Error('Not enough damaged stock');
        if (batch_id) {
          const batch = await trx('product_batches').where({ id: batch_id }).first();
          if (!batch || batch.damaged_quantity < count) throw new Error('Not enough damaged stock in batch');
          if (shouldRestock) await trx('product_batches').where({ id: batch_id }).update({ 
            quantity: db.raw('quantity + ?', [count]), 
            damaged_quantity: db.raw('damaged_quantity - ?', [count]) 
          });
          else await trx('product_batches').where({ id: batch_id }).update({ damaged_quantity: db.raw('damaged_quantity - ?', [count]) });
          costReduction = (count * batch.buying_price);
        } else {
          const newest = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).orderBy('created_at', 'desc').first();
          if (newest) {
            if (shouldRestock) await trx('product_batches').where({ id: newest.id }).update({ quantity: db.raw('quantity + ?', [count]) });
            costReduction = (count * newest.buying_price);
          }
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock + ?', [shouldRestock ? count : 0]),
        damage_stock: db.raw('damage_stock - ?', [count]),
        manual_damage_loss: db.raw('manual_damage_loss - ?', [costReduction]),
        recovered_damage_amount: db.raw('recovered_damage_amount + ?', [amount]),
        recovered_damage_quantity: db.raw('recovered_damage_quantity + ?', [count])
      });
    });
  }

  /**
   * Harvest units into components.
   */
  async harvest(productId, shopId, { count = 1 }) {
    return await db.transaction(async (trx) => {
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');
      if (product.stock < count) throw new Error(`Not enough stock of "${product.name}"`);

      let toRemove = count, totalCost = 0;
      const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
      for (const b of batches) {
        if (toRemove <= 0) break;
        const take = Math.min(b.quantity, toRemove);
        await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
        totalCost += (take * b.buying_price);
        toRemove -= take;
      }
      await trx('products').where({ id: productId }).update({ stock: db.raw('stock - ?', [count]) });

      const avgCost = count > 0 ? (totalCost / count) : product.buying_price;
      const components = await trx('product_compositions').where({ parent_product_id: productId });
      for (const comp of components) {
        if (comp.component_product_id) {
          const qty = count * comp.quantity;
          const cost = comp.cost || (avgCost / (comp.quantity || 1));
          await trx('products').where({ id: comp.component_product_id }).update({ stock: db.raw('stock + ?', [qty]) });
          await trx('product_batches').insert({ product_id: comp.component_product_id, shop_id: shopId, buying_price: cost, quantity: qty });
        }
      }
      return product.stock - count;
    });
  }
}

module.exports = new ProductService();

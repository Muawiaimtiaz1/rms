const db = require('../db/knex');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeId(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function insertedId(row) {
  return typeof row === 'object' ? row.id : row;
}

function jsonSnapshot(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

class WasteService {
  async getContext(shopId) {
    const [products, rawStocks, recipes, recentSales, recentReturns] = await Promise.all([
      db('products as p')
        .select(
          'p.id',
          'p.name',
          'p.sku',
          'p.category',
          'p.stock',
          'p.buying_price',
          'p.damage_stock',
          db.raw('COUNT(prl.id) as recipe_count')
        )
        .leftJoin('product_recipe_links as prl', 'p.id', 'prl.product_id')
        .where({ 'p.shop_id': shopId, 'p.is_deleted': 0 })
        .groupBy('p.id')
        .orderBy('p.name', 'asc'),
      db('raw_stocks as rs')
        .select(
          'rs.*',
          db.raw('(SELECT buying_price FROM raw_stock_batches WHERE raw_stock_id = rs.id AND shop_id = rs.shop_id ORDER BY created_at DESC, id DESC LIMIT 1) as buying_price')
        )
        .where({ 'rs.shop_id': shopId, 'rs.is_deleted': 0 })
        .orderBy('rs.name', 'asc'),
      db('recipes as r')
        .select('r.id', 'r.name', 'r.description')
        .where('r.shop_id', shopId)
        .orderBy('r.name', 'asc'),
      db('sales as s')
        .select('s.id', 's.customer_name', 's.total', 's.order_type', 's.order_status', 's.created_at')
        .where('s.shop_id', shopId)
        .orderBy('s.created_at', 'desc')
        .limit(50),
      db('returns as r')
        .select('r.id', 'r.sale_id', 'r.total_refund', 'r.reason', 'r.created_at')
        .where('r.shop_id', shopId)
        .orderBy('r.created_at', 'desc')
        .limit(50)
    ]);

    return { products, rawStocks, recipes, recentSales, recentReturns };
  }

  async list(shopId, filters = {}, user = null) {
    const query = db('waste_events as we')
      .select(
        'we.*',
        'u.name as user_name',
        'u.username as user_username',
        'p.name as product_name',
        'rs.name as raw_stock_name',
        'r.name as recipe_name',
        'shops.name as shop_name'
      )
      .leftJoin('users as u', 'we.user_id', 'u.id')
      .leftJoin('products as p', 'we.product_id', 'p.id')
      .leftJoin('raw_stocks as rs', 'we.raw_stock_id', 'rs.id')
      .leftJoin('recipes as r', 'we.recipe_id', 'r.id')
      .leftJoin('shops', 'we.shop_id', 'shops.id');

    if (shopId) query.where('we.shop_id', shopId);
    if (!shopId && filters.shop_id) query.where('we.shop_id', filters.shop_id);
    if (user && !['admin', 'superadmin', 'manager'].includes(user.role)) {
      query.where('we.user_id', user.id);
    }
    if (filters.from) query.where('we.created_at', '>=', filters.from);
    if (filters.to) query.where('we.created_at', '<=', filters.to);
    if (filters.source_type) query.where('we.source_type', filters.source_type);

    return query.orderBy('we.created_at', 'desc').limit(Math.min(parseInt(filters.limit, 10) || 500, 1000));
  }

  async record(shopId, userId, payload = {}) {
    const sourceType = String(payload.source_type || '').trim();
    const quantity = toNumber(payload.quantity);
    if (!shopId) throw new Error('Shop is required for waste recording.');
    if (!sourceType) throw new Error('Waste source type is required.');
    if (quantity <= 0) throw new Error('Waste quantity must be greater than zero.');

    return db.transaction(async (trx) => {
      const eventBase = {
        shop_id: shopId,
        user_id: userId,
        waste_type: payload.waste_type || this.inferWasteType(sourceType),
        source_type: sourceType,
        stock_action: payload.stock_action || this.defaultStockAction(sourceType),
        product_id: normalizeId(payload.product_id),
        raw_stock_id: normalizeId(payload.raw_stock_id),
        recipe_id: normalizeId(payload.recipe_id),
        sale_id: normalizeId(payload.sale_id),
        return_id: normalizeId(payload.return_id),
        batch_id: normalizeId(payload.batch_id),
        quantity,
        unit: payload.unit || null,
        reason_code: payload.reason_code || null,
        reason: payload.reason || null,
        recovery_status: payload.recovery_status || 'full_loss',
        recoverable_quantity: toNumber(payload.recoverable_quantity),
        recovered_amount: toNumber(payload.recovered_amount),
        status: 'recorded',
        approved_by_user_id: normalizeId(payload.approved_by_user_id),
        approved_at: payload.approved_by_user_id ? db.fn.now() : null
      };

      let lines = [];
      let snapshot = {};
      let costAmount = 0;

      if (sourceType === 'product') {
        const result = await this.handleProductWaste(trx, shopId, eventBase);
        lines = result.lines;
        snapshot = result.snapshot;
        costAmount = result.costAmount;
        eventBase.unit = eventBase.unit || 'unit';
      } else if (sourceType === 'raw_ingredient') {
        const result = await this.handleRawWaste(trx, shopId, userId, eventBase);
        lines = result.lines;
        snapshot = result.snapshot;
        costAmount = result.costAmount;
        eventBase.unit = eventBase.unit || result.unit;
      } else if (sourceType === 'recipe_product' || sourceType === 'prepared_batch') {
        const result = await this.handleRecipeWaste(trx, shopId, userId, eventBase);
        lines = result.lines;
        snapshot = result.snapshot;
        costAmount = result.costAmount;
        eventBase.unit = eventBase.unit || 'unit';
      } else if (sourceType === 'order' || sourceType === 'return') {
        const result = await this.handleReferenceWaste(trx, shopId, eventBase);
        lines = result.lines;
        snapshot = result.snapshot;
        costAmount = result.costAmount;
        eventBase.stock_action = eventBase.stock_action || 'already_deducted';
      } else {
        throw new Error(`Unsupported waste source type: ${sourceType}`);
      }

      eventBase.cost_amount = toNumber(payload.manual_cost_amount, costAmount);
      eventBase.item_snapshot = jsonSnapshot(snapshot);

      const [row] = await trx('waste_events').insert(eventBase).returning('id');
      const wasteEventId = insertedId(row);

      if (lines.length) {
        await trx('waste_event_items').insert(lines.map((line) => ({
          waste_event_id: wasteEventId,
          item_type: line.item_type,
          product_id: line.product_id || null,
          raw_stock_id: line.raw_stock_id || null,
          batch_id: line.batch_id || null,
          quantity: line.quantity,
          unit: line.unit || null,
          cost_amount: line.cost_amount || 0
        })));
      }

      return { ok: true, id: wasteEventId, cost_amount: eventBase.cost_amount };
    });
  }

  inferWasteType(sourceType) {
    if (sourceType === 'raw_ingredient') return 'raw_ingredient_waste';
    if (sourceType === 'recipe_product') return 'recipe_product_waste';
    if (sourceType === 'prepared_batch') return 'prepared_batch_waste';
    if (sourceType === 'order') return 'order_waste';
    if (sourceType === 'return') return 'return_damage_waste';
    return 'product_waste';
  }

  defaultStockAction(sourceType) {
    if (sourceType === 'order' || sourceType === 'return') return 'already_deducted';
    return 'deduct';
  }

  async handleProductWaste(trx, shopId, event) {
    if (!event.product_id) throw new Error('Product is required.');
    const product = await trx('products').where({ id: event.product_id, shop_id: shopId }).first();
    if (!product) throw new Error('Product not found.');

    if (event.stock_action === 'already_deducted' || event.stock_action === 'no_stock') {
      const cost = event.quantity * toNumber(product.buying_price);
      return {
        costAmount: cost,
        snapshot: { source_name: product.name, sku: product.sku, stock_action: event.stock_action },
        lines: [{ item_type: 'product', product_id: product.id, batch_id: event.batch_id, quantity: event.quantity, unit: 'unit', cost_amount: cost }]
      };
    }

    if (toNumber(product.stock) < event.quantity) throw new Error(`Not enough stock for ${product.name}.`);

    const { lines, totalCost } = await this.deductProductBatches(trx, shopId, product, event.quantity, event.batch_id, event.recovery_status);
    await trx('products').where({ id: product.id }).update({
      stock: db.raw('stock - ?', [event.quantity]),
      damage_stock: event.recovery_status === 'recoverable' ? db.raw('damage_stock + ?', [event.quantity]) : db.raw('damage_stock + 0'),
      manual_damage_loss: db.raw('manual_damage_loss + ?', [totalCost])
    });

    return { costAmount: totalCost, snapshot: { source_name: product.name, sku: product.sku }, lines };
  }

  async deductProductBatches(trx, shopId, product, quantity, batchId, recoveryStatus) {
    let remaining = quantity;
    const lines = [];
    let totalCost = 0;
    const query = trx('product_batches')
      .where({ product_id: product.id, shop_id: shopId })
      .andWhere('quantity', '>', 0);
    if (batchId) query.andWhere('id', batchId);
    const batches = await query.orderBy('created_at', 'asc');

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, toNumber(batch.quantity));
      await trx('product_batches').where({ id: batch.id }).update({
        quantity: db.raw('quantity - ?', [take]),
        damaged_quantity: recoveryStatus === 'recoverable'
          ? db.raw('damaged_quantity + ?', [take])
          : db.raw('damaged_quantity + 0')
      });
      const cost = take * toNumber(batch.buying_price);
      totalCost += cost;
      lines.push({ item_type: 'product', product_id: product.id, batch_id: batch.id, quantity: take, unit: 'unit', cost_amount: cost });
      remaining -= take;
    }

    if (remaining > 0.0001) throw new Error('Not enough batch stock for product waste.');
    return { lines, totalCost };
  }

  async handleRawWaste(trx, shopId, userId, event) {
    if (!event.raw_stock_id) throw new Error('Raw ingredient is required.');
    const raw = await trx('raw_stocks').where({ id: event.raw_stock_id, shop_id: shopId }).first();
    if (!raw) throw new Error('Raw ingredient not found.');

    if (event.stock_action === 'already_deducted' || event.stock_action === 'no_stock') {
      return {
        costAmount: 0,
        unit: raw.unit,
        snapshot: { source_name: raw.name, unit: raw.unit, stock_action: event.stock_action },
        lines: [{ item_type: 'raw_ingredient', raw_stock_id: raw.id, batch_id: event.batch_id, quantity: event.quantity, unit: raw.unit, cost_amount: 0 }]
      };
    }

    if (toNumber(raw.current_stock) < event.quantity) throw new Error(`Not enough stock of ${raw.name}.`);
    const { lines, totalCost } = await this.deductRawBatches(trx, shopId, raw, event.quantity, event.batch_id);
    await trx('raw_stocks').where({ id: raw.id }).update({ current_stock: db.raw('current_stock - ?', [event.quantity]) });
    await trx('raw_stock_waste').insert({
      raw_stock_id: raw.id,
      shop_id: shopId,
      user_id: userId,
      quantity: event.quantity,
      reason: event.reason || event.reason_code || 'Waste recorded'
    });

    return { costAmount: totalCost, unit: raw.unit, snapshot: { source_name: raw.name, unit: raw.unit }, lines };
  }

  async deductRawBatches(trx, shopId, raw, quantity, batchId) {
    let remaining = quantity;
    const lines = [];
    let totalCost = 0;
    const query = trx('raw_stock_batches')
      .where({ raw_stock_id: raw.id, shop_id: shopId })
      .andWhere('quantity', '>', 0);
    if (batchId) query.andWhere('id', batchId);
    const batches = await query.orderBy('created_at', 'asc');

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, toNumber(batch.quantity));
      await trx('raw_stock_batches').where({ id: batch.id }).update({ quantity: db.raw('quantity - ?', [take]) });
      const cost = take * toNumber(batch.buying_price);
      totalCost += cost;
      lines.push({ item_type: 'raw_ingredient', raw_stock_id: raw.id, batch_id: batch.id, quantity: take, unit: raw.unit, cost_amount: cost });
      remaining -= take;
    }

    if (remaining > 0.0001) throw new Error('Not enough batch stock for ingredient waste.');
    return { lines, totalCost };
  }

  async handleRecipeWaste(trx, shopId, userId, event) {
    const product = event.product_id
      ? await trx('products').where({ id: event.product_id, shop_id: shopId }).first()
      : null;

    if (event.stock_action === 'already_deducted' || event.stock_action === 'no_stock') {
      const cost = product ? event.quantity * toNumber(product.buying_price) : 0;
      return {
        costAmount: cost,
        snapshot: { source_name: product?.name || 'Prepared item', stock_action: event.stock_action },
        lines: product ? [{ item_type: 'prepared_product', product_id: product.id, quantity: event.quantity, unit: 'unit', cost_amount: cost }] : []
      };
    }

    const recipeLinks = await this.resolveRecipeLinks(trx, shopId, event, product);
    if (!recipeLinks.length) throw new Error('No recipe found for this waste item.');

    const allLines = [];
    let totalCost = 0;
    for (const link of recipeLinks) {
      const ingredients = await trx('recipe_ingredients as ri')
        .select('ri.raw_stock_id', 'ri.quantity as amount_per_unit', 'rs.name', 'rs.unit', 'rs.current_stock', 'rs.conversion_factor')
        .join('raw_stocks as rs', 'ri.raw_stock_id', 'rs.id')
        .where('ri.recipe_id', link.recipe_id);

      for (const ingredient of ingredients) {
        const raw = {
          id: ingredient.raw_stock_id,
          name: ingredient.name,
          unit: ingredient.unit,
          current_stock: ingredient.current_stock
        };
        const totalNeeded = (toNumber(ingredient.amount_per_unit) * event.quantity) / (toNumber(ingredient.conversion_factor, 1) || 1);
        if (toNumber(raw.current_stock) < totalNeeded) throw new Error(`Not enough stock of ${raw.name}.`);
        const { lines, totalCost: lineCost } = await this.deductRawBatches(trx, shopId, raw, totalNeeded, null);
        await trx('raw_stocks').where({ id: raw.id }).update({ current_stock: db.raw('current_stock - ?', [totalNeeded]) });
        await trx('raw_stock_waste').insert({
          raw_stock_id: raw.id,
          shop_id: shopId,
          user_id: userId,
          quantity: totalNeeded,
          reason: event.reason || `Recipe waste${product ? `: ${product.name}` : ''}`
        });
        totalCost += lineCost;
        allLines.push(...lines);
      }
    }

    return {
      costAmount: totalCost,
      snapshot: { source_name: product?.name || 'Recipe waste', recipe_count: recipeLinks.length },
      lines: allLines
    };
  }

  async resolveRecipeLinks(trx, shopId, event, product) {
    if (event.recipe_id) {
      const recipe = await trx('recipes').where({ id: event.recipe_id, shop_id: shopId }).first();
      if (!recipe) throw new Error('Recipe not found.');
      return [{ recipe_id: recipe.id }];
    }
    if (!product) throw new Error('Product or recipe is required.');
    return trx('product_recipe_links').where({ product_id: product.id, shop_id: shopId });
  }

  async handleReferenceWaste(trx, shopId, event) {
    if (event.source_type === 'order' && !event.sale_id) throw new Error('Sale/order reference is required.');
    if (event.source_type === 'return' && !event.return_id) throw new Error('Return reference is required.');

    let snapshot = {};
    let totalCost = 0;
    const lines = [];

    if (event.sale_id) {
      const sale = await trx('sales').where({ id: event.sale_id, shop_id: shopId }).first();
      if (!sale) throw new Error('Sale/order not found.');
      const saleItems = await trx('sale_items').where({ sale_id: sale.id });
      totalCost = saleItems.reduce((sum, item) => sum + (toNumber(item.buying_price_at_sale) * toNumber(item.quantity)), 0);
      snapshot = { source_name: `Sale #${sale.id}`, order_type: sale.order_type, order_status: sale.order_status };
      lines.push(...saleItems.map((item) => ({
        item_type: 'sale_item',
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        unit: 'unit',
        cost_amount: toNumber(item.buying_price_at_sale) * toNumber(item.quantity)
      })));
    }

    if (event.return_id) {
      const ret = await trx('returns').where({ id: event.return_id, shop_id: shopId }).first();
      if (!ret) throw new Error('Return not found.');
      const returnItems = await trx('return_items').where({ return_id: ret.id });
      totalCost = returnItems.reduce((sum, item) => sum + (toNumber(item.buying_price_at_sale) * toNumber(item.quantity)), 0);
      snapshot = { source_name: `Return #${ret.id}`, sale_id: ret.sale_id, reason: ret.reason };
      lines.push(...returnItems.map((item) => ({
        item_type: 'return_item',
        product_id: item.product_id,
        quantity: item.quantity,
        unit: 'unit',
        cost_amount: toNumber(item.buying_price_at_sale) * toNumber(item.quantity)
      })));
    }

    return { costAmount: totalCost, snapshot, lines };
  }
}

module.exports = new WasteService();

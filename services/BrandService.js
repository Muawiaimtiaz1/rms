const db = require('../db/knex');
const { z } = require('zod');

function normalizePercent(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

function normalizePartnerType(value) {
  return 'share_based';
}

function sameId(a, b) {
  return String(a) === String(b);
}

function extractInsertedId(idObj) {
  return typeof idObj === 'object' ? idObj.id : idObj;
}

class BrandService {
  async ensureOwnershipHistory(shopId, trx = db) {
    const existing = await trx('partner_ownership_history').where({ shop_id: shopId }).first();
    if (existing) return;
    const brands = await trx('brands').where({ shop_id: shopId }).select('id', 'name', 'ownership_percent');
    if (brands.length) {
      await trx('partner_ownership_history').insert(brands.map(brand => ({
        shop_id: shopId,
        brand_id: brand.id,
        partner_name: brand.name,
        ownership_percent: normalizePercent(brand.ownership_percent),
        effective_from: new Date('2000-01-01T00:00:00.000Z')
      })));
    }
  }

  async recordOwnershipSnapshot(shopId, trx = db, effectiveFrom = new Date()) {
    await this.ensureOwnershipHistory(shopId, trx);
    let timestamp = effectiveFrom instanceof Date ? effectiveFrom : new Date(effectiveFrom);
    const latest = await trx('partner_ownership_history').where({ shop_id: shopId }).max('effective_from as value').first();
    if (latest?.value && timestamp <= new Date(latest.value)) timestamp = new Date(new Date(latest.value).getTime() + 1);
    await trx('partner_ownership_history').where({ shop_id: shopId }).whereNull('effective_to').update({ effective_to: timestamp });
    const brands = await trx('brands').where({ shop_id: shopId }).select('id', 'name', 'ownership_percent');
    if (brands.length) {
      await trx('partner_ownership_history').insert(brands.map(brand => ({
        shop_id: shopId,
        brand_id: brand.id,
        partner_name: brand.name,
        ownership_percent: normalizePercent(brand.ownership_percent),
        effective_from: timestamp
      })));
    }
  }

  pickOwnerBrand(brands, adminUser = null) {
    if (!brands.length) return null;
    if (adminUser) {
      const adminBrand = brands.find((brand) => sameId(brand.user_id, adminUser.id));
      if (adminBrand) return adminBrand;
    }
    const namedOwner = brands.find((brand) => ['owner', 'admin'].includes(String(brand.name || '').trim().toLowerCase()));
    return namedOwner || brands[0];
  }

  async ensureOwnerBrand(shopId, trx = db) {
    let brands = await trx('brands').where({ shop_id: shopId }).orderBy('id', 'asc');
    const adminUser = await trx('users').where({ shop_id: shopId, role: 'admin' }).orderBy('id', 'asc').first();
    let owner = this.pickOwnerBrand(brands, adminUser);

    if (!owner && shopId && adminUser) {
      const [idObj] = await trx('brands').insert({
        name: 'owner',
        partner_type: 'share_based',
        ownership_percent: 100,
        user_id: adminUser.id,
        shop_id: shopId
      }).returning('id');

      const newId = extractInsertedId(idObj);
      brands = await trx('brands').where({ shop_id: shopId }).orderBy('id', 'asc');
      owner = brands.find((brand) => sameId(brand.id, newId)) || this.pickOwnerBrand(brands, adminUser);
    }

    return { owner, brands, adminUser };
  }

  async rebalanceOwnerShare(shopId, trx = db, { strict = true } = {}) {
    let { owner, brands } = await this.ensureOwnerBrand(shopId, trx);
    if (!owner) return null;

    await trx('brands')
      .where({ id: owner.id, shop_id: shopId })
      .update({ partner_type: 'share_based' });

    // Product suppliers live in third_party_persons. Brands are business owners only.
    await trx('brands').where({ shop_id: shopId, partner_type: 'product_based' })
      .update({ partner_type: 'share_based', ownership_percent: 0 });

    brands = await trx('brands').where({ shop_id: shopId }).orderBy('id', 'asc');

    const partnerTotal = brands
      .filter((brand) => !sameId(brand.id, owner.id) && normalizePartnerType(brand.partner_type) === 'share_based')
      .reduce((sum, brand) => sum + normalizePercent(brand.ownership_percent), 0);

    if (strict && partnerTotal > 100.0001) {
      throw new Error('Partner business shares cannot be more than 100%. Reduce another partner share first.');
    }

    const ownerPercent = Math.max(0, 100 - partnerTotal);
    await trx('brands')
      .where({ id: owner.id, shop_id: shopId })
      .update({ ownership_percent: ownerPercent });

    return { ownerId: owner.id, ownerPercent, partnerTotal };
  }

  async listBrands(shopId) {
    const ownerShare = shopId ? await this.rebalanceOwnerShare(shopId, db, { strict: false }) : null;
    if (shopId) await this.ensureOwnershipHistory(shopId);
    const brands = await db('brands').where({ shop_id: shopId }).orderBy('name', 'asc');
    return brands.map((brand) => ({
      ...brand,
      partner_type: normalizePartnerType(brand.partner_type),
      is_owner_partner: ownerShare ? sameId(brand.id, ownerShare.ownerId) : false
    }));
  }

  async createBrand(name, targetShopId, creatorId, ownershipPercent = null, partnerType = 'share_based') {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Business partner name is required.');
    return db.transaction(async (trx) => {
      await this.ensureOwnerBrand(targetShopId, trx);
      await this.ensureOwnershipHistory(targetShopId, trx);
      const normalizedPartnerType = normalizePartnerType(partnerType);
      const [idObj] = await trx('brands').insert({
        name: cleanName,
        partner_type: normalizedPartnerType,
        ownership_percent: normalizedPartnerType === 'share_based' ? normalizePercent(ownershipPercent, 0) : 0,
        user_id: creatorId,
        shop_id: targetShopId
      }).returning('id');

      await this.rebalanceOwnerShare(targetShopId, trx, { strict: true });
      await this.recordOwnershipSnapshot(targetShopId, trx);
      return extractInsertedId(idObj);
    });
  }

  async updateBrand(id, name, targetShopId, ownershipPercent = null, partnerType = null) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Business partner name is required.');
    return db.transaction(async (trx) => {
      const brand = await trx('brands').where({ id, shop_id: targetShopId }).first();
      if (!brand) throw new Error('Brand not found');
      await this.ensureOwnershipHistory(targetShopId, trx);

      const { owner } = await this.ensureOwnerBrand(targetShopId, trx);
      const isOwnerBrand = owner && sameId(brand.id, owner.id);
      const updates = { name: cleanName };
      const nextPartnerType = isOwnerBrand ? 'share_based' : normalizePartnerType(partnerType || brand.partner_type);
      updates.partner_type = nextPartnerType;

      if (nextPartnerType === 'product_based') {
        updates.ownership_percent = 0;
      } else if (!isOwnerBrand && ownershipPercent !== null && ownershipPercent !== undefined) {
        updates.ownership_percent = normalizePercent(ownershipPercent);
      }

      await trx('brands').where({ id, shop_id: targetShopId }).update(updates);
      await this.rebalanceOwnerShare(targetShopId, trx, { strict: true });
      await this.recordOwnershipSnapshot(targetShopId, trx);
    });
  }

  async deleteBrand(id, targetShopId) {
    return db.transaction(async (trx) => {
      const brand = await trx('brands').where({ id, shop_id: targetShopId }).first();
      if (!brand) throw new Error('Brand not found');
      await this.ensureOwnershipHistory(targetShopId, trx);

      const { owner } = await this.ensureOwnerBrand(targetShopId, trx);
      if (owner && sameId(brand.id, owner.id)) {
        throw new Error('Owner/admin partner cannot be deleted. Adjust partner shares instead.');
      }

      const fundedAllocation = await trx('partner_allocation_shares')
        .where({ shop_id: targetShopId, brand_id: id }).where('percentage', '>', 0).first();
      if (fundedAllocation) {
        throw new Error('This partner has a custom expense or inventory allocation. Reallocate it before deleting the partner.');
      }

      await trx('brands').where({ id, shop_id: targetShopId }).delete();
      await this.rebalanceOwnerShare(targetShopId, trx, { strict: false });
      await this.recordOwnershipSnapshot(targetShopId, trx);
    });
  }

  async getHistoricalProfitShares(shopId, bounds, damageLoss = 0) {
    await this.ensureOwnershipHistory(shopId);
    const result = await db.raw(`
      WITH item_totals AS (
        SELECT sale_id, SUM(quantity * price_at_sale) AS subtotal
        FROM sale_items GROUP BY sale_id
      ), profit_events AS (
        SELECT s.created_at AS occurred_at,
          CASE WHEN si.third_party_person_id IS NULL
            THEN CASE WHEN COALESCE(it.subtotal, 0) > 0
              THEN (si.quantity * si.price_at_sale) * COALESCE(s.total, 0) / it.subtotal
              ELSE 0 END - (si.quantity * si.buying_price_at_sale)
            ELSE CASE WHEN COALESCE(it.subtotal, 0) > 0
              THEN (si.quantity * si.price_at_sale) * (it.subtotal - COALESCE(s.discount, 0)) / it.subtotal
                   * si.commission_percentage_at_sale / 100
              ELSE 0 END
          END AS profit,
          CASE WHEN si.third_party_person_id IS NOT NULL AND COALESCE(it.subtotal, 0) > 0
            THEN (si.quantity * si.price_at_sale) * (it.subtotal - COALESCE(s.discount, 0)) / it.subtotal
                 * si.commission_percentage_at_sale / 100
            ELSE 0 END AS commission_profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN item_totals it ON it.sale_id = s.id
        WHERE s.shop_id = ? AND s.order_status = 'completed'
          AND s.created_at BETWEEN ? AND ?
        UNION ALL
        SELECT r.created_at AS occurred_at,
          CASE WHEN si.third_party_person_id IS NULL
            THEN (ri.quantity * COALESCE(ri.buying_price_at_sale, 0)) - (ri.quantity * ri.refund_price)
            ELSE -(ri.quantity * ri.refund_price * si.commission_percentage_at_sale / 100)
          END AS profit,
          CASE WHEN si.third_party_person_id IS NOT NULL
            THEN -(ri.quantity * ri.refund_price * si.commission_percentage_at_sale / 100)
            ELSE 0 END AS commission_profit
        FROM return_items ri
        JOIN returns r ON r.id = ri.return_id
        LEFT JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.shop_id = ? AND r.created_at BETWEEN ? AND ?
      ), allocated AS (
        SELECT h.brand_id, MAX(h.partner_name) AS partner_name,
          SUM(e.profit * h.ownership_percent / 100.0) AS transaction_profit,
          SUM(e.commission_profit * h.ownership_percent / 100.0) AS commission_share
        FROM profit_events e
        JOIN partner_ownership_history h
          ON h.shop_id = ?
         AND e.occurred_at >= h.effective_from
         AND (h.effective_to IS NULL OR e.occurred_at < h.effective_to)
        GROUP BY h.brand_id
      ), period_partners AS (
        SELECT DISTINCT ON (brand_id) brand_id, partner_name
        FROM partner_ownership_history
        WHERE shop_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to > ?)
        ORDER BY brand_id, effective_from DESC
      ), closing_split AS (
        SELECT brand_id, ownership_percent
        FROM partner_ownership_history
        WHERE shop_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to > ?)
      )
      SELECT p.brand_id, p.partner_name,
        COALESCE(a.transaction_profit, 0) - COALESCE(c.ownership_percent, 0) * ? / 100.0 AS profit_share,
        COALESCE(a.commission_share, 0) AS commission_share
      FROM period_partners p
      LEFT JOIN allocated a ON a.brand_id = p.brand_id
      LEFT JOIN closing_split c ON c.brand_id = p.brand_id
      ORDER BY p.partner_name
    `, [shopId, bounds.start, bounds.end, shopId, bounds.start, bounds.end,
      shopId, shopId, bounds.end, bounds.start, shopId, bounds.end, bounds.end, Number(damageLoss || 0)]);
    return result.rows || result;
  }

  async getExpenseShares(shopId, month) {
    await this.rebalanceOwnerShare(shopId, db, { strict: false });
    const isSqlite = db.client.config.client !== 'pg';
    const totalExpRes = await db('expenses')
      .where({ shop_id: shopId })
      .andWhereRaw(isSqlite ? "strftime('%Y-%m', date) = ?" : "TO_CHAR(date, 'YYYY-MM') = ?", [month])
      .sum('amount as val')
      .first();
    
    const totalExp = parseFloat(totalExpRes.val || 0);
    const allocation = await this.getAllocationSettings(shopId);
    const brands = await db('brands').where({ shop_id: shopId, partner_type: 'share_based' });
    const brandCount = brands.length;
    const totalOwnershipPercent = brands.reduce((sum, brand) => sum + normalizePercent(brand.ownership_percent), 0);
    const expenseMap = new Map(allocation.expense.shares.map(row => [Number(row.brand_id), Number(row.percentage)]));
    const useCustomSplit = allocation.expense.mode === 'custom';
    const useWeightedSplit = useCustomSplit || totalOwnershipPercent > 0.0001;
    const shareForBrand = (brand) => {
      if (useCustomSplit) return totalExp * (Number(expenseMap.get(Number(brand.id)) || 0) / 100);
      if (useWeightedSplit) return totalExp * (normalizePercent(brand.ownership_percent) / 100);
      return brandCount > 0 ? (totalExp / brandCount) : 0;
    };

    const payments = await db('brand_expense_payments as bep')
      .join('brands as b', 'b.id', 'bep.brand_id')
      .where('b.shop_id', shopId)
      .andWhere('bep.month', month)
      .select('bep.brand_id')
      .sum('bep.amount as paid')
      .groupBy('bep.brand_id');

    const paymentMap = {};
    payments.forEach(p => paymentMap[p.brand_id] = parseFloat(p.paid));

    const shares = brands.map(b => ({
      brand_id: b.id,
      brand_name: b.name,
      ownership_percent: normalizePercent(b.ownership_percent),
      expense_percentage: useCustomSplit ? Number(expenseMap.get(Number(b.id)) || 0) : normalizePercent(b.ownership_percent),
      total_share: shareForBrand(b),
      paid: paymentMap[b.id] || 0,
      due: shareForBrand(b) - (paymentMap[b.id] || 0)
    }));

    return { month, totalExpenses: totalExp, brandCount, totalOwnershipPercent, allocationMode: allocation.expense.mode, weightedSplit: useWeightedSplit, shares };
  }

  async getAllocationSettings(shopId) {
    await this.rebalanceOwnerShare(shopId, db, { strict: false });
    const brands = await db('brands').where({ shop_id: shopId, partner_type: 'share_based' }).orderBy('name');
    const config = await db('partner_allocation_configs').where({ shop_id: shopId }).first();
    const rows = await db('partner_allocation_shares').where({ shop_id: shopId });
    const makeSection = (type, mode) => ({
      mode,
      shares: brands.map(brand => {
        const custom = rows.find(row => Number(row.brand_id) === Number(brand.id) && row.allocation_type === type);
        return { brand_id: brand.id, brand_name: brand.name,
          percentage: mode === 'custom' ? Number(custom?.percentage || 0) : normalizePercent(brand.ownership_percent) };
      })
    });
    return {
      expense: makeSection('expense', config?.expense_mode === 'custom' ? 'custom' : 'ownership'),
      inventory: makeSection('inventory', config?.inventory_mode === 'custom' ? 'custom' : 'ownership')
    };
  }

  async saveAllocationSettings(shopId, payload) {
    const modes = ['ownership', 'custom'];
    const expenseMode = modes.includes(payload.expense_mode) ? payload.expense_mode : 'ownership';
    const inventoryMode = modes.includes(payload.inventory_mode) ? payload.inventory_mode : 'ownership';
    await db.transaction(async trx => {
      await this.rebalanceOwnerShare(shopId, trx, { strict: false });
      const brands = await trx('brands').where({ shop_id: shopId, partner_type: 'share_based' }).select('id');
      const validIds = new Set(brands.map(row => Number(row.id)));
      const validateShares = (mode, values, label) => {
        if (mode !== 'custom') return [];
        const normalized = brands.map(brand => {
          const match = (Array.isArray(values) ? values : []).find(row => Number(row.brand_id) === Number(brand.id));
          const percentage = Number(match?.percentage);
          if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error(`${label} percentages must be between 0 and 100.`);
          return { brand_id: Number(brand.id), percentage };
        });
        if ((Array.isArray(values) ? values : []).some(row => !validIds.has(Number(row.brand_id)))) throw new Error(`${label} contains an invalid business partner.`);
        const total = normalized.reduce((sum, row) => sum + row.percentage, 0);
        if (Math.abs(total - 100) > 0.001) throw new Error(`${label} percentages must total exactly 100%. Current total: ${total.toFixed(2)}%.`);
        return normalized;
      };
      const expenseShares = validateShares(expenseMode, payload.expense_shares, 'Expense allocation');
      const inventoryShares = validateShares(inventoryMode, payload.inventory_shares, 'Inventory allocation');
      await trx('partner_allocation_configs').insert({ shop_id: shopId, expense_mode: expenseMode, inventory_mode: inventoryMode, updated_at: trx.fn.now() })
        .onConflict('shop_id').merge();
      await trx('partner_allocation_shares').where({ shop_id: shopId }).delete();
      const rows = [
        ...expenseShares.map(row => ({ shop_id: shopId, allocation_type: 'expense', ...row })),
        ...inventoryShares.map(row => ({ shop_id: shopId, allocation_type: 'inventory', ...row }))
      ];
      if (rows.length) await trx('partner_allocation_shares').insert(rows);
    });
    return this.getAllocationSettings(shopId);
  }

  async getInventoryShares(shopId) {
    const allocation = await this.getAllocationSettings(shopId);
    const totalRow = await db('products').where({ shop_id: shopId, is_deleted: 0 })
      .where(qb => qb.whereNull('is_commission_based').orWhere('is_commission_based', 0))
      .select(db.raw('COALESCE(SUM(stock * buying_price), 0) as val')).first();
    const total = Number(totalRow?.val || 0);
    return { totalInventoryValue: total, allocationMode: allocation.inventory.mode,
      shares: allocation.inventory.shares.map(row => ({ ...row, inventory_share: total * Number(row.percentage) / 100 })) };
  }

  async recordPayment(brandId, userId, amount, month, shopId) {
    // Verify brand belongs to shop
    const brand = await db('brands').where({ id: brandId, shop_id: shopId }).first();
    if (!brand) throw new Error('Unauthorized brand');

    await db('brand_expense_payments').insert({
      brand_id: brandId,
      user_id: userId,
      amount: parseFloat(amount),
      month: month
    });
  }

  async listPayments(shopId, month = null) {
    let query = db('brand_expense_payments as bep')
      .join('brands as b', 'b.id', 'bep.brand_id')
      .leftJoin('users as u', 'u.id', 'bep.user_id')
      .where('b.shop_id', shopId)
      .select('bep.*', 'b.name as brand_name', 'u.name as admin_name');

    if (month) query = query.where('bep.month', month);

    return query.orderBy('bep.created_at', 'desc');
  }

  async updatePayment(paymentId, amount, shopId) {
    const payment = await db('brand_expense_payments as bep')
      .join('brands as b', 'b.id', 'bep.brand_id')
      .where('bep.id', paymentId)
      .andWhere('b.shop_id', shopId)
      .select('bep.id')
      .first();

    if (!payment) throw new Error('Payment record not found');

    await db('brand_expense_payments').where({ id: paymentId }).update({ amount: parseFloat(amount) });
  }

  async getAllMonthsDues(shopId) {
    const isSqlite = db.client.config.client !== 'pg';
    // 1. Get all unique months from expenses and payments for this shop
    const expMonths = await db('expenses')
      .where({ shop_id: shopId })
      .select(db.raw(isSqlite ? "strftime('%Y-%m', date) as m" : "TO_CHAR(date, 'YYYY-MM') as m"))
      .distinct();
    
    const payMonths = await db('brand_expense_payments as bep')
      .join('brands as b', 'b.id', 'bep.brand_id')
      .where('b.shop_id', shopId)
      .select('bep.month as m')
      .distinct();

    const allMonths = [...new Set([...expMonths.filter(x => x.m).map(x => x.m), ...payMonths.filter(x => x.m).map(x => x.m)])]
      .sort()
      .reverse();
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const results = [];

    for (const month of allMonths) {
      if (!month || month === currentMonth) continue; // Usually we only show previous months as "outstanding"
      
      const sharesData = await this.getExpenseShares(shopId, month);
      const totalDue = sharesData.shares.reduce((s, b) => s + b.due, 0);
      
      if (totalDue > 1) { // Only show if significant due exists
         results.push({
           month,
           totalDue,
           totalExpenses: sharesData.totalExpenses,
           brandDues: sharesData.shares.filter(s => s.due > 0).map(s => ({
             brand_id: s.brand_id,
             brand_name: s.brand_name,
             due: s.due
           }))
         });
      }
    }

    return results;
  }
}

module.exports = new BrandService();

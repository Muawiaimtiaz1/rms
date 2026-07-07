const db = require('../db/knex');
const { z } = require('zod');

function normalizePercent(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

function normalizePartnerType(value) {
  return value === 'product_based' ? 'product_based' : 'share_based';
}

function sameId(a, b) {
  return String(a) === String(b);
}

function extractInsertedId(idObj) {
  return typeof idObj === 'object' ? idObj.id : idObj;
}

class BrandService {
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

    await trx('brands')
      .where({ shop_id: shopId, partner_type: 'product_based' })
      .update({ ownership_percent: 0 });

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
    const brands = await db('brands').where({ shop_id: shopId }).orderBy('name', 'asc');
    return brands.map((brand) => ({
      ...brand,
      partner_type: normalizePartnerType(brand.partner_type),
      is_owner_partner: ownerShare ? sameId(brand.id, ownerShare.ownerId) : false
    }));
  }

  async createBrand(name, targetShopId, creatorId, ownershipPercent = null, partnerType = 'share_based') {
    return db.transaction(async (trx) => {
      await this.ensureOwnerBrand(targetShopId, trx);
      const normalizedPartnerType = normalizePartnerType(partnerType);
      const [idObj] = await trx('brands').insert({
        name,
        partner_type: normalizedPartnerType,
        ownership_percent: normalizedPartnerType === 'share_based' ? normalizePercent(ownershipPercent, 0) : 0,
        user_id: creatorId,
        shop_id: targetShopId
      }).returning('id');

      await this.rebalanceOwnerShare(targetShopId, trx, { strict: true });
      return extractInsertedId(idObj);
    });
  }

  async updateBrand(id, name, targetShopId, ownershipPercent = null, partnerType = null) {
    return db.transaction(async (trx) => {
      const brand = await trx('brands').where({ id, shop_id: targetShopId }).first();
      if (!brand) throw new Error('Brand not found');

      const { owner } = await this.ensureOwnerBrand(targetShopId, trx);
      const isOwnerBrand = owner && sameId(brand.id, owner.id);
      const updates = { name };
      const nextPartnerType = isOwnerBrand ? 'share_based' : normalizePartnerType(partnerType || brand.partner_type);
      updates.partner_type = nextPartnerType;

      if (nextPartnerType === 'product_based') {
        updates.ownership_percent = 0;
      } else if (!isOwnerBrand && ownershipPercent !== null && ownershipPercent !== undefined) {
        updates.ownership_percent = normalizePercent(ownershipPercent);
      }

      await trx('brands').where({ id, shop_id: targetShopId }).update(updates);
      await this.rebalanceOwnerShare(targetShopId, trx, { strict: true });
    });
  }

  async deleteBrand(id, targetShopId) {
    return db.transaction(async (trx) => {
      const brand = await trx('brands').where({ id, shop_id: targetShopId }).first();
      if (!brand) throw new Error('Brand not found');

      const { owner } = await this.ensureOwnerBrand(targetShopId, trx);
      if (owner && sameId(brand.id, owner.id)) {
        throw new Error('Owner/admin partner cannot be deleted. Adjust partner shares instead.');
      }

      await trx('brands').where({ id, shop_id: targetShopId }).delete();
      await this.rebalanceOwnerShare(targetShopId, trx, { strict: false });
    });
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
    const brands = await db('brands').where({ shop_id: shopId, partner_type: 'share_based' });
    const brandCount = brands.length;
    const totalOwnershipPercent = brands.reduce((sum, brand) => sum + normalizePercent(brand.ownership_percent), 0);
    const useWeightedSplit = totalOwnershipPercent > 0.0001;
    const shareForBrand = (brand) => {
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
      total_share: shareForBrand(b),
      paid: paymentMap[b.id] || 0,
      due: shareForBrand(b) - (paymentMap[b.id] || 0)
    }));

    return { month, totalExpenses: totalExp, brandCount, totalOwnershipPercent, weightedSplit: useWeightedSplit, shares };
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

const db = require('../db/knex');
const { z } = require('zod');

class BrandService {
  async listBrands(shopId) {
    let brands = await db('brands').where({ shop_id: shopId }).orderBy('name', 'asc');
    
    // Auto-create 'owner' brand if none exist
    if (brands.length === 0 && shopId) {
      const adminUser = await db('users').where({ shop_id: shopId, role: 'admin' }).first();
      const ownerId = adminUser ? adminUser.id : null;
      
      const [idObj] = await db('brands').insert({ 
        name: 'owner', 
        user_id: ownerId, 
        shop_id: shopId 
      }).returning('id');
      
      const newId = typeof idObj === 'object' ? idObj.id : idObj;
      brands = await db('brands').where({ id: newId });
    }
    return brands;
  }

  async createBrand(name, targetShopId, creatorId) {
    const [idObj] = await db('brands').insert({ 
      name, 
      user_id: creatorId, 
      shop_id: targetShopId 
    }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateBrand(id, name, targetShopId) {
    await db('brands').where({ id, shop_id: targetShopId }).update({ name });
  }

  async deleteBrand(id, targetShopId) {
    await db('brands').where({ id, shop_id: targetShopId }).delete();
  }

  async getExpenseShares(shopId, month) {
    const totalExpRes = await db('expenses')
      .where({ shop_id: shopId })
      .andWhereRaw(db.client.config.client === 'sqlite3' ? "strftime('%Y-%m', date) = ?" : "TO_CHAR(date, 'YYYY-MM') = ?", [month])
      .sum('amount as val')
      .first();
    
    const totalExp = parseFloat(totalExpRes.val || 0);
    const brands = await db('brands').where({ shop_id: shopId });
    const brandCount = brands.length;
    const sharePerBrand = brandCount > 0 ? (totalExp / brandCount) : 0;

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
      total_share: sharePerBrand,
      paid: paymentMap[b.id] || 0,
      due: sharePerBrand - (paymentMap[b.id] || 0)
    }));

    return { month, totalExpenses: totalExp, brandCount, shares };
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
    // 1. Get all unique months from expenses and payments for this shop
    const expMonths = await db('expenses')
      .where({ shop_id: shopId })
      .select(db.raw(db.client.config.client === 'sqlite3' ? "strftime('%Y-%m', date) as m" : "TO_CHAR(date, 'YYYY-MM') as m"))
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

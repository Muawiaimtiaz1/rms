const db = require('../db/knex');
const { z } = require('zod');

const expenseSchema = z.object({
  title: z.string().min(1),
  category: z.string().default('Other'),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().nullable().optional(),
});

class ExpenseService {
  async listExpenses(shopId, filters = {}) {
    const { from, to, category } = filters;
    let query = db('expenses as e')
      .select('e.*', 'u.name as added_by')
      .leftJoin('users as u', 'e.user_id', 'u.id')
      .where('e.shop_id', shopId);

    if (from) query = query.where('e.date', '>=', from);
    if (to) query = query.where('e.date', '<=', to);
    if (category) query = query.where('e.category', category);

    return query.orderBy('e.date', 'desc');
  }

  async createExpense(payload, shopId, userId) {
    const data = expenseSchema.parse(payload);
    const [idObj] = await db('expenses').insert({
      user_id: userId,
      shop_id: shopId,
      title: data.title,
      category: data.category,
      amount: data.amount,
      note: data.note || null,
      date: data.date || new Date().toISOString().slice(0, 10),
    }).returning('id');

    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateExpense(id, payload, shopId) {
    const data = expenseSchema.partial().parse(payload);
    const exp = await db('expenses').where({ id, shop_id: shopId }).first();
    if (!exp) throw new Error('Expense not found');

    // Check if brand payments have been made for this month
    const month = exp.date.substring(0, 7);
    const paymentsFound = await db('brand_expense_payments as bep')
      .join('brands as b', 'bep.brand_id', 'b.id')
      .where('b.shop_id', shopId)
      .andWhere('bep.month', month)
      .andWhere('bep.created_at', '>=', exp.created_at)
      .first();

    if (paymentsFound) throw new Error('Cannot edit this expense because brand payments have already been made.');

    await db('expenses').where({ id, shop_id: shopId }).update({
      title: data.title || exp.title,
      category: data.category || exp.category,
      amount: data.amount || exp.amount,
      note: data.note !== undefined ? data.note : exp.note,
      date: data.date || exp.date,
      updated_at: db.fn.now()
    });
  }

  async deleteExpense(id, shopId) {
    const exp = await db('expenses').where({ id, shop_id: shopId }).first();
    if (!exp) throw new Error('Expense not found');

    const month = exp.date.substring(0, 7);
    const payCheck = await db('brand_expense_payments as bep')
      .join('brands as b', 'bep.brand_id', 'b.id')
      .where('b.shop_id', shopId)
      .andWhere('bep.month', month)
      .andWhere('bep.created_at', '>=', exp.created_at)
      .first();

    if (payCheck) throw new Error('Cannot delete expense — brand payments recorded.');

    await db('expenses').where({ id, shop_id: shopId }).delete();
  }

  async listCategories(shopId) {
    return db('expense_categories').where({ shop_id: shopId }).orderBy('name', 'asc');
  }

  async createCategory(name, shopId) {
    const [idObj] = await db('expense_categories').insert({ name, shop_id: shopId }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async deleteCategory(id, shopId) {
    await db('expense_categories').where({ id, shop_id: shopId }).delete();
  }
}

module.exports = new ExpenseService();

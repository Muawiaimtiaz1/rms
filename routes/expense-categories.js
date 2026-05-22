const express = require('express');
const expenseService = require('../services/ExpenseService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const db = require('../db/knex');

// GET /api/expense-categories
router.get('/', requireAuth, async (req, res) => {
    const categories = await expenseService.listCategories(req.session.user.shop_id);
    res.json(categories);
});

// POST /api/expense-categories
router.post('/', requireAuth, async (req, res) => {
    const id = await expenseService.createCategory(req.body.name, req.session.user.shop_id);
    res.json({ ok: true, id });
});

// DELETE /api/expense-categories/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    const catId = req.params.id;
    
    const cat = await db('expense_categories').where({ id: catId, shop_id: shopId }).first();
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    // Check usage
    const usage = await db('expenses').where({ category: cat.name, shop_id: shopId }).count('* as c').first();
    if (parseInt(usage.c) > 0) return res.status(400).json({ error: 'Category is in use and cannot be deleted.' });

    await expenseService.deleteCategory(catId, shopId);
    res.json({ ok: true });
});

module.exports = router;

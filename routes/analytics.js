const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/analytics
router.get('/', requireAuth, (req, res) => {
  const userId = req.session.user.id;

  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total), 0) as val FROM sales WHERE user_id = ?').get(userId).val;
  const totalSales = db.prepare('SELECT COUNT(*) as val FROM sales WHERE user_id = ?').get(userId).val;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as val FROM expenses WHERE user_id = ?').get(userId).val;
  const totalProducts = db.prepare('SELECT COUNT(*) as val FROM products WHERE user_id = ?').get(userId).val;

  // Calculate COGS to compute profit from sales directly
  const totalCOGSQuery = db.prepare(`
    SELECT COALESCE(SUM(si.quantity * p.buying_price), 0) as val 
    FROM sale_items si 
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.user_id = ?
  `).get(userId).val;

  const netProfit = totalRevenue - totalCOGSQuery;

  // Revenue last 7 days
  const revenueByDay = db.prepare(`
    SELECT date(created_at) as day, SUM(total) as revenue
    FROM sales
    WHERE user_id = ? AND created_at >= date('now', '-7 days')
    GROUP BY day ORDER BY day ASC
  `).all(userId);

  // Top products by quantity sold
  const topProducts = db.prepare(`
    SELECT p.name, SUM(si.quantity) as qty_sold, SUM(si.quantity * si.price_at_sale) as revenue
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.user_id = ?
    GROUP BY si.product_id
    ORDER BY qty_sold DESC
    LIMIT 5
  `).all(userId);

  // Expenses by category
  const expByCategory = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses WHERE user_id = ?
    GROUP BY category ORDER BY total DESC
  `).all(userId);

  // Recent sales
  const recentSales = db.prepare('SELECT * FROM sales WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(userId);

  res.json({ totalRevenue, totalSales, totalExpenses, totalProducts, netProfit, revenueByDay, topProducts, expByCategory, recentSales });
});

module.exports = router;

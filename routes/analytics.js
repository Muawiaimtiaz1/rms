const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/analytics
router.get('/', requireAuth, (req, res) => {
  const shopId = req.session.user.shop_id;

  if (req.session.user.role === 'superadmin') {
    const totalShops = db.prepare('SELECT COUNT(*) as val FROM shops').get().val;
    const activeShops = db.prepare('SELECT COUNT(*) as val FROM shops WHERE status = \'active\'').get().val;
    const totalUsers = db.prepare('SELECT COUNT(*) as val FROM users').get().val;
    const totalRevenueAcrossAll = db.prepare('SELECT COALESCE(SUM(total), 0) as val FROM sales').get().val;

    return res.json({
      isGlobal: true,
      totalShops,
      activeShops,
      totalUsers,
      totalRevenue: totalRevenueAcrossAll,
      revenueByDay: db.prepare("SELECT date(created_at) as day, SUM(total) as revenue FROM sales WHERE created_at >= date('now', '-7 days') GROUP BY day ORDER BY day ASC").all(),
      recentSales: db.prepare('SELECT s.*, sh.name as shop_name FROM sales s JOIN shops sh ON s.shop_id = sh.id ORDER BY s.created_at DESC LIMIT 10').all()
    });
  }

  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total), 0) as val FROM sales WHERE shop_id = ?').get(shopId).val;
  const totalSales = db.prepare('SELECT COUNT(*) as val FROM sales WHERE shop_id = ?').get(shopId).val;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as val FROM expenses WHERE shop_id = ?').get(shopId).val;
  const totalProducts = db.prepare('SELECT COUNT(*) as val FROM products WHERE shop_id = ?').get(shopId).val;

  // Calculate COGS to compute profit from sales directly
  const totalCOGSQuery = db.prepare(`
    SELECT COALESCE(SUM(si.quantity * p.buying_price), 0) as val 
    FROM sale_items si 
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.shop_id = ?
  `).get(shopId).val;

  const netProfit = totalRevenue - totalCOGSQuery;

  // Revenue last 7 days
  const revenueByDay = db.prepare(`
    SELECT date(created_at) as day, SUM(total) as revenue
    FROM sales
    WHERE shop_id = ? AND created_at >= date('now', '-7 days')
    GROUP BY day ORDER BY day ASC
  `).all(shopId);

  // Top products by quantity sold
  const topProducts = db.prepare(`
    SELECT p.name, SUM(si.quantity) as qty_sold, SUM(si.quantity * si.price_at_sale) as revenue
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.shop_id = ?
    GROUP BY si.product_id
    ORDER BY qty_sold DESC
    LIMIT 5
  `).all(shopId);

  // Expenses by category
  const expByCategory = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses WHERE shop_id = ?
    GROUP BY category ORDER BY total DESC
  `).all(shopId);

  // Recent sales
  const recentSales = db.prepare('SELECT * FROM sales WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10').all(shopId);

  res.json({ totalRevenue, totalSales, totalExpenses, totalProducts, netProfit, revenueByDay, topProducts, expByCategory, recentSales });
});

module.exports = router;

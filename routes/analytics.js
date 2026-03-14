const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodToDateFilter(period) {
  const map = {
    '1m': "-1 month",
    '2m': "-2 months",
    '6m': "-6 months",
    '1y': "-1 year",
  };
  return map[period] || null;
}

// GET /api/analytics
router.get('/', requireAuth, (req, res) => {
  const user = req.session.user;
  const shopId = user.shop_id;

  // ── Superadmin global overview ──
  if (user.role === 'superadmin') {
    const totalShops = db.prepare('SELECT COUNT(*) as val FROM shops').get().val;
    const activeShops = db.prepare("SELECT COUNT(*) as val FROM shops WHERE status = 'active'").get().val;
    const totalUsers = db.prepare('SELECT COUNT(*) as val FROM users').get().val;
    const totalRevenueAcrossAll = db.prepare('SELECT COALESCE(SUM(total), 0) as val FROM sales').get().val;

    return res.json({
      isGlobal: true,
      totalShops,
      activeShops,
      totalUsers,
      totalRevenue: totalRevenueAcrossAll,
      revenueByDay: db.prepare(
        "SELECT date(created_at) as day, SUM(total) as revenue FROM sales WHERE created_at >= date('now', '-7 days') GROUP BY day ORDER BY day ASC"
      ).all(),
      recentSales: db.prepare(
        'SELECT s.*, sh.name as shop_name FROM sales s JOIN shops sh ON s.shop_id = sh.id ORDER BY s.created_at DESC LIMIT 10'
      ).all()
    });
  }

  // ── Shop analytics ──
  const period = req.query.period || 'all';
  const brandId = req.query.brand_id ? parseInt(req.query.brand_id, 10) : null;

  const dateOffset = periodToDateFilter(period);
  const dateClause = dateOffset ? `AND s.created_at >= date('now', '${dateOffset}')` : '';

  const totalProducts = brandId
    ? db.prepare('SELECT COUNT(*) as val FROM products WHERE shop_id = ? AND brand_id = ?').get(shopId, brandId).val
    : db.prepare('SELECT COUNT(*) as val FROM products WHERE shop_id = ?').get(shopId).val;

  // ── Revenue, COGS, Sales count ──
  // When brand filter is active: aggregate at sale_items level so we only count
  // the portion of each sale that belongs to that brand, not the whole sale total.
  let totalRevenue, totalCOGS, totalSalesCount;

  if (brandId) {
    const agg = db.prepare(`
      SELECT
        COALESCE(SUM(si.quantity * si.price_at_sale), 0) AS revenue,
        COALESCE(SUM(si.quantity * p.buying_price),   0) AS cogs,
        COUNT(DISTINCT s.id)                              AS sales_count
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales    s ON si.sale_id    = s.id
      WHERE s.shop_id = ? AND p.brand_id = ? ${dateClause}
    `).get(shopId, brandId);

    totalRevenue = agg.revenue;
    totalCOGS = agg.cogs;
    totalSalesCount = agg.sales_count;
  } else {
    // No brand filter: use full sale total for revenue, compute COGS from items
    const rev = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as val, COUNT(*) as cnt
      FROM sales s
      WHERE s.shop_id = ? ${dateClause}
    `).get(shopId);

    const cogs = db.prepare(`
      SELECT COALESCE(SUM(si.quantity * p.buying_price), 0) as val
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales    s ON si.sale_id    = s.id
      WHERE s.shop_id = ? ${dateClause}
    `).get(shopId);

    totalRevenue = rev.val;
    totalSalesCount = rev.cnt;
    totalCOGS = cogs.val;
  }

  const netProfit = totalRevenue - totalCOGS;

  // ── Top products (filtered) ──
  let topProducts;
  if (brandId) {
    topProducts = db.prepare(`
      SELECT p.name, b.name as brand_name,
             SUM(si.quantity) as qty_sold,
             SUM(si.quantity * si.price_at_sale) as revenue,
             SUM(si.quantity * p.buying_price)   as cogs
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN brands   b ON p.brand_id    = b.id
      JOIN sales    s ON si.sale_id    = s.id
      WHERE s.shop_id = ? AND p.brand_id = ? ${dateClause}
      GROUP BY si.product_id
      ORDER BY qty_sold DESC
      LIMIT 5
    `).all(shopId, brandId);
  } else {
    topProducts = db.prepare(`
      SELECT p.name, b.name as brand_name,
             SUM(si.quantity) as qty_sold,
             SUM(si.quantity * si.price_at_sale) as revenue,
             SUM(si.quantity * p.buying_price)   as cogs
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      LEFT JOIN brands b ON p.brand_id = b.id
      JOIN sales    s ON si.sale_id    = s.id
      WHERE s.shop_id = ? ${dateClause}
      GROUP BY si.product_id
      ORDER BY qty_sold DESC
      LIMIT 5
    `).all(shopId);
  }

  // ── Recent Sales ──
  let recentSales;
  if (brandId) {
    recentSales = db.prepare(`
      SELECT DISTINCT s.id, s.total, s.created_at
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products   p  ON si.product_id = p.id
      WHERE s.shop_id = ? AND p.brand_id = ? ${dateClause}
      ORDER BY s.created_at DESC
      LIMIT 10
    `).all(shopId, brandId);
  } else {
    recentSales = db.prepare(`
      SELECT * FROM sales s
      WHERE s.shop_id = ? ${dateClause}
      ORDER BY s.created_at DESC
      LIMIT 10
    `).all(shopId);
  }

  // ── All brands for this shop's products (show filter if >1 brand) ──
  const brands = db.prepare(`
    SELECT DISTINCT b.id, b.name
    FROM brands b
    JOIN products p ON p.brand_id = b.id
    WHERE p.shop_id = ?
    ORDER BY b.name ASC
  `).all(shopId);

  res.json({
    totalRevenue,
    totalSales: totalSalesCount,
    totalCOGS,
    netProfit,
    totalProducts,
    topProducts,
    recentSales,
    brands,
    activeFilters: { period, brand_id: brandId }
  });
});

module.exports = router;

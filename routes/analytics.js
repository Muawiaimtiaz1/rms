const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// ─── Helpers for Optimized Date Scopes ───────────────────────────────────────

function getPeriodBounds(period, fromDate, toDate) {
  const now = new Date();
  
  // Format Date to YYYY-MM-DD
  const format = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  let startStr = "";
  let endStr = format(now);

  if (period === 'today') {
    startStr = endStr;
  } else if (period === '7days') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    startStr = format(d);
  } else if (period === '30days') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    startStr = format(d);
  } else if (period === '12months') {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    d.setDate(1); // Start of month
    startStr = format(d);
  } else if (period === 'custom' && fromDate && toDate) {
    startStr = fromDate;
    endStr = toDate;
  } else {
    // Default to last 30 days if unrecognized
    const d = new Date();
    d.setDate(d.getDate() - 29);
    startStr = format(d);
  }

  return {
    start: `${startStr} 00:00:00`,
    end: `${endStr} 23:59:59`
  };
}

function getPreviousPeriodBounds(period, bounds) {
  const currentStart = new Date(bounds.start.split(' ')[0]);
  const currentEnd = new Date(bounds.end.split(' ')[0]);
  
  const diffTime = Math.abs(currentEnd - currentStart);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const format = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  if (period === '12months') {
    const prevStart = new Date(currentStart);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    
    const prevEnd = new Date(currentEnd);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    
    return {
      start: `${format(prevStart)} 00:00:00`,
      end: `${format(prevEnd)} 23:59:59`
    };
  }

  // Shift backward by diffDays
  const prevStart = new Date(currentStart);
  prevStart.setDate(prevStart.getDate() - diffDays);
  
  const prevEnd = new Date(currentEnd);
  prevEnd.setDate(prevEnd.getDate() - diffDays);
  
  return {
    start: `${format(prevStart)} 00:00:00`,
    end: `${format(prevEnd)} 23:59:59`
  };
}

// GET /api/analytics/dashboard-data
router.get('/dashboard-data', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const shopId = user.shop_id;
    const isPostgres = usePostgres();

    if (!shopId && user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const targetShopId = user.role === 'superadmin' ? (req.query.shop_id ? parseInt(req.query.shop_id, 10) : null) : shopId;
    const period = req.query.period || '30days';
    const { from, to } = req.query;
    const bounds = getPeriodBounds(period, from, to);

    let shopClause = "";
    let shopParams = [];
    if (targetShopId) {
      shopClause = isPostgres ? "shop_id = $1 AND" : "shop_id = ? AND";
      shopParams.push(targetShopId);
    }

    const nextIdx = () => shopParams.length + 1;

    // ─── 1. CORE KPI CARD AGGREGATES ───
    const kpiQ = `
      SELECT 
        COALESCE(SUM(total), 0) as total_sales, 
        COUNT(id) as total_orders, 
        COALESCE(AVG(total), 0) as avg_order_value 
      FROM sales 
      WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}
    `;
    let kpis;
    if (isPostgres) {
      const { rows } = await getPostgres().query(kpiQ, [...shopParams, bounds.start, bounds.end]);
      kpis = rows[0];
    } else {
      kpis = getSqlite().prepare(kpiQ).get(...shopParams, bounds.start, bounds.end);
    }

    const custQ = `
      SELECT COUNT(DISTINCT customer_id) as val 
      FROM sales 
      WHERE ${shopClause} customer_id IS NOT NULL AND created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}
    `;
    let customersCount;
    if (isPostgres) {
      const { rows } = await getPostgres().query(custQ, [...shopParams, bounds.start, bounds.end]);
      customersCount = rows[0].val;
    } else {
      customersCount = getSqlite().prepare(custQ).get(...shopParams, bounds.start, bounds.end).val;
    }

    let totalCustomersInDb;
    if (targetShopId) {
      const q = `SELECT COUNT(*) as val FROM customers WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
      if (isPostgres) totalCustomersInDb = (await getPostgres().query(q, [targetShopId])).rows[0].val;
      else totalCustomersInDb = getSqlite().prepare(q).get(targetShopId).val;
    } else {
      const q = `SELECT COUNT(*) as val FROM customers`;
      if (isPostgres) totalCustomersInDb = (await getPostgres().query(q)).rows[0].val;
      else totalCustomersInDb = getSqlite().prepare(q).get().val;
    }

    // ─── 2. QUICK SUMMARY AGGREGATES ───
    const discQ = `SELECT COALESCE(SUM(discount), 0) as val FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}`;
    let discounts;
    if (isPostgres) discounts = (await getPostgres().query(discQ, [...shopParams, bounds.start, bounds.end])).rows[0].val;
    else discounts = getSqlite().prepare(discQ).get(...shopParams, bounds.start, bounds.end).val;

    const retQ = `SELECT COALESCE(SUM(total_refund), 0) as total_refunds, COUNT(id) as return_count FROM returns WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} `;
    let returnsStats;
    if (isPostgres) returnsStats = (await getPostgres().query(retQ, [...shopParams, bounds.start, bounds.end])).rows[0];
    else returnsStats = getSqlite().prepare(retQ).get(...shopParams, bounds.start, bounds.end);

    const cogsQ = `
      SELECT COALESCE(SUM(si.quantity * si.buying_price_at_sale), 0) as val 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id 
      WHERE ${targetShopId ? (isPostgres ? 's.shop_id = $1 AND' : 's.shop_id = ? AND') : ''} s.created_at >= ${isPostgres ? '$'+(targetShopId?2:1) : '?'} AND s.created_at <= ${isPostgres ? '$'+(targetShopId?3:2) : '?'}
    `;
    let cogsStats;
    if (isPostgres) cogsStats = (await getPostgres().query(cogsQ, [...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end])).rows[0].val;
    else cogsStats = getSqlite().prepare(cogsQ).get(...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end).val;

    const stockValueQ = targetShopId 
        ? `SELECT COALESCE(SUM(stock * buying_price), 0) as val FROM products WHERE shop_id = ${isPostgres ? '$1' : '?'} AND is_deleted = 0`
        : `SELECT COALESCE(SUM(stock * buying_price), 0) as val FROM products WHERE is_deleted = 0`;
    let stockValue;
    if (isPostgres) stockValue = (await getPostgres().query(stockValueQ, targetShopId ? [targetShopId] : [])).rows[0].val;
    else stockValue = getSqlite().prepare(stockValueQ).get(...(targetShopId ? [targetShopId] : [])).val;

    const retCogsQ = `
      SELECT COALESCE(SUM(ri.quantity * ri.buying_price_at_sale), 0) as val 
      FROM return_items ri 
      JOIN returns r ON ri.return_id = r.id 
      WHERE ${targetShopId ? (isPostgres ? 'r.shop_id = $1 AND' : 'r.shop_id = ? AND') : ''} r.created_at >= ${isPostgres ? '$'+(targetShopId?2:1) : '?'} AND r.created_at <= ${isPostgres ? '$'+(targetShopId?3:2) : '?'}
    `;
    let returnedCogs;
    if (isPostgres) returnedCogs = (await getPostgres().query(retCogsQ, [...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end])).rows[0].val;
    else returnedCogs = getSqlite().prepare(retCogsQ).get(...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end).val;

    const adjustedRevenue = kpis.total_sales - returnsStats.total_refunds;
    const adjustedCOGS = cogsStats - returnedCogs;
    const grossProfit = adjustedRevenue - adjustedCOGS;
    const profitMargin = adjustedRevenue > 0 ? (grossProfit / adjustedRevenue) * 100 : 0;
    const conversionRate = kpis.total_orders > 0 ? (kpis.total_orders / (kpis.total_orders + Number(returnsStats.return_count))) * 100 : 68.5;

    // ─── COMPARATIVE GROWTH CALCULATIONS ───
    const prevBounds = getPreviousPeriodBounds(period, bounds);

    const pkpiQ = `SELECT COALESCE(SUM(total), 0) as total_sales, COUNT(id) as total_orders FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}`;
    let prevKpis;
    if (isPostgres) prevKpis = (await getPostgres().query(pkpiQ, [...shopParams, prevBounds.start, prevBounds.end])).rows[0];
    else prevKpis = getSqlite().prepare(pkpiQ).get(...shopParams, prevBounds.start, prevBounds.end);

    const prQ = `SELECT COALESCE(SUM(total_refund), 0) as total_refunds FROM returns WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}`;
    let prevReturnsTotal;
    if (isPostgres) prevReturnsTotal = (await getPostgres().query(prQ, [...shopParams, prevBounds.start, prevBounds.end])).rows[0].total_refunds;
    else prevReturnsTotal = getSqlite().prepare(prQ).get(...shopParams, prevBounds.start, prevBounds.end).total_refunds;

    const pcQ = `SELECT COUNT(DISTINCT customer_id) as val FROM sales WHERE ${shopClause} customer_id IS NOT NULL AND created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}`;
    let prevCustomersCount;
    if (isPostgres) prevCustomersCount = (await getPostgres().query(pcQ, [...shopParams, prevBounds.start, prevBounds.end])).rows[0].val;
    else prevCustomersCount = getSqlite().prepare(pcQ).get(...shopParams, prevBounds.start, prevBounds.end).val;

    const adjustedPrevRevenue = prevKpis.total_sales - prevReturnsTotal;
    const getChange = (curr, prev) => {
      if (prev <= 0) return curr > 0 ? 100.0 : 0.0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    const salesGrowth = getChange(adjustedRevenue, adjustedPrevRevenue);
    const ordersGrowth = getChange(kpis.total_orders, prevKpis.total_orders);
    const customersGrowth = getChange(customersCount, prevCustomersCount);
    const invoicesGrowth = getChange(kpis.total_orders, prevKpis.total_orders);

    // ─── 3. INTERVAL/TREND DATA SERIES ───
    let trendSeries = [];
    let trendQ = "";
    if (period === 'today') {
      trendQ = `SELECT ${isPostgres ? "TO_CHAR(created_at, 'HH24')" : "strftime('%H', created_at)"} as label, COALESCE(SUM(total), 0) as sales, COUNT(id) as orders FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY label ASC`;
    } else if (period === '7days' || period === '30days' || period === 'custom') {
      trendQ = `SELECT ${isPostgres ? "(created_at)::DATE" : "date(created_at)"} as label, COALESCE(SUM(total), 0) as sales, COUNT(id) as orders FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY label ASC`;
    } else if (period === '12months') {
      trendQ = `SELECT ${isPostgres ? "TO_CHAR(created_at, 'YYYY-MM')" : "strftime('%Y-%m', created_at)"} as label, COALESCE(SUM(total), 0) as sales, COUNT(id) as orders FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY label ASC`;
    }

    if (trendQ) {
      if (isPostgres) trendSeries = (await getPostgres().query(trendQ, [...shopParams, bounds.start, bounds.end])).rows;
      else trendSeries = getSqlite().prepare(trendQ).all(...shopParams, bounds.start, bounds.end);
    }

    // ─── 4. PIE/DONUT GRAPH BREAKDOWNS ───
    const payQ = `SELECT payment_method as label, COALESCE(SUM(total), 0) as sales FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY sales DESC`;
    let paymentBreakdown;
    if (isPostgres) paymentBreakdown = (await getPostgres().query(payQ, [...shopParams, bounds.start, bounds.end])).rows;
    else paymentBreakdown = getSqlite().prepare(payQ).all(...shopParams, bounds.start, bounds.end);

    const chanQ = `SELECT order_type as label, COALESCE(SUM(total), 0) as sales FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY sales DESC`;
    let channelBreakdown;
    if (isPostgres) channelBreakdown = (await getPostgres().query(chanQ, [...shopParams, bounds.start, bounds.end])).rows;
    else channelBreakdown = getSqlite().prepare(chanQ).all(...shopParams, bounds.start, bounds.end);

    const catQ = `
      SELECT COALESCE(p.category, 'General') as label, COALESCE(SUM(si.quantity * si.price_at_sale), 0) as sales 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id 
      JOIN products p ON si.product_id = p.id 
      WHERE ${targetShopId ? (isPostgres ? 's.shop_id = $1 AND' : 's.shop_id = ? AND') : ''} s.created_at >= ${isPostgres ? '$'+(targetShopId?2:1) : '?'} AND s.created_at <= ${isPostgres ? '$'+(targetShopId?3:2) : '?'}
      GROUP BY label ORDER BY sales DESC
    `;
    let categoryBreakdown;
    if (isPostgres) categoryBreakdown = (await getPostgres().query(catQ, [...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end])).rows;
    else categoryBreakdown = getSqlite().prepare(catQ).all(...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end);

    // ─── 5. LIST AND HIGHLIGHT TABLE DATA ───
    const hourQ = `SELECT ${isPostgres ? "TO_CHAR(created_at, 'HH24')" : "strftime('%H', created_at)"} as label, COALESCE(SUM(total), 0) as sales, COUNT(id) as orders FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'} GROUP BY label ORDER BY sales DESC LIMIT 5`;
    let bestSellingHours;
    if (isPostgres) bestSellingHours = (await getPostgres().query(hourQ, [...shopParams, bounds.start, bounds.end])).rows;
    else bestSellingHours = getSqlite().prepare(hourQ).all(...shopParams, bounds.start, bounds.end);

    const topPQ = `
      SELECT p.id, p.name, p.image_path, p.stock, SUM(si.quantity) as quantity_sold, COALESCE(SUM(si.quantity * si.price_at_sale), 0) as sales 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id JOIN products p ON si.product_id = p.id 
      WHERE ${targetShopId ? (isPostgres ? 's.shop_id = $1 AND' : 's.shop_id = ? AND') : ''} s.created_at >= ${isPostgres ? '$'+(targetShopId?2:1) : '?'} AND s.created_at <= ${isPostgres ? '$'+(targetShopId?3:2) : '?'}
      GROUP BY p.id, p.name, p.image_path, p.stock
      ORDER BY quantity_sold DESC LIMIT 5
    `;
    let topProducts;
    if (isPostgres) topProducts = (await getPostgres().query(topPQ, [...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end])).rows;
    else topProducts = getSqlite().prepare(topPQ).all(...(targetShopId ? [targetShopId] : []), bounds.start, bounds.end);

    // ─── 6. ACTIVITY HEATMAP DATA ───
    let heatmapStartBound = bounds.start;
    if (period === '12months') {
      const d = new Date(); d.setDate(d.getDate() - 29);
      heatmapStartBound = `${formatStr(d)} 00:00:00`;
    }

    const heatQ = `
      SELECT ${isPostgres ? "(created_at)::DATE" : "date(created_at)"} as dt, ${isPostgres ? "CAST(EXTRACT(HOUR FROM created_at) AS INTEGER) / 4" : "(CAST(strftime('%H', created_at) as INTEGER) / 4)"} as block_idx, COUNT(id) as orders, COALESCE(SUM(total), 0) as sales
      FROM sales WHERE ${shopClause} created_at >= ${isPostgres ? '$'+nextIdx() : '?'} AND created_at <= ${isPostgres ? '$'+(nextIdx()+1) : '?'}
      GROUP BY dt, block_idx
    `;
    let heatmapRaw;
    if (isPostgres) heatmapRaw = (await getPostgres().query(heatQ, [...shopParams, heatmapStartBound, bounds.end])).rows;
    else heatmapRaw = getSqlite().prepare(heatQ).all(...shopParams, heatmapStartBound, bounds.end);

    res.json({
      bounds, activePeriod: period,
      kpi: { totalSales: adjustedRevenue, totalOrders: kpis.total_orders, avgOrderValue: kpis.avg_order_value, activeCustomers: customersCount, totalCustomers: totalCustomersInDb, totalInvoices: kpis.total_orders, conversionRate },
      growth: { sales: salesGrowth, orders: ordersGrowth, customers: customersGrowth, invoices: invoicesGrowth },
      summary: { totalDiscounts: discounts, totalReturns: returnsStats.return_count, totalRefunds: returnsStats.total_refunds, grossProfit, profitMargin, stockValue },
      trendSeries, paymentBreakdown, channelBreakdown, categoryBreakdown, bestSellingHours, topProducts, heatmapRaw
    });

  } catch (error) {
    console.error("Dashboard Analytics Error:", error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

function formatStr(d) {
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
}

function legacyPeriodToDateFilter(period) {
  const map = { '1m': "-1 month", '2m': "-2 months", '6m': "-6 months", '1y': "-1 year" };
  return map[period] || null;
}

function legacyGetDateClause(from, to, period) {
  const isPostgres = usePostgres();
  if (from || to) {
    let clauses = []; let params = [];
    if (from) { clauses.push(isPostgres ? "s.created_at >= $n" : "s.created_at >= ?"); params.push(`${from} 00:00:00`); }
    if (to) { clauses.push(isPostgres ? "s.created_at <= $n" : "s.created_at <= ?"); params.push(`${to} 23:59:59`); }
    
    let clause = "AND " + clauses.map((c, i) => isPostgres ? c.replace('$n', '$'+(i+2)) : c).join(" AND ");
    return { clause, params };
  }

  const dateOffset = legacyPeriodToDateFilter(period);
  if (dateOffset) {
    if (isPostgres) return { clause: `AND s.created_at >= CURRENT_DATE + INTERVAL '${dateOffset}'`, params: [] };
    return { clause: `AND s.created_at >= date('now', '${dateOffset}')`, params: [] };
  }
  return { clause: "", params: [] };
}

// GET /api/analytics - Legacy support & Superadmin Overview
router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = user.shop_id;
  const isPostgres = usePostgres();

  try {
      if (user.role === 'superadmin') {
        let stats = {};
        if (isPostgres) {
            stats.totalShops = (await getPostgres().query('SELECT COUNT(*) as val FROM shops')).rows[0].val;
            stats.activeShops = (await getPostgres().query("SELECT COUNT(*) as val FROM shops WHERE status = 'active'")).rows[0].val;
            stats.totalUsers = (await getPostgres().query('SELECT COUNT(*) as val FROM users')).rows[0].val;
            stats.totalRevenue = (await getPostgres().query('SELECT COALESCE(SUM(total), 0) as val FROM sales')).rows[0].val;
            stats.revenueByDay = (await getPostgres().query("SELECT (created_at)::DATE as day, SUM(total) as revenue FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY day ORDER BY day ASC")).rows;
            stats.recentSales = (await getPostgres().query('SELECT s.*, sh.name as shop_name FROM sales s JOIN shops sh ON s.shop_id = sh.id ORDER BY s.created_at DESC LIMIT 10')).rows;
        } else {
            stats.totalShops = getSqlite().prepare('SELECT COUNT(*) as val FROM shops').get().val;
            stats.activeShops = getSqlite().prepare("SELECT COUNT(*) as val FROM shops WHERE status = 'active'").get().val;
            stats.totalUsers = getSqlite().prepare('SELECT COUNT(*) as val FROM users').get().val;
            stats.totalRevenue = getSqlite().prepare('SELECT COALESCE(SUM(total), 0) as val FROM sales').get().val;
            stats.revenueByDay = getSqlite().prepare("SELECT date(created_at) as day, SUM(total) as revenue FROM sales WHERE created_at >= date('now', '-7 days') GROUP BY day ORDER BY day ASC").all();
            stats.recentSales = getSqlite().prepare('SELECT s.*, sh.name as shop_name FROM sales s JOIN shops sh ON s.shop_id = sh.id ORDER BY s.created_at DESC LIMIT 10').all();
        }

        return res.json({ isGlobal: true, ...stats });
      }

      const period = req.query.period || 'all';
      const brandId = req.query.brand_id ? parseInt(req.query.brand_id, 10) : null;
      const { from, to } = req.query;

      const { clause: dateClause, params: dateParams } = legacyGetDateClause(from, to, period);

      const countQ = brandId 
        ? `SELECT COUNT(*) as val FROM products WHERE shop_id = ${isPostgres?'$1':'?'} AND brand_id = ${isPostgres?'$2':'?'}`
        : `SELECT COUNT(*) as val FROM products WHERE shop_id = ${isPostgres?'$1':'?'}`;
      let totalProducts;
      if (isPostgres) totalProducts = (await getPostgres().query(countQ, brandId ? [shopId, brandId] : [shopId])).rows[0].val;
      else totalProducts = getSqlite().prepare(countQ).get(...(brandId? [shopId, brandId] : [shopId])).val;

      let totalRevenue, totalCOGS, totalSalesCount;
      if (brandId) {
        const q = `
          SELECT COALESCE(SUM(si.quantity * si.price_at_sale), 0) AS revenue, COALESCE(SUM(si.quantity * si.buying_price_at_sale), 0) AS cogs, COUNT(DISTINCT s.id) AS sales_count
          FROM sale_items si JOIN sales s ON si.sale_id = s.id
          WHERE s.shop_id = ${isPostgres?'$1':'?'} AND si.parent_id IS NULL AND EXISTS (SELECT 1 FROM products p WHERE p.id = si.product_id AND p.brand_id = ${isPostgres?'$2':'?'}) ${dateClause}
        `;
        let agg;
        if (isPostgres) agg = (await getPostgres().query(q, [shopId, brandId, ...dateParams])).rows[0];
        else agg = getSqlite().prepare(q).get(shopId, brandId, ...dateParams);
        totalRevenue = agg.revenue; totalCOGS = agg.cogs; totalSalesCount = agg.sales_count;
      } else {
        const revQ = `SELECT COALESCE(SUM(total), 0) as val, COUNT(*) as cnt FROM sales s WHERE s.shop_id = ${isPostgres?'$1':'?'} ${dateClause}`;
        const cogsQ = `SELECT COALESCE(SUM(si.quantity * si.buying_price_at_sale), 0) as val FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.shop_id = ${isPostgres?'$1':'?'} ${dateClause}`;
        let rev, cogs;
        if (isPostgres) {
            rev = (await getPostgres().query(revQ, [shopId, ...dateParams])).rows[0];
            cogs = (await getPostgres().query(cogsQ, [shopId, ...dateParams])).rows[0];
        } else {
            rev = getSqlite().prepare(revQ).get(shopId, ...dateParams);
            cogs = getSqlite().prepare(cogsQ).get(shopId, ...dateParams);
        }
        totalRevenue = rev.val; totalSalesCount = rev.cnt; totalCOGS = cogs.val;
      }

      const retQ = `SELECT COALESCE(SUM(total_refund), 0) as val FROM returns s WHERE s.shop_id = ${isPostgres?'$1':'?'} ${dateClause}`;
      const retCogsQ = `SELECT COALESCE(SUM(ri.quantity * ri.buying_price_at_sale), 0) as val FROM return_items ri JOIN returns s ON ri.return_id = s.id WHERE s.shop_id = ${isPostgres?'$1':'?'} ${dateClause}`;
      let returns, returnedCogs;
      if (isPostgres) {
          returns = (await getPostgres().query(retQ, [shopId, ...dateParams])).rows[0];
          returnedCogs = (await getPostgres().query(retCogsQ, [shopId, ...dateParams])).rows[0];
      } else {
          returns = getSqlite().prepare(retQ).get(shopId, ...dateParams);
          returnedCogs = getSqlite().prepare(retCogsQ).get(shopId, ...dateParams);
      }
      totalRevenue -= returns.val; totalCOGS -= returnedCogs.val;
      let netProfit = totalRevenue - totalCOGS;

      const damageQ = `SELECT (SUM(manual_damage_loss) - SUM(recovered_damage_amount)) as total FROM products WHERE shop_id = ${isPostgres?'$1':'?'} AND is_deleted = 0`;
      let damageTotal;
      if (isPostgres) damageTotal = (await getPostgres().query(damageQ, [shopId])).rows[0].total || 0;
      else damageTotal = getSqlite().prepare(damageQ).get(shopId).total || 0;

      const topPQ = `
        SELECT COALESCE(p.name, si.custom_name) as name, b.name as brand_name, SUM(si.quantity) as qty_sold, SUM(si.quantity * si.price_at_sale) as revenue, SUM(si.quantity * si.buying_price_at_sale) as cogs
        FROM sale_items si LEFT JOIN products p ON si.product_id = p.id LEFT JOIN brands b ON p.brand_id = b.id JOIN sales s ON si.sale_id = s.id
        WHERE s.shop_id = ${isPostgres?'$1':'?'} ${brandId ? (isPostgres ? 'AND p.brand_id = $2' : 'AND p.brand_id = ?') : ''} ${dateClause}
        GROUP BY si.product_id, si.custom_name, p.name, b.name ORDER BY qty_sold DESC LIMIT 5
      `;
      let topProducts;
      if (isPostgres) topProducts = (await getPostgres().query(topPQ, [shopId, ...(brandId ? [brandId] : []), ...dateParams])).rows;
      else topProducts = getSqlite().prepare(topPQ).all(shopId, ...(brandId ? [brandId] : []), ...dateParams);

      const recentQ = brandId
        ? `SELECT DISTINCT s.id, s.total, s.created_at FROM sales s JOIN sale_items si ON si.sale_id = s.id JOIN products p ON si.product_id = p.id WHERE s.shop_id = ${isPostgres?'$1':'?'} AND p.brand_id = ${isPostgres?'$2':'?'} ${dateClause} ORDER BY s.created_at DESC LIMIT 10`
        : `SELECT * FROM sales s WHERE s.shop_id = ${isPostgres?'$1':'?'} ${dateClause} ORDER BY s.created_at DESC LIMIT 10`;
      let recentSales;
      if (isPostgres) recentSales = (await getPostgres().query(recentQ, brandId ? [shopId, brandId, ...dateParams] : [shopId, ...dateParams])).rows;
      else recentSales = getSqlite().prepare(recentQ).all(...(brandId ? [shopId, brandId, ...dateParams] : [shopId, ...dateParams]));

      const brandsQ = `SELECT DISTINCT b.id, b.name FROM brands b JOIN products p ON p.brand_id = b.id WHERE p.shop_id = ${isPostgres?'$1':'?'} ORDER BY b.name ASC`;
      let brands;
      if (isPostgres) brands = (await getPostgres().query(brandsQ, [shopId])).rows;
      else brands = getSqlite().prepare(brandsQ).all(shopId);

      res.json({ totalRevenue, totalSales: totalSalesCount, totalCOGS, netProfit, damageTotal, totalProducts, topProducts, recentSales, brands, activeFilters: { period, brand_id: brandId, from, to } });
  } catch (err) {
      console.error("Legacy Analytics Error:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

module.exports = router;

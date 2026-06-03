const db = require('../db/knex');

class AnalyticsService {
  /**
   * Helper to get period bounds (start and end timestamps)
   */
  getPeriodBounds(period, fromDate, toDate) {
    const now = new Date();
    const format = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const shiftMonths = (date, monthDelta) => {
      const shifted = new Date(date);
      const targetDay = shifted.getDate();
      shifted.setDate(1);
      shifted.setMonth(shifted.getMonth() + monthDelta);
      const lastDayOfTargetMonth = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
      shifted.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      return shifted;
    };

    let startStr = "";
    let endStr = format(now);

    switch (period) {
      case 'today':
        startStr = endStr;
        break;
      case '7days':
        const d7 = new Date();
        d7.setDate(d7.getDate() - 6);
        startStr = format(d7);
        break;
      case '30days':
        const d30 = new Date();
        d30.setDate(d30.getDate() - 29);
        startStr = format(d30);
        break;
      case '12months':
        const d12 = new Date();
        d12.setMonth(d12.getMonth() - 11);
        d12.setDate(1);
        startStr = format(d12);
        break;
      case 'custom':
        if (fromDate && toDate) {
          startStr = fromDate;
          endStr = toDate;
        }
        break;
      case 'all':
        startStr = "2000-01-01"; // effectively all time
        break;
      case '1m':
        startStr = format(shiftMonths(now, -1));
        break;
      case '2m':
        startStr = format(shiftMonths(now, -2));
        break;
      case '6m':
        startStr = format(shiftMonths(now, -6));
        break;
      case '1y':
        startStr = format(shiftMonths(now, -12));
        break;
      default:
        // Default to all time if not specified, to match legacy behavior
        startStr = "2000-01-01";
    }

    return {
      start: `${startStr} 00:00:00`,
      end: `${endStr} 23:59:59`
    };
  }

  getPreviousPeriodBounds(period, bounds) {
    const currentStart = new Date(bounds.start.split(' ')[0]);
    const currentEnd = new Date(bounds.end.split(' ')[0]);
    
    const diffTime = Math.abs(currentEnd - currentStart);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const format = (d) => d.toISOString().split('T')[0];

    if (period === '12months' || period === '1y') {
      const prevStart = new Date(currentStart);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      const prevEnd = new Date(currentEnd);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
      return { start: `${format(prevStart)} 00:00:00`, end: `${format(prevEnd)} 23:59:59` };
    }

    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - diffDays);
    const prevEnd = new Date(currentEnd);
    prevEnd.setDate(prevEnd.getDate() - diffDays);
    
    return { start: `${format(prevStart)} 00:00:00`, end: `${format(prevEnd)} 23:59:59` };
  }

  async getDashboardData(shopId, period = 'all', from = null, to = null) {
    try {
      const bounds = this.getPeriodBounds(period, from, to);
      const prevBounds = this.getPreviousPeriodBounds(period, bounds);
      const isSqlite = db.client.config.client === 'sqlite3';

      // 1. KPI Aggregates
      const kpi = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .select(
          db.raw('COALESCE(SUM(total), 0) as total_sales'),
          db.raw('COUNT(id) as total_orders'),
          db.raw('COALESCE(AVG(total), 0) as avg_order_value'),
          db.raw('COALESCE(SUM(CASE WHEN (COALESCE(total, 0) - COALESCE(amount_received, 0)) > 0.01 THEN (COALESCE(total, 0) - COALESCE(amount_received, 0)) ELSE 0 END), 0) as total_pending_dues'),
          db.raw('COALESCE(SUM(CASE WHEN (COALESCE(total, 0) - COALESCE(amount_received, 0)) > 0.01 THEN 1 ELSE 0 END), 0) as pending_dues_count')
        ).first();

      const linkedCustomersCount = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .whereNotNull('customer_id')
        .countDistinct('customer_id as val').first();

      const walkInCustomersCount = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .whereNull('customer_id')
        .count('id as val').first();

      const totalCustomersInDb = await db('customers')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as val').first();

      // 2. Summary (Returns, COGS, Discounts)
      const discounts = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .sum('discount as val').first();

      const returnsStats = await db('returns')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .whereBetween('created_at', [bounds.start, bounds.end])
        .select(
          db.raw('COALESCE(SUM(total_refund), 0) as total_refunds'),
          db.raw('COUNT(id) as return_count')
        ).first();

      const cogsStats = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .modify(qb => shopId ? qb.where('s.shop_id', shopId) : qb)
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(db.raw('SUM(si.quantity * si.buying_price_at_sale) as val')).first();

      const returnedCogs = await db('return_items as ri')
        .join('returns as r', 'ri.return_id', 'r.id')
        .modify(qb => shopId ? qb.where('r.shop_id', shopId) : qb)
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select(db.raw('SUM(ri.quantity * ri.buying_price_at_sale) as val')).first();

      const stockValueResult = await db('products')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ is_deleted: 0 })
        .select(db.raw('SUM(stock * buying_price) as val')).first();

      // Calculations
      const totalSalesVal = Number(kpi.total_sales || 0);
      const totalRefundsVal = Number(returnsStats.total_refunds || 0);
      const adjustedRevenue = totalSalesVal - totalRefundsVal;
      
      const cogsVal = Number(cogsStats ? cogsStats.val : 0);
      const retCogsVal = Number(returnedCogs ? returnedCogs.val : 0);
      const adjustedCOGS = cogsVal - retCogsVal;
      
      const grossProfit = adjustedRevenue - adjustedCOGS;
      const profitMargin = adjustedRevenue > 0 ? (grossProfit / adjustedRevenue) * 100 : 0;

      // 3. Growth
      const prevKpi = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [prevBounds.start, prevBounds.end])
        .select(db.raw('COALESCE(SUM(total), 0) as total_sales'), db.raw('COUNT(id) as total_orders')).first();

      const prevLinkedCustomersCount = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [prevBounds.start, prevBounds.end])
        .whereNotNull('customer_id')
        .countDistinct('customer_id as val').first();

      const prevWalkInCustomersCount = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [prevBounds.start, prevBounds.end])
        .whereNull('customer_id')
        .count('id as val').first();

      const prevReturns = await db('returns')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .whereBetween('created_at', [prevBounds.start, prevBounds.end])
        .sum('total_refund as val').first();

      const adjustedPrevRevenue = Number(prevKpi.total_sales || 0) - Number(prevReturns.val || 0);
      const getChange = (curr, prev) => {
        if (prev <= 0) return curr > 0 ? 100.0 : 0.0;
        return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
      };

      const salesGrowth = getChange(adjustedRevenue, adjustedPrevRevenue);
      const ordersGrowth = getChange(parseInt(kpi.total_orders || 0), parseInt(prevKpi.total_orders || 0));
      const linkedCustomerCountVal = parseInt(linkedCustomersCount ? linkedCustomersCount.val : 0, 10) || 0;
      const walkInCustomerCountVal = parseInt(walkInCustomersCount ? walkInCustomersCount.val : 0, 10) || 0;
      const activeCustomerCountVal = linkedCustomerCountVal + walkInCustomerCountVal;
      const prevLinkedCustomerCountVal = parseInt(prevLinkedCustomersCount ? prevLinkedCustomersCount.val : 0, 10) || 0;
      const prevWalkInCustomerCountVal = parseInt(prevWalkInCustomersCount ? prevWalkInCustomersCount.val : 0, 10) || 0;
      const customersGrowth = getChange(activeCustomerCountVal, prevLinkedCustomerCountVal + prevWalkInCustomerCountVal);

      // 4. Trends & Breakdowns
      const getTrendData = async (lblExpr) => {
        const raw = await db('sales')
          .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
          .where({ order_status: 'completed' })
          .whereBetween('created_at', [bounds.start, bounds.end])
          .select(db.raw(`${lblExpr} as label`))
          .select(db.raw('SUM(total) as sales'), db.raw('COUNT(id) as orders'))
          .groupBy('label').orderBy('label', 'asc');
        return raw.map(r => ({ ...r, sales: Number(r.sales || 0), orders: Number(r.orders || 0) }));
      };
      
      let trendSeries = [];
      if (period === 'today') {
        trendSeries = await getTrendData(isSqlite ? "strftime('%H', created_at)" : "TO_CHAR(created_at, 'HH24')");
      } else if (period === '12months') {
        trendSeries = await getTrendData(isSqlite ? "strftime('%Y-%m', created_at)" : "TO_CHAR(created_at, 'YYYY-MM')");
      } else {
        trendSeries = await getTrendData(isSqlite ? "date(created_at)" : "TO_CHAR(created_at, 'YYYY-MM-DD')");
      }

      const mergeNetBreakdown = (grossRows, refundRows) => {
        const rowsByLabel = new Map();
        const getRow = (label) => {
          const key = label || 'Other';
          if (!rowsByLabel.has(key)) rowsByLabel.set(key, { label: key, sales: 0, orders: 0 });
          return rowsByLabel.get(key);
        };

        grossRows.forEach((row) => {
          const target = getRow(row.label);
          target.sales += Number(row.sales || 0);
          target.orders += Number(row.orders || 0);
        });

        refundRows.forEach((row) => {
          const target = getRow(row.label);
          target.sales -= Number(row.refunds || 0);
        });

        return Array.from(rowsByLabel.values())
          .filter((row) => Math.abs(row.sales) > 0.005 || row.orders > 0)
          .map((row) => ({ ...row, sales: Number(row.sales.toFixed(2)) }))
          .sort((a, b) => b.sales - a.sales);
      };

      const paymentBreakdownGross = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .select('payment_method as label')
        .sum('total as sales')
        .count('id as orders')
        .groupBy('label');
      const paymentRefunds = await db('returns as r')
        .join('sales as s', 'r.sale_id', 's.id')
        .modify(qb => shopId ? qb.where('r.shop_id', shopId) : qb)
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select('s.payment_method as label')
        .sum('r.total_refund as refunds')
        .groupBy('label');
      const paymentBreakdown = mergeNetBreakdown(paymentBreakdownGross, paymentRefunds);

      const channelBreakdownGross = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .select('order_type as label')
        .sum('total as sales')
        .count('id as orders')
        .groupBy('label');
      const channelRefunds = await db('returns as r')
        .join('sales as s', 'r.sale_id', 's.id')
        .modify(qb => shopId ? qb.where('r.shop_id', shopId) : qb)
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select('s.order_type as label')
        .sum('r.total_refund as refunds')
        .groupBy('label');
      const channelBreakdown = mergeNetBreakdown(channelBreakdownGross, channelRefunds);

      const itemTotals = db('sale_items')
        .select('sale_id')
        .select(db.raw('SUM(quantity * price_at_sale) as item_subtotal'))
        .groupBy('sale_id')
        .as('item_totals');

      const categoryBreakdownGross = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .leftJoin('products as p', 'si.product_id', 'p.id')
        .leftJoin(itemTotals, 'si.sale_id', 'item_totals.sale_id')
        .modify(qb => shopId ? qb.where('s.shop_id', shopId) : qb)
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(db.raw("COALESCE(p.category, 'General') as label"))
        .select(db.raw('SUM(CASE WHEN COALESCE(item_totals.item_subtotal, 0) > 0 THEN (si.quantity * si.price_at_sale) * s.total / item_totals.item_subtotal ELSE 0 END) as sales'))
        .groupBy('label');
      const categoryRefunds = await db('return_items as ri')
        .join('returns as r', 'ri.return_id', 'r.id')
        .leftJoin('products as p', 'ri.product_id', 'p.id')
        .modify(qb => shopId ? qb.where('r.shop_id', shopId) : qb)
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select(db.raw("COALESCE(p.category, 'General') as label"))
        .select(db.raw('SUM(ri.quantity * ri.refund_price) as refunds'))
        .groupBy('label');
      const categoryBreakdown = mergeNetBreakdown(categoryBreakdownGross, categoryRefunds);

      const hourQ = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [bounds.start, bounds.end])
        .select(db.raw(isSqlite ? "strftime('%H', created_at) as label" : "TO_CHAR(created_at, 'HH24') as label"))
        .sum('total as sales').count('id as orders')
        .groupBy('label').orderBy('sales', 'desc').limit(5);
      const bestSellingHours = hourQ.map(r => ({ ...r, sales: Number(r.sales || 0), orders: Number(r.orders || 0) }));

      const topProductsRaw = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .join('products as p', 'si.product_id', 'p.id')
        .modify(qb => shopId ? qb.where('s.shop_id', shopId) : qb)
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select('p.id', 'p.name', 'p.image_path', 'p.stock')
        .sum('si.quantity as quantity_sold')
        .select(db.raw('SUM(si.quantity * si.price_at_sale) as sales'))
        .groupBy('p.id', 'p.name', 'p.image_path', 'p.stock')
        .orderBy('quantity_sold', 'desc').limit(5);
      const topProducts = topProductsRaw.map(r => ({ 
        ...r, 
        sales: Number(r.sales || 0), 
        quantity_sold: Number(r.quantity_sold || 0),
        // Legacy aliases for dashboard
        qty_sold: Number(r.quantity_sold || 0),
        revenue: Number(r.sales || 0)
      }));

      // 5. Heatmap
      let heatmapStartBound = bounds.start;
      if (period === '12months') {
        const hmd = new Date(); hmd.setDate(hmd.getDate() - 29);
        heatmapStartBound = `${hmd.toISOString().split('T')[0]} 00:00:00`;
      }
      const heatmapRawData = await db('sales')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .where({ order_status: 'completed' })
        .whereBetween('created_at', [heatmapStartBound, bounds.end])
        .select(
          db.raw(isSqlite ? "date(created_at) as dt" : "TO_CHAR(created_at, 'YYYY-MM-DD') as dt"),
          db.raw(isSqlite ? "(CAST(strftime('%H', created_at) as INTEGER) / 4) as block_idx" : "CAST(EXTRACT(HOUR FROM created_at) AS INTEGER) / 4 as block_idx")
        )
        .count('id as orders').sum('total as sales')
        .groupBy('dt', 'block_idx');
      const heatmapRaw = heatmapRawData.map(r => ({ ...r, sales: Number(r.sales || 0), orders: Number(r.orders || 0), block_idx: Number(r.block_idx) }));

      const recentSales = await db('sales')
        .where({ shop_id: shopId })
        .orderBy('created_at', 'desc')
        .limit(10);

      const totalProductsCount = await db('products')
        .where({ shop_id: shopId, is_deleted: 0 })
        .count('* as val').first();

      const damageTotalResult = await db('products')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .sum('manual_damage_loss as val').first();

      return {
        bounds,
        activePeriod: period,
        kpi: { 
          totalSales: adjustedRevenue, 
          totalOrders: parseInt(kpi.total_orders || 0), 
          avgOrderValue: parseFloat(kpi.avg_order_value || 0), 
          activeCustomers: activeCustomerCountVal,
          linkedCustomers: linkedCustomerCountVal,
          walkInCustomers: walkInCustomerCountVal,
          totalCustomers: parseInt(totalCustomersInDb ? totalCustomersInDb.val : 0),
          totalInvoices: parseInt(kpi.total_orders || 0),
          conversionRate: kpi.total_orders > 0 ? 100 : 0
        },
        growth: {
          sales: salesGrowth,
          orders: ordersGrowth,
          customers: customersGrowth,
          invoices: ordersGrowth
        },
        summary: {
          totalDiscounts: Number(discounts ? (discounts.val || 0) : 0),
          totalReturns: Number(returnsStats ? (returnsStats.return_count || 0) : 0),
          totalRefunds: Number(returnsStats ? (returnsStats.total_refunds || 0) : 0),
          grossProfit: grossProfit,
          profitMargin: profitMargin,
          stockValue: Number(stockValueResult ? (stockValueResult.val || 0) : 0)
        },
        trendSeries,
        paymentBreakdown,
        channelBreakdown,
        categoryBreakdown,
        bestSellingHours,
        topProducts,
        heatmapRaw,
        recentSales,
        totalProducts: parseInt(totalProductsCount ? totalProductsCount.val : 0),
        totalRevenue: adjustedRevenue,
        totalPendingDues: Number(kpi.total_pending_dues || 0),
        pendingDuesCount: parseInt(kpi.pending_dues_count || 0),
        totalCOGS: adjustedCOGS,
        netProfit: grossProfit,
        totalSales: parseInt(kpi.total_orders || 0),
        damageTotal: Number(damageTotalResult ? (damageTotalResult.val || 0) : 0)
      };
    } catch (e) {
      console.error("Critical Analytics Service Error:", e);
      throw e;
    }
  }

  async getGlobalStats() {
    const stats = {};
    const totalShops = await db('shops').count('* as c').first();
    stats.totalShops = totalShops.c;
    
    const activeShops = await db('shops').where({ status: 'active' }).count('* as c').first();
    stats.activeShops = activeShops.c;
    
    const totalUsers = await db('users').count('* as c').first();
    stats.totalUsers = totalUsers.c;
    
    const totalRevenueResult = await db('sales').sum('total as v').first();
    stats.totalRevenue = Number(totalRevenueResult.v || 0);
    
    const revDayRaw = await db('sales')
      .where('created_at', '>=', db.raw(db.client.config.client === 'sqlite3' ? "date('now', '-7 days')" : "CURRENT_DATE - INTERVAL '7 days'"))
      .select(db.raw(db.client.config.client === 'sqlite3' ? "date(created_at) as day" : "TO_CHAR(created_at, 'YYYY-MM-DD') as day"))
      .sum('total as revenue').groupBy('day').orderBy('day', 'asc');
    stats.revenueByDay = revDayRaw.map(r => ({ ...r, revenue: Number(r.revenue || 0) }));

    stats.recentSales = await db('sales as s')
      .join('shops as sh', 's.shop_id', 'sh.id')
      .select('s.*', 'sh.name as shop_name')
      .orderBy('s.created_at', 'desc').limit(10);

    return stats;
  }
}

module.exports = new AnalyticsService();

const express = require('express');
const router = express.Router();
const activityLogService = require('../services/ActivityLogService');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/knex');
const { usePostgres } = require('../db/runtime');

function isPrivilegedLogUser(user) {
  return ['admin', 'superadmin', 'manager'].includes(user?.role);
}

function applyShopAndUserScope(query, req, tableAlias, userColumn = 'user_id') {
  const user = req.session.user;
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const shopFilter = req.query.shop_id || req.query.shopId;

  if (user.role === 'superadmin') {
    if (shopFilter) query.where(`${prefix}shop_id`, shopFilter);
    return query;
  }

  query.where(`${prefix}shop_id`, user.shop_id);
  if (!isPrivilegedLogUser(user) && userColumn) {
    query.where(`${prefix}${userColumn}`, user.id);
  }
  return query;
}

function applyDateScope(query, req, column) {
  if (req.query.from) query.where(column, '>=', req.query.from);
  if (req.query.to) query.where(column, '<=', req.query.to);
  return query;
}

function clampLogLimit(value, fallback = 500) {
  return Math.min(parseInt(value, 10) || fallback, 1000);
}

// GET /api/activity-logs
// Fetch logs with permission-aware filtering
router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  const filters = { ...req.query };

  // Permission Logic:
  if (user.role === 'superadmin') {
    // Superadmin can see logs from all shops if they want, or filter by shopId
    const logs = await activityLogService.getAllLogs(filters);
    return res.json(logs);
  } else if (user.role === 'admin' || user.role === 'manager') {
    // Shop Admin/Owner can see all logs for their shop
    const logs = await activityLogService.getLogs(user.shop_id, filters);
    return res.json(logs);
  } else {
    // Regular users can ONLY see their own logs
    filters.userId = user.id;
    const logs = await activityLogService.getLogs(user.shop_id, filters);
    return res.json(logs);
  }
});

// GET /api/activity-logs/payments
// Customer ledger payment events for the Payment Logs tab.
router.get('/payments', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const limit = clampLogLimit(req.query.limit);

    const ledgerQuery = db('customer_ledger as cl')
      .select(
        'cl.id',
        'cl.customer_id',
        'cl.shop_id',
        'cl.sale_id',
        'cl.amount',
        'cl.balance_after',
        'cl.note',
        'cl.created_by',
        'cl.created_at',
        'cl.shift_id',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'u.name as created_by_name',
        'u.username as created_by_username',
        's.payment_method',
        's.total as sale_total',
        'shops.name as shop_name'
      )
      .leftJoin('customers as c', 'cl.customer_id', 'c.id')
      .leftJoin('users as u', 'cl.created_by', 'u.id')
      .leftJoin('sales as s', 'cl.sale_id', 's.id')
      .leftJoin('shops', 'cl.shop_id', 'shops.id')
      .where('cl.type', 'payment');

    applyShopAndUserScope(ledgerQuery, req, 'cl', 'created_by');
    applyDateScope(ledgerQuery, req, 'cl.created_at');

    const salePaymentQuery = db('sales as s')
      .select(
        's.id',
        's.shop_id',
        's.user_id',
        's.customer_name',
        's.customer_phone',
        's.amount_received',
        's.payment_method',
        's.created_at',
        's.total',
        'u.name as created_by_name',
        'u.username as created_by_username',
        'shops.name as shop_name'
      )
      .leftJoin('users as u', 's.user_id', 'u.id')
      .leftJoin('shops', 's.shop_id', 'shops.id')
      .where('s.amount_received', '>', 0.01);

    applyShopAndUserScope(salePaymentQuery, req, 's', 'user_id');
    applyDateScope(salePaymentQuery, req, 's.created_at');

    const [ledgerPayments, salePayments] = await Promise.all([
      ledgerQuery.orderBy('cl.created_at', 'desc').limit(limit),
      salePaymentQuery.orderBy('s.created_at', 'desc').limit(limit)
    ]);

    const normalizedLedgerPayments = ledgerPayments.map((payment) => ({
      ...payment,
      source_type: 'ledger_payment',
      source_label: 'Due payment',
      amount: Number(payment.amount || 0),
      note: payment.note || 'Customer due payment received'
    }));

    const normalizedSalePayments = salePayments.map((sale) => ({
      id: `sale-${sale.id}`,
      customer_id: null,
      shop_id: sale.shop_id,
      sale_id: sale.id,
      amount: Number(sale.amount_received || 0),
      balance_after: null,
      note: 'Sale payment at checkout',
      created_by: sale.user_id,
      created_at: sale.created_at,
      shift_id: null,
      customer_name: sale.customer_name || 'Walk-in customer',
      customer_phone: sale.customer_phone || '',
      created_by_name: sale.created_by_name,
      created_by_username: sale.created_by_username,
      payment_method: sale.payment_method,
      sale_total: sale.total,
      shop_name: sale.shop_name,
      source_type: 'sale_payment',
      source_label: 'Sale payment'
    }));

    const payments = [...normalizedLedgerPayments, ...normalizedSalePayments]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
    res.json(payments);
  } catch (err) {
    console.error('[ActivityLogs] Payment logs error:', err);
    res.status(500).json({ error: err.message || 'Failed to load payment logs.' });
  }
});

// GET /api/activity-logs/wastage
// Permission-aware wastage records for the Wastage Logs tab.
router.get('/wastage', requireAuth, async (req, res) => {
  try {
    const limit = clampLogLimit(req.query.limit);
    const query = usePostgres()
      ? db('waste_events as we')
        .select(
          'we.id',
          'we.shop_id',
          'we.user_id',
          'we.waste_type',
          'we.source_type',
          'we.stock_action',
          'we.product_id',
          'we.raw_stock_id',
          'we.recipe_id',
          'we.sale_id',
          'we.return_id',
          'we.quantity',
          'we.unit',
          'we.reason_code',
          'we.reason',
          'we.cost_amount',
          'we.recovery_status',
          'we.created_at',
          db.raw(`
            COALESCE(
              p.name,
              rs.name,
              r.name,
              CASE
                WHEN we.sale_id IS NOT NULL THEN CONCAT('Sale #', we.sale_id)
                WHEN we.return_id IS NOT NULL THEN CONCAT('Return #', we.return_id)
                ELSE CONCAT('Waste #', we.id)
              END
            ) as ingredient_name
          `),
          'u.name as user_name',
          'u.username as user_username',
          'shops.name as shop_name'
        )
        .leftJoin('products as p', 'we.product_id', 'p.id')
        .leftJoin('raw_stocks as rs', 'we.raw_stock_id', 'rs.id')
        .leftJoin('recipes as r', 'we.recipe_id', 'r.id')
        .leftJoin('users as u', 'we.user_id', 'u.id')
        .leftJoin('shops', 'we.shop_id', 'shops.id')
      : db('raw_stock_waste as w')
        .select(
          'w.*',
          db.raw("'raw_ingredient' as source_type"),
          db.raw("'deduct' as stock_action"),
          'rs.name as ingredient_name',
          'u.name as user_name',
          'u.username as user_username',
          'shops.name as shop_name'
        )
        .leftJoin('raw_stocks as rs', 'w.raw_stock_id', 'rs.id')
        .leftJoin('users as u', 'w.user_id', 'u.id')
        .leftJoin('shops', 'w.shop_id', 'shops.id');

    const alias = usePostgres() ? 'we' : 'w';
    applyShopAndUserScope(query, req, alias, 'user_id');
    applyDateScope(query, req, `${alias}.created_at`);

    const rows = await query.orderBy(`${alias}.created_at`, 'desc').limit(limit);
    res.json(rows);
  } catch (err) {
    console.error('[ActivityLogs] Wastage logs error:', err);
    res.status(500).json({ error: err.message || 'Failed to load wastage logs.' });
  }
});

// GET /api/activity-logs/sales
// Permission-aware sales and delivery records for the Sales/Delivery Logs tabs.
router.get('/sales', requireAuth, async (req, res) => {
  try {
    const limit = clampLogLimit(req.query.limit);
    const query = db('sales as s')
      .select(
        's.*',
        'u.name as served_by_name',
        'u.username as served_by_username',
        'w.name as waiter_name',
        'r.name as rider_name',
        'k.name as kitchen_name',
        't.table_number',
        'shops.name as shop_name'
      )
      .leftJoin('users as u', 's.user_id', 'u.id')
      .leftJoin('users as w', 's.waiter_id', 'w.id')
      .leftJoin('users as r', 's.rider_id', 'r.id')
      .leftJoin('users as k', 's.kitchen_id', 'k.id')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .leftJoin('shops', 's.shop_id', 'shops.id');

    applyShopAndUserScope(query, req, 's', 'user_id');
    applyDateScope(query, req, 's.created_at');

    if (req.query.order_type) {
      query.where('s.order_type', String(req.query.order_type));
    }

    const rows = await query.orderBy('s.created_at', 'desc').limit(limit);
    res.json(rows);
  } catch (err) {
    console.error('[ActivityLogs] Sales logs error:', err);
    res.status(500).json({ error: err.message || 'Failed to load sales logs.' });
  }
});

// GET /api/activity-logs/shift/:id
// Fetch full audit trail for a specific shift
router.get('/shift/:id', requireAuth, async (req, res) => {
  const user = req.session.user;
  const shiftId = req.params.id;

  // Audit view is for admins or the user who owned the shift
  const logs = await activityLogService.getLogsByReference(user.role === 'superadmin' ? null : user.shop_id, shiftId, 'shift');
  
  if (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'manager') {
    // If not admin, check if this user performed the SHIFT_OPEN action
    const opener = logs.find(l => l.action === 'SHIFT_OPEN');
    if (opener && opener.user_id !== user.id) {
       return res.status(403).json({ error: 'You do not have permission to view this shift audit.' });
    }
  }

  res.json(logs);
});

module.exports = router;

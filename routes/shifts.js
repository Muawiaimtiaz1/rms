const express = require('express');
const router = express.Router();
const shiftService = require('../services/ShiftService');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');

function isShiftAdmin(user) {
  return ['admin', 'superadmin', 'manager'].includes(user?.role);
}

function shiftAdminShopScope(user) {
  return user?.role === 'superadmin' ? null : user?.shop_id;
}

async function loadShiftForAccess(req, shiftId, options = {}) {
  const shift = await db('shifts')
    .where({ id: shiftId, shop_id: req.session.user.shop_id })
    .first();

  if (!shift) {
    const err = new Error('Shift not found');
    err.status = 404;
    throw err;
  }

  if (!isShiftAdmin(req.session.user) && Number(shift.user_id) !== Number(req.session.user.id)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  if (options.requireOpen && shift.status !== 'open') {
    const err = new Error('Shift is already closed');
    err.status = 400;
    throw err;
  }

  return shift;
}

// GET /api/shifts/active
// Get the current user's active shift
router.get('/active', requireAuth, async (req, res) => {
  const shift = await shiftService.getActiveShift(req.session.user.shop_id, req.session.user.id);
  res.json(shift || { status: 'none' });
});

// POST /api/shifts/open
// Start a new shift
router.post('/open', requireAuth, async (req, res) => {
  const { opening_balance, terminal_id } = req.body;
  const balance = parseFloat(opening_balance);
  
  if (isNaN(balance)) return res.status(400).json({ error: 'Valid opening balance required.' });

  const shiftId = await shiftService.openShift(
    req.session.user.shop_id,
    req.session.user.id,
    balance,
    terminal_id
  );

  res.json({ ok: true, shiftId });
});

// GET /api/shifts/summary/:id
// Get expected totals for a specific shift
router.get('/summary/:id', requireAuth, async (req, res) => {
  await loadShiftForAccess(req, req.params.id);
  const summary = await shiftService.calculateShiftSummary(req.params.id, req.session.user.shop_id);
  res.json(summary);
});

// POST /api/shifts/close
// End current shift with cash count
router.post('/close', requireAuth, async (req, res) => {
  const { shift_id, actual_balance, note, shortage_reason } = req.body;
  const balance = parseFloat(actual_balance);

  if (isNaN(balance)) return res.status(400).json({ error: 'Valid cash count required.' });
  await loadShiftForAccess(req, shift_id, { requireOpen: true });

  const summary = await shiftService.closeShift(
    shift_id,
    req.session.user.shop_id,
    balance,
    note,
    req.session.user.id,
    shortage_reason
  );

  res.json({ ok: true, summary });
});

// POST /api/shifts/cash-drop
// Record managerial cash removal
router.post('/cash-drop', requireAuth, async (req, res) => {
  const { shift_id, amount, note } = req.body;
  const val = parseFloat(amount);
  
  if (isNaN(val) || val <= 0) return res.status(400).json({ error: 'Valid amount required.' });

  await loadShiftForAccess(req, shift_id, { requireOpen: true });
  const cashDropId = await shiftService.recordCashDrop(shift_id, req.session.user.shop_id, val, note, req.session.user.id);
  res.json({ ok: true, cashDropId });
});

// GET /api/shifts/cash-drops/pending
// Admin/manager view of cash drops waiting for verification
router.get('/cash-drops/pending', requireAuth, async (req, res) => {
  if (!isShiftAdmin(req.session.user)) return res.status(403).json({ error: 'Forbidden' });
  const drops = await shiftService.listPendingCashDrops(shiftAdminShopScope(req.session.user));
  res.json(drops);
});

// POST /api/shifts/cash-drops/:id/verify
// Admin/manager verifies or rejects a requested cash drop.
router.post('/cash-drops/:id/verify', requireAuth, async (req, res) => {
  if (!isShiftAdmin(req.session.user)) return res.status(403).json({ error: 'Forbidden' });
  const { status } = req.body;
  if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  await shiftService.verifyCashDrop(
    req.params.id,
    shiftAdminShopScope(req.session.user),
    req.session.user.id,
    status
  );

  res.json({ ok: true });
});

// POST /api/shifts/handover
// Initiate handover to another user
router.post('/handover', requireAuth, async (req, res) => {
  const { shift_id, receiver_id, amount, note } = req.body;
  const val = parseFloat(amount);

  if (isNaN(val) || val <= 0) return res.status(400).json({ error: 'Valid amount required.' });
  const shift = await loadShiftForAccess(req, shift_id, { requireOpen: true });
  if (Number(shift.user_id) !== Number(req.session.user.id)) {
    return res.status(403).json({ error: 'Only the shift owner can initiate a handover.' });
  }

  const handoverId = await shiftService.createHandover(
    shift_id,
    req.session.user.shop_id,
    req.session.user.id,
    receiver_id,
    val,
    note
  );

  res.json({ ok: true, handoverId });
});

// GET /api/shifts/pending-handovers
// Get handovers waiting for current user to verify
router.get('/pending-handovers', requireAuth, async (req, res) => {
  const isAdmin = isShiftAdmin(req.session.user);
  const shopScope = isAdmin ? shiftAdminShopScope(req.session.user) : req.session.user.shop_id;
  const receiverScope = isAdmin ? null : req.session.user.id;
  const handovers = await shiftService.listPendingHandovers(shopScope, receiverScope);

  res.json(handovers);
});

// POST /api/shifts/verify-handover
// Accept or reject a handover
router.post('/verify-handover', requireAuth, async (req, res) => {
  const { handover_id, status } = req.body; // 'verified' or 'rejected'
  if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  
  await shiftService.verifyHandover(
    handover_id,
    isShiftAdmin(req.session.user) ? shiftAdminShopScope(req.session.user) : req.session.user.shop_id,
    req.session.user.id,
    status,
    isShiftAdmin(req.session.user)
  );

  res.json({ ok: true });
});

// GET /api/shifts/history
// Admin-only shift list
router.get('/history', requireAuth, async (req, res) => {
  const filters = { ...req.query };
  if (!isShiftAdmin(req.session.user)) filters.userId = req.session.user.id;

  const history = await shiftService.listHistory(shiftAdminShopScope(req.session.user), filters);
  res.json(history);
});

// GET /api/shifts/:id/details
// Full Z-report/audit details for a shift.
router.get('/:id/details', requireAuth, async (req, res) => {
  const shift = await loadShiftForAccess(req, req.params.id);
  const details = await shiftService.getShiftDetails(req.session.user.shop_id, req.params.id);
  if (shift.status === 'open' && !isShiftAdmin(req.session.user)) {
    delete details.summary.expected_balance;
  }
  res.json(details);
});

module.exports = router;

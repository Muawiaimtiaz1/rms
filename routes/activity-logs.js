const express = require('express');
const router = express.Router();
const activityLogService = require('../services/ActivityLogService');
const { requireAuth } = require('../middleware/auth');

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

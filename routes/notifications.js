const express = require('express');
const notificationService = require('../services/NotificationService');
const activityLogService = require('../services/ActivityLogService');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const notifications = await notificationService.list(req.session.user, req.query);
  res.json(notifications);
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const count = await notificationService.unreadCount(req.session.user);
  res.json({ count });
});

router.post('/', requireSuperAdmin, async (req, res) => {
  const id = await notificationService.create(req.body, req.session.user);
  if (req.body.shop_id) {
    await activityLogService.log(
      req.body.shop_id,
      req.session.user.id,
      'NOTIFICATION_CREATED',
      { title: req.body.title, type: req.body.type || 'announcement' },
      id,
      'notification'
    );
  }
  res.json({ ok: true, id });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  const count = await notificationService.markAllRead(req.session.user);
  res.json({ ok: true, count });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  await notificationService.markRead(req.session.user, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id', requireSuperAdmin, async (req, res) => {
  await notificationService.update(req.params.id, req.body);
  res.json({ ok: true });
});

router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await notificationService.update(req.params.id, { status: 'archived' });
  res.json({ ok: true });
});

module.exports = router;

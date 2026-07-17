const express = require('express');
const db = require('../db/knex');
const { requirePanel } = require('../middleware/auth');

const router = express.Router();
const requireDelivery = requirePanel('delivery');
const DELIVERY_STATUSES = new Set(['pending', 'preparing', 'ready', 'completed']);

router.get('/', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const rows = await db('sales as s')
    .select(
      's.*',
      'creator.name as served_by_name',
      'receiver.name as payment_receiver_name',
      'rider.name as rider_name',
      'kitchen.name as kitchen_name'
    )
    .leftJoin('users as creator', 's.user_id', 'creator.id')
    .leftJoin('users as receiver', 's.payment_receiver_id', 'receiver.id')
    .leftJoin('users as rider', 's.rider_id', 'rider.id')
    .leftJoin('users as kitchen', 's.kitchen_id', 'kitchen.id')
    .where({ 's.shop_id': shopId, 's.order_type': 'delivery' })
    .orderBy('s.created_at', 'desc')
    .limit(200);
  res.json(rows);
});

router.patch('/:id/status', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const status = String(req.body.status || '').trim();
  if (!DELIVERY_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid delivery status.' });

  const sale = await db('sales').where({ id: req.params.id, shop_id: shopId, order_type: 'delivery' }).first();
  if (!sale) return res.status(404).json({ error: 'Delivery order not found.' });

  const update = { order_status: status, updated_at: db.fn.now() };
  if (status === 'completed' && Object.prototype.hasOwnProperty.call(req.body, 'money_received')) {
    const received = req.body.money_received === true;
    const alreadyAttributed = Number(sale.amount_received || 0) > 0.01 && sale.payment_receiver_id;
    update.amount_received = received ? Number(sale.total || 0) : 0;
    update.payment_receiver_id = received ? (alreadyAttributed ? sale.payment_receiver_id : userId) : null;
    update.payment_received_at = received ? (alreadyAttributed ? sale.payment_received_at : db.fn.now()) : null;
    if (req.body.payment_method) update.payment_method = String(req.body.payment_method);
  }

  await db('sales').where({ id: sale.id, shop_id: shopId }).update(update);
  res.json({ success: true, status, money_received: Number(update.amount_received ?? sale.amount_received) > 0.01 });
});

router.patch('/:id/payment', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const sale = await db('sales').where({ id: req.params.id, shop_id: shopId, order_type: 'delivery' }).first();
  if (!sale) return res.status(404).json({ error: 'Delivery order not found.' });

  const received = req.body.money_received === true;
  await db('sales').where({ id: sale.id, shop_id: shopId }).update({
    amount_received: received ? Number(sale.total || 0) : 0,
    payment_method: req.body.payment_method ? String(req.body.payment_method) : sale.payment_method,
    payment_receiver_id: received ? userId : null,
    payment_received_at: received ? db.fn.now() : null,
    updated_at: db.fn.now()
  });
  res.json({ success: true, money_received: received });
});

module.exports = router;

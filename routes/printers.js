const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET all printers for this shop
router.get('/', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  try {
    const printers = await db('printers').where({ shop_id: shopId }).orderBy('display_name', 'asc');
    res.json(printers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new printer
router.post('/', requireAuth, async (req, res) => {
  const { display_name, system_name } = req.body;
  const shopId = req.session.user.shop_id;
  if (!display_name || !system_name) return res.status(400).json({ error: "Display name and System name required" });

  try {
    const [printer] = await db('printers').insert({
      shop_id: shopId,
      display_name,
      system_name
    }).returning('*');
    res.json(printer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function findPrinterByRoute(shopId, routeValue, dbInstance = db) {
  if (!routeValue) return null;
  const value = String(routeValue).trim();
  if (value.startsWith('PRINTER:')) {
    const printerId = Number(value.replace('PRINTER:', ''));
    if (!printerId) return null;
    return dbInstance('printers')
      .where({ shop_id: shopId, id: printerId })
      .first();
  }
  return dbInstance('printers')
    .where({ shop_id: shopId, system_name: value })
    .first();
}

// Assign a kitchen terminal to a physical printer. The same printer can still
// be used for customer or unpaid bills through shop settings.
router.patch('/kitchen-routes/:kitchenId', requireAdmin, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const { kitchenId } = req.params;
  const stationName = req.body.printer_station ? String(req.body.printer_station).trim() : null;

  try {
    if (stationName) {
      const printer = await findPrinterByRoute(shopId, stationName);
      if (!printer) return res.status(400).json({ error: "Selected printer is not registered for this shop" });
    }

    const updated = await db('users')
      .where({ id: kitchenId, shop_id: shopId, role: 'kitchen' })
      .update({ printer_station: stationName });

    if (!updated) return res.status(404).json({ error: "Kitchen terminal not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE printer
router.delete('/:id', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const { id } = req.params;
  try {
    const printer = await db('printers').where({ id, shop_id: shopId }).first();
    if (!printer) return res.status(404).json({ error: "Printer not found" });

    await db.transaction(async (trx) => {
      const routeKey = `PRINTER:${printer.id}`;

      await trx('users')
        .where({ shop_id: shopId })
        .whereIn('printer_station', [printer.system_name, routeKey])
        .update({ printer_station: null });

      await trx('product_categories')
        .where({ shop_id: shopId })
        .whereIn('printer_station', [printer.system_name, routeKey])
        .update({ printer_station: null });

      const shop = await trx('shops').where({ id: shopId }).first();
      const shopUpdates = {};
      if ([printer.system_name, routeKey].includes(shop?.customer_bill_printer)) shopUpdates.customer_bill_printer = null;
      if ([printer.system_name, routeKey].includes(shop?.unpaid_bill_printer)) shopUpdates.unpaid_bill_printer = null;
      if (Object.keys(shopUpdates).length > 0) {
        await trx('shops').where({ id: shopId }).update(shopUpdates);
      }

      await trx('printers').where({ id, shop_id: shopId }).del();
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

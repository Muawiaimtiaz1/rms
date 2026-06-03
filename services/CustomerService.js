const db = require('../db/knex');
const { z } = require('zod');

class CustomerService {
  /**
   * Find or create a customer based on name/phone/ID.
   */
  async resolveOrCreateCustomer(trx, { shopId, customerId, customerName, customerPhone }) {
    const name = (customerName || "").trim();
    const phone = (customerPhone || "").trim();

    if (customerId) {
      const existing = await trx('customers')
        .where({ id: parseInt(customerId), shop_id: shopId, status: 'active' })
        .first();
      if (!existing) throw new Error("Selected customer not found or inactive");
      return existing;
    }

    if (!name && !phone) return null;

    let customer = null;

    if (phone) {
      customer = await trx('customers')
        .where({ phone, shop_id: shopId, status: 'active' })
        .first();
    }

    if (!customer && name) {
      customer = await trx('customers')
        .whereRaw('LOWER(name) = LOWER(?)', [name])
        .andWhere({ shop_id: shopId, status: 'active' })
        .orderBy('id', 'desc')
        .first();
    }

    if (!customer) {
      const finalName = name || phone || "Walk-in Customer";
      const finalPhone = phone || null;
      const [newIdObj] = await trx('customers')
        .insert({
          shop_id: shopId,
          name: finalName,
          phone: finalPhone,
          current_balance: 0,
          status: 'active'
        })
        .returning('id');
      const newId = typeof newIdObj === 'object' ? newIdObj.id : newIdObj;
      return { id: newId, name: finalName, phone: finalPhone, current_balance: 0, credit_limit: 0 };
    } else {
      // Update if missing info
      const needsNameUpdate = !customer.name && name;
      const needsPhoneUpdate = !customer.phone && phone;

      if (needsNameUpdate || needsPhoneUpdate) {
        await trx('customers')
          .where({ id: customer.id })
          .update({
            name: customer.name || name || null,
            phone: customer.phone || phone || null,
            updated_at: db.fn.now()
          });
        return await trx('customers').where({ id: customer.id }).first();
      }
    }

    return customer;
  }

  /**
   * Add a sale entry to the customer ledger and update balance.
   */
  async addSaleEntry(trx, { customerId, shopId, saleId, dueAmount, grandTotal, amountReceived, userId, shiftId }) {
    if (!customerId || dueAmount <= 0.01) return;

    const customer = await trx('customers')
      .select('current_balance')
      .where({ id: customerId, shop_id: shopId })
      .first();

    if (!customer) return;

    const newBalance = parseFloat((Number(customer.current_balance || 0) + Number(dueAmount || 0)).toFixed(2));

    await trx('customers')
      .where({ id: customerId, shop_id: shopId })
      .update({ current_balance: newBalance, updated_at: db.fn.now() });

    await trx('customer_ledger').insert({
      customer_id: customerId,
      shop_id: shopId,
      sale_id: saleId,
      type: 'sale',
      amount: dueAmount,
      balance_after: newBalance,
      note: `Credit sale — Total: Rs. ${Number(grandTotal || 0).toFixed(2)}, Paid: Rs. ${Number(amountReceived || 0).toFixed(2)}`,
      created_by: userId,
      shift_id: shiftId
    });
  }

  /**
   * Add a payment entry (due payment) to the customer ledger and update balance.
   */
  async addPaymentEntry(trx, { customerId, shopId, saleId, paymentAmount, note, userId, shiftId }) {
    if (!customerId || paymentAmount <= 0.01) return;

    const customer = await trx('customers')
      .select('current_balance')
      .where({ id: customerId, shop_id: shopId })
      .first();

    if (!customer) return;

    const newBalance = parseFloat(Math.max(0, Number(customer.current_balance || 0) - Number(paymentAmount || 0)).toFixed(2));

    await trx('customers')
      .where({ id: customerId, shop_id: shopId })
      .update({ current_balance: newBalance, updated_at: db.fn.now() });

    await trx('customer_ledger').insert({
      customer_id: customerId,
      shop_id: shopId,
      sale_id: saleId || null,
      type: 'payment',
      amount: paymentAmount,
      balance_after: newBalance,
      note: note || (saleId ? `Payment received for SALE-${String(saleId).padStart(5, "0")}` : "Payment received"),
      created_by: userId,
      shift_id: shiftId
    });
  }
}

module.exports = new CustomerService();

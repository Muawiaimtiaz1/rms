const db = require('../db/knex');
const { z } = require('zod');

const CATEGORY_VALUES = ['subscription', 'setup', 'repair', 'advance', 'other'];
const SUBSCRIPTION_TYPES = ['1_month', '3_months', '6_months', '1_year', '2_years', 'lifetime'];
let schemaReadyPromise = null;

const paymentSchema = z.object({
  shop_id: z.coerce.number().int().positive().nullable().optional(),
  shopId: z.coerce.number().int().positive().nullable().optional(),
  amount: z.coerce.number().min(0),
  category: z.enum(CATEGORY_VALUES).default('other'),
  description: z.string().trim().max(1000).nullable().optional(),
  payment_method: z.string().trim().max(100).nullable().optional(),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
  subscription_type: z.enum(SUBSCRIPTION_TYPES).nullable().optional(),
  type: z.enum(SUBSCRIPTION_TYPES).nullable().optional(),
  month: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  startDate: z.string().trim().nullable().optional(),
});

function normalizeDate(value) {
  if (!value) return new Date().toISOString().split('T')[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
}

function subscriptionWindow(type, startDateValue) {
  const startDate = new Date(`${normalizeDate(startDateValue)}T00:00:00`);
  let endDate;

  if (type === 'lifetime') {
    endDate = new Date('2099-12-31T00:00:00');
  } else {
    const durationMap = { '1_month': 1, '3_months': 3, '6_months': 6, '1_year': 12, '2_years': 24 };
    endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (durationMap[type] || 1));
  }

  return {
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  };
}

function firstInsertedId(result) {
  const first = Array.isArray(result) ? result[0] : result;
  return typeof first === 'object' ? first.id : first;
}

function normalizePayload(payload = {}) {
  const data = paymentSchema.parse(payload);
  const shopId = data.shop_id ?? data.shopId ?? null;
  const paymentMethod = data.payment_method || data.paymentMethod || 'Cash';
  const subscriptionType = data.subscription_type || data.type || '1_month';
  const startDate = data.start_date || data.startDate || new Date().toISOString().split('T')[0];
  const month = data.month || normalizeDate(startDate).slice(0, 7);

  if (data.category === 'subscription' && !shopId) {
    throw new Error('Select a shop before recording a subscription payment.');
  }

  return {
    shop_id: shopId,
    amount: data.amount,
    category: data.category,
    description: data.description || defaultDescription(data.category, subscriptionType),
    payment_method: paymentMethod,
    subscription_type: subscriptionType,
    month,
    start_date: startDate,
  };
}

function defaultDescription(category, subscriptionType) {
  if (category === 'subscription') return `Subscription payment: ${subscriptionType}`;
  if (category === 'setup') return 'Setup charges';
  if (category === 'advance') return 'Advance payment';
  if (category === 'repair') return 'Maintenance or repair payment';
  return 'Platform payment';
}

function amountMatches(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.01;
}

function sameCalendarDate(left, right) {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return leftDate.toISOString().slice(0, 10) === rightDate.toISOString().slice(0, 10);
}

class PlatformPaymentService {
  async ensureLedgerReady() {
    await this.ensureSchema();
    await this.ensureSubscriptionLogs();
  }

  async ensureSchema() {
    if (!schemaReadyPromise) {
      schemaReadyPromise = this.ensureSchemaInternal().catch((error) => {
        schemaReadyPromise = null;
        throw error;
      });
    }
    return schemaReadyPromise;
  }

  async ensureSchemaInternal() {
    const hasLedger = await db.schema.hasTable('saas_financial_logs');
    if (!hasLedger) {
      await db.schema.createTable('saas_financial_logs', (table) => {
        table.increments('id').primary();
        table.integer('shop_id').references('id').inTable('shops').onDelete('SET NULL');
        table.integer('subscription_id').references('id').inTable('subscriptions').onDelete('SET NULL');
        table.float('amount').notNullable().defaultTo(0);
        table.string('category').notNullable().defaultTo('other');
        table.text('description');
        table.string('payment_method').defaultTo('Cash');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });
    }

    const columns = [
      {
        name: 'subscription_id',
        add: (table) => table.integer('subscription_id').references('id').inTable('subscriptions').onDelete('SET NULL'),
      },
      {
        name: 'updated_at',
        add: (table) => table.timestamp('updated_at'),
      },
    ];

    for (const column of columns) {
      const exists = await db.schema.hasColumn('saas_financial_logs', column.name);
      if (!exists) {
        await db.schema.alterTable('saas_financial_logs', column.add);
      }
    }

    await db.raw('CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_shop_id ON saas_financial_logs(shop_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_subscription_id ON saas_financial_logs(subscription_id)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_category ON saas_financial_logs(category)');
    await db.raw('CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_created_at ON saas_financial_logs(created_at)');
  }

  async ensureSubscriptionLogs() {
    const subscriptions = await db('subscriptions')
      .select('id', 'shop_id', 'amount', 'type', 'month', 'start_date', 'end_date', 'paid_at');
    if (!subscriptions.length) return;

    const logs = await db('saas_financial_logs')
      .select('id', 'shop_id', 'subscription_id', 'amount', 'category', 'created_at');
    const linkedSubscriptionIds = new Set(
      logs
        .map((log) => Number(log.subscription_id))
        .filter((id) => Number.isFinite(id))
    );
    const usedLegacyLogIds = new Set();

    await db.transaction(async (trx) => {
      for (const subscription of subscriptions) {
        const subscriptionId = Number(subscription.id);
        if (linkedSubscriptionIds.has(subscriptionId)) continue;

        const legacyLog = logs.find((log) => {
          if (usedLegacyLogIds.has(Number(log.id)) || log.subscription_id) return false;
          return log.category === 'subscription'
            && Number(log.shop_id) === Number(subscription.shop_id)
            && amountMatches(log.amount, subscription.amount)
            && sameCalendarDate(log.created_at, subscription.paid_at);
        });

        if (legacyLog) {
          usedLegacyLogIds.add(Number(legacyLog.id));
          await trx('saas_financial_logs').where({ id: legacyLog.id }).update({
            subscription_id: subscriptionId,
            updated_at: db.fn.now(),
          });
          continue;
        }

        await trx('saas_financial_logs').insert({
          shop_id: subscription.shop_id,
          subscription_id: subscriptionId,
          amount: subscription.amount,
          category: 'subscription',
          description: `Subscription payment: ${subscription.type || '1_month'}`,
          payment_method: 'Cash',
          created_at: subscription.paid_at || db.fn.now(),
          updated_at: subscription.paid_at || db.fn.now(),
        });
      }
    });
  }

  async list() {
    await this.ensureLedgerReady();
    return db('saas_financial_logs as l')
      .select(
        'l.*',
        's.name as shop_name',
        'sub.type as subscription_type',
        'sub.start_date as subscription_start_date',
        'sub.end_date as subscription_end_date',
        'sub.month as subscription_month'
      )
      .leftJoin('shops as s', 'l.shop_id', 's.id')
      .leftJoin('subscriptions as sub', 'l.subscription_id', 'sub.id')
      .orderBy('l.created_at', 'desc');
  }

  async create(payload) {
    await this.ensureLedgerReady();
    const data = normalizePayload(payload);

    return db.transaction(async (trx) => {
      let subscriptionId = null;

      if (data.category === 'subscription') {
        subscriptionId = await this.createSubscription(trx, data);
      }

      const inserted = await trx('saas_financial_logs')
        .insert({
          shop_id: data.shop_id,
          subscription_id: subscriptionId,
          amount: data.amount,
          category: data.category,
          description: data.description,
          payment_method: data.payment_method,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning('id');

      return firstInsertedId(inserted);
    });
  }

  async update(id, payload) {
    await this.ensureLedgerReady();
    const existing = await db('saas_financial_logs').where({ id }).first();
    if (!existing) throw new Error('Payment transaction not found.');
    const existingSubscription = existing.subscription_id
      ? await db('subscriptions').where({ id: existing.subscription_id }).first()
      : null;

    const data = normalizePayload({
      amount: payload.amount ?? existing.amount,
      category: payload.category ?? existing.category,
      description: payload.description ?? existing.description,
      payment_method: payload.payment_method ?? payload.paymentMethod ?? existing.payment_method,
      shop_id: payload.shop_id ?? payload.shopId ?? existing.shop_id,
      subscription_type: payload.subscription_type ?? payload.type ?? existingSubscription?.type,
      month: payload.month ?? existingSubscription?.month,
      start_date: payload.start_date ?? payload.startDate ?? existingSubscription?.start_date,
    });

    return db.transaction(async (trx) => {
      let subscriptionId = existing.subscription_id || null;

      if (data.category === 'subscription') {
        if (subscriptionId) await this.updateSubscription(trx, subscriptionId, data);
        else subscriptionId = await this.createSubscription(trx, data);
      } else if (subscriptionId) {
        await trx('subscriptions').where({ id: subscriptionId }).delete();
        subscriptionId = null;
      }

      await trx('saas_financial_logs').where({ id }).update({
        shop_id: data.shop_id,
        subscription_id: subscriptionId,
        amount: data.amount,
        category: data.category,
        description: data.description,
        payment_method: data.payment_method,
        updated_at: db.fn.now(),
      });
    });
  }

  async delete(id) {
    await this.ensureLedgerReady();
    const existing = await db('saas_financial_logs').where({ id }).first();
    if (!existing) throw new Error('Payment transaction not found.');

    await db.transaction(async (trx) => {
      await trx('saas_financial_logs').where({ id }).delete();
      if (existing.subscription_id) {
        await trx('subscriptions').where({ id: existing.subscription_id }).delete();
      }
    });
  }

  async createSubscription(trx, data) {
    const dates = subscriptionWindow(data.subscription_type, data.start_date);
    const inserted = await trx('subscriptions')
      .insert({
        shop_id: data.shop_id,
        amount: data.amount,
        type: data.subscription_type,
        start_date: dates.start_date,
        end_date: dates.end_date,
        month: data.month,
      })
      .returning('id');

    await trx('shops').where({ id: data.shop_id }).update({ status: 'active' });
    return firstInsertedId(inserted);
  }

  async updateSubscription(trx, subscriptionId, data) {
    const dates = subscriptionWindow(data.subscription_type, data.start_date);
    await trx('subscriptions').where({ id: subscriptionId }).update({
      shop_id: data.shop_id,
      amount: data.amount,
      type: data.subscription_type,
      start_date: dates.start_date,
      end_date: dates.end_date,
      month: data.month,
    });
    await trx('shops').where({ id: data.shop_id }).update({ status: 'active' });
  }
}

module.exports = new PlatformPaymentService();

const db = require('../db/knex');
const { usePostgres } = require('../db/runtime');
const { z } = require('zod');

const notificationSchema = z.object({
  shop_id: z.coerce.number().int().positive().nullable().optional(),
  target_user_id: z.coerce.number().int().positive().nullable().optional(),
  type: z.enum(['announcement', 'assignment', 'release', 'billing', 'maintenance', 'support', 'system']).default('announcement'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(4000),
  action_label: z.string().trim().max(80).nullable().optional(),
  action_url: z.string().trim().max(500).nullable().optional(),
  publish_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
});

const updateSchema = notificationSchema.partial();

function currentTimestampRaw() {
  return db.raw(usePostgres() ? 'NOW()' : "datetime('now')");
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return usePostgres() ? iso : iso.slice(0, 19).replace('T', ' ');
}

function parseLimit(value, fallback = 100) {
  return Math.min(parseInt(value, 10) || fallback, 250);
}

function isShopOwner(user) {
  return ['admin', 'manager'].includes(user?.role);
}

class NotificationService {
  baseVisibleQuery(user, filters = {}) {
    const query = db('notifications as n')
      .leftJoin('shops as s', 'n.shop_id', 's.id')
      .leftJoin('users as creator', 'n.created_by_user_id', 'creator.id')
      .leftJoin('users as target', 'n.target_user_id', 'target.id');

    if (user.role === 'superadmin') {
      if (filters.shop_id) {
        if (String(filters.shop_id) === 'global') query.whereNull('n.shop_id');
        else query.where('n.shop_id', filters.shop_id);
      }
      if (filters.status && filters.status !== 'all') {
        query.where('n.status', filters.status);
      } else if (!filters.include_archived) {
        query.whereNot('n.status', 'archived');
      }
    } else {
      query
        .where('n.status', 'active')
        .where(function () {
          this.whereNull('n.shop_id').orWhere('n.shop_id', user.shop_id);
        })
        .where(function () {
          this.whereNull('n.publish_at').orWhere('n.publish_at', '<=', currentTimestampRaw());
        })
        .where(function () {
          this.whereNull('n.expires_at').orWhere('n.expires_at', '>=', currentTimestampRaw());
        });

      if (!isShopOwner(user)) {
        query.where(function () {
          this.whereNull('n.target_user_id').orWhere('n.target_user_id', user.id);
        });
      }
    }

    if (filters.type && filters.type !== 'all') query.where('n.type', filters.type);
    if (filters.priority && filters.priority !== 'all') query.where('n.priority', filters.priority);
    if (filters.unread_only) query.whereNull('nr.read_at');

    return query;
  }

  async list(user, filters = {}) {
    const limit = parseLimit(filters.limit, 100);
    const query = this.baseVisibleQuery(user, filters)
      .leftJoin('notification_reads as nr', function () {
        this.on('nr.notification_id', '=', 'n.id').andOn('nr.user_id', '=', db.raw('?', [user.id]));
      })
      .select(
        'n.*',
        's.name as shop_name',
        'creator.name as created_by_name',
        'creator.username as created_by_username',
        'target.name as target_user_name',
        'target.username as target_user_username',
        'target.role as target_user_role',
        'nr.read_at'
      )
      .orderBy('n.created_at', 'desc')
      .limit(limit);

    if (filters.unread_only) query.whereNull('nr.read_at');
    return query;
  }

  async unreadCount(user) {
    const row = await this.baseVisibleQuery(user, {})
      .leftJoin('notification_reads as nr', function () {
        this.on('nr.notification_id', '=', 'n.id').andOn('nr.user_id', '=', db.raw('?', [user.id]));
      })
      .whereNull('nr.read_at')
      .count({ count: 'n.id' })
      .first();
    return Number(row?.count || 0);
  }

  async validateTarget(data) {
    let targetShopId = data.shop_id || null;

    if (targetShopId) {
      const shop = await db('shops').where({ id: targetShopId }).first();
      if (!shop) throw new Error('Target shop not found');
    }

    if (data.target_user_id) {
      const user = await db('users').where({ id: data.target_user_id }).first();
      if (!user || user.role === 'superadmin') throw new Error('Target user not found');
      if (targetShopId && Number(user.shop_id) !== Number(targetShopId)) {
        throw new Error('Target user does not belong to the selected shop');
      }
      targetShopId = user.shop_id;
    }

    return targetShopId;
  }

  async create(payload, actor) {
    const data = notificationSchema.parse(payload);
    const targetShopId = await this.validateTarget(data);

    const insertData = {
      shop_id: targetShopId,
      target_user_id: data.target_user_id || null,
      created_by_user_id: actor.id,
      type: data.type,
      priority: data.priority,
      title: data.title,
      message: data.message,
      action_label: data.action_label || null,
      action_url: data.action_url || null,
      publish_at: normalizeTimestamp(data.publish_at),
      expires_at: normalizeTimestamp(data.expires_at),
      due_at: normalizeTimestamp(data.due_at),
      status: data.status,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    const [idObj] = await db('notifications').insert(insertData).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async update(id, payload) {
    const existing = await db('notifications').where({ id }).first();
    if (!existing) throw new Error('Notification not found');

    const data = updateSchema.parse(payload);
    const updateData = {};

    if (data.hasOwnProperty('shop_id') || data.hasOwnProperty('target_user_id')) {
      const targetShopId = await this.validateTarget({
        shop_id: data.hasOwnProperty('shop_id') ? data.shop_id : existing.shop_id,
        target_user_id: data.hasOwnProperty('target_user_id') ? data.target_user_id : existing.target_user_id,
      });
      updateData.shop_id = targetShopId;
      updateData.target_user_id = data.hasOwnProperty('target_user_id') ? data.target_user_id || null : existing.target_user_id;
    }

    ['type', 'priority', 'title', 'message', 'action_label', 'action_url', 'status'].forEach((key) => {
      if (data.hasOwnProperty(key)) updateData[key] = data[key] || null;
    });

    ['publish_at', 'expires_at', 'due_at'].forEach((key) => {
      if (data.hasOwnProperty(key)) updateData[key] = normalizeTimestamp(data[key]);
    });

    updateData.updated_at = db.fn.now();
    await db('notifications').where({ id }).update(updateData);
  }

  async findVisible(user, id) {
    return this.baseVisibleQuery(user, { include_archived: true, status: 'all' })
      .where('n.id', id)
      .first('n.id');
  }

  async markRead(user, id) {
    const notification = await this.findVisible(user, id);
    if (!notification) throw new Error('Notification not found');

    await db('notification_reads')
      .insert({
        notification_id: id,
        user_id: user.id,
        read_at: db.fn.now(),
      })
      .onConflict(['notification_id', 'user_id'])
      .merge({ read_at: db.fn.now() });
  }

  async markAllRead(user) {
    const rows = await this.baseVisibleQuery(user, {})
      .leftJoin('notification_reads as nr', function () {
        this.on('nr.notification_id', '=', 'n.id').andOn('nr.user_id', '=', db.raw('?', [user.id]));
      })
      .whereNull('nr.read_at')
      .select('n.id');

    if (!rows.length) return 0;

    const readRows = rows.map((row) => ({
      notification_id: row.id,
      user_id: user.id,
      read_at: db.fn.now(),
    }));

    await db('notification_reads')
      .insert(readRows)
      .onConflict(['notification_id', 'user_id'])
      .merge({ read_at: db.fn.now() });

    return rows.length;
  }
}

module.exports = new NotificationService();

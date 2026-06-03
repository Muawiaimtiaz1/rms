const db = require('../db/knex');

class ActivityLogService {
  /**
   * Log an activity to the database.
   * @param {number} shopId - ID of the shop
   * @param {number} userId - ID of the user performing the action
   * @param {string} action - Short description of the action (e.g., 'SHIFT_OPEN')
   * @param {string|object} details - Additional details about the action
   * @param {number} referenceId - Optional ID of the related object (e.g., shift_id)
   * @param {string} referenceType - Optional type of the related object (e.g., 'shift')
   */
  async log(shopId, userId, action, details = null, referenceId = null, referenceType = null) {
    try {
      const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;
      
      await db('activity_logs').insert({
        shop_id: shopId,
        user_id: userId,
        action,
        details: detailsStr,
        reference_id: referenceId,
        reference_type: referenceType,
        created_at: db.fn.now()
      });
    } catch (err) {
      console.error('[ActivityLogService] Failed to log activity:', err);
      // We don't throw here to avoid breaking the main operation if logging fails
    }
  }

  /**
   * Get logs for a shop with filters.
   */
  async getLogs(shopId, filters = {}) {
    let query = db('activity_logs as al')
      .select('al.*', 'u.name as user_name', 'u.username as user_username', 'u.role as user_role')
      .leftJoin('users as u', 'al.user_id', 'u.id')
      .where('al.shop_id', shopId);

    if (filters.userId) {
      query = query.where('al.user_id', filters.userId);
    }

    if (filters.action) {
      query = query.where('al.action', filters.action);
    }

    if (filters.from) {
      query = query.where('al.created_at', '>=', filters.from);
    }

    if (filters.to) {
      query = query.where('al.created_at', '<=', filters.to);
    }

    return query.orderBy('al.created_at', 'desc').limit(filters.limit || 500);
  }

  /**
   * Get logs across all shops (Super Admin only).
   */
  async getAllLogs(filters = {}) {
    let query = db('activity_logs as al')
      .select('al.*', 'u.name as user_name', 'u.username as user_username', 'u.role as user_role', 's.name as shop_name')
      .leftJoin('users as u', 'al.user_id', 'u.id')
      .leftJoin('shops as s', 'al.shop_id', 's.id');

    if (filters.shopId) {
      query = query.where('al.shop_id', filters.shopId);
    }

    if (filters.userId) {
      query = query.where('al.user_id', filters.userId);
    }

    if (filters.action) {
      query = query.where('al.action', filters.action);
    }

    if (filters.from) {
      query = query.where('al.created_at', '>=', filters.from);
    }

    if (filters.to) {
      query = query.where('al.created_at', '<=', filters.to);
    }

    return query.orderBy('al.created_at', 'desc').limit(filters.limit || 1000);
  }

  /**
   * Get all logs for a specific reference (e.g. all logs for a shift).
   */
  async getLogsByReference(shopId, referenceId, referenceType) {
    const query = db('activity_logs as al')
      .select('al.*', 'u.name as user_name', 'u.username as user_username', 'u.role as user_role')
      .leftJoin('users as u', 'al.user_id', 'u.id')
      .where({ 'al.reference_id': referenceId, 'al.reference_type': referenceType });

    if (shopId) query.where('al.shop_id', shopId);

    return query.orderBy('al.created_at', 'asc');
  }
}

module.exports = new ActivityLogService();

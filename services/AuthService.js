const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

function toDateOnlyString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function localDateFromDateOnly(value, endOfDay = false) {
  const dateStr = toDateOnlyString(value);
  if (!dateStr) return null;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const date = new Date(`${dateStr}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getSubscriptionTypeLabel(type) {
  return {
    "1_month": "1 Month",
    "3_months": "3 Months",
    "6_months": "6 Months",
    "1_year": "1 Year",
    "2_years": "2 Years",
    lifetime: "Lifetime",
  }[type] || type || "Subscription";
}

function buildSubscriptionSummary(subscription) {
  if (!subscription) return null;

  const type = subscription.type || "1_month";
  const isLifetime = type === "lifetime";
  const startDate = localDateFromDateOnly(subscription.start_date);
  const endDate = localDateFromDateOnly(subscription.end_date, true);
  const today = startOfToday();

  if (isLifetime) {
    return {
      id: subscription.id,
      type,
      type_label: getSubscriptionTypeLabel(type),
      start_date: toDateOnlyString(subscription.start_date),
      end_date: toDateOnlyString(subscription.end_date),
      status: "active",
      is_lifetime: true,
      remaining_days: null,
      total_days: null,
      used_days: null,
      remaining_percent: 100,
      label: "Lifetime access",
      timeline_label: "Unlimited access",
    };
  }

  const totalDays = startDate && endDate
    ? Math.max(1, Math.ceil((endDate - startDate) / 86400000))
    : 1;
  const rawRemainingDays = endDate
    ? Math.max(0, Math.ceil((endDate - today) / 86400000))
    : 0;
  const remainingDays = Math.min(totalDays, rawRemainingDays);
  const usedDays = Math.max(0, totalDays - remainingDays);
  const remainingPercent = Math.max(0, Math.min(100, Math.round((remainingDays / totalDays) * 100)));
  const status = remainingDays > 0 ? "active" : "expired";

  return {
    id: subscription.id,
    type,
    type_label: getSubscriptionTypeLabel(type),
    start_date: toDateOnlyString(subscription.start_date),
    end_date: toDateOnlyString(subscription.end_date),
    status,
    is_lifetime: false,
    remaining_days: remainingDays,
    total_days: totalDays,
    used_days: usedDays,
    remaining_percent: remainingPercent,
    label: remainingDays > 0
      ? `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`
      : "Expired",
    timeline_label: `${remainingDays} of ${totalDays} day${totalDays === 1 ? "" : "s"} remaining`,
  };
}

class AuthService {
  async getSubscriptionSummary(shopId) {
    if (!shopId) return null;

    const subscriptions = await db('subscriptions')
      .where({ shop_id: shopId })
      .orderBy('paid_at', 'desc')
      .limit(100);

    if (!subscriptions.length) return null;

    const today = startOfToday();
    const sorted = subscriptions.sort((a, b) => {
      if (a.type === "lifetime" && b.type !== "lifetime") return -1;
      if (b.type === "lifetime" && a.type !== "lifetime") return 1;
      const aEnd = localDateFromDateOnly(a.end_date, true)?.getTime() || 0;
      const bEnd = localDateFromDateOnly(b.end_date, true)?.getTime() || 0;
      if (aEnd !== bEnd) return bEnd - aEnd;
      return new Date(b.paid_at || 0) - new Date(a.paid_at || 0);
    });

    const active = sorted.find((sub) => {
      if (sub.type === "lifetime") return true;
      const end = localDateFromDateOnly(sub.end_date, true);
      return end && end >= today;
    });

    return buildSubscriptionSummary(active || sorted[0]);
  }

  /**
   * Validate credentials and return user object if valid.
   */
  async login(username, password) {
    if (!username || !password) throw new Error('Username and password required');

    const user = await db('users').where({ username }).first();
    if (!user) throw new Error('Invalid credentials');

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) throw new Error('Invalid credentials');

    if (user.status === 'blocked') {
      throw new Error('Your account has been blocked. Please contact your administrator.');
    }

    // SaaS Role Checks
    if (user.role !== 'superadmin') {
      const shop = await db('shops').where({ id: user.shop_id }).first();
      if (!shop) throw new Error('Shop not found');
      if (shop.status === 'blocked') throw new Error('Shop access is blocked by administrator');

      // Check Subscription
      const now = new Date().toISOString().split('T')[0];
      const sub = await db('subscriptions')
        .where('shop_id', user.shop_id)
        .andWhere((builder) => {
          builder.where('type', 'lifetime').orWhere('end_date', '>=', now);
        })
        .orderBy('end_date', 'desc')
        .first();

      if (!sub) throw new Error('No active subscription. Please contact administrator.');
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      shop_id: user.shop_id,
      can_manage_register: !!user.can_manage_register
    };
  }

  /**
   * Get fresh user details including merged panel permissions.
   */
  async getProfile(userId) {
    const user = await db('users').where({ id: userId }).first();
    if (!user) return null;

    let allowedPanels = user.allowed_panels ? JSON.parse(user.allowed_panels) : [];
    let shopName = 'Master Control';
    let shopType = 'other';
    let subscription = null;

    let shopStatus = 'active';
    let shopCreatedAt = null;
    let shopPhone = '';
    let shopAddress = '';

    if (user.role !== 'superadmin') {
      const shop = await db('shops').where({ id: user.shop_id }).first();
      if (!shop) return null;

      shopName = shop.name;
      shopType = shop.shop_type || 'retail';
      shopStatus = shop.status || 'active';
      shopCreatedAt = shop.created_at;
      shopPhone = shop.receipt_phone || '';
      shopAddress = shop.receipt_address || '';

      const shopPanels = shop.allowed_panels ? JSON.parse(shop.allowed_panels) : [];
      if (user.role === 'admin') {
        allowedPanels = shopPanels;
      } else {
        allowedPanels = allowedPanels.filter(p => shopPanels.includes(p));
      }
      subscription = await this.getSubscriptionSummary(user.shop_id);
    }

    return {
      ...user,
      shop_name: shopName,
      shop_type: shopType,
      shop_status: shopStatus,
      shop_created_at: shopCreatedAt,
      shop_phone: shopPhone,
      shop_address: shopAddress,
      subscription,
      allowed_panels: allowedPanels,
      can_manage_register: !!user.can_manage_register
    };
  }

  async resetPassword(username) {
    const user = await db('users').select('id').where({ username }).first();
    if (!user) throw new Error('User not found');

    const tempPassword = 'Reset@' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const hash = bcrypt.hashSync(tempPassword, 10);

    await db('users').where({ id: user.id }).update({ password_hash: hash });
    return tempPassword;
  }
}

module.exports = new AuthService();

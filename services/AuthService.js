const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

class AuthService {
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
        .andWhere('end_date', '>=', now)
        .orderBy('end_date', 'desc')
        .first();

      if (!sub) throw new Error('No active subscription. Please contact administrator.');
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      shop_id: user.shop_id
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

    if (user.role !== 'superadmin') {
      const shop = await db('shops').where({ id: user.shop_id }).first();
      if (!shop) return null;

      shopName = shop.name;
      shopType = shop.shop_type || 'retail';

      const shopPanels = shop.allowed_panels ? JSON.parse(shop.allowed_panels) : [];
      if (user.role === 'admin') {
        allowedPanels = shopPanels;
      } else {
        allowedPanels = allowedPanels.filter(p => shopPanels.includes(p));
      }
    }

    return {
      ...user,
      shop_name: shopName,
      shop_type: shopType,
      allowed_panels: allowedPanels
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

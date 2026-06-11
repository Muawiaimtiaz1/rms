const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const shopSchema = z.object({
  name: z.string().min(1),
  shop_type: z.enum(['retail', 'restaurant', 'pharmacy', 'grocery']).default('retail'),
  allowed_panels: z.array(z.string()).optional().default([]),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(6),
  employees: z.array(z.object({
    name: z.string(),
    username: z.string(),
    password: z.string().optional(),
    role: z.string().optional(),
    allowed_panels: z.array(z.string()).optional()
  })).optional(),
  kitchens: z.array(z.object({
    name: z.string(),
    username: z.string(),
    password: z.string().optional(),
    allowed_panels: z.array(z.string()).optional()
  })).optional(),
});

function ensureShopPanels(panels = []) {
  return [...new Set([...(Array.isArray(panels) ? panels : []), 'notifications'])];
}

class ShopService {
  async listShops() {
    const shops = await db('shops').orderBy('created_at', 'desc');
    return shops.map(s => ({
      ...s,
      allowed_panels: typeof s.allowed_panels === 'string' ? JSON.parse(s.allowed_panels) : (s.allowed_panels || [])
    }));
  }

  async createShop(payload) {
    const data = shopSchema.parse(payload);
    const panelsJson = JSON.stringify(ensureShopPanels(data.allowed_panels));

    const shopId = await db.transaction(async (trx) => {
      // 1. Create Shop
      const [idObj] = await trx('shops').insert({
        name: data.name,
        shop_type: data.shop_type,
        allowed_panels: panelsJson,
        status: 'active'
      }).returning('id');
      
      const sid = typeof idObj === 'object' ? idObj.id : idObj;

      // 2. Create Admin User
      const adminHash = bcrypt.hashSync(data.adminPassword, 10);
      await trx('users').insert({
        name: `${data.name} Admin`,
        username: data.adminUsername,
        password_hash: adminHash,
        role: 'admin',
        shop_id: sid,
        allowed_panels: panelsJson
      });

      // 3. Create Employees
      if (data.employees) {
        for (const emp of data.employees) {
          const empHash = emp.password ? bcrypt.hashSync(emp.password, 10) : null;
          await trx('users').insert({
            name: emp.name,
            username: emp.username,
            password_hash: empHash,
            role: emp.role || 'user',
            shop_id: sid,
            allowed_panels: JSON.stringify(emp.allowed_panels || [])
          });
        }
      }

      // 4. Create Kitchens
      if (data.kitchens) {
        for (const kit of data.kitchens) {
          const kitHash = kit.password ? bcrypt.hashSync(kit.password, 10) : null;
          await trx('users').insert({
            name: kit.name,
            username: kit.username,
            password_hash: kitHash,
            role: 'kitchen',
            shop_id: sid,
            allowed_panels: JSON.stringify(kit.allowed_panels || [])
          });
        }
      }

      // 5. Log activity
      await trx('activity_logs').insert({
        shop_id: sid,
        action: 'Store Created',
        details: `Store ${data.name} created with initial staff.`
      });

      return sid;
    });

    return shopId;
  }

  async updateShop(id, updates) {
    const { name, status, allowed_panels } = updates;
    const upData = {};
    if (name) upData.name = name;
    if (status) upData.status = status;
    if (allowed_panels) upData.allowed_panels = JSON.stringify(ensureShopPanels(allowed_panels));

    if (Object.keys(upData).length === 0) return;

    await db('shops').where({ id }).update(upData);
  }

  async deleteShop(id) {
    if (Number(id) === 1) throw new Error("Cannot delete main shop");
    await db('shops').where({ id }).delete();
  }
}

module.exports = new ShopService();

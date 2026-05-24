const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const userSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(4).optional(),
  role: z.string().default('pos_user'),
  shop_id: z.coerce.number().int().nullable().optional(),
  allowed_panels: z.array(z.string()).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.enum(['active', 'blocked']).default('active'),
});

class UserService {
  async listUsers(currentUser) {
    const isSuper = currentUser.role === 'superadmin';
    
    let query = db('users as u')
      .select('u.id', 'u.name', 'u.email', 'u.phone', 'u.username', 'u.role', 'u.status', 'u.shop_id', 'u.allowed_panels', 'u.created_at')
      .orderBy('u.created_at', 'desc');

    if (isSuper) {
      query = query.select('s.name as shop_name').leftJoin('shops as s', 'u.shop_id', 's.id');
    } else {
      query = query.where({ shop_id: currentUser.shop_id }).whereNot('role', 'superadmin').whereNotNull('shop_id');
    }

    const users = await query;
    return users.map(u => ({
      ...u,
      allowed_panels: u.allowed_panels ? JSON.parse(u.allowed_panels) : []
    }));
  }

  async createUser(payload, currentUser) {
    if (currentUser.role !== 'superadmin') throw new Error('Only Super Admin can create users.');
    const data = userSchema.parse(payload);
    
    if (data.role === 'superadmin') throw new Error('Cannot create Super Admins');

    const existing = await db('users').where({ username: data.username }).first();
    if (existing) throw new Error('Username already taken');

    const hash = bcrypt.hashSync(payload.password, 10);
    const targetShopId = data.shop_id || null; // Super admin can assign any shop

    const [idObj] = await db('users').insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      username: data.username,
      password_hash: hash,
      role: data.role,
      status: data.status,
      allowed_panels: JSON.stringify(data.allowed_panels || []),
      shop_id: targetShopId
    }).returning('id');

    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateUser(userId, payload, currentUser) {
    const userToEdit = await db('users').where({ id: userId }).first();
    if (!userToEdit) throw new Error('User not found');

    if (currentUser.role !== 'superadmin') {
      if (userToEdit.shop_id !== currentUser.shop_id) throw new Error('Access denied');
      
      // Shop admin can ONLY edit password
      if (payload.password) {
        await db('users').where({ id: userId }).update({
          password_hash: bcrypt.hashSync(payload.password, 10),
          updated_at: db.fn.now()
        });
        return;
      } else {
        throw new Error('You are only allowed to update passwords for users in your shop.');
      }
    }

    // Superadmin logic
    const data = userSchema.partial().parse(payload);
    
    // Check if username is being changed and if it already exists
    if (data.username && data.username !== userToEdit.username) {
      const existing = await db('users').where({ username: data.username }).first();
      if (existing) throw new Error('Username already taken');
    }

    const isSuper = userToEdit.role === 'superadmin';
    const updateData = {
      name: data.name || userToEdit.name,
      username: data.username || userToEdit.username,
      email: data.email !== undefined ? data.email : userToEdit.email,
      phone: data.phone !== undefined ? data.phone : userToEdit.phone,
      role: !isSuper ? (data.role || userToEdit.role) : userToEdit.role,
      shop_id: data.hasOwnProperty('shop_id') ? data.shop_id : userToEdit.shop_id,
      status: isSuper ? 'active' : (data.status || userToEdit.status),
      allowed_panels: JSON.stringify(data.allowed_panels || JSON.parse(userToEdit.allowed_panels || '[]')),
      updated_at: db.fn.now()
    };

    if (payload.password) {
      updateData.password_hash = bcrypt.hashSync(payload.password, 10);
    }

    await db('users').where({ id: userId }).update(updateData);
  }

  async deleteUser(userId, currentUser) {
    if (currentUser.role !== 'superadmin') throw new Error('Only Super Admin can delete users.');
    if (userId === currentUser.id) throw new Error('Cannot delete yourself');

    const userToDelete = await db('users').where({ id: userId }).first();
    if (!userToDelete) throw new Error('User not found');
    if (userToDelete.role === 'superadmin') throw new Error('The Master Owner account cannot be deleted');

    await db('users').where({ id: userId }).delete();
  }
}

module.exports = new UserService();

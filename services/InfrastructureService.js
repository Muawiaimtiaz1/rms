const db = require('../db/knex');

class InfrastructureService {
  // --- Floors ---
  async listFloors(shopId) {
    return db('floors').where({ shop_id: shopId }).orderBy('id', 'asc');
  }

  async createFloor(name, shopId) {
    const [idObj] = await db('floors').insert({ name, shop_id: shopId }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async deleteFloor(id, shopId) {
    await db('floors').where({ id, shop_id: shopId }).delete();
  }

  // --- Tables ---
  async listTables(shopId) {
    return db('tables').where({ shop_id: shopId }).orderBy('id', 'asc');
  }

  async createTable(payload, shopId) {
    const { table_number, capacity, floor_id } = payload;
    const [idObj] = await db('tables').insert({
      shop_id: shopId,
      table_number,
      capacity: capacity || 4,
      floor_id: floor_id || null,
      status: 'available'
    }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateTableStatus(id, status, shopId) {
    await db('tables').where({ id, shop_id: shopId }).update({ status });
  }

  // --- Kitchen Display System (KDS) ---
  async listActiveKitchenOrders(shopId, kitchenUserId = null) {
    let query = db('sales as s')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .leftJoin('users as u', 's.waiter_id', 'u.id')
      .where('s.shop_id', shopId)
      .whereIn('s.order_status', ['pending', 'preparing', 'ready', 'completed'])
      .select(
        's.id', 's.order_type', 's.order_status', 's.table_id', 's.token_number', 
        's.guest_count', 's.created_at', 's.special_instructions as order_notes',
        't.table_number', 'u.name as waiter_name'
      );

    if (kitchenUserId) {
      query = query.where('s.kitchen_id', kitchenUserId);
    }

    const orders = await query.orderBy('s.created_at', 'asc');

    for (let order of orders) {
      const items = await db('sale_items as si')
        .leftJoin('products as p', 'si.product_id', 'p.id')
        .where('si.sale_id', order.id)
        .select(
          'si.id', 'si.quantity', 'si.custom_name', 'si.special_instructions', 
          'si.variants_json', 'si.addons_json',
          db.raw('COALESCE(p.name, si.custom_name) as product_name')
        );

      order.items = items.map(item => ({
        ...item,
        variants: typeof item.variants_json === 'string' ? JSON.parse(item.variants_json) : (item.variants_json || null),
        addons: typeof item.addons_json === 'string' ? JSON.parse(item.addons_json) : (item.addons_json || null)
      }));
    }

    return orders;
  }

  async updateOrderStatus(saleId, status, shopId) {
    await db('sales')
      .where({ id: saleId, shop_id: shopId })
      .update({ order_status: status });
  }
}

module.exports = new InfrastructureService();

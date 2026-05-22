const db = require('../db/knex');

class TableService {
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
}

module.exports = new TableService();

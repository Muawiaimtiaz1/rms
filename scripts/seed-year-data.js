const db = require('../db/knex');
const fs = require('fs');

async function seed() {
  const shopId = 24;
  const userId = 27; 
  const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('seed.log', msg + '\n');
  };

  log(`🚀 Starting SCHEMA_VALID seed for Shop ID: ${shopId}...`);

  try {
    let brand = await db('brands').where({ shop_id: shopId }).first();
    if (!brand) {
        const [bidObj] = await db('brands').insert({ shop_id: shopId, name: 'Bistro Main' }).returning('id');
        brand = { id: typeof bidObj === 'object' ? bidObj.id : bidObj };
    }
    const brandId = brand.id;

    const categories = ['Burgers', 'Pizza', 'Drinks', 'Desserts'];
    const products = [];
    for (const cat of categories) {
      for (let i = 1; i <= 3; i++) {
        const name = `${cat} Item ${i}`;
        const buying = 110 + (i * 5);
        const selling = 350 + (i * 15);
        const [idObj] = await db('products').insert({
          shop_id: shopId, brand_id: brandId, user_id: userId,
          name, category: cat, buying_price: buying, selling_price: selling,
          stock: 100, sku: `B-${cat.substring(0,2)}-${i}-${Date.now()}`
        }).returning('id');
        products.push({ id: typeof idObj === 'object' ? idObj.id : idObj, buying, selling });
      }
    }

    log(`✅ Created ${products.length} products.`);

    const now = new Date();
    for (let dayOffset = 365; dayOffset >= 0; dayOffset--) {
      await db.transaction(async (trx) => {
        const date = new Date();
        date.setDate(now.getDate() - dayOffset);
        const timestamp = date.toISOString().replace('T', ' ').split('.')[0];
        
        const dailyOrders = Math.floor(Math.random() * 8) + 6;
        for (let o = 0; o < dailyOrders; o++) {
          const p1 = products[Math.floor(Math.random() * products.length)];
          const p2 = products[Math.floor(Math.random() * products.length)];
          const totalSale = p1.selling + p2.selling;

          const [saleIdObj] = await trx('sales').insert({
            shop_id: shopId, user_id: userId, total: totalSale, discount: 0, 
            payment_method: Math.random() > 0.4 ? 'cash' : 'online',
            order_type: 'dine_in', created_at: timestamp
          }).returning('id');
          
          const sid = typeof saleIdObj === 'object' ? saleIdObj.id : saleIdObj;
          
          // Schema-accurate SaleItems
          await trx('sale_items').insert([
            { sale_id: sid, product_id: p1.id, quantity: 1, price_at_sale: p1.selling, buying_price_at_sale: p1.buying },
            { sale_id: sid, product_id: p2.id, quantity: 1, price_at_sale: p2.selling, buying_price_at_sale: p2.buying }
          ]);
        }
      });
      if (dayOffset % 20 === 0) log(`📅 Seeded Day ${365 - dayOffset}/365...`);
    }
    log(`🏁 Success! 1 Year Sales Baseline established.`);
    process.exit(0);
  } catch (err) {
    log(`❌ Seed failed: ${err.message}`);
    process.exit(1);
  }
}

seed();

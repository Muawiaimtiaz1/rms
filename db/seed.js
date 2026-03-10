const db = require('./db');
const bcrypt = require('bcryptjs');

function seed() {
    // Create admin user
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!existing) {
        const hash = bcrypt.hashSync('admin123', 10);
        const adminId = db.prepare(
            'INSERT INTO users (name, email, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('System Admin', 'admin@pos.local', '0000000000', 'admin', hash, 'admin').lastInsertRowid;

        // Create sample brands for admin
        const brand1Id = db.prepare('INSERT INTO brands (name, user_id) VALUES (?, ?)').run('Tormaline Events', adminId).lastInsertRowid;
        const brand2Id = db.prepare('INSERT INTO brands (name, user_id) VALUES (?, ?)').run('Mavi Altin', adminId).lastInsertRowid;
        const brand3Id = db.prepare('INSERT INTO brands (name, user_id) VALUES (?, ?)').run('Guzel Meraki', adminId).lastInsertRowid;

        // Create sample products
        db.prepare(
            'INSERT INTO products (sku, name, category, description, brand_id, user_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('SKU-A-001', 'Sample Product A', 'General', 'A sample product', brand1Id, adminId, 50, 100, 10);

        db.prepare(
            'INSERT INTO products (sku, name, category, description, brand_id, user_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('SKU-B-001', 'Sample Product B', 'General', 'Another sample product', brand2Id, adminId, 120, 50, 5);

        console.log('✅ Seeded admin user (username: admin, password: admin123)');
        console.log('✅ Seeded 3 brands and 2 products');
    } else {
        console.log('ℹ️  Admin user already exists, skipping seed.');
    }
}

seed();

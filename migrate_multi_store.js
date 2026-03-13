const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'db', 'pos.db'));

db.transaction(() => {
    // 1. Create Shops table if not exists (redundant with schema.sql but safe)
    db.prepare(`CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();

    // 2. Insert default shop
    const shopResult = db.prepare("INSERT INTO shops (name) VALUES (?)").run("Main Shop");
    const shopId = shopResult.lastInsertRowid;

    // 3. Update Users table
    try { db.prepare("ALTER TABLE users ADD COLUMN shop_id INTEGER REFERENCES shops(id)").run(); } catch (e) { }
    db.prepare("UPDATE users SET shop_id = ?").run(shopId);

    // Make current admin a superadmin (assuming username 'admin')
    db.prepare("UPDATE users SET role = 'superadmin', shop_id = NULL WHERE username = 'admin'").run();

    // 4. Update other tables
    const tables = ['brands', 'products', 'sales', 'expenses'];
    tables.forEach(table => {
        try {
            db.prepare(`ALTER TABLE ${table} ADD COLUMN shop_id INTEGER REFERENCES shops(id)`).run();
        } catch (e) { /* column might exist */ }
        db.prepare(`UPDATE ${table} SET shop_id = ?`).run(shopId);
    });

    console.log("Migration successful: Created 'Main Shop' and associated all data.");
})();

db.close();

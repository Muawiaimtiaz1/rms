const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Determine path based on environment (Electron vs Node)
const isElectron = !!process.versions.electron;
let dbDir = __dirname;

if (isElectron) {
    const { app } = require('electron');
    // Store data in the user application data directory
    dbDir = path.join(app.getPath('userData'), 'db');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

const DB_PATH = path.join(dbDir, 'pos.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables from schema only if they don't exist
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shops'").get();
if (!tableExists) {
    console.log('🌱 Initializing fresh database...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    
    // Auto-seed default shop, admin, and subscription
    db.transaction(() => {
        const hash = bcrypt.hashSync('admin123', 10);
        const panels = JSON.stringify(['dashboard', 'brands', 'products', 'pos', 'sales-history', 'expenses']);
        const longTermDate = '2099-12-31';
        
        // 1. Create default shop
        const shopId = db.prepare('INSERT INTO shops (name, allowed_panels) VALUES (?, ?)')
                         .run('Default Shop', panels).lastInsertRowid;
        
        // 2. Create Super Admin (Bypasses all checks)
        db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)')
          .run('Global Owner', 'owner', hash, 'superadmin', null);

        // 3. Create default shop Admin
        db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)')
          .run('Administrator', 'admin', hash, 'admin', shopId);

        // 4. Create Active Subscription (Necessary for 'admin' role login)
        db.prepare('INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES (?, ?, ?, ?, ?, ?)')
          .run(shopId, 0, '1_year', '2024-01-01', longTermDate, '2024-01');
    })();
    
    console.log('✅ Database initialized with:');
    console.log('   - SuperAdmin: owner / admin123');
    console.log('   - ShopAdmin:  admin / admin123');
} else {
    // Migration check: Ensure 'owner' account and lifetime subscription exist
    const ownerExists = db.prepare("SELECT id FROM users WHERE username = 'owner'").get();
    if (!ownerExists) {
        console.log('🔧 SuperAdmin missing. Seeding "owner" and lifetime subscription...');
        db.transaction(() => {
            const hash = bcrypt.hashSync('admin123', 10);
            const panels = JSON.stringify(['dashboard', 'brands', 'products', 'pos', 'sales-history', 'expenses']);
            const longTermDate = '2099-12-31';

            let shopId = db.prepare("SELECT id FROM shops LIMIT 1").get()?.id;
            if (!shopId) {
                shopId = db.prepare('INSERT INTO shops (name, allowed_panels) VALUES (?, ?)')
                           .run('Default Shop', panels).lastInsertRowid;
            }
            
            // Add Super Admin
            db.prepare('INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)')
              .run('Global Owner', 'owner', hash, 'superadmin', null);

            // Add Lifetime Subscription for the default shop (so 'admin' works too)
            db.prepare('INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES (?, ?, ?, ?, ?, ?)')
              .run(shopId, 0, '1_year', '2024-01-01', longTermDate, '2024-01');
        })();
        console.log('✅ SuperAdmin ("owner") and Subscription added.');
    }
    // Check for activity_logs specifically (added later)
    const logsExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_logs'").get();
    if (!logsExist) {
        console.log('🔧 Updating database: Adding activity_logs table...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ activity_logs table added.');
    }

    // Check for is_deleted in products (soft delete migration)
    const productCols = db.prepare("PRAGMA table_info(products)").all();
    const isDeletedExists = productCols.some(col => col.name === 'is_deleted');
    if (!isDeletedExists) {
        console.log('🔧 Updating database: Adding is_deleted to products...');
        db.exec("ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0;");
        console.log('✅ is_deleted column added.');
    }

    // Check for selling_price in products
    const sellingPriceExists = productCols.some(col => col.name === 'selling_price');
    if (!sellingPriceExists) {
        console.log('🔧 Updating database: Adding selling_price to products...');
        db.exec("ALTER TABLE products ADD COLUMN selling_price REAL NOT NULL DEFAULT 0;");
        console.log('✅ selling_price column added.');
    }

    // Check for expense_categories (new feature)
    const catTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'").get();
    if (!catTableExists) {
        console.log('🔧 Updating database: Adding expense_categories table...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS expense_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                emoji TEXT DEFAULT '📦',
                color_class TEXT DEFAULT 'bg-slate-700 text-slate-300',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
            );
        `);

        // Seed default categories
        const defaults = [
            ['Electricity', '⚡', 'bg-yellow-900/40 text-yellow-300'],
            ['Fuel', '⛽', 'bg-orange-900/40 text-orange-300'],
            ['Rent', '🏠', 'bg-blue-900/40 text-blue-300'],
            ['Salary', '👷', 'bg-purple-900/40 text-purple-300'],
            ['Other', '📦', 'bg-slate-700 text-slate-300']
        ];

        const insert = db.prepare('INSERT INTO expense_categories (shop_id, name, emoji, color_class) SELECT id, ?, ?, ? FROM shops');
        const transaction = db.transaction(() => {
            for (const [name, emoji, color] of defaults) {
                insert.run(name, emoji, color);
            }
        });
        transaction();
        console.log('✅ expense_categories table added and seeded.');
    }
}


module.exports = db;

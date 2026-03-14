const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'pos.db');
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
    console.log('✅ Database initialized.');
} else {
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
}


module.exports = db;

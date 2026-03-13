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
}


module.exports = db;

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'pos.sqlite');
const db = new Database(dbPath);

try {
  db.exec("ALTER TABLE return_items ADD COLUMN sale_item_id INTEGER REFERENCES sale_items(id);");
  console.log("Successfully added sale_item_id to return_items");
} catch (e) {
  if (e.message.includes("duplicate column name")) {
    console.log("Column already exists.");
  } else {
    console.error("Error migrating DB:", e);
  }
}

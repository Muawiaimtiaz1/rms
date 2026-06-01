const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { query } = require("./postgres");

async function initPostgres() {
  if (process.env.DB_CLIENT !== "postgres") return;

  try {
    // 1. Check if 'users' table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("🚀 PostgreSQL tables missing. Applying schema...");
      const schemaPath = path.join(__dirname, "postgres-schema.sql");
      const schema = fs.readFileSync(schemaPath, "utf8");
      
      // Execute schema
      await query(schema);
      console.log("✅ PostgreSQL schema applied successfully.");
    }

    // 2. Check if any user exists (to ensure we have an admin)
    const userCheck = await query("SELECT id FROM users LIMIT 1");
    if (userCheck.rows.length === 0) {
      console.log("🌱 No users found. Seeding initial superadmin...");
      const hash = bcrypt.hashSync("admin123", 10);
      
      // Create Global Owner (superadmin)
      await query(
        "INSERT INTO users (name, username, password_hash, role, shop_id, status) VALUES ($1, $2, $3, $4, $5, $6)",
        ["Global Owner", "owner", hash, "superadmin", null, "active"]
      );
      
      console.log("✅ Initial superadmin ('owner' / 'admin123') created.");
    }

    // 3. Robust Schema Updates (Add missing columns to existing tables)
    console.log("🛠 Checking for required schema updates...");
    
    // Check for updated_at in products
    const productUpdateCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'updated_at'
    `);
    if (productUpdateCheck.rows.length === 0) {
      console.log("🔧 Migrating products table: Adding updated_at column...");
      await query("ALTER TABLE products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()");
      console.log("✅ products.updated_at added.");
    }

    // Check for updated_at in users
    const userUpdateCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'updated_at'
    `);
    if (userUpdateCheck.rows.length === 0) {
      console.log("🔧 Migrating users table: Adding updated_at column...");
      await query("ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()");
      console.log("✅ users.updated_at added.");
    }

    // Check for printer_station in users for kitchen terminal routing
    const userPrinterStationCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'printer_station'
    `);
    if (userPrinterStationCheck.rows.length === 0) {
      console.log("🔧 Migrating users table: Adding printer_station column...");
      await query("ALTER TABLE users ADD COLUMN printer_station TEXT");
      console.log("✅ users.printer_station added.");
    }

    // Check for bill-printer routing columns in shops
    const shopPrinterColumns = [
      ["customer_bill_printer", "TEXT"],
      ["unpaid_bill_printer", "TEXT"]
    ];
    for (const [columnName, columnType] of shopPrinterColumns) {
      const columnCheck = await query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'shops' AND column_name = $1
      `, [columnName]);
      if (columnCheck.rows.length === 0) {
        console.log(`🔧 Migrating shops table: Adding ${columnName} column...`);
        await query(`ALTER TABLE shops ADD COLUMN ${columnName} ${columnType}`);
        console.log(`✅ shops.${columnName} added.`);
      }
    }

    // Check for updated_at in sales
    const salesUpdateCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'sales' AND column_name = 'updated_at'
    `);
    if (salesUpdateCheck.rows.length === 0) {
      console.log("🔧 Migrating sales table: Adding updated_at column...");
      await query("ALTER TABLE sales ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()");
      console.log("✅ sales.updated_at added.");
    }

    // Check for updated_at in expenses
    const expensesUpdateCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'expenses' AND column_name = 'updated_at'
    `);
    if (expensesUpdateCheck.rows.length === 0) {
      console.log("🔧 Migrating expenses table: Adding updated_at column...");
      await query("ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()");
      console.log("✅ expenses.updated_at added.");
    }

    // Check for discounts table
    const discountsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'discounts'
      );
    `);
    if (!discountsTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding discounts table...");
      await query(`
        CREATE TABLE IF NOT EXISTS discounts (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'percentage',
          value DOUBLE PRECISION NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log("✅ discounts table added.");
    }

    // Check for taxes table
    const taxesTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'taxes'
      );
    `);
    if (!taxesTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding taxes table...");
      await query(`
        CREATE TABLE IF NOT EXISTS taxes (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
          linked_payment_method TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log("✅ taxes table added.");
    }

    // Check for printer_station in product_categories
    const prodCatPrinterCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'product_categories' AND column_name = 'printer_station'
    `);
    if (prodCatPrinterCheck.rows.length === 0) {
      console.log("🔧 Migrating product_categories table: Adding printer_station column...");
      await query("ALTER TABLE product_categories ADD COLUMN printer_station TEXT");
      console.log("✅ product_categories.printer_station added.");
    }

    // Check for print_queue table
    const printQueueTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'print_queue'
      );
    `);
    if (!printQueueTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding print_queue table...");
      await query(`
        CREATE TABLE IF NOT EXISTS print_queue (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          station_name TEXT NOT NULL,
          content_json TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_print_queue_shop_id ON print_queue(shop_id);
        CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
      `);
      console.log("✅ print_queue table added.");
    }
    
    // Check printers table
    const printersTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'printers'
      );
    `);
    if (!printersTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding printers table...");
      await query(`
        CREATE TABLE IF NOT EXISTS printers (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          display_name TEXT NOT NULL,
          system_name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_printers_shop_id ON printers(shop_id);
      `);
      console.log("✅ printers table added.");
    }

  } catch (err) {
    console.error("❌ PostgreSQL Initialization Error:", err.message);
    // Don't crash the server, but log the error
  }
}

module.exports = { initPostgres };

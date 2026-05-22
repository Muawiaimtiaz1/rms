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

  } catch (err) {
    console.error("❌ PostgreSQL Initialization Error:", err.message);
    // Don't crash the server, but log the error
  }
}

module.exports = { initPostgres };

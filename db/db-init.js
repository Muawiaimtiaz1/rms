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
      ["unpaid_bill_printer", "TEXT"],
      ["logo_data", "TEXT"]
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
          attempts INTEGER DEFAULT 0,
          claimed_at TIMESTAMPTZ,
          printed_at TIMESTAMPTZ,
          last_error TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_print_queue_shop_id ON print_queue(shop_id);
        CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
        CREATE INDEX IF NOT EXISTS idx_print_queue_claimed_at ON print_queue(claimed_at);
      `);
      console.log("✅ print_queue table added.");
    }

    const printQueueColumns = [
      ["attempts", "INTEGER DEFAULT 0"],
      ["claimed_at", "TIMESTAMPTZ"],
      ["printed_at", "TIMESTAMPTZ"],
      ["last_error", "TEXT"],
      ["updated_at", "TIMESTAMPTZ DEFAULT NOW()"],
    ];
    for (const [columnName, columnType] of printQueueColumns) {
      const columnCheck = await query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'print_queue' AND column_name = $1
      `, [columnName]);
      if (columnCheck.rows.length === 0) {
        console.log(`🔧 Migrating print_queue table: Adding ${columnName} column...`);
        await query(`ALTER TABLE print_queue ADD COLUMN ${columnName} ${columnType}`);
        console.log(`✅ print_queue.${columnName} added.`);
      }
    }
    await query("UPDATE print_queue SET updated_at = COALESCE(updated_at, created_at, NOW())");
    await query("CREATE INDEX IF NOT EXISTS idx_print_queue_claimed_at ON print_queue(claimed_at)");
    
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
    
    // Check for shifts table
    const shiftsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'shifts'
      );
    `);
    if (!shiftsTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding shifts table...");
      await query(`
        CREATE TABLE IF NOT EXISTS shifts (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          end_time TIMESTAMPTZ,
          opening_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
          closing_balance DOUBLE PRECISION,
          expected_balance DOUBLE PRECISION,
          net_cash_sales DOUBLE PRECISION DEFAULT 0,
          net_card_sales DOUBLE PRECISION DEFAULT 0,
          total_expenses DOUBLE PRECISION DEFAULT 0,
          cash_drops DOUBLE PRECISION DEFAULT 0,
          cash_handovers DOUBLE PRECISION DEFAULT 0,
          status TEXT DEFAULT 'open',
          note TEXT,
          closed_by_user_id INTEGER REFERENCES users(id),
          terminal_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_shifts_shop_id ON shifts(shop_id);
      `);
      console.log("✅ shifts table added.");
    }

    // Check for cash_handovers table
    const handoversTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cash_handovers'
      );
    `);
    if (!handoversTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding cash_handovers table...");
      await query(`
        CREATE TABLE IF NOT EXISTS cash_handovers (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
          sender_id INTEGER NOT NULL REFERENCES users(id),
          receiver_id INTEGER NOT NULL REFERENCES users(id),
          amount DOUBLE PRECISION NOT NULL,
          status TEXT DEFAULT 'pending',
          note TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          verified_at TIMESTAMPTZ
        );
      `);
      console.log("✅ cash_handovers table added.");
    }

    // Check for cash_drops table
    const cashDropsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cash_drops'
      );
    `);
    if (!cashDropsTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding cash_drops table...");
      await query(`
        CREATE TABLE IF NOT EXISTS cash_drops (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
          requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
          amount DOUBLE PRECISION NOT NULL,
          status TEXT DEFAULT 'pending',
          note TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          verified_by_user_id INTEGER REFERENCES users(id),
          verified_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_cash_drops_shift_id ON cash_drops(shift_id);
        CREATE INDEX IF NOT EXISTS idx_cash_drops_status ON cash_drops(status);
      `);
      console.log("✅ cash_drops table added.");
    }

    const wasteEventsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'waste_events'
      );
    `);
    if (!wasteEventsTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding unified waste tables...");
      await query(`
        CREATE TABLE IF NOT EXISTS waste_events (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          waste_type TEXT NOT NULL,
          source_type TEXT NOT NULL,
          stock_action TEXT NOT NULL DEFAULT 'deduct',
          product_id INTEGER REFERENCES products(id),
          raw_stock_id INTEGER REFERENCES raw_stocks(id),
          recipe_id INTEGER REFERENCES recipes(id),
          sale_id INTEGER REFERENCES sales(id),
          return_id INTEGER REFERENCES returns(id),
          batch_id INTEGER,
          quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
          unit TEXT,
          reason_code TEXT,
          reason TEXT,
          cost_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          recovery_status TEXT NOT NULL DEFAULT 'full_loss',
          recoverable_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
          recovered_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'recorded',
          item_snapshot TEXT,
          approved_by_user_id INTEGER REFERENCES users(id),
          approved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS waste_event_items (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          waste_event_id INTEGER NOT NULL REFERENCES waste_events(id) ON DELETE CASCADE,
          item_type TEXT NOT NULL,
          product_id INTEGER REFERENCES products(id),
          raw_stock_id INTEGER REFERENCES raw_stocks(id),
          batch_id INTEGER,
          quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
          unit TEXT,
          cost_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_waste_events_shop_id ON waste_events(shop_id);
        CREATE INDEX IF NOT EXISTS idx_waste_events_created_at ON waste_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_waste_event_items_event_id ON waste_event_items(waste_event_id);
      `);
      console.log("✅ unified waste tables added.");
    }

    const appendWastePanelAccess = async (tableName) => {
      if (!['shops', 'users'].includes(tableName)) return 0;
      const rows = await query(`SELECT id, allowed_panels FROM ${tableName} WHERE allowed_panels IS NOT NULL`);
      let updated = 0;

      for (const row of rows.rows) {
        let panels = [];
        try {
          panels = JSON.parse(row.allowed_panels || '[]');
        } catch {
          panels = [];
        }

        if (Array.isArray(panels) && panels.includes('raw-stock') && !panels.includes('waste-management')) {
          panels.push('waste-management');
          await query(`UPDATE ${tableName} SET allowed_panels = $1 WHERE id = $2`, [JSON.stringify(panels), row.id]);
          updated += 1;
        }
      }

      return updated;
    };

    const shopWastePanelUpdates = await appendWastePanelAccess('shops');
    const userWastePanelUpdates = await appendWastePanelAccess('users');
    if (shopWastePanelUpdates || userWastePanelUpdates) {
      console.log(`✅ waste-management panel access added to ${shopWastePanelUpdates} shops and ${userWastePanelUpdates} users.`);
    }

    await query(`
      INSERT INTO cash_drops (shop_id, shift_id, requested_by_user_id, amount, status, note, created_at)
      SELECT s.shop_id, s.id, s.user_id, s.cash_drops, 'pending',
             'Imported from previous cash drop total before verification was enabled.',
             NOW()
      FROM shifts s
      WHERE s.status = 'open'
        AND COALESCE(s.cash_drops, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM cash_drops cd WHERE cd.shift_id = s.id);

      UPDATE shifts s
      SET cash_drops = 0,
          note = COALESCE(s.note, '') || E'\n[Legacy cash drops moved to pending verification]'
      WHERE s.status = 'open'
        AND COALESCE(s.cash_drops, 0) > 0
        AND EXISTS (
          SELECT 1 FROM cash_drops cd
          WHERE cd.shift_id = s.id
            AND cd.status = 'pending'
            AND cd.note = 'Imported from previous cash drop total before verification was enabled.'
        );

      INSERT INTO cash_drops (shop_id, shift_id, requested_by_user_id, amount, status, note, created_at, verified_by_user_id, verified_at)
      SELECT s.shop_id, s.id, s.user_id, s.cash_drops, 'verified',
             'Imported from previous closed-shift cash drop total.',
             COALESCE(s.end_time, s.start_time, NOW()),
             s.closed_by_user_id,
             COALESCE(s.end_time, NOW())
      FROM shifts s
      WHERE s.status = 'closed'
        AND COALESCE(s.cash_drops, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM cash_drops cd WHERE cd.shift_id = s.id);
    `);

    // Add shift_id to various tables
    const tablesToUpdate = ['sales', 'expenses', 'returns', 'customer_ledger'];
    for (const tableName of tablesToUpdate) {
      const columnCheck = await query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'shift_id'
      `, [tableName]);
      if (columnCheck.rows.length === 0) {
        console.log(`🔧 Migrating ${tableName} table: Adding shift_id column...`);
        await query(`ALTER TABLE ${tableName} ADD COLUMN shift_id INTEGER`);
        console.log(`✅ ${tableName}.shift_id added.`);
      }
    }

    // Add can_manage_register to users
    const userRegCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'can_manage_register'
    `);
    if (userRegCheck.rows.length === 0) {
      console.log("🔧 Migrating users table: Adding can_manage_register column...");
      await query("ALTER TABLE users ADD COLUMN can_manage_register BOOLEAN DEFAULT FALSE");
      console.log("✅ users.can_manage_register added.");
    }
    
    // Check for activity_logs table
    const activityLogsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      );
    `);
    if (!activityLogsTableCheck.rows[0].exists) {
      console.log("🔧 Migrating database: Adding activity_logs table...");
      await query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id SERIAL PRIMARY KEY,
          shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          details TEXT,
          reference_id INTEGER,
          reference_type TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_id ON activity_logs(shop_id);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_reference ON activity_logs(reference_id, reference_type);
      `);
      console.log("✅ activity_logs table added.");
    } else {
      // Check for user_id in activity_logs
      const activityLogUserCheck = await query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'activity_logs' AND column_name = 'user_id'
      `);
      if (activityLogUserCheck.rows.length === 0) {
        console.log("🔧 Migrating activity_logs table: Adding user_id column...");
        await query("ALTER TABLE activity_logs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
        await query("CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)");
        console.log("✅ activity_logs.user_id added.");
      }
      
      const referenceIdCheck = await query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'activity_logs' AND column_name = 'reference_id'
      `);
      if (referenceIdCheck.rows.length === 0) {
        console.log("🔧 Migrating activity_logs table: Adding reference columns...");
        await query("ALTER TABLE activity_logs ADD COLUMN reference_id INTEGER");
        await query("ALTER TABLE activity_logs ADD COLUMN reference_type TEXT");
        await query("CREATE INDEX IF NOT EXISTS idx_activity_logs_reference ON activity_logs(reference_id, reference_type)");
        console.log("✅ activity_logs reference columns added.");
      }
    }

    // Check for shortage_reason in shifts
    const shiftShortageCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'shifts' AND column_name = 'shortage_reason'
    `);
    if (shiftShortageCheck.rows.length === 0) {
      console.log("🔧 Migrating shifts table: Adding shortage_reason column...");
      await query("ALTER TABLE shifts ADD COLUMN shortage_reason TEXT");
      console.log("✅ shifts.shortage_reason added.");
    }

  } catch (err) {
    console.error("❌ PostgreSQL Initialization Error:", err.message);
    // Don't crash the server, but log the error
  }
}

module.exports = { initPostgres };

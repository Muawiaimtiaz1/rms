const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

// Local database directory
const dbDir = __dirname;

const DB_PATH = path.join(dbDir, "pos.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

const db = new Database(DB_PATH);

// Enable WAL mode and production performance PRAGMAs
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("journal_size_limit = 6144000"); // 6MB limit for WAL
db.pragma("cache_size = -64000"); // 64MB cache
db.pragma("temp_store = memory"); // In-memory temp tables
db.pragma("mmap_size = 30000000000"); // ~30GB mmap
db.pragma("foreign_keys = ON");

// --- START MIGRATIONS ---
try {
  // Fix for multi-batch returns
  db.exec("ALTER TABLE return_items ADD COLUMN sale_item_id INTEGER REFERENCES sale_items(id);");
  console.log("✅ DB Migration Applied: added sale_item_id to return_items");
} catch (e) {
  // ignore if already exists
}

try {
  db.exec("ALTER TABLE raw_stocks ADD COLUMN conversion_factor REAL DEFAULT 1;");
  console.log("✅ DB Migration Applied: added conversion_factor to raw_stocks");
} catch (e) {}

try {
  db.exec("ALTER TABLE raw_stocks ADD COLUMN usage_unit TEXT;");
  console.log("✅ DB Migration Applied: added usage_unit to raw_stocks");
} catch (e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS floors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    );
  `);
  console.log("✅ DB Migration Applied: created floors table");
} catch (e) {
  console.error("❌ Error creating floors table:", e.message);
}

try {
  db.exec("ALTER TABLE tables ADD COLUMN floor_id INTEGER REFERENCES floors(id);");
  console.log("✅ DB Migration Applied: added floor_id to tables");
} catch (e) {}
try {
  db.exec("ALTER TABLE sales ADD COLUMN kitchen_id INTEGER REFERENCES users(id);");
  console.log("✅ DB Migration Applied: added kitchen_id to sales");
} catch (e) {}
// --- END MIGRATIONS ---

// Initialize tables from schema only if they don't exist
const tableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shops'")
  .get();
if (!tableExists) {
  console.log("🌱 Initializing fresh database...");
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  // Auto-seed default shop, admin, and subscription
  db.transaction(() => {
    const hash = bcrypt.hashSync("admin123", 10);
    const panels = JSON.stringify([
      "dashboard",
      "brands",
      "products",
      "pos",
      "sales-history",
      "expenses",
      "customers",
      "notifications",
      "composite_products",
    ]);
    const longTermDate = "2099-12-31";

    // 1. Create default shop
    const shopId = db
      .prepare("INSERT INTO shops (name, allowed_panels) VALUES (?, ?)")
      .run("Default Shop", panels).lastInsertRowid;

    // 2. Create Super Admin (Bypasses all checks)
    db.prepare(
      "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
    ).run("Global Owner", "owner", hash, "superadmin", null);

    // 3. Create default shop Admin
    db.prepare(
      "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
    ).run("Administrator", "admin", hash, "admin", shopId);

    // 4. Create Active Subscription (Necessary for 'admin' role login)
    db.prepare(
      "INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(shopId, 0, "1_year", "2024-01-01", longTermDate, "2024-01");
  })();

  console.log("✅ Database initialized with:");
  console.log("   - SuperAdmin: owner / admin123");
  console.log("   - ShopAdmin:  admin / admin123");
} else {
  // Migration check: Ensure 'owner' account and lifetime subscription exist
  const ownerExists = db
    .prepare("SELECT id FROM users WHERE username = 'owner'")
    .get();
  if (!ownerExists) {
    console.log(
      '🔧 SuperAdmin missing. Seeding "owner" and lifetime subscription...',
    );
    db.transaction(() => {
      const hash = bcrypt.hashSync("admin123", 10);
      const panels = JSON.stringify([
        "dashboard",
        "brands",
        "products",
        "pos",
        "sales-history",
        "expenses",
        "customers",
        "notifications",
        "composite_products",
      ]);
      const longTermDate = "2099-12-31";

      let shopId = db.prepare("SELECT id FROM shops LIMIT 1").get()?.id;
      if (!shopId) {
        shopId = db
          .prepare("INSERT INTO shops (name, allowed_panels) VALUES (?, ?)")
          .run("Default Shop", panels).lastInsertRowid;
      }

      // Add Super Admin
      db.prepare(
        "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
      ).run("Global Owner", "owner", hash, "superadmin", null);

      // Add Lifetime Subscription for the default shop (so 'admin' works too)
      db.prepare(
        "INSERT INTO subscriptions (shop_id, amount, type, start_date, end_date, month) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(shopId, 0, "1_year", "2024-01-01", longTermDate, "2024-01");
    })();
    console.log('✅ SuperAdmin ("owner") and Subscription added.');
  }
  // Check for activity_logs specifically (added later)
  const logsExist = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='activity_logs'",
    )
    .get();
  if (!logsExist) {
    console.log("🔧 Updating database: Adding activity_logs table...");
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
    console.log("✅ activity_logs table added.");
  }

  // Activity Logs: add user_id, reference_id, reference_type columns
  const activityLogCols = db.prepare("PRAGMA table_info(activity_logs)").all();
  if (!activityLogCols.some((col) => col.name === "user_id")) {
    console.log("🔧 Updating database: Adding user_id to activity_logs...");
    db.exec("ALTER TABLE activity_logs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  }
  if (!activityLogCols.some((col) => col.name === "reference_id")) {
    console.log("🔧 Updating database: Adding reference_id to activity_logs...");
    db.exec("ALTER TABLE activity_logs ADD COLUMN reference_id INTEGER;");
  }
  if (!activityLogCols.some((col) => col.name === "reference_type")) {
    console.log("🔧 Updating database: Adding reference_type to activity_logs...");
    db.exec("ALTER TABLE activity_logs ADD COLUMN reference_type TEXT;");
  }

  // Shops: add shortage_reason, logo_data columns
  const shiftColsShortage = db.prepare("PRAGMA table_info(shifts)").all();
  if (shiftColsShortage.length > 0 && !shiftColsShortage.some((col) => col.name === "shortage_reason")) {
    console.log("🔧 Updating database: Adding shortage_reason to shifts...");
    db.exec("ALTER TABLE shifts ADD COLUMN shortage_reason TEXT;");
  }

  const shopColsLogo = db.prepare("PRAGMA table_info(shops)").all();
  if (shopColsLogo.length > 0 && !shopColsLogo.some((col) => col.name === "logo_data")) {
    console.log("🔧 Updating database: Adding logo_data to shops...");
    db.exec("ALTER TABLE shops ADD COLUMN logo_data TEXT;"); // Using TEXT to store Base64/Compressed string
  }

  // Check for is_deleted in products (soft delete migration)
  const productCols = db.prepare("PRAGMA table_info(products)").all();
  const isDeletedExists = productCols.some((col) => col.name === "is_deleted");
  if (!isDeletedExists) {
    console.log("🔧 Updating database: Adding is_deleted to products...");
    db.exec("ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0;");
    console.log("✅ is_deleted column added.");
  }

  // Check for selling_price in products
  const sellingPriceExists = productCols.some(
    (col) => col.name === "selling_price",
  );
  if (!sellingPriceExists) {
    console.log("🔧 Updating database: Adding selling_price to products...");
    db.exec(
      "ALTER TABLE products ADD COLUMN selling_price REAL NOT NULL DEFAULT 0;",
    );
    console.log("✅ selling_price column added.");
  }

  // Check for expense_categories (new feature)
  const catTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'",
    )
    .get();
  if (!catTableExists) {
    console.log("🔧 Updating database: Adding expense_categories table...");
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
      ["Electricity", "⚡", "bg-yellow-900/40 text-yellow-300"],
      ["Fuel", "⛽", "bg-orange-900/40 text-orange-300"],
      ["Rent", "🏠", "bg-blue-900/40 text-blue-300"],
      ["Salary", "👷", "bg-purple-900/40 text-purple-300"],
      ["Other", "📦", "bg-slate-700 text-slate-300"],
    ];

    const insert = db.prepare(
      "INSERT INTO expense_categories (shop_id, name, emoji, color_class) SELECT id, ?, ?, ? FROM shops",
    );
    const transaction = db.transaction(() => {
      for (const [name, emoji, color] of defaults) {
        insert.run(name, emoji, color);
      }
    });
    transaction();
    console.log("✅ expense_categories table added and seeded.");
  }

  // Check for product_categories (new feature)
  const prodCatTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='product_categories'",
    )
    .get();
  if (!prodCatTableExists) {
    console.log("🔧 Updating database: Adding product_categories table...");
    db.exec(`
            CREATE TABLE IF NOT EXISTS product_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                printer_station TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
            );
        `);

    // Migration: Seed from existing products
    console.log("🔧 Migrating existing product categories...");
    db.exec(`
            INSERT INTO product_categories (shop_id, name)
            SELECT DISTINCT shop_id, category FROM products
            WHERE category IS NOT NULL AND category != ''
        `);

    // Also add defaults for any shop that may not have products yet
    const defaults = ["General", "Electronics", "Groceries", "Services"];
    const insert = db.prepare(
      "INSERT INTO product_categories (shop_id, name) SELECT id, ? FROM shops WHERE id NOT IN (SELECT DISTINCT shop_id FROM product_categories WHERE name = ?)",
    );
    const transaction = db.transaction(() => {
      for (const name of defaults) {
        insert.run(name, name);
      }
    });
    transaction();
    console.log("✅ product_categories table added and migrated.");
  }

  try {
    const prodCatCols = db.prepare("PRAGMA table_info(product_categories)").all();
    if (!prodCatCols.some((col) => col.name === "printer_station")) {
      console.log("🔧 Updating database: Adding printer_station to product_categories...");
      db.exec("ALTER TABLE product_categories ADD COLUMN printer_station TEXT;");
      console.log("✅ product_categories.printer_station column added.");
    }
  } catch (e) {
    console.error("Failed to check product category printer_station column:", e.message);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS print_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL,
        station_name TEXT NOT NULL,
        content_json TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        claimed_at TEXT,
        printed_at TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_print_queue_shop_id ON print_queue(shop_id);
      CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
      CREATE INDEX IF NOT EXISTS idx_print_queue_claimed_at ON print_queue(claimed_at);

      CREATE TABLE IF NOT EXISTS printers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        system_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_printers_shop_id ON printers(shop_id);
    `);
  } catch (e) {
    console.error("Failed to ensure print queue/printers tables:", e.message);
  }

  try {
    const printQueueCols = db.prepare("PRAGMA table_info(print_queue)").all();
    const printQueueColumns = [
      { name: "attempts", type: "INTEGER DEFAULT 0" },
      { name: "claimed_at", type: "TEXT" },
      { name: "printed_at", type: "TEXT" },
      { name: "last_error", type: "TEXT" },
      { name: "updated_at", type: "TEXT" },
    ];

    printQueueColumns.forEach((col) => {
      if (!printQueueCols.some((c) => c.name === col.name)) {
        console.log(`🔧 Updating database: Adding ${col.name} to print_queue...`);
        db.exec(`ALTER TABLE print_queue ADD COLUMN ${col.name} ${col.type};`);
        console.log(`✅ print_queue.${col.name} column added.`);
      }
    });
    db.exec("UPDATE print_queue SET updated_at = COALESCE(updated_at, created_at, datetime('now'));");
    db.exec("CREATE INDEX IF NOT EXISTS idx_print_queue_claimed_at ON print_queue(claimed_at);");
  } catch (e) {
    console.error("Failed to check print queue retry columns:", e.message);
  }

  // Migration for Products table (is_component flag)
  const productColsIsComponent = db
    .prepare("PRAGMA table_info(products)")
    .all();
  if (!productColsIsComponent.some((col) => col.name === "is_component")) {
    console.log(
      "🔧 Updating database: Adding is_component flag to products...",
    );
    db.exec("ALTER TABLE products ADD COLUMN is_component INTEGER DEFAULT 0;");
    // Auto-flag existing components
    db.exec(`
            UPDATE products SET is_component = 1
            WHERE id IN (SELECT DISTINCT component_product_id FROM product_compositions WHERE component_product_id IS NOT NULL)
        `);
    console.log("✅ products table updated with is_component flag.");
  }

  // Check for product_compositions (new feature)
  const compTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='product_compositions'",
    )
    .get();
  if (!compTableExists) {
    console.log("🔧 Updating database: Adding product_compositions table...");
    // Re-creating table to allow NULL component_product_id and add custom_name
    console.log(
      "🔧 Updating database: Adding custom_name and fixing constraints...",
    );
    db.exec(`
            CREATE TABLE IF NOT EXISTS product_compositions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_product_id INTEGER NOT NULL,
                component_product_id INTEGER,
                custom_name TEXT,
                quantity INTEGER NOT NULL DEFAULT 1,
                price REAL,
                FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE
            );
        `);
    // Check if old table has data to migrate
    const oldData = db.prepare("SELECT * FROM product_compositions").all();
    if (oldData.length > 0) {
      const insert = db.prepare(
        "INSERT INTO product_compositions_new (id, parent_product_id, component_product_id, quantity, price) VALUES (?, ?, ?, ?, ?)",
      );
      oldData.forEach((row) =>
        insert.run(
          row.id,
          row.parent_product_id,
          row.component_product_id,
          row.quantity,
          row.price,
        ),
      );
    }
    db.exec("DROP TABLE product_compositions;");
    db.exec(
      "ALTER TABLE product_compositions_new RENAME TO product_compositions;",
    );
    console.log("✅ product_compositions table updated.");
  } else {
    // Migration to fix product_compositions constraints
    const compCols = db
      .prepare("PRAGMA table_info(product_compositions)")
      .all();
    const customNameExists = compCols.some((col) => col.name === "custom_name");
    const compIdCol = compCols.find(
      (col) => col.name === "component_product_id",
    );
    const isNotNull = compIdCol && compIdCol.notnull === 1;

    if (!customNameExists || isNotNull) {
      console.log(
        "🔧 Updating database: Modernizing product_compositions constraints...",
      );
      const oldData = db.prepare("SELECT * FROM product_compositions").all();
      db.exec("DROP TABLE product_compositions;");
      db.exec(`
                CREATE TABLE IF NOT EXISTS product_compositions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_product_id INTEGER NOT NULL,
                    component_product_id INTEGER,
                    custom_name TEXT,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    price REAL,
                    cost REAL,
                    FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
                    FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE
                );
            `);
      if (oldData.length > 0) {
        const insert = db.prepare(
          "INSERT INTO product_compositions (id, parent_product_id, component_product_id, custom_name, quantity, price, cost) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        oldData.forEach((row) =>
          insert.run(
            row.id,
            row.parent_product_id,
            row.component_product_id,
            row.custom_name || "",
            row.quantity,
            row.price,
            row.cost || 0,
          ),
        );
      }
      console.log("✅ product_compositions modernized.");
    }

    // Add 'cost' column if missing in product_compositions
    const compColsNew = db
      .prepare("PRAGMA table_info(product_compositions)")
      .all();
    if (!compColsNew.some((col) => col.name === "cost")) {
      console.log(
        "🔧 Updating database: Adding cost to product_compositions...",
      );
      db.exec(
        "ALTER TABLE product_compositions ADD COLUMN cost REAL DEFAULT 0;",
      );
      console.log("✅ cost column added to product_compositions.");
    }

    // NEW: Migration for sale_items to support manual entries
    const saleItemCols = db.prepare("PRAGMA table_info(sale_items)").all();
    const saleItemCustomExists = saleItemCols.some(
      (col) => col.name === "custom_name",
    );
    const saleItemProdIdCol = saleItemCols.find(
      (col) => col.name === "product_id",
    );
    const saleItemProdIdIsNotNull =
      saleItemProdIdCol && saleItemProdIdCol.notnull === 1;

    if (
      !saleItemCustomExists ||
      saleItemProdIdIsNotNull ||
      !saleItemCols.some((col) => col.name === "parent_id")
    ) {
      console.log(
        "🔧 Updating database: Modernizing sale_items for manual entries and parent linking...",
      );
      const oldSaleItems = db.prepare("SELECT * FROM sale_items").all();
      db.exec("DROP TABLE sale_items;");
      db.exec(`
                CREATE TABLE IF NOT EXISTS sale_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sale_id INTEGER NOT NULL,
                    product_id INTEGER,
                    parent_id INTEGER,
                    custom_name TEXT,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    price_at_sale REAL NOT NULL DEFAULT 0,
                    buying_price_at_sale REAL NOT NULL DEFAULT 0,
                    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (parent_id) REFERENCES products(id)
                );
            `);
      if (oldSaleItems.length > 0) {
        const insert = db.prepare(
          "INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?)",
        );
        oldSaleItems.forEach((row) =>
          insert.run(
            row.id,
            row.sale_id,
            row.product_id,
            row.quantity,
            row.price_at_sale,
          ),
        );
      }
      console.log("✅ sale_items modernized.");
    }

    const saleItemCols2 = db.prepare("PRAGMA table_info(sale_items)").all();
    if (!saleItemCols2.some((col) => col.name === "buying_price_at_sale")) {
      console.log(
        "🔧 Updating database: Adding buying_price_at_sale to sale_items...",
      );
      db.exec(
        "ALTER TABLE sale_items ADD COLUMN buying_price_at_sale REAL NOT NULL DEFAULT 0;",
      );
      console.log("✅ buying_price_at_sale column added to sale_items.");
    }

    const returnItemCols = db.prepare("PRAGMA table_info(return_items)").all();
    if (returnItemCols.length > 0 && !returnItemCols.some((col) => col.name === "buying_price_at_sale")) {
      console.log(
        "🔧 Updating database: Adding buying_price_at_sale to return_items...",
      );
      db.exec(
        "ALTER TABLE return_items ADD COLUMN buying_price_at_sale REAL NOT NULL DEFAULT 0;",
      );
      console.log("✅ buying_price_at_sale column added to return_items.");
    }

    const returnItemColsDamage = db.prepare("PRAGMA table_info(return_items)").all();
    if (returnItemColsDamage.length > 0 && !returnItemColsDamage.some((col) => col.name === "is_damage")) {
        console.log("🔧 Updating database: Adding is_damage to return_items...");
        db.exec("ALTER TABLE return_items ADD COLUMN is_damage INTEGER NOT NULL DEFAULT 0;");
        console.log("✅ is_damage column added to return_items.");
    }

    // Migration: add damage_stock to products
    const productColsDamage = db.prepare("PRAGMA table_info(products)").all();
    if (!productColsDamage.some((col) => col.name === "damage_stock")) {
      console.log("🔧 Updating database: Adding damage_stock to products...");
      db.exec("ALTER TABLE products ADD COLUMN damage_stock INTEGER DEFAULT 0;");
      console.log("✅ damage_stock column added to products.");
    }

    if (!productColsDamage.some((col) => col.name === "recovered_damage_amount")) {
      console.log("🔧 Updating database: Adding recovered_damage_amount to products...");
      db.exec("ALTER TABLE products ADD COLUMN recovered_damage_amount REAL DEFAULT 0;");
      console.log("✅ recovered_damage_amount column added to products.");
    }

    if (!productColsDamage.some((col) => col.name === "manual_damage_loss")) {
      console.log("🔧 Updating database: Adding manual_damage_loss to products...");
      db.exec("ALTER TABLE products ADD COLUMN manual_damage_loss REAL DEFAULT 0;");
      console.log("✅ manual_damage_loss column added to products.");
    }

    if (!productColsDamage.some((col) => col.name === "recovered_damage_quantity")) {
      console.log("🔧 Updating database: Adding recovered_damage_quantity to products...");
      db.exec("ALTER TABLE products ADD COLUMN recovered_damage_quantity INTEGER DEFAULT 0;");
      console.log("✅ recovered_damage_quantity column added to products.");
    }

    // Migration: Create product_batches table if missing
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        shop_id INTEGER NOT NULL,
        buying_price REAL NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      );
    `);

    // Migration: Move existing stock into initial batches
    const batchCount = db.prepare("SELECT COUNT(*) as count FROM product_batches").get().count;
    if (batchCount === 0) {
      console.log("🔧 Migrating existing stock to product_batches...");
      db.transaction(() => {
        db.prepare(`
          INSERT INTO product_batches (product_id, shop_id, buying_price, quantity)
          SELECT id, shop_id, buying_price, stock FROM products WHERE stock > 0 AND is_deleted = 0
        `).run();
      })();
      console.log("✅ Stock migration completed.");
    }

    // Migration: add batch_id to sale_items
    const saleItemColsBatch = db.prepare("PRAGMA table_info(sale_items)").all();
    if (!saleItemColsBatch.some((col) => col.name === "batch_id")) {
      console.log("🔧 Updating database: Adding batch_id to sale_items...");
      db.exec("ALTER TABLE sale_items ADD COLUMN batch_id INTEGER;");
      console.log("✅ batch_id column added to sale_items.");
    }

    // Migration: add damaged_quantity to product_batches
    const productBatchCols = db.prepare("PRAGMA table_info(product_batches)").all();
    if (!productBatchCols.some((col) => col.name === "damaged_quantity")) {
      console.log("🔧 Updating database: Adding damaged_quantity to product_batches...");
      db.exec("ALTER TABLE product_batches ADD COLUMN damaged_quantity INTEGER DEFAULT 0;");
      console.log("✅ damaged_quantity column added to product_batches.");
    }
  }

  // Check for returns and return_items (New Feature)
  const returnsExist = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='returns'",
    )
    .get();
  if (!returnsExist) {
    console.log(
      "🔧 Updating database: Adding returns and return_items tables...",
    );
    db.exec(`
            CREATE TABLE IF NOT EXISTS returns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                sale_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                total_refund REAL NOT NULL DEFAULT 0,
                reason TEXT,
                payment_method TEXT NOT NULL DEFAULT 'cash',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS return_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                return_id INTEGER NOT NULL,
                product_id INTEGER,
                quantity INTEGER NOT NULL DEFAULT 1,
                refund_price REAL NOT NULL DEFAULT 0,
                buying_price_at_sale REAL NOT NULL DEFAULT 0,
                is_damage INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
        `);
    console.log("✅ Returns tables added.");
  } else {
    // Migration: Ensure returns has payment_method column
    const returnsCols = db.prepare("PRAGMA table_info(returns)").all();
    if (!returnsCols.some((col) => col.name === "payment_method")) {
      console.log("🔧 Updating database: Adding payment_method to returns...");
      db.exec(
        "ALTER TABLE returns ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';",
      );
      console.log("✅ payment_method column added to returns.");
    }

    // Migration: add customers table
    const customersTableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='customers'",
      )
      .get();
    if (!customersTableExists) {
      console.log(
        "🔧 Updating database: Adding customers and customer_ledger tables...",
      );
      db.exec(`
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                address TEXT,
                notes TEXT,
                credit_limit REAL DEFAULT 0,
                current_balance REAL DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS customer_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                shop_id INTEGER NOT NULL,
                sale_id INTEGER,
                type TEXT NOT NULL DEFAULT 'sale',
                amount REAL NOT NULL DEFAULT 0,
                balance_after REAL NOT NULL DEFAULT 0,
                note TEXT,
                created_by INTEGER,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
                FOREIGN KEY (sale_id) REFERENCES sales(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            );
        `);
      console.log("✅ customers and customer_ledger tables added.");
    }

    // Migration: add customer_id to sales
    const salesColsCheck = db.prepare("PRAGMA table_info(sales)").all();
    if (!salesColsCheck.some((col) => col.name === "customer_id")) {
      console.log("🔧 Updating database: Adding customer_id to sales...");
      db.exec(
        "ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id);",
      );
      console.log("✅ customer_id column added to sales.");
    }

    // Migration: enable newer shop panels for existing shops and admins
    try {
      const requiredPanels = ["customers", "notifications"];
      const existingShops = db
        .prepare("SELECT id, allowed_panels FROM shops")
        .all();

      const updateShopPanels = db.prepare(
        "UPDATE shops SET allowed_panels = ? WHERE id = ?",
      );

      existingShops.forEach((shop) => {
        let panels = [];
        try {
          panels = shop.allowed_panels ? JSON.parse(shop.allowed_panels) : [];
        } catch (e) {
          panels = [];
        }

        const beforeLength = panels.length;
        requiredPanels.forEach((panelId) => {
          if (!panels.includes(panelId)) panels.push(panelId);
        });
        if (panels.length !== beforeLength) {
          updateShopPanels.run(JSON.stringify(panels), shop.id);
        }
      });

      const adminUsers = db
        .prepare("SELECT id, allowed_panels FROM users WHERE role = 'admin'")
        .all();

      const updateUserPanels = db.prepare(
        "UPDATE users SET allowed_panels = ? WHERE id = ?",
      );

      adminUsers.forEach((user) => {
        let panels = [];
        try {
          panels = user.allowed_panels ? JSON.parse(user.allowed_panels) : [];
        } catch (e) {
          panels = [];
        }

        const beforeLength = panels.length;
        requiredPanels.forEach((panelId) => {
          if (!panels.includes(panelId)) panels.push(panelId);
        });
        if (panels.length !== beforeLength) {
          updateUserPanels.run(JSON.stringify(panels), user.id);
        }
      });
    } catch (e) {
      console.error("Failed to enable newer panels for existing data:", e);
    }

    // Migration: Add receipt settings columns to shops
    const shopCols = db.prepare("PRAGMA table_info(shops)").all();
    const receiptColumns = [
      { name: "logo_path", type: "TEXT" },
      { name: "receipt_header_text", type: "TEXT" },
      { name: "receipt_extended_name", type: "TEXT" },
      { name: "receipt_phone", type: "TEXT" },
      { name: "receipt_address", type: "TEXT" },
      { name: "receipt_images_json", type: "TEXT" },
      { name: "receipt_policies", type: "TEXT" },
      { name: "use_logo_on_receipt", type: "INTEGER DEFAULT 1" },
      { name: "receipt_font_family", type: "TEXT DEFAULT 'monospace'" },
      // Typography settings
      { name: "header_font_size", type: "INTEGER DEFAULT 18" },
      { name: "header_font_weight", type: "TEXT DEFAULT 'bold'" },
      { name: "header_spacing", type: "INTEGER DEFAULT 10" },
      { name: "extended_name_font_size", type: "INTEGER DEFAULT 10" },
      { name: "extended_name_font_weight", type: "TEXT DEFAULT 'normal'" },
      { name: "extended_name_spacing", type: "INTEGER DEFAULT 2" },
      { name: "contact_font_size", type: "INTEGER DEFAULT 10" },
      { name: "contact_align", type: "TEXT DEFAULT 'center'" },
      { name: "contact_padding", type: "INTEGER DEFAULT 10" },
      { name: "footer_font_size", type: "INTEGER DEFAULT 9" },
      { name: "footer_font_style", type: "TEXT DEFAULT 'normal'" },
      { name: "footer_margin", type: "INTEGER DEFAULT 10" },
      { name: "divider_style", type: "TEXT DEFAULT 'dashed'" },
      { name: "divider_width", type: "INTEGER DEFAULT 1" },
      { name: "section_gap", type: "INTEGER DEFAULT 10" },
      { name: "auto_calculate_damage_to_loss", type: "INTEGER DEFAULT 1" },
      { name: "customer_bill_printer", type: "TEXT" },
      { name: "unpaid_bill_printer", type: "TEXT" },
      { name: "user_count", type: "INTEGER DEFAULT 0" },
      { name: "product_count", type: "INTEGER DEFAULT 0" },
    ];

    receiptColumns.forEach((col) => {
      if (!shopCols.some((c) => c.name === col.name)) {
        console.log(`🔧 Updating database: Adding ${col.name} to shops...`);
        db.exec(`ALTER TABLE shops ADD COLUMN ${col.name} ${col.type};`);
        console.log(`✅ ${col.name} column added to shops.`);
      }
    });
    db.exec(`
      UPDATE shops
      SET
        user_count = COALESCE((SELECT COUNT(*) FROM users u WHERE u.shop_id = shops.id AND u.role != 'superadmin'), 0),
        product_count = COALESCE((SELECT COUNT(*) FROM products p WHERE p.shop_id = shops.id AND COALESCE(p.is_deleted, 0) = 0), 0);
    `);

    if (!shopCols.some((c) => c.name === "shop_type")) {
      console.log("🔧 Updating database: Adding shop_type to shops...");
      db.exec("ALTER TABLE shops ADD COLUMN shop_type TEXT DEFAULT 'retail';");
      console.log("✅ shop_type column added to shops.");
    }

    // Migration: Add kitchen printer assignment to users
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    if (!userCols.some((col) => col.name === "printer_station")) {
      console.log("🔧 Updating database: Adding printer_station to users...");
      db.exec("ALTER TABLE users ADD COLUMN printer_station TEXT;");
      console.log("✅ users.printer_station column added.");
    }

    // Migration: add user_id to brand_expense_payments
    const bepCols = db.prepare("PRAGMA table_info(brand_expense_payments)").all();
    if (!bepCols.some((col) => col.name === "user_id")) {
      console.log("🔧 Updating database: Adding user_id to brand_expense_payments...");
      db.exec("ALTER TABLE brand_expense_payments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
      console.log("✅ user_id column added to brand_expense_payments.");
    }
    // Migration: Restaurant Management System Columns
    const salesRestCols = db.prepare("PRAGMA table_info(sales)").all();
    if (!salesRestCols.some((col) => col.name === "order_type")) {
      console.log("🔧 Updating database: Adding Restaurant POS columns to sales...");
      db.exec(`
        ALTER TABLE sales ADD COLUMN delivery_address TEXT DEFAULT '';
        ALTER TABLE sales ADD COLUMN order_type TEXT DEFAULT 'dine_in';
        ALTER TABLE sales ADD COLUMN order_status TEXT DEFAULT 'pending';
        ALTER TABLE sales ADD COLUMN table_id INTEGER REFERENCES tables(id);
        ALTER TABLE sales ADD COLUMN waiter_id INTEGER REFERENCES users(id);
        ALTER TABLE sales ADD COLUMN rider_id INTEGER REFERENCES users(id);
        ALTER TABLE sales ADD COLUMN guest_count INTEGER DEFAULT 1;
        ALTER TABLE sales ADD COLUMN token_number TEXT;
        ALTER TABLE sales ADD COLUMN special_instructions TEXT;
      `);
      console.log("✅ Restaurant columns added to sales.");
    }

    const salesColsCheckNotes = db.prepare("PRAGMA table_info(sales)").all();
    if (!salesColsCheckNotes.some((col) => col.name === "special_instructions")) {
      console.log("🔧 Updating database: Adding special_instructions to sales...");
      db.exec("ALTER TABLE sales ADD COLUMN special_instructions TEXT;");
      console.log("✅ special_instructions column added to sales.");
    }
    
    // Check for tables table
    const tablesTableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tables'"
      )
      .get();
    if (!tablesTableExists) {
      console.log("🔧 Updating database: Adding tables table...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS tables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shop_id INTEGER NOT NULL,
          table_number TEXT NOT NULL,
          capacity INTEGER DEFAULT 4,
          status TEXT DEFAULT 'available',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );
      `);
      // Seed some default tables for existing shops
      db.exec(`
        INSERT INTO tables (shop_id, table_number, capacity)
        SELECT id, 'T1', 4 FROM shops;
        INSERT INTO tables (shop_id, table_number, capacity)
        SELECT id, 'T2', 4 FROM shops;
        INSERT INTO tables (shop_id, table_number, capacity)
        SELECT id, 'T3', 6 FROM shops;
        INSERT INTO tables (shop_id, table_number, capacity)
        SELECT id, 'T4', 2 FROM shops;
      `);
      console.log("✅ tables table added.");
    }

    // Migration: Sale Items Restaurant Columns
    const saleItemsRestCols = db.prepare("PRAGMA table_info(sale_items)").all();
    if (!saleItemsRestCols.some((col) => col.name === "special_instructions")) {
      console.log("🔧 Updating database: Adding Restaurant POS columns to sale_items...");
      db.exec(`
        ALTER TABLE sale_items ADD COLUMN special_instructions TEXT;
        ALTER TABLE sale_items ADD COLUMN variants_json TEXT;
        ALTER TABLE sale_items ADD COLUMN addons_json TEXT;
      `);
      console.log("✅ Restaurant columns added to sale_items.");
    }

    // Check for discounts table
    const discountsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='discounts'").get();
    if (!discountsExists) {
      console.log("🔧 Updating database: Adding discounts table...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS discounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shop_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'percentage',
          value REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );
      `);
      console.log("✅ discounts table added.");
    }

    // Check for taxes table
    const taxesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='taxes'").get();
    if (!taxesExists) {
      console.log("🔧 Updating database: Adding taxes table...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS taxes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shop_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          percentage REAL NOT NULL DEFAULT 0,
          linked_payment_method TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );
      `);
      console.log("✅ taxes table added.");
    }

    const notificationsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'").get();
    if (!notificationsExists) {
      console.log("🔧 Updating database: Adding notifications table...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shop_id INTEGER,
          target_user_id INTEGER,
          created_by_user_id INTEGER,
          type TEXT NOT NULL DEFAULT 'announcement',
          priority TEXT NOT NULL DEFAULT 'normal',
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          action_label TEXT,
          action_url TEXT,
          publish_at TEXT,
          expires_at TEXT,
          due_at TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
          FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS notification_reads (
          notification_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          read_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (notification_id, user_id),
          FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
        CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id);
      `);
      console.log("✅ notifications table added.");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        notification_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (notification_id, user_id),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id);
    `);

  }
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_financial_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER,
      subscription_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      payment_method TEXT DEFAULT 'Cash',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_shop_id ON saas_financial_logs(shop_id);
    CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_subscription_id ON saas_financial_logs(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_category ON saas_financial_logs(category);
    CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_created_at ON saas_financial_logs(created_at);
  `);

  const financialLogCols = db.prepare("PRAGMA table_info(saas_financial_logs)").all();
  if (!financialLogCols.some((col) => col.name === "subscription_id")) {
    db.exec("ALTER TABLE saas_financial_logs ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL;");
  }
  if (!financialLogCols.some((col) => col.name === "updated_at")) {
    db.exec("ALTER TABLE saas_financial_logs ADD COLUMN updated_at TEXT;");
    db.exec("UPDATE saas_financial_logs SET updated_at = COALESCE(updated_at, created_at, datetime('now'));");
  }

  db.exec(`
    INSERT INTO saas_financial_logs (shop_id, subscription_id, amount, category, description, payment_method, created_at, updated_at)
    SELECT s.shop_id, s.id, s.amount, 'subscription', 'Subscription payment: ' || s.type, 'Cash', s.paid_at, s.paid_at
    FROM subscriptions s
    WHERE NOT EXISTS (
      SELECT 1
      FROM saas_financial_logs l
      WHERE l.subscription_id = s.id
         OR (
           l.subscription_id IS NULL
           AND l.category = 'subscription'
           AND l.shop_id = s.shop_id
           AND ABS(COALESCE(l.amount, 0) - COALESCE(s.amount, 0)) < 0.01
           AND DATE(l.created_at) = DATE(s.paid_at)
         )
    );
  `);
} catch (e) {
  console.error("⚠️ Failed to ensure platform financial ledger:", e.message);
}

// Shift management tables and columns
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      start_time TEXT NOT NULL DEFAULT (datetime('now')),
      end_time TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      closing_balance REAL,
      expected_balance REAL,
      net_cash_sales REAL DEFAULT 0,
      net_card_sales REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      cash_drops REAL DEFAULT 0,
      cash_handovers REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      note TEXT,
      closed_by_user_id INTEGER,
      terminal_id TEXT,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cash_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      shift_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      verified_at TEXT,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cash_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      shift_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      verified_by_user_id INTEGER,
      verified_at TEXT,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
      FOREIGN KEY (verified_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_shop_id ON shifts(shop_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    CREATE INDEX IF NOT EXISTS idx_cash_handovers_shift_id ON cash_handovers(shift_id);
    CREATE INDEX IF NOT EXISTS idx_cash_drops_shift_id ON cash_drops(shift_id);
    CREATE INDEX IF NOT EXISTS idx_cash_drops_status ON cash_drops(status);
  `);

  const ensureColumn = (table, column, definition) => {
    const exists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) return;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((col) => col.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
      console.log(`✅ ${table}.${column} column added.`);
    }
  };

  ensureColumn("sales", "shift_id", "INTEGER");
  ensureColumn("expenses", "shift_id", "INTEGER");
  ensureColumn("returns", "shift_id", "INTEGER");
  ensureColumn("customer_ledger", "shift_id", "INTEGER");
  ensureColumn("users", "can_manage_register", "INTEGER DEFAULT 0");

  db.exec(`
    INSERT INTO cash_drops (shop_id, shift_id, requested_by_user_id, amount, status, note, created_at)
    SELECT s.shop_id, s.id, s.user_id, s.cash_drops, 'pending',
           'Imported from previous cash drop total before verification was enabled.',
           datetime('now')
    FROM shifts s
    WHERE s.status = 'open'
      AND COALESCE(s.cash_drops, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM cash_drops cd WHERE cd.shift_id = s.id);

    UPDATE shifts
    SET cash_drops = 0,
        note = COALESCE(note, '') || char(10) || '[Legacy cash drops moved to pending verification]'
    WHERE status = 'open'
      AND COALESCE(cash_drops, 0) > 0
      AND EXISTS (
        SELECT 1 FROM cash_drops cd
        WHERE cd.shift_id = shifts.id
          AND cd.status = 'pending'
          AND cd.note = 'Imported from previous cash drop total before verification was enabled.'
      );

    INSERT INTO cash_drops (shop_id, shift_id, requested_by_user_id, amount, status, note, created_at, verified_by_user_id, verified_at)
    SELECT s.shop_id, s.id, s.user_id, s.cash_drops, 'verified',
           'Imported from previous closed-shift cash drop total.',
           COALESCE(s.end_time, s.start_time, datetime('now')),
           s.closed_by_user_id,
           COALESCE(s.end_time, datetime('now'))
    FROM shifts s
    WHERE s.status = 'closed'
      AND COALESCE(s.cash_drops, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM cash_drops cd WHERE cd.shift_id = s.id);
  `);
} catch (e) {
  console.error("⚠️ Failed to ensure shift management tables:", e.message);
}

// -----------------------------------------------------------------------------
// PERFORMANCE MIGRATION: Ensure all necessary secondary indices exist.
// Running CREATE INDEX IF NOT EXISTS is very fast if they already exist,
// and drastically speeds up the application in production environments.
// -----------------------------------------------------------------------------
try {
  console.log("⚡ Ensuring database performance indexes exist...");
  db.exec(`
    -- Multi-tenant / shop_id Lookups (Most queried column in the system)
    CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id);
    CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON sales(shop_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_shop_id ON expenses(shop_id);
    CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id);
    CREATE INDEX IF NOT EXISTS idx_brands_shop_id ON brands(shop_id);
    CREATE INDEX IF NOT EXISTS idx_tables_shop_id ON tables(shop_id);
    CREATE INDEX IF NOT EXISTS idx_returns_shop_id ON returns(shop_id);
    CREATE INDEX IF NOT EXISTS idx_product_batches_shop_id ON product_batches(shop_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_id ON activity_logs(shop_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id);
    
    -- Foreign Keys & Relationships
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_batch_id ON sale_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
    
    -- Dates (Used heavily in reporting and dashboards)
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_created_at ON customer_ledger(created_at);
  `);
  console.log("✅ Database performance indexes are ready.");
} catch (e) {
  console.error("⚠️ Failed to create performance indexes:", e);
}

module.exports = db;

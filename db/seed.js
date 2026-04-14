const db = require("./db");
const bcrypt = require("bcryptjs");

function seed() {
  console.log("🧹 Clearing database...");

  // Clear all tables in correct order
  const tables = [
    "expense_categories",
    "brand_expense_payments",
    "sale_items",
    "sales",
    "expenses",
    "products",
    "brands",
    "users",
    "shops",
  ];

  db.transaction(() => {
    tables.forEach((table) => {
      db.prepare(`DELETE FROM ${table}`).run();
      // Reset autoincrement
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
    });

    console.log("🌱 Seeding fresh data...");

    const hash = bcrypt.hashSync("admin123", 10);

    // 1. Create Super Admin
    db.prepare(
      "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
    ).run("Global Owner", "owner", hash, "superadmin", null);

    // 2. Create Shops
    const allPanels = JSON.stringify([
      "dashboard",
      "brands",
      "products",
      "pos",
      "sales-history",
      "expenses",
      "customers",
    ]);
    const shop1Id = db
      .prepare("INSERT INTO shops (name, allowed_panels) VALUES (?, ?)")
      .run("Alpha Store", allPanels).lastInsertRowid;
    const shop2Id = db
      .prepare("INSERT INTO shops (name, allowed_panels) VALUES (?, ?)")
      .run("Beta Electronics", allPanels).lastInsertRowid;

    // 3. Create Shop Admins
    const admin1Id = db
      .prepare(
        "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run("Alpha Admin", "admin1", hash, "admin", shop1Id);

    const admin2Id = db
      .prepare(
        "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run("Beta Admin", "admin2", hash, "admin", shop2Id);

    // 4. Create Shop Users (Staff)
    db.prepare(
      "INSERT INTO users (name, username, password_hash, role, shop_id, allowed_panels) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      "Alpha Staff",
      "staff1",
      hash,
      "user",
      shop1Id,
      JSON.stringify(["pos", "dashboard"]),
    );

    // 5. Create Brands for Shop 1
    const b1s1 = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Nike", admin1Id.lastInsertRowid, shop1Id).lastInsertRowid;
    const b2s1 = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Adidas", admin1Id.lastInsertRowid, shop1Id).lastInsertRowid;

    // 6. Create Brands for Shop 2
    const b1s2 = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Sony", admin2Id.lastInsertRowid, shop2Id).lastInsertRowid;
    const b2s2 = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Apple", admin2Id.lastInsertRowid, shop2Id).lastInsertRowid;

    // 7. Create Products for Shop 1
    db.prepare(
      "INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "SHOE-001",
      "Air Max",
      "Footwear",
      b1s1,
      admin1Id.lastInsertRowid,
      shop1Id,
      5000,
      20,
      5,
    );

    // 8. Create Products for Shop 2
    db.prepare(
      "INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "IPH-15",
      "iPhone 15",
      "Mobile",
      b2s2,
      admin2Id.lastInsertRowid,
      shop2Id,
      150000,
      10,
      2,
    );
    // 9. Seed Default Expense Categories
    const defaults = [
      ["Electricity", "⚡", "bg-yellow-900/40 text-yellow-300"],
      ["Fuel", "⛽", "bg-orange-900/40 text-orange-300"],
      ["Rent", "🏠", "bg-blue-900/40 text-blue-300"],
      ["Salary", "👷", "bg-purple-900/40 text-purple-300"],
      ["Other", "📦", "bg-slate-700 text-slate-300"],
    ];
    const insertCat = db.prepare(
      "INSERT INTO expense_categories (shop_id, name, emoji, color_class) VALUES (?, ?, ?, ?)",
    );
    [shop1Id, shop2Id].forEach((sid) => {
      defaults.forEach(([name, emoji, color]) => {
        insertCat.run(sid, name, emoji, color);
      });
    });

    console.log("✅ Seeding Complete!");
    console.log("-----------------------------------");
    console.log("Super Admin: owner / admin123");
    console.log("Alpha Admin: admin1 / admin123");
    console.log("Beta Admin:  admin2 / admin123");
    console.log("-----------------------------------");
  })();
}

seed();

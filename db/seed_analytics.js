const db = require("./db");
const bcrypt = require("bcryptjs");

function seedAnalytics() {
  console.log("🧹 Clearing database...");

  const tables = [
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
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
    });

    console.log("🌱 Seeding 2 years of analytics data...");

    const hash = bcrypt.hashSync("admin123", 10);

    // 1. Create Super Admin
    db.prepare(
      "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
    ).run("Global Owner", "owner", hash, "superadmin", null);

    // 2. Create Shop
    const allPanels = JSON.stringify([
      "dashboard",
      "brands",
      "products",
      "pos",
      "sales-history",
      "expenses",
      "customers",
    ]);
    const shopId = db
      .prepare("INSERT INTO shops (name, allowed_panels) VALUES (?, ?)")
      .run("Analytics Test Shop", allPanels).lastInsertRowid;

    // 3. Create Shop Admin
    const adminId = db
      .prepare(
        "INSERT INTO users (name, username, password_hash, role, shop_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run("Shop Admin", "admin", hash, "admin", shopId).lastInsertRowid;

    // 4. Create Brands
    const brand1Id = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Nike", adminId, shopId).lastInsertRowid;
    const brand2Id = db
      .prepare("INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)")
      .run("Adidas", adminId, shopId).lastInsertRowid;

    // 5. Create Products
    const p1 = db
      .prepare(
        "INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "NK-01",
        "Nike Air",
        "Shoes",
        brand1Id,
        adminId,
        shopId,
        3000,
        100,
        10,
      ).lastInsertRowid;

    const p2 = db
      .prepare(
        "INSERT INTO products (sku, name, category, brand_id, user_id, shop_id, buying_price, stock, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "AD-01",
        "Adidas Ultra",
        "Shoes",
        brand2Id,
        adminId,
        shopId,
        4000,
        100,
        10,
      ).lastInsertRowid;

    const products = [
      { id: p1, price: 5000, brandId: brand1Id },
      { id: p2, price: 6500, brandId: brand2Id },
    ];

    // 6. Generate Sales for 2 years (24 months)
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 15); // middle of month

      console.log(
        `Generating sales for ${date.toLocaleString("default", { month: "long", year: "numeric" })}...`,
      );

      // Generate 5-10 sales per brand per month
      products.forEach((prod) => {
        const salesInMonth = Math.floor(Math.random() * 6) + 5; // 5 to 10
        for (let s = 0; s < salesInMonth; s++) {
          // Randomize day in month
          const day = Math.floor(Math.random() * 28) + 1;
          const hour = Math.floor(Math.random() * 12) + 9; // 9 AM to 9 PM
          const min = Math.floor(Math.random() * 60);
          const sec = Math.floor(Math.random() * 60);
          const saleDate = new Date(
            date.getFullYear(),
            date.getMonth(),
            day,
            hour,
            min,
            sec,
          );
          const saleDateStr = saleDate
            .toISOString()
            .replace("T", " ")
            .split(".")[0];

          const qty = Math.floor(Math.random() * 3) + 1;
          const subtotal = qty * prod.price;
          const discount = Math.random() > 0.8 ? 500 : 0;
          const total = subtotal - discount;

          const saleId = db
            .prepare(
              `
                        INSERT INTO sales (shop_id, user_id, total, discount, amount_received, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `,
            )
            .run(
              shopId,
              adminId,
              total,
              discount,
              total,
              saleDateStr,
            ).lastInsertRowid;

          db.prepare(
            `
                        INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale)
                        VALUES (?, ?, ?, ?)
                    `,
          ).run(saleId, prod.id, qty, prod.price);
        }
      });
    }

    console.log("✅ Seeding Complete!");
    console.log("-----------------------------------");
    console.log("Admin: admin / admin123");
    console.log("-----------------------------------");
  })();
}

seedAnalytics();

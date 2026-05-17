const express = require("express");
const db = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveOrCreateCustomer({
  shopId,
  customerId,
  customerName,
  customerPhone,
}) {
  const name = normalizeText(customerName);
  const phone = normalizeText(customerPhone);

  if (customerId) {
    const existing = db
      .prepare(
        "SELECT id, name, phone, current_balance FROM customers WHERE id = ? AND shop_id = ? AND status = 'active'",
      )
      .get(parseInt(customerId, 10), shopId);
    if (!existing) throw new Error("Selected customer not found");
    return existing;
  }

  if (!name && !phone) return null;

  let customer = null;

  if (phone) {
    customer = db
      .prepare(
        "SELECT id, name, phone, current_balance FROM customers WHERE phone = ? AND shop_id = ? AND status = 'active' LIMIT 1",
      )
      .get(phone, shopId);
  }

  if (!customer && name) {
    customer = db
      .prepare(
        "SELECT id, name, phone, current_balance FROM customers WHERE lower(name) = lower(?) AND shop_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      )
      .get(name, shopId);
  }

  if (!customer) {
    const result = db
      .prepare(
        `
        INSERT INTO customers (shop_id, name, phone, current_balance, status)
        VALUES (?, ?, ?, 0, 'active')
      `,
      )
      .run(shopId, name || phone || "Walk-in Customer", phone || null);

    customer = {
      id: result.lastInsertRowid,
      name: name || phone || "Walk-in Customer",
      phone: phone || null,
      current_balance: 0,
    };
  } else {
    const needsNameUpdate = !customer.name && name;
    const needsPhoneUpdate = !customer.phone && phone;

    if (needsNameUpdate || needsPhoneUpdate) {
      db.prepare(
        `
        UPDATE customers
        SET name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            updated_at = datetime('now')
        WHERE id = ?
      `,
      ).run(name || null, phone || null, customer.id);

      customer = db
        .prepare(
          "SELECT id, name, phone, current_balance FROM customers WHERE id = ?",
        )
        .get(customer.id);
    }
  }

  return customer;
}

function addCustomerLedgerSaleEntry({
  customerId,
  shopId,
  saleId,
  dueAmount,
  grandTotal,
  amountReceived,
  userId,
}) {
  if (!customerId || dueAmount <= 0.01) return;

  const customer = db
    .prepare(
      "SELECT current_balance FROM customers WHERE id = ? AND shop_id = ?",
    )
    .get(customerId, shopId);

  if (!customer) return;

  const newBalance = parseFloat(
    (Number(customer.current_balance || 0) + Number(dueAmount || 0)).toFixed(2),
  );

  db.prepare(
    `
    UPDATE customers
    SET current_balance = ?, updated_at = datetime('now')
    WHERE id = ? AND shop_id = ?
  `,
  ).run(newBalance, customerId, shopId);

  db.prepare(
    `
    INSERT INTO customer_ledger
      (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
    VALUES
      (?, ?, ?, 'sale', ?, ?, ?, ?)
  `,
  ).run(
    customerId,
    shopId,
    saleId,
    dueAmount,
    newBalance,
    `Credit sale — Total: Rs. ${Number(grandTotal || 0).toFixed(2)}, Paid: Rs. ${Number(amountReceived || 0).toFixed(2)}`,
    userId,
  );
}

function addCustomerLedgerPaymentEntry({
  customerId,
  shopId,
  saleId,
  paymentAmount,
  note,
  userId,
}) {
  if (!customerId || paymentAmount <= 0.01) return;

  const customer = db
    .prepare(
      "SELECT current_balance FROM customers WHERE id = ? AND shop_id = ?",
    )
    .get(customerId, shopId);

  if (!customer) return;

  const newBalance = parseFloat(
    Math.max(
      0,
      Number(customer.current_balance || 0) - Number(paymentAmount || 0),
    ).toFixed(2),
  );

  db.prepare(
    `
    UPDATE customers
    SET current_balance = ?, updated_at = datetime('now')
    WHERE id = ? AND shop_id = ?
  `,
  ).run(newBalance, customerId, shopId);

  db.prepare(
    `
    INSERT INTO customer_ledger
      (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
    VALUES
      (?, ?, ?, 'payment', ?, ?, ?, ?)
  `,
  ).run(
    customerId,
    shopId,
    saleId || null,
    paymentAmount,
    newBalance,
    note ||
      (saleId
        ? `Payment received for SALE-${String(saleId).padStart(5, "0")}`
        : "Payment received"),
    userId,
  );
}

// POST /api/sales — create a sale (checkout)
router.post("/", requireAuth, (req, res) => {
  console.log("DEBUG: Checkout payload received:", req.body);

  const {
    items,
    discount = 0,
    tax_percentage = 0,
    payment_method = "cash",
    amount_received = 0,
    customer_name = "",
    customer_phone = "",
    customer_id = null,
    order_type = "dine_in",
    table_id = null,
    waiter_id = null,
    rider_id = null,
    guest_count = 1,
    token_number = null,
    delivery_address = "",
    kitchen_id = null,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const insertSale = db.transaction((cartItems) => {
    let subtotal = 0;
    const resolved = [];

    for (const item of cartItems) {
      if (item.product_id) {
        const product = db
          .prepare("SELECT * FROM products WHERE id = ? AND shop_id = ?")
          .get(item.product_id, req.session.user.shop_id);

        if (!product) throw new Error(`Product ${item.product_id} not found`);
        const recipeLink = db.prepare('SELECT recipe_id FROM product_recipe_links WHERE product_id = ? AND shop_id = ?').get(item.product_id, req.session.user.shop_id);
        
        if (recipeLink) {
          // Check ingredients availability
          const recipeIngredients = db.prepare(`
            SELECT ri.raw_stock_id, ri.quantity as amount_per_unit, rs.name as ing_name, rs.current_stock, rs.conversion_factor, rs.unit
            FROM recipe_ingredients ri
            JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
            WHERE ri.recipe_id = ?
          `).all(recipeLink.recipe_id);

          for (const ing of recipeIngredients) {
            const factor = ing.conversion_factor || 1;
            const totalNeededLargeUnits = (ing.amount_per_unit * item.quantity) / factor;
            if (ing.current_stock < totalNeededLargeUnits) {
              throw new Error(`Insufficient stock of ingredient "${ing.ing_name}" for "${product.name}". Needed: ${totalNeededLargeUnits.toFixed(3)} ${ing.unit}, Available: ${ing.current_stock} ${ing.unit}`);
            }
          }
        } else if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for "${product.name}"`);
        }

        resolved.push({
          product,
          quantity: item.quantity,
          selling_price: item.selling_price,
          parent_id: item.parent_id,
          special_instructions: item.special_instructions,
          variants_json: item.variants ? JSON.stringify(item.variants) : null,
          addons_json: item.addons ? JSON.stringify(item.addons) : null,
        });

        subtotal += item.selling_price * item.quantity;
      } else {
        resolved.push({
          manual: true,
          name: item.name,
          quantity: item.quantity,
          selling_price: item.selling_price,
          parent_id: item.parent_id,
          special_instructions: item.special_instructions,
        });

        subtotal += item.selling_price * item.quantity;
      }
    }

    const taxAmount = (subtotal - discount) * (tax_percentage / 100);
    const grandTotal = subtotal - discount + taxAmount;

    const resolvedCustomer = resolveOrCreateCustomer({
      shopId: req.session.user.shop_id,
      customerId: customer_id,
      customerName: customer_name,
      customerPhone: customer_phone,
    });

    const finalCustomerName =
      normalizeText(customer_name) ||
      (resolvedCustomer ? resolvedCustomer.name : "");
    const finalCustomerPhone =
      normalizeText(customer_phone) ||
      (resolvedCustomer ? resolvedCustomer.phone : "");

    const dueAmount = parseFloat((grandTotal - amount_received).toFixed(2));

    // --- ENFORCE CREDIT LIMIT ---
    if (resolvedCustomer && dueAmount > 0.01) {
       const limit = Number(resolvedCustomer.credit_limit || 0);
       const currentBal = Number(resolvedCustomer.current_balance || 0);
       if (limit > 0 && (currentBal + dueAmount) > limit) {
          throw new Error(`Credit limit exceeded for ${resolvedCustomer.name}. Limit: Rs. ${limit}, New Balance: Rs. ${(currentBal + dueAmount).toFixed(2)}`);
       }
    }

    const saleResult = db
      .prepare(
        `
        INSERT INTO sales
          (shop_id, user_id, customer_id, customer_name, customer_phone, delivery_address, total, discount, tax_percentage, payment_method, amount_received, order_type, table_id, waiter_id, rider_id, kitchen_id, guest_count, token_number)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        req.session.user.shop_id,
        req.session.user.id,
        resolvedCustomer ? resolvedCustomer.id : null,
        finalCustomerName,
        finalCustomerPhone,
        delivery_address,
        grandTotal,
        discount,
        tax_percentage,
        payment_method,
        amount_received,
        order_type,
        table_id,
        waiter_id,
        rider_id,
        kitchen_id,
        guest_count,
        token_number
      );

    const saleId = saleResult.lastInsertRowid;

    for (const item of resolved) {
      let priceAtSale = item.selling_price;
      let remainingToDeduct = item.quantity;

      if (item.parent_id) {
        const parent = db
          .prepare("SELECT selling_price, buying_price FROM products WHERE id = ?")
          .get(item.parent_id);

        if (parent) {
          const compCount = db
            .prepare("SELECT SUM(quantity) as total FROM product_compositions WHERE parent_product_id = ?")
            .get(item.parent_id);
          const totalParts = compCount ? compCount.total : 0;
          if (totalParts > 0) {
            priceAtSale = parent.selling_price / totalParts;
          }
        }
      }

      if (!item.manual) {
        const productVariants = item.variants_json ? JSON.parse(item.variants_json) : [];
        const variantNames = Array.isArray(productVariants) ? productVariants.map(v => v.name || v) : [];
        const links = db.prepare('SELECT recipe_id, variant_name FROM product_recipe_links WHERE product_id = ? AND shop_id = ?').all(item.product.id, req.session.user.shop_id);
        const activeLinks = links.filter(l => !l.variant_name || variantNames.includes(l.variant_name));
        const isRecipe = activeLinks.length > 0;

        if (isRecipe) {
          // --- RECIPE-BASED PRODUCT (Restaurant) ---
          // 1. Record Sale Item (Simplified, no batches)
          db.prepare(`
            INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            saleId,
            item.product.id,
            item.parent_id || null,
            item.quantity,
            priceAtSale,
            item.product.buying_price || 0,
            null,
            item.special_instructions || null,
            item.variants_json || null,
            item.addons_json || null
          );

          // 2. RMS RECIPE DEDUCTION (from Raw Stock Batches)
          for (const link of activeLinks) {
            const recipeIngredients = db.prepare(`
              SELECT ri.raw_stock_id, ri.quantity as amount_per_unit
              FROM recipe_ingredients ri
              WHERE ri.recipe_id = ?
            `).all(link.recipe_id);

            for (const ing of recipeIngredients) {
              const stockItem = db.prepare('SELECT conversion_factor FROM raw_stocks WHERE id = ?').get(ing.raw_stock_id);
              const factor = (stockItem && stockItem.conversion_factor) ? stockItem.conversion_factor : 1;
              
              const totalNeededSmallUnits = ing.amount_per_unit * item.quantity;
              const totalNeededLargeUnits = totalNeededSmallUnits / factor;
              
              let remaining = totalNeededLargeUnits;
              const rsBatches = db.prepare(`
                SELECT id, buying_price, quantity 
                FROM raw_stock_batches 
                WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0
                ORDER BY created_at ASC
              `).all(ing.raw_stock_id, req.session.user.shop_id);

              for (const rsb of rsBatches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, rsb.quantity);
                db.prepare("UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?").run(take, rsb.id);
                remaining -= take;
              }

              // Deduct from main raw_stock total
              db.prepare("UPDATE raw_stocks SET current_stock = current_stock - ? WHERE id = ?").run(totalNeededLargeUnits, ing.raw_stock_id);
            }
          }
        } else {
          // --- RETAIL PRODUCT (Standard/FIFO) ---
          const batches = db.prepare(`
            SELECT id, buying_price, quantity 
            FROM product_batches 
            WHERE product_id = ? AND shop_id = ? AND quantity > 0
            ORDER BY created_at ASC
          `).all(item.product.id, req.session.user.shop_id);

          let deductedInBatches = 0;
          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const take = Math.min(remainingToDeduct, batch.quantity);
            db.prepare(`
              INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(saleId, item.product.id, item.parent_id || null, take, priceAtSale, batch.buying_price, batch.id, item.special_instructions || null, item.variants_json || null, item.addons_json || null);

            db.prepare("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?").run(take, batch.id);
            remainingToDeduct -= take;
            deductedInBatches += take;
          }

          if (remainingToDeduct > 0) {
            const lastBatch = db.prepare('SELECT id, buying_price FROM product_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1').get(item.product.id);
            const fallbackCost = lastBatch ? lastBatch.buying_price : (item.product.buying_price || 0);
            const fallbackBatchId = lastBatch ? lastBatch.id : null;
            db.prepare(`
              INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(saleId, item.product.id, item.parent_id || null, remainingToDeduct, priceAtSale, fallbackCost, fallbackBatchId, item.special_instructions || null, item.variants_json || null, item.addons_json || null);

            if (fallbackBatchId) db.prepare("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?").run(remainingToDeduct, fallbackBatchId);
          }

          db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.product.id);
        }
      } else {
        // Manual items
        db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, parent_id, custom_name, quantity, price_at_sale, buying_price_at_sale, special_instructions)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
        `).run(
          saleId,
          item.parent_id || null,
          item.name,
          item.quantity,
          priceAtSale,
          0, // Manual items have no recorded cost
          item.special_instructions || null
        );
      }
    }

    if (resolvedCustomer && dueAmount > 0.01) {
      addCustomerLedgerSaleEntry({
        customerId: resolvedCustomer.id,
        shopId: req.session.user.shop_id,
        saleId,
        dueAmount,
        grandTotal,
        amountReceived: amount_received,
        userId: req.session.user.id,
      });
    }

    return {
      saleId,
      total: grandTotal,
      customer_id: resolvedCustomer ? resolvedCustomer.id : null,
      customer_name: finalCustomerName,
      customer_phone: finalCustomerPhone,
    };
  });

  try {
    const result = insertSale(items);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sales — list sales for current shop
router.get("/", requireAuth, (req, res) => {
  console.log(
    `[DEBUG] Fetching sales for shop_id: ${req.session.user.shop_id}`,
  );

  const sales = db
    .prepare(
      `
      SELECT
        s.*,
        u.name as served_by_name,
        u.username as served_by_username,
        w.name as waiter_name,
        r.name as rider_name,
        k.name as kitchen_name,
        t.table_number,
        (SELECT SUM(quantity) FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE sale_id = s.id)) as items_returned
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN users w ON s.waiter_id = w.id
      LEFT JOIN users r ON s.rider_id = r.id
      LEFT JOIN users k ON s.kitchen_id = k.id
      LEFT JOIN tables t ON s.table_id = t.id
      WHERE s.shop_id = ?
      ORDER BY s.created_at DESC
    `,
    )
    .all(req.session.user.shop_id);

  console.log(`[DEBUG] Found ${sales.length} sales`);
  res.json(sales);
});

// PATCH /api/sales/:id/pay — record payment / update received amount
router.patch("/:id/pay", requireAuth, (req, res) => {
  const { amount, note = "" } = req.body;

  const sale = db
    .prepare("SELECT * FROM sales WHERE id = ? AND shop_id = ?")
    .get(req.params.id, req.session.user.shop_id);

  if (!sale) return res.status(404).json({ error: "Sale not found" });

  const finalAmount =
    amount !== undefined ? parseFloat(amount) : Number(sale.total || 0);
  if (Number.isNaN(finalAmount) || finalAmount < 0) {
    return res.status(400).json({ error: "Invalid payment amount" });
  }

  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE sales SET amount_received = ? WHERE id = ? AND shop_id = ?",
      ).run(finalAmount, sale.id, req.session.user.shop_id);

      if (sale.customer_id) {
        const prevDue =
          Number(sale.total || 0) - Number(sale.amount_received || 0);
        const newDue = Number(sale.total || 0) - finalAmount;
        const paymentMade = Math.max(
          0,
          parseFloat((prevDue - newDue).toFixed(2)),
        );

        if (paymentMade > 0.01) {
          addCustomerLedgerPaymentEntry({
            customerId: sale.customer_id,
            shopId: sale.shop_id,
            saleId: sale.id,
            paymentAmount: paymentMade,
            note:
              normalizeText(note) ||
              `Payment received for SALE-${String(sale.id).padStart(5, "0")}`,
            userId: req.session.user.id,
          });
        }
      }
    })();

    res.json({ ok: true, amount_received: finalAmount });
  } catch (e) {
    console.error("Sale payment update error:", e);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// PATCH /api/sales/:id/details — Updates sale customer and payment details
router.patch("/:id/details", requireAuth, (req, res) => {
  const { customer_name, customer_phone, payment_method, amount_received } = req.body;
  try {
    db.prepare(`
      UPDATE sales 
      SET customer_name = ?, 
          customer_phone = ?, 
          payment_method = ?, 
          amount_received = ?
      WHERE id = ? AND shop_id = ?
    `).run(
      customer_name || '', 
      customer_phone || '', 
      payment_method || 'cash', 
      amount_received || 0, 
      req.params.id, 
      req.session.user.shop_id
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Sale update error:", err);
    res.status(500).json({ error: "Failed to update sale details" });
  }
});

// GET /api/sales/:id/bill — get full bill details
router.get("/:id/bill", requireAuth, (req, res) => {
  const saleId = parseInt(req.params.id, 10);
  const sale = db
    .prepare(`
      SELECT s.*, w.name as waiter_name, r.name as rider_name, k.name as kitchen_name, t.table_number 
      FROM sales s 
      LEFT JOIN users w ON s.waiter_id = w.id
      LEFT JOIN users r ON s.rider_id = r.id
      LEFT JOIN users k ON s.kitchen_id = k.id
      LEFT JOIN tables t ON s.table_id = t.id
      WHERE s.id = ? AND s.shop_id = ?
    `)
    .get(saleId, req.session.user.shop_id);

  if (!sale) return res.status(404).json({ error: "Sale not found" });

  const items = db
    .prepare(
      `
    SELECT
      si.*,
      COALESCE(p.name, si.custom_name) as product_name,
      b.name as brand_name,
      (
        SELECT COALESCE(SUM(ri.quantity), 0)
        FROM return_items ri
        JOIN returns r ON ri.return_id = r.id
        WHERE r.sale_id = si.sale_id AND (ri.sale_item_id = si.id OR (ri.sale_item_id IS NULL AND ri.product_id = si.product_id))
      ) as returned_qty
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE si.sale_id = ?
  `,
    )
    .all(saleId);

  const payments = db
    .prepare(
      `
    SELECT amount, note, created_at
    FROM customer_ledger
    WHERE sale_id = ? AND type = 'payment'
    ORDER BY created_at DESC
  `,
    )
    .all(saleId);

  const seller = db
    .prepare("SELECT name FROM users WHERE id = ?")
    .get(sale.user_id);
  const shop = db
    .prepare(
      `SELECT id, name, status, logo_path, receipt_header_text, receipt_extended_name, receipt_phone, 
              receipt_address, receipt_images_json, receipt_policies, use_logo_on_receipt, receipt_font_family,
              header_font_size, header_font_weight, header_spacing,
              extended_name_font_size, extended_name_font_weight, extended_name_spacing,
              contact_font_size, contact_align, contact_padding,
              footer_font_size, footer_font_style, footer_margin,
              divider_style, divider_width, section_gap,
              allowed_panels, created_at 
       FROM shops WHERE id = ?`
    )
    .get(sale.shop_id);

  // Parse receipt images JSON
  if (shop?.receipt_images_json) {
    try {
      shop.receipt_images = JSON.parse(shop.receipt_images_json);
    } catch (e) {
      shop.receipt_images = [];
    }
  } else {
    shop.receipt_images = [];
  }
  delete shop.receipt_images_json;

  // Convert use_logo_on_receipt to boolean
  if (shop) {
    shop.use_logo_on_receipt = shop.use_logo_on_receipt === 1;
  }

  res.json({ sale, items, seller, shop, payments });
});

// POST /api/sales/:id/return — process a return for a sale
router.post("/:id/return", requireAuth, (req, res) => {
  const saleId = parseInt(req.params.id, 10);
  const { items, reason = "", payment_method = "cash" } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "No items to return" });
  }

  const processReturn = db.transaction((returnItems) => {
    const sale = db
      .prepare("SELECT * FROM sales WHERE id = ? AND shop_id = ?")
      .get(saleId, req.session.user.shop_id);

    if (!sale) throw new Error("Sale not found");

    let totalRefund = 0;
    returnItems.forEach((it) => {
      totalRefund += it.refund_price * it.quantity;
    });

    const returnResult = db
      .prepare(
        `
        INSERT INTO returns (shop_id, sale_id, user_id, total_refund, reason, payment_method)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        req.session.user.shop_id,
        saleId,
        req.session.user.id,
        totalRefund,
        reason,
        payment_method,
      );

    const returnId = returnResult.lastInsertRowid;

    for (const item of returnItems) {
      const original = db
        .prepare(
          `
        SELECT
          si.id as sale_item_id,
          si.quantity as sold_qty,
          si.buying_price_at_sale,
          si.batch_id,
          (
            SELECT COALESCE(SUM(ri.quantity), 0)
            FROM return_items ri
            JOIN returns r ON ri.return_id = r.id
            WHERE r.sale_id = si.sale_id AND (ri.sale_item_id = si.id OR (ri.sale_item_id IS NULL AND ri.product_id = si.product_id))
          ) as already_returned
        FROM sale_items si
        WHERE si.sale_id = ? AND (si.id = ? OR (? IS NULL AND si.product_id = ?))
      `,
        )
        .get(saleId, item.sale_item_id, item.sale_item_id, item.product_id);

      if (!original && item.product_id) {
        throw new Error(`Product ${item.product_id} was not part of this sale`);
      }

      if (item.product_id) {
        const available = original.sold_qty - original.already_returned;
        if (item.quantity > available) {
          throw new Error(
            `Cannot return ${item.quantity} units of product ${item.product_id}. Only ${available} units available to return.`,
          );
        }
      }

      const originalCogs = original ? original.buying_price_at_sale : 0;

      db.prepare(
        `
        INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, refund_price, buying_price_at_sale, is_damage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        returnId,
        item.sale_item_id || null,
        item.product_id || null,
        item.quantity,
        item.refund_price,
        originalCogs,
        item.is_damage ? 1 : 0,
      );

      if (item.product_id) {
        const soldBatchId = original ? original.batch_id : null;

        if (item.is_damage) {
          // Update global product damage stats
          db.prepare(
            "UPDATE products SET damage_stock = damage_stock + ?, manual_damage_loss = manual_damage_loss + ? WHERE id = ? AND shop_id = ?",
          ).run(item.quantity, (item.quantity * originalCogs), item.product_id, req.session.user.shop_id);

          // Update specific batch's damage count
          if (soldBatchId) {
            db.prepare("UPDATE product_batches SET damaged_quantity = damaged_quantity + ? WHERE id = ?").run(item.quantity, soldBatchId);
          }
        } else {
          // Non-damage: Restore to stock
          let batchRestored = false;

          if (soldBatchId) {
            const batchUpdate = db.prepare("UPDATE product_batches SET quantity = quantity + ? WHERE id = ?").run(item.quantity, soldBatchId);
            if (batchUpdate.changes > 0) batchRestored = true;
          }

          // Fallback: If no batch recorded or batch was deleted, add to the newest active batch
          if (!batchRestored) {
            const newestBatch = db.prepare('SELECT id FROM product_batches WHERE product_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT 1').get(item.product_id, req.session.user.shop_id);
            if (newestBatch) {
              db.prepare("UPDATE product_batches SET quantity = quantity + ? WHERE id = ?").run(item.quantity, newestBatch.id);
            }
          }

          db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.product_id);
        }
      }
    }

    // Update customer ledger if applicable
    if (sale.customer_id && totalRefund > 0.01) {
      const customer = db.prepare('SELECT current_balance FROM customers WHERE id = ?').get(sale.customer_id);
      if (customer) {
        // If method is 'ledger', we reduce balance (can go negative = store credit).
        // For cash/online, we just record the event without affecting the balance.
        let creditAmount = 0;
        let noteSuffix = "";

        if (payment_method === 'ledger') {
          creditAmount = totalRefund;
          noteSuffix = " (Credited to Account)";
        } else {
          creditAmount = 0;
          noteSuffix = ` (Refunded via ${payment_method.toUpperCase()})`;
        }

        const newBalance = parseFloat((Number(customer.current_balance || 0) - creditAmount).toFixed(2));

        if (creditAmount !== 0) {
          db.prepare('UPDATE customers SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newBalance, sale.customer_id);
        }

        db.prepare(`
          INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
          VALUES (?, ?, ?, 'return', ?, ?, ?, ?)
        `).run(
          sale.customer_id,
          req.session.user.shop_id,
          saleId,
          totalRefund,
          newBalance,
          `Return refund — SALE-${String(saleId).padStart(5, '0')}${noteSuffix}`,
          req.session.user.id
        );
      }
    }

    return { returnId, totalRefund };
  });

  try {
    const result = processReturn(items);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



// GET /api/sales/returns/:id/receipt — get return receipt details
router.get("/returns/:id/receipt", requireAuth, (req, res) => {
  const returnId = parseInt(req.params.id, 10);
  const ret = db
    .prepare("SELECT * FROM returns WHERE id = ? AND shop_id = ?")
    .get(returnId, req.session.user.shop_id);

  if (!ret) return res.status(404).json({ error: "Return not found" });

  const items = db
    .prepare(
      `
    SELECT ri.*, COALESCE(p.name, 'Manual Item') as product_name, b.name as brand_name
    FROM return_items ri
    LEFT JOIN products p ON ri.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE ri.return_id = ?
  `,
    )
    .all(returnId);

  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(ret.sale_id);
  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(ret.user_id);
  const shop = db
    .prepare(
      `SELECT id, name, status, logo_path, receipt_header_text, receipt_extended_name, receipt_phone, 
              receipt_address, receipt_images_json, receipt_policies, use_logo_on_receipt, receipt_font_family,
              header_font_size, header_font_weight, header_spacing,
              extended_name_font_size, extended_name_font_weight, extended_name_spacing,
              contact_font_size, contact_align, contact_padding,
              footer_font_size, footer_font_style, footer_margin,
              divider_style, divider_width, section_gap,
              allowed_panels, created_at 
       FROM shops WHERE id = ?`
    )
    .get(ret.shop_id);

  // Parse receipt images JSON
  if (shop?.receipt_images_json) {
    try {
      shop.receipt_images = JSON.parse(shop.receipt_images_json);
    } catch (e) {
      shop.receipt_images = [];
    }
  } else {
    shop.receipt_images = [];
  }
  delete shop.receipt_images_json;

  // Convert use_logo_on_receipt to boolean
  if (shop) {
    shop.use_logo_on_receipt = shop.use_logo_on_receipt === 1;
  }

  res.json({ return: ret, items, sale, user, shop });
});

module.exports = router;

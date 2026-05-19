const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

function normalizeText(value) {
  return String(value || "").trim();
}

async function resolveOrCreateCustomer(client, {
  shopId,
  customerId,
  customerName,
  customerPhone,
  userId
}) {
  const name = normalizeText(customerName);
  const phone = normalizeText(customerPhone);
  const isPostgres = usePostgres();

  if (customerId) {
    let existing;
    if (isPostgres) {
      const { rows } = await client.query(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE id = $1 AND shop_id = $2 AND status = 'active'",
        [parseInt(customerId, 10), shopId]
      );
      existing = rows[0];
    } else {
      existing = client.prepare(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE id = ? AND shop_id = ? AND status = 'active'",
      ).get(parseInt(customerId, 10), shopId);
    }
    if (!existing) throw new Error("Selected customer not found");
    return existing;
  }

  if (!name && !phone) return null;

  let customer = null;

  if (phone) {
    if (isPostgres) {
      const { rows } = await client.query(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE phone = $1 AND shop_id = $2 AND status = 'active' LIMIT 1",
        [phone, shopId]
      );
      customer = rows[0];
    } else {
      customer = client.prepare(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE phone = ? AND shop_id = ? AND status = 'active' LIMIT 1",
      ).get(phone, shopId);
    }
  }

  if (!customer && name) {
    if (isPostgres) {
      const { rows } = await client.query(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE lower(name) = lower($1) AND shop_id = $2 AND status = 'active' ORDER BY id DESC LIMIT 1",
        [name, shopId]
      );
      customer = rows[0];
    } else {
      customer = client.prepare(
        "SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE lower(name) = lower(?) AND shop_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      ).get(name, shopId);
    }
  }

  if (!customer) {
    const finalName = name || phone || "Walk-in Customer";
    const finalPhone = phone || null;
    if (isPostgres) {
      const { rows } = await client.query(
        `INSERT INTO customers (shop_id, name, phone, current_balance, status)
         VALUES ($1, $2, $3, 0, 'active') RETURNING id`,
        [shopId, finalName, finalPhone]
      );
      customer = { id: rows[0].id, name: finalName, phone: finalPhone, current_balance: 0, credit_limit: 0 };
    } else {
      const result = client.prepare(
        `INSERT INTO customers (shop_id, name, phone, current_balance, status)
         VALUES (?, ?, ?, 0, 'active')`
      ).run(shopId, finalName, finalPhone);
      customer = { id: result.lastInsertRowid, name: finalName, phone: finalPhone, current_balance: 0, credit_limit: 0 };
    }
  } else {
    const needsNameUpdate = !customer.name && name;
    const needsPhoneUpdate = !customer.phone && phone;

    if (needsNameUpdate || needsPhoneUpdate) {
      if (isPostgres) {
        await client.query(
          `UPDATE customers SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [name || null, phone || null, customer.id]
        );
        const { rows } = await client.query("SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE id = $1", [customer.id]);
        customer = rows[0];
      } else {
        client.prepare(
          `UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone), updated_at = datetime('now') WHERE id = ?`
        ).run(name || null, phone || null, customer.id);
        customer = client.prepare("SELECT id, name, phone, current_balance, credit_limit FROM customers WHERE id = ?").get(customer.id);
      }
    }
  }

  return customer;
}

async function addCustomerLedgerSaleEntry(client, {
  customerId,
  shopId,
  saleId,
  dueAmount,
  grandTotal,
  amountReceived,
  userId,
}) {
  if (!customerId || dueAmount <= 0.01) return;
  const isPostgres = usePostgres();

  let customer;
  if (isPostgres) {
    const { rows } = await client.query("SELECT current_balance FROM customers WHERE id = $1 AND shop_id = $2", [customerId, shopId]);
    customer = rows[0];
  } else {
    customer = client.prepare("SELECT current_balance FROM customers WHERE id = ? AND shop_id = ?").get(customerId, shopId);
  }

  if (!customer) return;

  const newBalance = parseFloat((Number(customer.current_balance || 0) + Number(dueAmount || 0)).toFixed(2));

  if (isPostgres) {
    await client.query(`UPDATE customers SET current_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND shop_id = $3`, [newBalance, customerId, shopId]);
    await client.query(
      `INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
       VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7)`,
      [customerId, shopId, saleId, dueAmount, newBalance, `Credit sale — Total: Rs. ${Number(grandTotal || 0).toFixed(2)}, Paid: Rs. ${Number(amountReceived || 0).toFixed(2)}`, userId]
    );
  } else {
    client.prepare(`UPDATE customers SET current_balance = ?, updated_at = datetime('now') WHERE id = ? AND shop_id = ?`).run(newBalance, customerId, shopId);
    client.prepare(
      `INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
       VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`
    ).run(customerId, shopId, saleId, dueAmount, newBalance, `Credit sale — Total: Rs. ${Number(grandTotal || 0).toFixed(2)}, Paid: Rs. ${Number(amountReceived || 0).toFixed(2)}`, userId);
  }
}

async function addCustomerLedgerPaymentEntry(client, {
  customerId,
  shopId,
  saleId,
  paymentAmount,
  note,
  userId,
}) {
  if (!customerId || paymentAmount <= 0.01) return;
  const isPostgres = usePostgres();

  let customer;
  if (isPostgres) {
    const { rows } = await client.query("SELECT current_balance FROM customers WHERE id = $1 AND shop_id = $2", [customerId, shopId]);
    customer = rows[0];
  } else {
    customer = client.prepare("SELECT current_balance FROM customers WHERE id = ? AND shop_id = ?").get(customerId, shopId);
  }

  if (!customer) return;

  const newBalance = parseFloat(Math.max(0, Number(customer.current_balance || 0) - Number(paymentAmount || 0)).toFixed(2));

  if (isPostgres) {
    await client.query(`UPDATE customers SET current_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND shop_id = $3`, [newBalance, customerId, shopId]);
    await client.query(
      `INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
       VALUES ($1, $2, $3, 'payment', $4, $5, $6, $7)`,
      [customerId, shopId, saleId || null, paymentAmount, newBalance, note || (saleId ? `Payment received for SALE-${String(saleId).padStart(5, "0")}` : "Payment received"), userId]
    );
  } else {
    client.prepare(`UPDATE customers SET current_balance = ?, updated_at = datetime('now') WHERE id = ? AND shop_id = ?`).run(newBalance, customerId, shopId);
    client.prepare(
      `INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by)
       VALUES (?, ?, ?, 'payment', ?, ?, ?, ?)`
    ).run(customerId, shopId, saleId || null, paymentAmount, newBalance, note || (saleId ? `Payment received for SALE-${String(saleId).padStart(5, "0")}` : "Payment received"), userId);
  }
}

// POST /api/sales — create a sale (checkout)
router.post("/", requireAuth, async (req, res) => {
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

  if (!items || items.length === 0) return res.status(400).json({ error: "Cart is empty" });

  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const isPostgres = usePostgres();

  try {
    const performCheckout = async (client) => {
      let subtotal = 0;
      const resolved = [];

      for (const item of items) {
        if (item.product_id) {
          let product;
          if (isPostgres) {
            const { rows } = await client.query("SELECT * FROM products WHERE id = $1 AND shop_id = $2", [item.product_id, shopId]);
            product = rows[0];
          } else {
            product = client.prepare("SELECT * FROM products WHERE id = ? AND shop_id = ?").get(item.product_id, shopId);
          }

          if (!product) throw new Error(`Product ${item.product_id} not found`);

          let recipeLink;
          if (isPostgres) {
            const { rows } = await client.query('SELECT recipe_id FROM product_recipe_links WHERE product_id = $1 AND shop_id = $2', [item.product_id, shopId]);
            recipeLink = rows[0];
          } else {
            recipeLink = client.prepare('SELECT recipe_id FROM product_recipe_links WHERE product_id = ? AND shop_id = ?').get(item.product_id, shopId);
          }

          if (recipeLink) {
            let recipeIngredients;
            if (isPostgres) {
              const { rows } = await client.query(`
                SELECT ri.raw_stock_id, ri.quantity as amount_per_unit, rs.name as ing_name, rs.current_stock, rs.conversion_factor, rs.unit
                FROM recipe_ingredients ri
                JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
                WHERE ri.recipe_id = $1
              `, [recipeLink.recipe_id]);
              recipeIngredients = rows;
            } else {
              recipeIngredients = client.prepare(`
                SELECT ri.raw_stock_id, ri.quantity as amount_per_unit, rs.name as ing_name, rs.current_stock, rs.conversion_factor, rs.unit
                FROM recipe_ingredients ri
                JOIN raw_stocks rs ON ri.raw_stock_id = rs.id
                WHERE ri.recipe_id = ?
              `).all(recipeLink.recipe_id);
            }

            for (const ing of recipeIngredients) {
              const factor = ing.conversion_factor || 1;
              const totalNeededLargeUnits = (ing.amount_per_unit * item.quantity) / factor;
              if (ing.current_stock < totalNeededLargeUnits) {
                throw new Error(`Insufficient stock of ingredient "${ing.ing_name}" for "${product.name}".`);
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

      const resolvedCustomer = await resolveOrCreateCustomer(client, {
        shopId, customerId: customer_id, customerName: customer_name, customerPhone: customer_phone, userId
      });

      const finalCustomerName = normalizeText(customer_name) || (resolvedCustomer ? resolvedCustomer.name : "");
      const finalCustomerPhone = normalizeText(customer_phone) || (resolvedCustomer ? resolvedCustomer.phone : "");
      const dueAmount = parseFloat((grandTotal - amount_received).toFixed(2));

      if (resolvedCustomer && dueAmount > 0.01) {
        const limit = Number(resolvedCustomer.credit_limit || 0);
        const currentBal = Number(resolvedCustomer.current_balance || 0);
        if (limit > 0 && (currentBal + dueAmount) > limit) {
          throw new Error(`Credit limit exceeded for ${resolvedCustomer.name}.`);
        }
      }

      let saleId;
      if (isPostgres) {
        const { rows } = await client.query(
          `INSERT INTO sales
            (shop_id, user_id, customer_id, customer_name, customer_phone, delivery_address, total, discount, tax_percentage, payment_method, amount_received, order_type, table_id, waiter_id, rider_id, kitchen_id, guest_count, token_number)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
          [shopId, userId, resolvedCustomer ? resolvedCustomer.id : null, finalCustomerName, finalCustomerPhone, delivery_address, grandTotal, discount, tax_percentage, payment_method, amount_received, order_type, table_id, waiter_id, rider_id, kitchen_id, guest_count, token_number]
        );
        saleId = rows[0].id;
      } else {
        const res = client.prepare(
          `INSERT INTO sales
            (shop_id, user_id, customer_id, customer_name, customer_phone, delivery_address, total, discount, tax_percentage, payment_method, amount_received, order_type, table_id, waiter_id, rider_id, kitchen_id, guest_count, token_number)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(shopId, userId, resolvedCustomer ? resolvedCustomer.id : null, finalCustomerName, finalCustomerPhone, delivery_address, grandTotal, discount, tax_percentage, payment_method, amount_received, order_type, table_id, waiter_id, rider_id, kitchen_id, guest_count, token_number);
        saleId = res.lastInsertRowid;
      }

      for (const item of resolved) {
        let priceAtSale = item.selling_price;
        let remainingToDeduct = item.quantity;

        if (item.parent_id) {
          let parent;
          if (isPostgres) {
            const { rows } = await client.query("SELECT selling_price, buying_price FROM products WHERE id = $1", [item.parent_id]);
            parent = rows[0];
          } else {
            parent = client.prepare("SELECT selling_price, buying_price FROM products WHERE id = ?").get(item.parent_id);
          }
          if (parent) {
            let compCount;
            if (isPostgres) {
              const { rows } = await client.query("SELECT SUM(quantity) as total FROM product_compositions WHERE parent_product_id = $1", [item.parent_id]);
              compCount = rows[0];
            } else {
              compCount = client.prepare("SELECT SUM(quantity) as total FROM product_compositions WHERE parent_product_id = ?").get(item.parent_id);
            }
            if (compCount && compCount.total > 0) priceAtSale = parent.selling_price / compCount.total;
          }
        }

        if (!item.manual) {
          const productVariants = item.variants_json ? JSON.parse(item.variants_json) : [];
          const variantNames = Array.isArray(productVariants) ? productVariants.map(v => v.name || v) : [];
          
          let links;
          if (isPostgres) {
            const { rows } = await client.query('SELECT recipe_id, variant_name FROM product_recipe_links WHERE product_id = $1 AND shop_id = $2', [item.product.id, shopId]);
            links = rows;
          } else {
            links = client.prepare('SELECT recipe_id, variant_name FROM product_recipe_links WHERE product_id = ? AND shop_id = ?').all(item.product.id, shopId);
          }
          const activeLinks = links.filter(l => !l.variant_name || variantNames.includes(l.variant_name));
          const isRecipe = activeLinks.length > 0;

          if (isRecipe) {
            if (isPostgres) {
              await client.query(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [saleId, item.product.id, item.parent_id || null, item.quantity, priceAtSale, item.product.buying_price || 0, null, item.special_instructions || null, item.variants_json || null, item.addons_json || null]);
            } else {
              client.prepare(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(saleId, item.product.id, item.parent_id || null, item.quantity, priceAtSale, item.product.buying_price || 0, null, item.special_instructions || null, item.variants_json || null, item.addons_json || null);
            }

            for (const link of activeLinks) {
              let ingList;
              if (isPostgres) {
                const { rows } = await client.query(`SELECT ri.raw_stock_id, ri.quantity as amount_per_unit FROM recipe_ingredients ri WHERE ri.recipe_id = $1`, [link.recipe_id]);
                ingList = rows;
              } else {
                ingList = client.prepare(`SELECT ri.raw_stock_id, ri.quantity as amount_per_unit FROM recipe_ingredients ri WHERE ri.recipe_id = ?`).all(link.recipe_id);
              }

              for (const ing of ingList) {
                let stItem;
                if (isPostgres) {
                  const { rows } = await client.query('SELECT conversion_factor FROM raw_stocks WHERE id = $1', [ing.raw_stock_id]);
                  stItem = rows[0];
                } else {
                  stItem = client.prepare('SELECT conversion_factor FROM raw_stocks WHERE id = ?').get(ing.raw_stock_id);
                }
                const factor = stItem?.conversion_factor || 1;
                const totalNeeded = (ing.amount_per_unit * item.quantity) / factor;
                
                let remaining = totalNeeded;
                let rsBatches;
                if (isPostgres) {
                  const { rows } = await client.query(`SELECT id, buying_price, quantity FROM raw_stock_batches WHERE raw_stock_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC`, [ing.raw_stock_id, shopId]);
                  rsBatches = rows;
                } else {
                  rsBatches = client.prepare(`SELECT id, buying_price, quantity FROM raw_stock_batches WHERE raw_stock_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC`).all(ing.raw_stock_id, shopId);
                }

                for (const rsb of rsBatches) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, rsb.quantity);
                  if (isPostgres) await client.query("UPDATE raw_stock_batches SET quantity = quantity - $1 WHERE id = $2", [take, rsb.id]);
                  else client.prepare("UPDATE raw_stock_batches SET quantity = quantity - ? WHERE id = ?").run(take, rsb.id);
                  remaining -= take;
                }
                if (isPostgres) await client.query("UPDATE raw_stocks SET current_stock = current_stock - $1 WHERE id = $2", [totalNeeded, ing.raw_stock_id]);
                else client.prepare("UPDATE raw_stocks SET current_stock = current_stock - ? WHERE id = ?").run(totalNeeded, ing.raw_stock_id);
              }
            }
          } else {
            let batches;
            if (isPostgres) {
              const { rows } = await client.query(`SELECT id, buying_price, quantity FROM product_batches WHERE product_id = $1 AND shop_id = $2 AND quantity > 0 ORDER BY created_at ASC`, [item.product.id, shopId]);
              batches = rows;
            } else {
              batches = client.prepare(`SELECT id, buying_price, quantity FROM product_batches WHERE product_id = ? AND shop_id = ? AND quantity > 0 ORDER BY created_at ASC`).all(item.product.id, shopId);
            }

            for (const batch of batches) {
              if (remainingToDeduct <= 0) break;
              const take = Math.min(remainingToDeduct, batch.quantity);
              if (isPostgres) {
                await client.query(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [saleId, item.product.id, item.parent_id || null, take, priceAtSale, batch.buying_price, batch.id, item.special_instructions || null, item.variants_json || null, item.addons_json || null]);
                await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [take, batch.id]);
              } else {
                client.prepare(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(saleId, item.product.id, item.parent_id || null, take, priceAtSale, batch.buying_price, batch.id, item.special_instructions || null, item.variants_json || null, item.addons_json || null);
                client.prepare("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?").run(take, batch.id);
              }
              remainingToDeduct -= take;
            }

            if (remainingToDeduct > 0) {
              let lastBatch;
              if (isPostgres) {
                const { rows } = await client.query('SELECT id, buying_price FROM product_batches WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1', [item.product.id]);
                lastBatch = rows[0];
              } else {
                lastBatch = client.prepare('SELECT id, buying_price FROM product_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1').get(item.product.id);
              }
              const fallbackCost = lastBatch?.buying_price || item.product.buying_price || 0;
              const fallbackBatchId = lastBatch?.id || null;
              if (isPostgres) {
                await client.query(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [saleId, item.product.id, item.parent_id || null, remainingToDeduct, priceAtSale, fallbackCost, fallbackBatchId, item.special_instructions || null, item.variants_json || null, item.addons_json || null]);
                if (fallbackBatchId) await client.query("UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2", [remainingToDeduct, fallbackBatchId]);
              } else {
                client.prepare(`INSERT INTO sale_items (sale_id, product_id, parent_id, quantity, price_at_sale, buying_price_at_sale, batch_id, special_instructions, variants_json, addons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(saleId, item.product.id, item.parent_id || null, remainingToDeduct, priceAtSale, fallbackCost, fallbackBatchId, item.special_instructions || null, item.variants_json || null, item.addons_json || null);
                if (fallbackBatchId) client.prepare("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?").run(remainingToDeduct, fallbackBatchId);
              }
            }
            if (isPostgres) await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.quantity, item.product.id]);
            else client.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.product.id);
          }
        } else {
          // Manual items
          if (isPostgres) {
            await client.query(`INSERT INTO sale_items (sale_id, product_id, parent_id, custom_name, quantity, price_at_sale, buying_price_at_sale, special_instructions) VALUES ($1, NULL, $2, $3, $4, $5, 0, $6)`, [saleId, item.parent_id || null, item.name, item.quantity, priceAtSale, item.special_instructions || null]);
          } else {
            client.prepare(`INSERT INTO sale_items (sale_id, product_id, parent_id, custom_name, quantity, price_at_sale, buying_price_at_sale, special_instructions) VALUES (?, NULL, ?, ?, ?, ?, 0, ?)`).run(saleId, item.parent_id || null, item.name, item.quantity, priceAtSale, item.special_instructions || null);
          }
        }
      }

      if (resolvedCustomer && dueAmount > 0.01) {
        await addCustomerLedgerSaleEntry(client, {
          customerId: resolvedCustomer.id, shopId, saleId, dueAmount, grandTotal, amountReceived, userId
        });
      }

      return { saleId, total: grandTotal, customer_id: resolvedCustomer?.id || null, customer_name: finalCustomerName, customer_phone: finalCustomerPhone };
    };

    let result;
    if (isPostgres) {
      result = await getPostgres().withTransaction(performCheckout);
    } else {
      result = getSqlite().transaction(() => performCheckout(getSqlite()))();
      result = await result; // Unwrap if performCheckout is async (which it is)
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Sale checkout error:", err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sales — list sales for current shop
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();
  const query = `
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
    WHERE s.shop_id = ${isPostgres ? '$1' : '?'}
    ORDER BY s.created_at DESC
  `;

  try {
    let sales;
    if (isPostgres) {
      const { rows } = await getPostgres().query(query, [shopId]);
      sales = rows;
    } else {
      sales = getSqlite().prepare(query).all(shopId);
    }
    res.json(sales);
  } catch (err) {
    console.error("Sales fetch error:", err);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
});

// PATCH /api/sales/:id/pay — record payment / update received amount
router.patch("/:id/pay", requireAuth, async (req, res) => {
  const { amount, note = "" } = req.body;
  const saleId = req.params.id;
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  try {
    let sale;
    if (isPostgres) {
      const { rows } = await getPostgres().query("SELECT * FROM sales WHERE id = $1 AND shop_id = $2", [saleId, shopId]);
      sale = rows[0];
    } else {
      sale = getSqlite().prepare("SELECT * FROM sales WHERE id = ? AND shop_id = ?").get(saleId, shopId);
    }
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    const finalAmount = amount !== undefined ? parseFloat(amount) : Number(sale.total || 0);
    if (Number.isNaN(finalAmount) || finalAmount < 0) return res.status(400).json({ error: "Invalid payment amount" });

    const performPay = async (client) => {
      if (isPostgres) await client.query("UPDATE sales SET amount_received = $1 WHERE id = $2 AND shop_id = $3", [finalAmount, saleId, shopId]);
      else client.prepare("UPDATE sales SET amount_received = ? WHERE id = ? AND shop_id = ?").run(finalAmount, saleId, shopId);

      if (sale.customer_id) {
        const prevDue = Number(sale.total || 0) - Number(sale.amount_received || 0);
        const newDue = Number(sale.total || 0) - finalAmount;
        const paymentMade = Math.max(0, parseFloat((prevDue - newDue).toFixed(2)));

        if (paymentMade > 0.01) {
          await addCustomerLedgerPaymentEntry(client, {
            customerId: sale.customer_id, shopId: sale.shop_id, saleId: sale.id, paymentAmount: paymentMade,
            note: normalizeText(note) || `Payment received for SALE-${String(sale.id).padStart(5, "0")}`,
            userId: req.session.user.id
          });
        }
      }
    };

    if (isPostgres) await getPostgres().withTransaction(performPay);
    else getSqlite().transaction(() => performPay(getSqlite()))();

    res.json({ ok: true, amount_received: finalAmount });
  } catch (e) {
    console.error("Sale payment update error:", e);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// PATCH /api/sales/:id/details — Updates sale customer and payment details
router.patch("/:id/details", requireAuth, async (req, res) => {
  const { customer_name, customer_phone, payment_method, amount_received } = req.body;
  const saleId = req.params.id;
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  try {
    const q = `UPDATE sales SET customer_name = $1, customer_phone = $2, payment_method = $3, amount_received = $4 WHERE id = $5 AND shop_id = $6`;
    const p = [customer_name || '', customer_phone || '', payment_method || 'cash', amount_received || 0, saleId, shopId];
    
    if (isPostgres) await getPostgres().query(q.replace(/\?/g, (m, i) => `$${i + 1}`), p);
    else await getSqlite().prepare(q.replace(/\$\d+/g, '?')).run(...p);
    
    res.json({ success: true });
  } catch (err) {
    console.error("Sale update error:", err);
    res.status(500).json({ error: "Failed to update sale details" });
  }
});

// GET /api/sales/:id/bill — get full bill details
router.get("/:id/bill", requireAuth, async (req, res) => {
  const saleId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  try {
    let sale;
    const saleQ = `
      SELECT s.*, w.name as waiter_name, r.name as rider_name, k.name as kitchen_name, t.table_number 
      FROM sales s 
      LEFT JOIN users w ON s.waiter_id = w.id
      LEFT JOIN users r ON s.rider_id = r.id
      LEFT JOIN users k ON s.kitchen_id = k.id
      LEFT JOIN tables t ON s.table_id = t.id
      WHERE s.id = ${isPostgres ? '$1' : '?'} AND s.shop_id = ${isPostgres ? '$2' : '?'}
    `;
    if (isPostgres) {
      const { rows } = await getPostgres().query(saleQ, [saleId, shopId]);
      sale = rows[0];
    } else {
      sale = getSqlite().prepare(saleQ).get(saleId, shopId);
    }
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    const itemsQ = `
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
      WHERE si.sale_id = ${isPostgres ? '$1' : '?'}
    `;
    let items;
    if (isPostgres) {
      const { rows } = await getPostgres().query(itemsQ, [saleId]);
      items = rows;
    } else {
      items = getSqlite().prepare(itemsQ).all(saleId);
    }

    const payQ = `SELECT amount, note, created_at FROM customer_ledger WHERE sale_id = ${isPostgres ? '$1' : '?'} AND type = 'payment' ORDER BY created_at DESC`;
    let payments;
    if (isPostgres) {
      const { rows } = await getPostgres().query(payQ, [saleId]);
      payments = rows;
    } else {
      payments = getSqlite().prepare(payQ).all(saleId);
    }

    let seller, shop;
    if (isPostgres) {
      const uRes = await getPostgres().query("SELECT name FROM users WHERE id = $1", [sale.user_id]);
      seller = uRes.rows[0];
      const sRes = await getPostgres().query("SELECT * FROM shops WHERE id = $1", [sale.shop_id]);
      shop = sRes.rows[0];
    } else {
      seller = getSqlite().prepare("SELECT name FROM users WHERE id = ?").get(sale.user_id);
      shop = getSqlite().prepare("SELECT * FROM shops WHERE id = ?").get(sale.shop_id);
    }

    if (shop?.receipt_images_json) {
      try { shop.receipt_images = JSON.parse(shop.receipt_images_json); } catch (e) { shop.receipt_images = []; }
    } else shop.receipt_images = [];
    delete shop.receipt_images_json;
    if (shop) shop.use_logo_on_receipt = Boolean(shop.use_logo_on_receipt);

    res.json({ sale, items, seller, shop, payments });
  } catch (err) {
    console.error("Sale bill error:", err);
    res.status(500).json({ error: "Failed to fetch sale details" });
  }
});

// POST /api/sales/:id/return — process a return for a sale
router.post("/:id/return", requireAuth, async (req, res) => {
  const saleId = parseInt(req.params.id, 10);
  const { items, reason = "", payment_method = "cash" } = req.body;
  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const isPostgres = usePostgres();

  if (!items || items.length === 0) return res.status(400).json({ error: "No items to return" });

  try {
    const performReturn = async (client) => {
      let sale;
      if (isPostgres) {
        const { rows } = await client.query("SELECT * FROM sales WHERE id = $1 AND shop_id = $2", [saleId, shopId]);
        sale = rows[0];
      } else {
        sale = client.prepare("SELECT * FROM sales WHERE id = ? AND shop_id = ?").get(saleId, shopId);
      }
      if (!sale) throw new Error("Sale not found");

      let totalRefund = items.reduce((s, it) => s + (it.refund_price * it.quantity), 0);

      let returnId;
      if (isPostgres) {
        const { rows } = await client.query(
          `INSERT INTO returns (shop_id, sale_id, user_id, total_refund, reason, payment_method)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [shopId, saleId, userId, totalRefund, reason, payment_method]
        );
        returnId = rows[0].id;
      } else {
        const res = client.prepare(
          `INSERT INTO returns (shop_id, sale_id, user_id, total_refund, reason, payment_method)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(shopId, saleId, userId, totalRefund, reason, payment_method);
        returnId = res.lastInsertRowid;
      }

      for (const item of items) {
        const origQ = `
          SELECT
            si.id as sale_item_id, si.quantity as sold_qty, si.buying_price_at_sale, si.batch_id,
            (
              SELECT COALESCE(SUM(ri.quantity), 0)
              FROM return_items ri
              JOIN returns r ON ri.return_id = r.id
              WHERE r.sale_id = si.sale_id AND (ri.sale_item_id = si.id OR (ri.sale_item_id IS NULL AND ri.product_id = si.product_id))
            ) as already_returned
          FROM sale_items si
          WHERE si.sale_id = ${isPostgres ? '$1' : '?'} AND (si.id = ${isPostgres ? '$2' : '?'} OR (${isPostgres ? '$3' : '?'} IS NULL AND si.product_id = ${isPostgres ? '$4' : '?'}))
        `;
        let original;
        if (isPostgres) {
          const { rows } = await client.query(origQ, [saleId, item.sale_item_id || null, item.sale_item_id || null, item.product_id || null]);
          original = rows[0];
        } else {
          original = client.prepare(origQ).get(saleId, item.sale_item_id || null, item.sale_item_id || null, item.product_id || null);
        }

        if (!original && item.product_id) throw new Error(`Product ${item.product_id} was not part of this sale`);
        if (item.product_id) {
          const available = original.sold_qty - original.already_returned;
          if (item.quantity > available) throw new Error(`Only ${available} units available to return.`);
        }

        const originalCogs = original?.buying_price_at_sale || 0;
        if (isPostgres) {
          await client.query(`INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, refund_price, buying_price_at_sale, is_damage) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [returnId, item.sale_item_id || null, item.product_id || null, item.quantity, item.refund_price, originalCogs, item.is_damage ? 1 : 0]);
        } else {
          client.prepare(`INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, refund_price, buying_price_at_sale, is_damage) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(returnId, item.sale_item_id || null, item.product_id || null, item.quantity, item.refund_price, originalCogs, item.is_damage ? 1 : 0);
        }

        if (item.product_id) {
          const soldBatchId = original?.batch_id || null;
          if (item.is_damage) {
            if (isPostgres) {
              await client.query("UPDATE products SET damage_stock = damage_stock + $1, manual_damage_loss = manual_damage_loss + $2 WHERE id = $3 AND shop_id = $4", [item.quantity, (item.quantity * originalCogs), item.product_id, shopId]);
              if (soldBatchId) await client.query("UPDATE product_batches SET damaged_quantity = damaged_quantity + $1 WHERE id = $2", [item.quantity, soldBatchId]);
            } else {
              client.prepare("UPDATE products SET damage_stock = damage_stock + ?, manual_damage_loss = manual_damage_loss + ? WHERE id = ? AND shop_id = ?").run(item.quantity, (item.quantity * originalCogs), item.product_id, shopId);
              if (soldBatchId) client.prepare("UPDATE product_batches SET damaged_quantity = damaged_quantity + ? WHERE id = ?").run(item.quantity, soldBatchId);
            }
          } else {
            let batchRestored = false;
            if (soldBatchId) {
              if (isPostgres) {
                const res = await client.query("UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2", [item.quantity, soldBatchId]);
                if (res.rowCount > 0) batchRestored = true;
              } else {
                const res = client.prepare("UPDATE product_batches SET quantity = quantity + ? WHERE id = ?").run(item.quantity, soldBatchId);
                if (res.changes > 0) batchRestored = true;
              }
            }
            if (!batchRestored) {
              let newestBatch;
              if (isPostgres) {
                const { rows } = await client.query('SELECT id FROM product_batches WHERE product_id = $1 AND shop_id = $2 ORDER BY created_at DESC LIMIT 1', [item.product_id, shopId]);
                newestBatch = rows[0];
              } else {
                newestBatch = client.prepare('SELECT id FROM product_batches WHERE product_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT 1').get(item.product_id, shopId);
              }
              if (newestBatch) {
                if (isPostgres) await client.query("UPDATE product_batches SET quantity = quantity + $1 WHERE id = $2", [item.quantity, newestBatch.id]);
                else client.prepare("UPDATE product_batches SET quantity = quantity + ? WHERE id = ?").run(item.quantity, newestBatch.id);
              }
            }
            if (isPostgres) await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2", [item.quantity, item.product_id]);
            else client.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.product_id);
          }
        }
      }

      if (sale.customer_id && totalRefund > 0.01) {
        let customer;
        if (isPostgres) {
          const { rows } = await client.query('SELECT current_balance FROM customers WHERE id = $1', [sale.customer_id]);
          customer = rows[0];
        } else {
          customer = client.prepare('SELECT current_balance FROM customers WHERE id = ?').get(sale.customer_id);
        }
        if (customer) {
          let creditAmount = payment_method === 'ledger' ? totalRefund : 0;
          const noteSuffix = payment_method === 'ledger' ? " (Credited to Account)" : ` (Refunded via ${payment_method.toUpperCase()})`;
          const newBalance = parseFloat((Number(customer.current_balance || 0) - creditAmount).toFixed(2));
          if (creditAmount !== 0) {
            if (isPostgres) await client.query('UPDATE customers SET current_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newBalance, sale.customer_id]);
            else client.prepare('UPDATE customers SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newBalance, sale.customer_id);
          }
          if (isPostgres) {
            await client.query(`INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by) VALUES ($1, $2, $3, 'return', $4, $5, $6, $7)`, [sale.customer_id, shopId, saleId, totalRefund, newBalance, `Return refund — SALE-${String(saleId).padStart(5, '0')}${noteSuffix}`, userId]);
          } else {
            client.prepare(`INSERT INTO customer_ledger (customer_id, shop_id, sale_id, type, amount, balance_after, note, created_by) VALUES (?, ?, ?, 'return', ?, ?, ?, ?)`).run(sale.customer_id, shopId, saleId, totalRefund, newBalance, `Return refund — SALE-${String(saleId).padStart(5, '0')}${noteSuffix}`, userId);
          }
        }
      }
      return { returnId, totalRefund };
    };

    let result;
    if (isPostgres) result = await getPostgres().withTransaction(performReturn);
    else {
      result = getSqlite().transaction(() => performReturn(getSqlite()))();
      result = await result;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Return error:", err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sales/returns/:id/receipt
router.get("/returns/:id/receipt", requireAuth, async (req, res) => {
  const returnId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const isPostgres = usePostgres();

  try {
    let ret;
    if (isPostgres) {
      const { rows } = await getPostgres().query("SELECT * FROM returns WHERE id = $1 AND shop_id = $2", [returnId, shopId]);
      ret = rows[0];
    } else {
      ret = getSqlite().prepare("SELECT * FROM returns WHERE id = ? AND shop_id = ?").get(returnId, shopId);
    }
    if (!ret) return res.status(404).json({ error: "Return not found" });

    const itemsQ = `
      SELECT ri.*, COALESCE(p.name, 'Manual Item') as product_name, b.name as brand_name
      FROM return_items ri
      LEFT JOIN products p ON ri.product_id = p.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ri.return_id = ${isPostgres ? '$1' : '?'}
    `;
    let items;
    if (isPostgres) items = (await getPostgres().query(itemsQ, [returnId])).rows;
    else items = getSqlite().prepare(itemsQ).all(returnId);

    let sale, user, shop;
    if (isPostgres) {
      sale = (await getPostgres().query("SELECT * FROM sales WHERE id = $1", [ret.sale_id])).rows[0];
      user = (await getPostgres().query("SELECT name FROM users WHERE id = $1", [ret.user_id])).rows[0];
      shop = (await getPostgres().query("SELECT * FROM shops WHERE id = $1", [ret.shop_id])).rows[0];
    } else {
      sale = getSqlite().prepare("SELECT * FROM sales WHERE id = ?").get(ret.sale_id);
      user = getSqlite().prepare("SELECT name FROM users WHERE id = ?").get(ret.user_id);
      shop = getSqlite().prepare("SELECT * FROM shops WHERE id = ?").get(ret.shop_id);
    }

    if (shop?.receipt_images_json) {
      try { shop.receipt_images = JSON.parse(shop.receipt_images_json); } catch (e) { shop.receipt_images = []; }
    } else shop.receipt_images = [];
    delete shop.receipt_images_json;
    if (shop) shop.use_logo_on_receipt = Boolean(shop.use_logo_on_receipt);

    res.json({ return: ret, items, sale, user, shop });
  } catch (err) {
    console.error("Return receipt error:", err);
    res.status(500).json({ error: "Failed to fetch return details" });
  }
});

module.exports = router;

const db = require('../db/knex');
const customerService = require('./CustomerService');
const { z } = require('zod');

// Validation Schemas
const checkoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().nullable().optional(),
    name: z.string().nullable().optional(),
    quantity: z.number().positive(),
    selling_price: z.number().nonnegative(),
    parent_id: z.number().int().nullable().optional(),
    special_instructions: z.string().nullable().optional(),
    variants: z.array(z.any()).nullable().optional(),
    addons: z.array(z.any()).nullable().optional(),
  })).min(1, "Cart cannot be empty"),
  discount: z.number().nonnegative().default(0),
  tax_percentage: z.number().nonnegative().default(0),
  payment_method: z.string().default("cash"),
  amount_received: z.number().nonnegative().default(0),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_id: z.number().int().nullable().optional(),
  order_type: z.string().default("dine_in"),
  table_id: z.number().int().nullable().optional(),
  waiter_id: z.number().int().nullable().optional(),
  rider_id: z.number().int().nullable().optional(),
  guest_count: z.number().int().default(1),
  token_number: z.string().nullable().optional(),
  delivery_address: z.string().nullable().optional(),
  kitchen_id: z.number().int().nullable().optional(),
  order_status: z.string().default('pending'),
});

class SalesService {
  async getPrinterRouting(dbInstance, shopId) {
    const printers = await dbInstance('printers')
      .where({ shop_id: shopId })
      .select('id', 'display_name', 'system_name')
      .orderBy('id', 'asc');

    const noneRoute = {
      key: 'NONE',
      station: 'NONE',
      systemName: 'NONE',
      label: 'No Printer'
    };
    const byRouteKey = new Map();
    const bySystemName = new Map();
    const makePrinterRoute = (printer) => {
      if (!printer) return noneRoute;
      const key = `PRINTER:${printer.id}`;
      return {
        key,
        station: printer.system_name,
        systemName: printer.system_name,
        label: printer.display_name || printer.system_name,
        printerId: printer.id,
        printerLabel: printer.display_name || printer.system_name
      };
    };

    printers.forEach((printer) => {
      const route = makePrinterRoute(printer);
      byRouteKey.set(route.key, route);
      if (!bySystemName.has(printer.system_name)) {
        bySystemName.set(printer.system_name, route);
      }
    });

    const defaultRoute = printers[0] ? makePrinterRoute(printers[0]) : noneRoute;
    const resolvePrinterRoute = (routeValue) => {
      if (!routeValue) return noneRoute;
      const value = String(routeValue).trim();
      if (!value || value === 'NONE') return noneRoute;
      if (value === 'DEFAULT') return defaultRoute;
      if (value.startsWith('PRINTER:')) return byRouteKey.get(value) || noneRoute;
      return bySystemName.get(value) || noneRoute;
    };

    const resolveStation = (station) => resolvePrinterRoute(station).station;

    return { printers, resolvePrinterRoute, resolveStation };
  }

  async resolveKitchenRoute(dbInstance, sale, shopId, resolvePrinterRoute) {
    if (!sale?.kitchen_id) return resolvePrinterRoute('NONE');

    const kitchen = await dbInstance('users')
      .where({ id: sale.kitchen_id, shop_id: shopId, role: 'kitchen' })
      .select('id', 'name', 'username', 'printer_station')
      .first();

    if (!kitchen) return resolvePrinterRoute('NONE');

    const printerRoute = resolvePrinterRoute(kitchen.printer_station);
    if (printerRoute.station === 'NONE') return printerRoute;

    const kitchenLabel = kitchen.name || kitchen.username || `Kitchen ${kitchen.id}`;
    return {
      ...printerRoute,
      key: `KITCHEN:${kitchen.id}`,
      label: `Kitchen: ${kitchenLabel}`,
      kitchenId: kitchen.id,
      kitchenLabel
    };
  }

  async resolveKitchenStation(dbInstance, sale, shopId, resolvePrinterRoute) {
    const route = await this.resolveKitchenRoute(dbInstance, sale, shopId, resolvePrinterRoute);
    return route.station;
  }

  async getKitchenRouteMap(dbInstance, shopId, resolvePrinterRoute) {
    const kitchens = await dbInstance('users')
      .where({ shop_id: shopId, role: 'kitchen' })
      .select('id', 'name', 'username', 'printer_station');

    const map = {};
    kitchens.forEach((kitchen) => {
      const printerRoute = resolvePrinterRoute(kitchen.printer_station);
      if (printerRoute.station === 'NONE') {
        map[`KITCHEN:${kitchen.id}`] = printerRoute;
        return;
      }

      const kitchenLabel = kitchen.name || kitchen.username || `Kitchen ${kitchen.id}`;
      map[`KITCHEN:${kitchen.id}`] = {
        ...printerRoute,
        key: `KITCHEN:${kitchen.id}`,
        label: `Kitchen: ${kitchenLabel}`,
        kitchenId: kitchen.id,
        kitchenLabel
      };
    });
    return map;
  }

  async getCategoryPrintRouteMap(dbInstance, shopId, resolvePrinterRoute) {
    const [categories, kitchenRouteMap] = await Promise.all([
      dbInstance('product_categories')
        .where({ shop_id: shopId })
        .select('name', 'printer_station'),
      this.getKitchenRouteMap(dbInstance, shopId, resolvePrinterRoute)
    ]);

    const resolveRoute = (route) => {
      if (!route) return resolvePrinterRoute('NONE');
      if (typeof route === 'string' && route.startsWith('KITCHEN:')) {
        return kitchenRouteMap[route] || resolvePrinterRoute('NONE');
      }
      return resolvePrinterRoute(route);
    };

    const routeMap = {};
    categories.forEach((category) => {
      routeMap[category.name] = {
        raw: category.printer_station || null,
        route: resolveRoute(category.printer_station)
      };
    });
    return routeMap;
  }

  getItemCategory(item) {
    return item.product?.category || item.product_category || item.category || null;
  }

  getItemPrintRoute(item, categoryRouteMap, fallbackRoute) {
    const category = this.getItemCategory(item);
    const categoryRoute = category ? categoryRouteMap[category] : null;
    if (categoryRoute?.raw) return categoryRoute.route;
    return fallbackRoute || {
      key: 'NONE',
      station: 'NONE',
      systemName: 'NONE',
      label: 'No Printer'
    };
  }

  getItemPrintStation(item, categoryRouteMap, fallbackRoute) {
    return this.getItemPrintRoute(item, categoryRouteMap, fallbackRoute).station;
  }

  buildPrintJobItem(item) {
    const parseList = (value, fallback = []) => {
      if (!value) return fallback;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
          return fallback;
        }
      }
      return fallback;
    };

    return {
      name: item.product ? item.product.name : (item.product_name || item.name || item.custom_name),
      quantity: item.quantity,
      special_instructions: item.special_instructions,
      variants: parseList(item.variants_json, item.variants || []),
      addons: parseList(item.addons_json, item.addons || [])
    };
  }

  /**
   * Generates automatic print jobs based on item categories and stations
   * Creates separate print jobs per category even if they route to the same printer
   */
  async generatePrintJobs(saleId, items, shopId, trx) {
    const dbInstance = trx || db;

    const { printers, resolvePrinterRoute } = await this.getPrinterRouting(dbInstance, shopId);
    if (!printers.length) {
      return { queued: 0, printer_configured: false };
    }

    const sale = await dbInstance('sales').where({ id: saleId, shop_id: shopId }).first();
    if (!sale) return { queued: 0, printer_configured: true };

    const jobs = {};
    const addItemToRoute = (route, item, category) => {
      if (!route || route.station === 'NONE') return;
      
      // Create unique key combining category and route to enable split printing
      // This ensures separate print jobs even if categories route to the same printer
      let routeKey = route.key || route.station;
      if (category) {
        routeKey = `${category}::${routeKey}`;
      }
      
      if (!jobs[routeKey]) {
        jobs[routeKey] = { route, items: [], category };
      }
      jobs[routeKey].items.push(this.buildPrintJobItem(item));
    };

    const [categoryRouteMap, kitchenRoute] = await Promise.all([
      this.getCategoryPrintRouteMap(dbInstance, shopId, resolvePrinterRoute),
      this.resolveKitchenRoute(dbInstance, sale, shopId, resolvePrinterRoute)
    ]);

    for (const item of items) {
      const category = this.getItemCategory(item);
      const route = this.getItemPrintRoute(item, categoryRouteMap, kitchenRoute);
      addItemToRoute(route, item, category);
    }

    let queuedCount = 0;
    for (const { route, items: stationItems } of Object.values(jobs)) {
      const station = route.station;
      const content = {
        type: 'PRINT_URL',
        format: 'kitchen',
        sale_id: saleId,
        station_name: station,
        route_key: route.key,
        route_label: route.label,
        printer_label: route.printerLabel || route.label,
        print_url: `/print/sales/${saleId}?format=kitchen&station=${encodeURIComponent(route.key)}&shop_id=${shopId}&autoprint=0`,
        order_type: sale.order_type,
        table_number: sale.table_id ? (await dbInstance('tables').where({id: sale.table_id}).first())?.table_number : null,
        token_number: sale.token_number,
        items: stationItems,
        created_at: new Date().toISOString()
      };

      const [jobIdResult] = await dbInstance('print_queue').insert({
        shop_id: shopId,
        station_name: station,
        content_json: JSON.stringify(content),
        status: 'pending'
      }).returning('id');

      const jobId = typeof jobIdResult === 'object' ? jobIdResult.id : jobIdResult;
      if (jobId) {
        content.job_id = jobId;
        content.print_url = `/print/jobs/${jobId}?shop_id=${shopId}&autoprint=0`;
        await dbInstance('print_queue')
          .where({ id: jobId, shop_id: shopId })
          .update({ content_json: JSON.stringify(content) });
      }
      queuedCount += 1;
    }

    return { queued: queuedCount, printer_configured: true };
  }

  async queueReceiptPrint(saleId, shopId, format = 'customer', trx) {
    const dbInstance = trx || db;
    const normalizedFormat = ['kitchen', 'customer', 'unpaid'].includes(format) ? format : 'customer';
    const bill = await this.getBill(saleId, shopId);
    if (!bill) return { queued: 0, printer_configured: false };

    if (normalizedFormat === 'kitchen') {
      return this.generatePrintJobs(saleId, bill.items, shopId, dbInstance);
    }

    // For customer and unpaid bills, check if category-based routing is configured
    // If yes, use split printing by category. If no, use the default bill printer setting.
    const { printers, resolvePrinterRoute } = await this.getPrinterRouting(dbInstance, shopId);
    const categoryRouteMap = await this.getCategoryPrintRouteMap(dbInstance, shopId, resolvePrinterRoute);
    
    // Check if any categories have routing configured
    const hasCategoryRouting = Object.values(categoryRouteMap).some(cat => cat.raw);
    
    if (hasCategoryRouting && printers.length > 0) {
      // Use split printing by category for bills
      return this.generateBillPrintJobs(saleId, bill.items, shopId, normalizedFormat, dbInstance);
    }

    // Fallback to default bill printer setting (not split)
    const shopSettings = await dbInstance('shops').where({ id: shopId }).select('customer_bill_printer', 'unpaid_bill_printer').first();
    let targetPrinterRouteValue = null;

    if (normalizedFormat === 'customer' && shopSettings?.customer_bill_printer) {
      targetPrinterRouteValue = shopSettings.customer_bill_printer;
    } else if (normalizedFormat === 'unpaid' && shopSettings?.unpaid_bill_printer) {
      targetPrinterRouteValue = shopSettings.unpaid_bill_printer;
    }

    if (!targetPrinterRouteValue) {
      return { queued: 0, printer_configured: false };
    }

    const printerRoute = resolvePrinterRoute(targetPrinterRouteValue);
    if (printerRoute.station === 'NONE') {
      return { queued: 0, printer_configured: false };
    }

    await dbInstance('print_queue').insert({
      shop_id: shopId,
      station_name: printerRoute.station,
      content_json: JSON.stringify({
        type: 'PRINT_URL',
        format: normalizedFormat,
        sale_id: saleId,
        station_name: printerRoute.station,
        route_key: printerRoute.key,
        route_label: printerRoute.label,
        printer_label: printerRoute.printerLabel || printerRoute.label,
        print_url: `/print/sales/${saleId}?format=${normalizedFormat}&shop_id=${shopId}&autoprint=0`
      }),
      status: 'pending'
    });

    return { queued: 1, printer_configured: true };
  }

  /**
   * Generate split bill print jobs by category (for customer/unpaid bills)
   */
  async generateBillPrintJobs(saleId, items, shopId, format, trx) {
    const dbInstance = trx || db;
    const { printers, resolvePrinterRoute } = await this.getPrinterRouting(dbInstance, shopId);
    
    if (!printers.length) {
      return { queued: 0, printer_configured: false };
    }

    const sale = await dbInstance('sales').where({ id: saleId, shop_id: shopId }).first();
    if (!sale) return { queued: 0, printer_configured: true };

    const jobs = {};
    const [categoryRouteMap, kitchenRoute] = await Promise.all([
      this.getCategoryPrintRouteMap(dbInstance, shopId, resolvePrinterRoute),
      this.resolveKitchenRoute(dbInstance, sale, shopId, resolvePrinterRoute)
    ]);

    // Group items by category
    for (const item of items) {
      const category = this.getItemCategory(item);
      const route = this.getItemPrintRoute(item, categoryRouteMap, kitchenRoute);
      
      if (!route || route.station === 'NONE') continue;
      
      let routeKey = route.key || route.station;
      if (category) {
        routeKey = `${category}::${routeKey}`;
      }
      
      if (!jobs[routeKey]) {
        jobs[routeKey] = { route, items: [], category };
      }
      jobs[routeKey].items.push(this.buildPrintJobItem(item));
    }

    let queuedCount = 0;
    for (const { route, items: categoryItems } of Object.values(jobs)) {
      const station = route.station;
      await dbInstance('print_queue').insert({
        shop_id: shopId,
        station_name: station,
        content_json: JSON.stringify({
          type: 'PRINT_URL',
          format: format,
          sale_id: saleId,
          station_name: station,
          route_key: route.key,
          route_label: route.label,
          printer_label: route.printerLabel || route.label,
          print_url: `/print/sales/${saleId}?format=${format}&station=${encodeURIComponent(route.key)}&shop_id=${shopId}&autoprint=0`,
          items: categoryItems
        }),
        status: 'pending'
      });
      queuedCount += 1;
    }

    return { queued: queuedCount, printer_configured: true };
  }

  /**
   * Main Checkout Workflow
   */
  async createSale(payload, shopId, userId) {
    const data = checkoutSchema.parse(payload);
    
    return await db.transaction(async (trx) => {
      let subtotal = 0;
      const resolvedItems = [];

      // 1. Resolve and Validate Stock for all items
      for (const item of data.items) {
        if (item.product_id) {
          const product = await trx('products')
            .where({ id: item.product_id, shop_id: shopId })
            .first();

          if (!product) throw new Error(`Product ${item.product_id} not found`);

          // Check for Recipe
          const recipeLink = await trx('product_recipe_links')
            .where({ product_id: item.product_id, shop_id: shopId })
            .first();

          if (recipeLink) {
            const ingredients = await trx('recipe_ingredients as ri')
              .select('ri.raw_stock_id', 'ri.quantity as amount_per_unit', 'rs.name as ing_name', 'rs.current_stock', 'rs.conversion_factor')
              .join('raw_stocks as rs', 'ri.raw_stock_id', 'rs.id')
              .where('ri.recipe_id', recipeLink.recipe_id);

            for (const ing of ingredients) {
              const factor = ing.conversion_factor || 1;
              const totalNeeded = (ing.amount_per_unit * item.quantity) / factor;
              if (ing.current_stock < totalNeeded) {
                throw new Error(`Insufficient stock of ingredient "${ing.ing_name}" for "${product.name}".`);
              }
            }
          } else if (product.stock < item.quantity) {
            throw new Error(`Insufficient stock for "${product.name}"`);
          }

          resolvedItems.push({
            product,
            quantity: item.quantity,
            selling_price: item.selling_price,
            parent_id: item.parent_id,
            special_instructions: item.special_instructions,
            variants_json: item.variants ? JSON.stringify(item.variants) : null,
            addons_json: item.addons ? JSON.stringify(item.addons) : null,
          });
        } else {
          resolvedItems.push({
            manual: true,
            name: item.name,
            quantity: item.quantity,
            selling_price: item.selling_price,
            parent_id: item.parent_id,
            special_instructions: item.special_instructions,
          });
        }
        subtotal += item.selling_price * item.quantity;
      }

      // 2. Calculations
      const taxAmount = (subtotal - data.discount) * (data.tax_percentage / 100);
      const grandTotal = subtotal - data.discount + taxAmount;
      const dueAmount = parseFloat((grandTotal - data.amount_received).toFixed(2));

      // 3. Customer Resolution
      const customer = await customerService.resolveOrCreateCustomer(trx, {
        shopId, 
        customerId: data.customer_id, 
        customerName: data.customer_name, 
        customerPhone: data.customer_phone
      });

      if (customer && dueAmount > 0.01) {
        const limit = Number(customer.credit_limit || 0);
        const currentBal = Number(customer.current_balance || 0);
        if (limit > 0 && (currentBal + dueAmount) > limit) {
          throw new Error(`Credit limit exceeded for ${customer.name}.`);
        }
      }

      // 4. Insert Sale
      const [saleIdObj] = await trx('sales')
        .insert({
          shop_id: shopId,
          user_id: userId,
          customer_id: customer ? customer.id : null,
          customer_name: data.customer_name || (customer ? customer.name : ""),
          customer_phone: data.customer_phone || (customer ? customer.phone : ""),
          delivery_address: data.delivery_address,
          total: grandTotal,
          discount: data.discount,
          tax_percentage: data.tax_percentage,
          payment_method: data.payment_method,
          amount_received: data.amount_received,
          order_type: data.order_type,
          table_id: data.table_id,
          waiter_id: data.waiter_id,
          rider_id: data.rider_id,
          kitchen_id: data.kitchen_id,
          guest_count: data.guest_count,
          token_number: data.token_number,
          order_status: data.order_status
        })
        .returning('id');
      const saleId = typeof saleIdObj === 'object' ? saleIdObj.id : saleIdObj;

      // 4.1 Update Table Status to occupied
      if (data.table_id) {
        await trx('tables')
          .where({ id: data.table_id, shop_id: shopId })
          .update({ status: 'occupied' });
      }

      // 5. Process Items and Deduct Stock
      for (const item of resolvedItems) {
        let priceAtSale = item.selling_price;
        let remainingToDeduct = item.quantity;

        // Parent/Composition Logic for prices
        if (item.parent_id) {
          const parent = await trx('products').where({ id: item.parent_id }).first();
          if (parent) {
            const compCount = await trx('product_compositions')
              .where({ parent_product_id: item.parent_id })
              .sum('quantity as total')
              .first();
            if (compCount && compCount.total > 0) priceAtSale = parent.selling_price / compCount.total;
          }
        }

        if (!item.manual) {
          // Recipe Stock Deduction
          const variantNames = item.variants_json ? JSON.parse(item.variants_json).map(v => v.name || v) : [];
          const links = await trx('product_recipe_links')
            .where({ product_id: item.product.id, shop_id: shopId });
          const activeLinks = links.filter(l => !l.variant_name || variantNames.includes(l.variant_name));

          if (activeLinks.length > 0) {
            await trx('sale_items').insert({
              sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
              quantity: item.quantity, price_at_sale: priceAtSale, buying_price_at_sale: item.product.buying_price || 0,
              special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
            });

            for (const link of activeLinks) {
              const ingredients = await trx('recipe_ingredients').where({ recipe_id: link.recipe_id });
              for (const ing of ingredients) {
                const rs = await trx('raw_stocks').where({ id: ing.raw_stock_id }).first();
                const factor = rs.conversion_factor || 1;
                const totalNeeded = (ing.quantity * item.quantity) / factor;

                let remaining = totalNeeded;
                const batches = await trx('raw_stock_batches')
                  .where({ raw_stock_id: ing.raw_stock_id, shop_id: shopId })
                  .andWhere('quantity', '>', 0)
                  .orderBy('created_at', 'asc');

                for (const b of batches) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, b.quantity);
                  await trx('raw_stock_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
                  remaining -= take;
                }
                await trx('raw_stocks').where({ id: ing.raw_stock_id }).update({ current_stock: db.raw('current_stock - ?', [totalNeeded]) });
              }
            }
          } else {
            // Retail Stock Deduction (FIFO)
            const batches = await trx('product_batches')
              .where({ product_id: item.product.id, shop_id: shopId })
              .andWhere('quantity', '>', 0)
              .orderBy('created_at', 'asc');

            for (const b of batches) {
              if (remainingToDeduct <= 0) break;
              const take = Math.min(remainingToDeduct, b.quantity);
              await trx('sale_items').insert({
                sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
                quantity: take, price_at_sale: priceAtSale, buying_price_at_sale: b.buying_price, batch_id: b.id,
                special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
              });
              await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
              remainingToDeduct -= take;
            }

            // Oversell handling (record at current cost)
            if (remainingToDeduct > 0) {
                const lastBatch = await trx('product_batches').where({ product_id: item.product.id }).orderBy('created_at', 'desc').first();
                const cost = lastBatch ? lastBatch.buying_price : (item.product.buying_price || 0);
                await trx('sale_items').insert({
                    sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
                    quantity: remainingToDeduct, price_at_sale: priceAtSale, buying_price_at_sale: cost,
                    batch_id: lastBatch ? lastBatch.id : null,
                    special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
                });
                if (lastBatch) await trx('product_batches').where({ id: lastBatch.id }).update({ quantity: db.raw('quantity - ?', [remainingToDeduct]) });
            }
            await trx('products').where({ id: item.product.id }).update({ stock: db.raw('stock - ?', [item.quantity]) });
          }
        } else {
          // Manual Item
          await trx('sale_items').insert({
            sale_id: saleId, product_id: null, parent_id: item.parent_id || null,
            custom_name: item.name, quantity: item.quantity, price_at_sale: priceAtSale, 
            buying_price_at_sale: 0, special_instructions: item.special_instructions
          });
        }
      }

      // 6. Ledger Update
      if (customer && dueAmount > 0.01) {
        await customerService.addSaleEntry(trx, {
          customerId: customer.id, shopId, saleId, dueAmount, grandTotal, amountReceived: data.amount_received, userId
        });
      }

      // 7. Automatic Kitchen/Station Printing
      const printResult = await this.generatePrintJobs(saleId, resolvedItems, shopId, trx);

      return {
        saleId,
        total: grandTotal,
        customer_id: customer?.id,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        print_jobs_queued: printResult.queued,
        printer_configured: printResult.printer_configured
      };
    });
  }

  async updateSaleItems(saleId, payload, shopId, userId) {
    const data = checkoutSchema.parse(payload);
    
    return await db.transaction(async (trx) => {
      const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).first();
      if (!sale) throw new Error("Sale not found");
      if (sale.order_status === 'completed') throw new Error("Cannot edit a completed order");

      // 1. Fetch previous items to restore stock
      const oldItems = await trx('sale_items').where({ sale_id: saleId });

      // 2. Restore Stock for Old Items
      for (const item of oldItems) {
        if (item.product_id) {
          if (item.batch_id) {
            // Retail item restoration
            await trx('product_batches').where({ id: item.batch_id }).update({ quantity: db.raw('quantity + ?', [item.quantity]) });
            await trx('products').where({ id: item.product_id }).update({ stock: db.raw('stock + ?', [item.quantity]) });
          } else {
            // Recipe or Oversold item
            const variantNames = item.variants_json ? JSON.parse(item.variants_json).map(v => v.name || v) : [];
            const activeLinks = await trx('product_recipe_links')
              .where({ product_id: item.product_id, shop_id: shopId })
              .andWhere(function() {
                if (variantNames.length > 0) this.whereIn('variant_name', variantNames);
              });

            if (activeLinks.length > 0) {
              // Recipe Restoration
              for (const link of activeLinks) {
                const ingredients = await trx('recipe_ingredients').where({ recipe_id: link.recipe_id });
                for (const ing of ingredients) {
                  const rs = await trx('raw_stocks').where({ id: ing.raw_stock_id }).first();
                  const factor = rs.conversion_factor || 1;
                  const totalToRestore = (ing.quantity * item.quantity) / factor;
                  await trx('raw_stocks').where({ id: ing.raw_stock_id }).update({ current_stock: db.raw('current_stock + ?', [totalToRestore]) });
                  const newestBatch = await trx('raw_stock_batches').where({ raw_stock_id: ing.raw_stock_id, shop_id: shopId }).orderBy('created_at', 'desc').first();
                  if (newestBatch) await trx('raw_stock_batches').where({ id: newestBatch.id }).update({ quantity: db.raw('quantity + ?', [totalToRestore]) });
                }
              }
            } else {
              // Oversold retail item restoration
              await trx('products').where({ id: item.product_id }).update({ stock: db.raw('stock + ?', [item.quantity]) });
              const newestBatch = await trx('product_batches').where({ product_id: item.product_id, shop_id: shopId }).orderBy('created_at', 'desc').first();
              if (newestBatch) await trx('product_batches').where({ id: newestBatch.id }).update({ quantity: db.raw('quantity + ?', [item.quantity]) });
            }
          }
        }
      }

      // 3. Delete old items and Ledger entries associated with this sale
      await trx('sale_items').where({ sale_id: saleId }).del();
      
      // Handle Ledger and Balance restoration
      const oldLedgerEntries = await trx('customer_ledger').where({ sale_id: saleId, type: 'sale' });
      for (const entry of oldLedgerEntries) {
          await trx('customers').where({ id: entry.customer_id }).update({
              current_balance: db.raw('current_balance - ?', [entry.amount])
          });
      }
      await trx('customer_ledger').where({ sale_id: saleId }).del();

      // 4. Process new items
      let subtotal = 0;
      const resolvedItems = [];

      for (const item of data.items) {
        if (item.product_id) {
          const product = await trx('products').where({ id: item.product_id, shop_id: shopId }).first();
          if (!product) throw new Error(`Product ${item.product_id} not found`);

          // Stock Validation
          const recipeLink = await trx('product_recipe_links').where({ product_id: item.product_id, shop_id: shopId }).first();
          if (recipeLink) {
             const ingredients = await trx('recipe_ingredients as ri')
              .select('ri.raw_stock_id', 'ri.quantity as amount_per_unit', 'rs.name as ing_name', 'rs.current_stock', 'rs.conversion_factor')
              .join('raw_stocks as rs', 'ri.raw_stock_id', 'rs.id')
              .where('ri.recipe_id', recipeLink.recipe_id);

            for (const ing of ingredients) {
              const factor = ing.conversion_factor || 1;
              const totalNeeded = (ing.amount_per_unit * item.quantity) / factor;
              if (ing.current_stock < totalNeeded) throw new Error(`Insufficient stock of ingredient "${ing.ing_name}" for "${product.name}".`);
            }
          } else if (product.stock < item.quantity) {
            throw new Error(`Insufficient stock for "${product.name}"`);
          }

          resolvedItems.push({
            product, quantity: item.quantity, selling_price: item.selling_price, parent_id: item.parent_id,
            special_instructions: item.special_instructions,
            variants_json: item.variants ? JSON.stringify(item.variants) : null,
            addons_json: item.addons ? JSON.stringify(item.addons) : null,
          });
        } else {
          resolvedItems.push({ manual: true, name: item.name, quantity: item.quantity, selling_price: item.selling_price, parent_id: item.parent_id, special_instructions: item.special_instructions });
        }
        subtotal += item.selling_price * item.quantity;
      }

      const taxAmount = (subtotal - data.discount) * (data.tax_percentage / 100);
      const grandTotal = subtotal - data.discount + taxAmount;
      const dueAmount = parseFloat((grandTotal - data.amount_received).toFixed(2));

      // 5. Update Sale Record
      await trx('sales').where({ id: saleId }).update({
        customer_id: data.customer_id || (sale.customer_id),
        customer_name: data.customer_name || sale.customer_name,
        customer_phone: data.customer_phone || sale.customer_phone,
        total: grandTotal,
        discount: data.discount,
        tax_percentage: data.tax_percentage,
        payment_method: data.payment_method,
        amount_received: data.amount_received,
        order_type: data.order_type,
        table_id: data.table_id || sale.table_id,
        waiter_id: data.waiter_id || sale.waiter_id,
        rider_id: data.rider_id || sale.rider_id,
        kitchen_id: data.kitchen_id || sale.kitchen_id,
        guest_count: data.guest_count,
        token_number: data.token_number || sale.token_number,
        updated_at: trx.fn.now()
      });

      // 6. Process NEW items and Deduct Stock
      for (const item of resolvedItems) {
        let priceAtSale = item.selling_price;
        let remainingToDeduct = item.quantity;

        if (item.parent_id) {
          const parent = await trx('products').where({ id: item.parent_id }).first();
          if (parent) {
            const compCount = await trx('product_compositions').where({ parent_product_id: item.parent_id }).sum('quantity as total').first();
            if (compCount && compCount.total > 0) priceAtSale = parent.selling_price / compCount.total;
          }
        }

        if (!item.manual) {
           const variantNames = item.variants_json ? JSON.parse(item.variants_json).map(v => v.name || v) : [];
           const links = await trx('product_recipe_links').where({ product_id: item.product.id, shop_id: shopId });
           const activeLinks = links.filter(l => !l.variant_name || variantNames.includes(l.variant_name));

           if (activeLinks.length > 0) {
             await trx('sale_items').insert({
               sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
               quantity: item.quantity, price_at_sale: priceAtSale, buying_price_at_sale: item.product.buying_price || 0,
               special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
             });

             for (const link of activeLinks) {
               const ingredients = await trx('recipe_ingredients').where({ recipe_id: link.recipe_id });
               for (const ing of ingredients) {
                 const rs = await trx('raw_stocks').where({ id: ing.raw_stock_id }).first();
                 const factor = rs.conversion_factor || 1;
                 const totalNeeded = (ing.quantity * item.quantity) / factor;
                 let remaining = totalNeeded;
                 const batches = await trx('raw_stock_batches').where({ raw_stock_id: ing.raw_stock_id, shop_id: shopId }).andWhere('quantity', '>', 0).orderBy('created_at', 'asc');
                 for (const b of batches) {
                   if (remaining <= 0) break;
                   const take = Math.min(remaining, b.quantity);
                   await trx('raw_stock_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
                   remaining -= take;
                 }
                 await trx('raw_stocks').where({ id: ing.raw_stock_id }).update({ current_stock: db.raw('current_stock - ?', [totalNeeded]) });
               }
             }
           } else {
             const batches = await trx('product_batches').where({ product_id: item.product.id, shop_id: shopId }).andWhere('quantity', '>', 0).orderBy('created_at', 'asc');
             for (const b of batches) {
               if (remainingToDeduct <= 0) break;
               const take = Math.min(remainingToDeduct, b.quantity);
               await trx('sale_items').insert({
                 sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
                 quantity: take, price_at_sale: priceAtSale, buying_price_at_sale: b.buying_price, batch_id: b.id,
                 special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
               });
               await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
               remainingToDeduct -= take;
             }
             if (remainingToDeduct > 0) {
               const lastBatch = await trx('product_batches').where({ product_id: item.product.id }).orderBy('created_at', 'desc').first();
               const cost = lastBatch ? lastBatch.buying_price : (item.product.buying_price || 0);
               await trx('sale_items').insert({
                 sale_id: saleId, product_id: item.product.id, parent_id: item.parent_id || null,
                 quantity: remainingToDeduct, price_at_sale: priceAtSale, buying_price_at_sale: cost, batch_id: lastBatch ? lastBatch.id : null,
                 special_instructions: item.special_instructions, variants_json: item.variants_json, addons_json: item.addons_json
               });
               if (lastBatch) await trx('product_batches').where({ id: lastBatch.id }).update({ quantity: db.raw('quantity - ?', [remainingToDeduct]) });
             }
             await trx('products').where({ id: item.product.id }).update({ stock: db.raw('stock - ?', [item.quantity]) });
           }
        } else {
           await trx('sale_items').insert({
             sale_id: saleId, product_id: null, parent_id: item.parent_id || null,
             custom_name: item.name, quantity: item.quantity, price_at_sale: priceAtSale, 
             buying_price_at_sale: 0, special_instructions: item.special_instructions
           });
        }
      }
      // 7. Ledger Update (if customer and due)
      const customer = await trx('customers').where({ id: data.customer_id || sale.customer_id }).first();
      if (customer && dueAmount > 0.01) {
        await customerService.addSaleEntry(trx, {
          customerId: customer.id, shopId, saleId, dueAmount, grandTotal, amountReceived: data.amount_received, userId
        });
      }

      // 8. Automatic Kitchen/Station Printing
      const printResult = await this.generatePrintJobs(saleId, resolvedItems, shopId, trx);

      return {
        saleId,
        total: grandTotal,
        print_jobs_queued: printResult.queued,
        printer_configured: printResult.printer_configured
      };
    });
  }


  async getSales(shopId) {
    return await db('sales as s')
      .select('s.*', 'u.name as served_by_name', 'u.username as served_by_username', 'w.name as waiter_name', 'r.name as rider_name', 'k.name as kitchen_name', 't.table_number')
      .select(db.raw('(SELECT SUM(quantity) FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE sale_id = s.id)) as items_returned'))
      .leftJoin('users as u', 's.user_id', 'u.id')
      .leftJoin('users as w', 's.waiter_id', 'w.id')
      .leftJoin('users as r', 's.rider_id', 'r.id')
      .leftJoin('users as k', 's.kitchen_id', 'k.id')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .where('s.shop_id', shopId)
      .orderBy('s.created_at', 'desc');
  }

  async payDue(saleId, shopId, userId, amount, note) {
    return await db.transaction(async (trx) => {
      const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).first();
      if (!sale) throw new Error("Sale not found");

      const finalAmount = amount !== undefined ? parseFloat(amount) : Number(sale.total || 0);

      await trx('sales').where({ id: saleId }).update({ amount_received: finalAmount });

      if (sale.customer_id) {
        const prevDue = Number(sale.total || 0) - Number(sale.amount_received || 0);
        const newDue = Number(sale.total || 0) - finalAmount;
        const paymentMade = Math.max(0, parseFloat((prevDue - newDue).toFixed(2)));

        if (paymentMade > 0.01) {
          await customerService.addPaymentEntry(trx, {
            customerId: sale.customer_id, shopId, saleId: sale.id, paymentAmount: paymentMade, note, userId
          });
        }
      }
      return finalAmount;
    });
  }

  async updateDetails(saleId, shopId, { customer_name, customer_phone, delivery_address, rider_id, payment_method, amount_received, discount, tax_percentage }) {
    return await db.transaction(async (trx) => {
      const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).first();
      if (!sale) throw new Error("Sale not found");

      const updateData = {
        updated_at: trx.fn.now()
      };

      if (customer_name !== undefined) updateData.customer_name = customer_name;
      if (customer_phone !== undefined) updateData.customer_phone = customer_phone;
      if (delivery_address !== undefined) updateData.delivery_address = delivery_address;
      if (rider_id !== undefined) updateData.rider_id = rider_id ? parseInt(rider_id, 10) : null;
      if (payment_method !== undefined) updateData.payment_method = payment_method;
      if (amount_received !== undefined) updateData.amount_received = amount_received;

      const newDiscount = discount !== undefined ? parseFloat(discount) : sale.discount;
      const newTaxPct = tax_percentage !== undefined ? parseFloat(tax_percentage) : sale.tax_percentage;

      // Recalculate Total if discount or tax changed
      if (discount !== undefined || tax_percentage !== undefined) {
        const items = await trx('sale_items').where({ sale_id: saleId });
        const subtotal = items.reduce((sum, item) => sum + (Number(item.price_at_sale) * Number(item.quantity)), 0);
        const taxAmount = (subtotal - newDiscount) * (newTaxPct / 100);
        const grandTotal = subtotal - newDiscount + taxAmount;

        updateData.discount = newDiscount;
        updateData.tax_percentage = newTaxPct;
        updateData.total = grandTotal;
      }

      await trx('sales')
        .where({ id: saleId, shop_id: shopId })
        .update(updateData);
    });
  }

  async getBill(saleId, shopId) {
    const sale = await db('sales as s')
      .select('s.*', 'w.name as waiter_name', 'r.name as rider_name', 'k.name as kitchen_name', 't.table_number')
      .leftJoin('users as w', 's.waiter_id', 'w.id')
      .leftJoin('users as r', 's.rider_id', 'r.id')
      .leftJoin('users as k', 's.kitchen_id', 'k.id')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .where({ 's.id': saleId, 's.shop_id': shopId })
      .first();

    if (!sale) return null;

    const items = await db('sale_items as si')
      .select('si.*', db.raw('COALESCE(p.name, si.custom_name) as product_name'), 'p.category as product_category', 'b.name as brand_name')
      .select(db.raw(`(
        SELECT COALESCE(SUM(ri.quantity), 0)
        FROM return_items ri
        JOIN returns r ON ri.return_id = r.id
        WHERE r.sale_id = si.sale_id AND (ri.sale_item_id = si.id OR (ri.sale_item_id IS NULL AND ri.product_id = si.product_id))
      ) as returned_qty`))
      .leftJoin('products as p', 'si.product_id', 'p.id')
      .leftJoin('brands as b', 'p.brand_id', 'b.id')
      .where('si.sale_id', saleId);

    const payments = await db('customer_ledger')
      .where({ sale_id: saleId, type: 'payment' })
      .orderBy('created_at', 'desc');

    const seller = await db('users').select('name').where({ id: sale.user_id }).first();
    const shop = await db('shops').where({ id: sale.shop_id }).first();

    if (shop) {
      shop.receipt_images = shop.receipt_images_json ? JSON.parse(shop.receipt_images_json) : [];
      shop.use_logo_on_receipt = Boolean(shop.use_logo_on_receipt);
    }

    return { sale, items, seller, shop, payments };
  }

  async processReturn(saleId, shopId, userId, { items, reason, payment_method }) {
    return await db.transaction(async (trx) => {
      const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).first();
      if (!sale) throw new Error("Sale not found");

      const totalRefund = items.reduce((s, it) => s + (it.refund_price * it.quantity), 0);

      const [returnIdObj] = await trx('returns')
        .insert({ shop_id: shopId, sale_id: saleId, user_id: userId, total_refund: totalRefund, reason, payment_method })
        .returning('id');
      const returnId = typeof returnIdObj === 'object' ? returnIdObj.id : returnIdObj;

      for (const item of items) {
        const original = await trx('sale_items as si')
          .select('si.id as sale_item_id', 'si.quantity as sold_qty', 'si.buying_price_at_sale', 'si.batch_id')
          .select(db.raw(`(
            SELECT COALESCE(SUM(ri.quantity), 0)
            FROM return_items ri
            JOIN returns r ON ri.return_id = r.id
            WHERE r.sale_id = si.sale_id AND (ri.sale_item_id = si.id OR (ri.sale_item_id IS NULL AND ri.product_id = si.product_id))
          ) as already_returned`))
          .where('si.sale_id', saleId)
          .andWhere(function() {
            if (item.sale_item_id) this.where('si.id', item.sale_item_id);
            else this.where('si.product_id', item.product_id);
          })
          .first();

        if (!original && item.product_id) throw new Error(`Product ${item.product_id} was not part of this sale`);
        
        if (item.product_id) {
            const available = original.sold_qty - (original.already_returned || 0);
            if (item.quantity > available) throw new Error(`Only ${available} units available to return.`);
        }

        const originalCogs = original ? original.buying_price_at_sale : 0;
        await trx('return_items').insert({
          return_id: returnId, sale_item_id: item.sale_item_id || null, product_id: item.product_id || null,
          quantity: item.quantity, refund_price: item.refund_price, buying_price_at_sale: originalCogs, is_damage: item.is_damage ? 1 : 0
        });

        if (item.product_id) {
          if (item.is_damage) {
            await trx('products').where({ id: item.product_id }).update({
              damage_stock: db.raw('damage_stock + ?', [item.quantity]),
              manual_damage_loss: db.raw('manual_damage_loss + ?', [item.quantity * originalCogs])
            });
            if (original.batch_id) await trx('product_batches').where({ id: original.batch_id }).update({ damaged_quantity: db.raw('damaged_quantity + ?', [item.quantity]) });
          } else {
            let batchRestored = false;
            if (original.batch_id) {
                const updated = await trx('product_batches').where({ id: original.batch_id }).update({ quantity: db.raw('quantity + ?', [item.quantity]) });
                if (updated > 0) batchRestored = true;
            }
            if (!batchRestored) {
                const newest = await trx('product_batches').where({ product_id: item.product_id, shop_id: shopId }).orderBy('created_at', 'desc').first();
                if (newest) await trx('product_batches').where({ id: newest.id }).update({ quantity: db.raw('quantity + ?', [item.quantity]) });
            }
            await trx('products').where({ id: item.product_id }).update({ stock: db.raw('stock + ?', [item.quantity]) });
          }
        }
      }

      if (sale.customer_id && totalRefund > 0.01) {
          // Refund to customer balance if paid via ledger
          if (payment_method === 'ledger') {
              await customerService.addPaymentEntry(trx, {
                  customerId: sale.customer_id, shop_id: shopId, saleId: null, paymentAmount: totalRefund, 
                  note: `Refund for sale SALE-${String(saleId).padStart(5, '0')}`, userId
              });
          }
      }

      return { returnId, totalRefund };
    });
  }

  async getReturnReceipt(returnId, shopId) {
    const ret = await db('returns').where({ id: returnId, shop_id: shopId }).first();
    if (!ret) return null;

    const items = await db('return_items as ri')
      .select('ri.*', 'p.name as product_name')
      .leftJoin('products as p', 'ri.product_id', 'p.id')
      .where('ri.return_id', returnId);

    const sale = await db('sales').where({ id: ret.sale_id }).first();
    const user = await db('users').select('name').where({ id: ret.user_id }).first();
    const shop = await db('shops').where({ id: shopId }).first();

    if (shop) {
      shop.receipt_images = shop.receipt_images_json ? JSON.parse(shop.receipt_images_json) : [];
      shop.use_logo_on_receipt = Boolean(shop.use_logo_on_receipt);
    }

    return { return: ret, items, sale, user, shop };
  }
}

module.exports = new SalesService();

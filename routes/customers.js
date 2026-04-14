const express = require("express");
const db = require("../db/db");
const { requireAuth } = require("../middleware/auth");
const PDFDocument = require("pdfkit");

const router = express.Router();

function parseDateFilters(query) {
  const from = query.from ? String(query.from).trim() : "";
  const to = query.to ? String(query.to).trim() : "";
  return { from, to };
}

function buildDateClause(column, from, to, params) {
  const clauses = [];
  if (from) {
    clauses.push(`date(${column}) >= ?`);
    params.push(from);
  }
  if (to) {
    clauses.push(`date(${column}) <= ?`);
    params.push(to);
  }
  return clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function safeFilename(name) {
  return String(name || "customer").replace(/[^a-z0-9_-]+/gi, "_");
}

// ─── GET /api/customers ───────────────────────────────────────────────────────
// Supports:
// - search
// - status
// - from / to   => filtered purchase analytics by timeframe
// - sort        => name_asc | name_desc | purchase_desc | purchase_asc | due_desc | due_asc | recent_desc
router.get("/", requireAuth, (req, res) => {
  const { search = "", status = "active", sort = "name_asc" } = req.query;
  const { from, to } = parseDateFilters(req.query);
  const shopId = req.session.user.shop_id;

  const salesDateParams = [];
  const salesDateClause = buildDateClause(
    "s.created_at",
    from,
    to,
    salesDateParams,
  );

  let query = `
    SELECT
      c.*,
      COALESCE((
        SELECT COUNT(*)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.shop_id = c.shop_id
          ${salesDateClause}
      ), 0) AS total_sales,
      COALESCE((
        SELECT SUM(s.total)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.shop_id = c.shop_id
          ${salesDateClause}
      ), 0) AS total_purchase_amount,
      COALESCE((
        SELECT SUM(s.amount_received)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.shop_id = c.shop_id
          ${salesDateClause}
      ), 0) AS total_paid_amount,
      COALESCE((
        SELECT SUM(s.total - s.amount_received)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.shop_id = c.shop_id
          AND s.total > s.amount_received
          ${salesDateClause}
      ), 0) AS period_due_amount,
      (
        SELECT MAX(s.created_at)
        FROM sales s
        WHERE s.customer_id = c.id
          AND s.shop_id = c.shop_id
          ${salesDateClause}
      ) AS last_purchase_at
    FROM customers c
    WHERE c.shop_id = ?
  `;

  const params = [
    ...salesDateParams,
    ...salesDateParams,
    ...salesDateParams,
    ...salesDateParams,
    ...salesDateParams,
    shopId,
  ];

  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (status && status !== "all") {
    query += ` AND c.status = ?`;
    params.push(status);
  }

  const sortMap = {
    name_asc: "c.name ASC",
    name_desc: "c.name DESC",
    purchase_desc: "total_purchase_amount DESC, c.name ASC",
    purchase_asc: "total_purchase_amount ASC, c.name ASC",
    due_desc: "c.current_balance DESC, c.name ASC",
    due_asc: "c.current_balance ASC, c.name ASC",
    recent_desc:
      "CASE WHEN last_purchase_at IS NULL THEN 1 ELSE 0 END ASC, last_purchase_at DESC, c.name ASC",
  };

  query += ` ORDER BY ${sortMap[sort] || sortMap.name_asc}`;

  try {
    const customers = db.prepare(query).all(...params);
    res.json(customers);
  } catch (e) {
    console.error("Customers fetch error:", e);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// ─── GET /api/customers/:id ───────────────────────────────────────────────────
// Detailed account view with optional date filters for purchasing analysis.
router.get("/:id", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const { from, to } = parseDateFilters(req.query);

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`)
    .get(customerId, shopId);

  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const ledgerParams = [customerId];
  const ledgerDateClause = buildDateClause(
    "cl.created_at",
    from,
    to,
    ledgerParams,
  );

  const ledger = db
    .prepare(
      `
    SELECT
      cl.*,
      u.name as created_by_name
    FROM customer_ledger cl
    LEFT JOIN users u ON cl.created_by = u.id
    WHERE cl.customer_id = ?
      ${ledgerDateClause}
    ORDER BY cl.created_at ASC, cl.id ASC
  `,
    )
    .all(...ledgerParams);

  const salesParams = [customerId, shopId];
  const salesDateClause = buildDateClause(
    "s.created_at",
    from,
    to,
    salesParams,
  );

  const sales = db
    .prepare(
      `
    SELECT
      s.*,
      u.name as served_by_name,
      (s.total - s.amount_received) AS due_amount,
      (
        SELECT COUNT(*)
        FROM sale_items si
        WHERE si.sale_id = s.id
      ) AS item_lines
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.customer_id = ?
      AND s.shop_id = ?
      ${salesDateClause}
    ORDER BY s.created_at DESC, s.id DESC
  `,
    )
    .all(...salesParams);

  const summary = {
    period: {
      from: from || null,
      to: to || null,
    },
    total_sales_count: sales.length,
    total_purchase_amount: sales.reduce(
      (sum, s) => sum + Number(s.total || 0),
      0,
    ),
    total_paid_amount: sales.reduce(
      (sum, s) => sum + Number(s.amount_received || 0),
      0,
    ),
    total_due_in_period: sales.reduce(
      (sum, s) =>
        sum +
        Math.max(0, Number(s.total || 0) - Number(s.amount_received || 0)),
      0,
    ),
    current_balance: Number(customer.current_balance || 0),
    total_ledger_debit: ledger
      .filter((e) => e.type === "sale")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    total_ledger_credit: ledger
      .filter((e) => e.type === "payment")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    first_purchase_at: sales.length ? sales[sales.length - 1].created_at : null,
    last_purchase_at: sales.length ? sales[0].created_at : null,
  };

  res.json({ customer, ledger, sales, summary });
});

// ─── POST /api/customers ──────────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const { name, phone, email, address, notes, credit_limit = 0 } = req.body;
  const shopId = req.session.user.shop_id;

  if (!name)
    return res.status(400).json({ error: "Customer name is required" });

  if (phone) {
    const existing = db
      .prepare(`SELECT id FROM customers WHERE phone = ? AND shop_id = ?`)
      .get(phone, shopId);

    if (existing) {
      return res
        .status(409)
        .json({ error: "A customer with this phone number already exists" });
    }
  }

  try {
    const result = db
      .prepare(
        `
      INSERT INTO customers (
        shop_id, name, phone, email, address, notes, credit_limit, current_balance, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')
    `,
      )
      .run(
        shopId,
        name.trim(),
        phone || null,
        email || null,
        address || null,
        notes || null,
        parseFloat(credit_limit) || 0,
      );

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error("Customer create error:", e);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────
router.put("/:id", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const { name, phone, email, address, notes, credit_limit, status } = req.body;

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`)
    .get(customerId, shopId);

  if (!customer) return res.status(404).json({ error: "Customer not found" });

  if (phone && phone !== customer.phone) {
    const existing = db
      .prepare(
        `SELECT id FROM customers WHERE phone = ? AND shop_id = ? AND id != ?`,
      )
      .get(phone, shopId, customerId);

    if (existing) {
      return res
        .status(409)
        .json({ error: "Phone number already in use by another customer" });
    }
  }

  try {
    db.prepare(
      `
      UPDATE customers
      SET
        name = ?,
        phone = ?,
        email = ?,
        address = ?,
        notes = ?,
        credit_limit = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ? AND shop_id = ?
    `,
    ).run(
      name || customer.name,
      phone !== undefined ? phone || null : customer.phone,
      email !== undefined ? email || null : customer.email,
      address !== undefined ? address || null : customer.address,
      notes !== undefined ? notes || null : customer.notes,
      credit_limit !== undefined
        ? parseFloat(credit_limit)
        : customer.credit_limit,
      status || customer.status,
      customerId,
      shopId,
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("Customer update error:", e);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────
router.delete("/:id", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;

  const customer = db
    .prepare(
      `SELECT current_balance FROM customers WHERE id = ? AND shop_id = ?`,
    )
    .get(customerId, shopId);

  if (!customer) return res.status(404).json({ error: "Customer not found" });

  if (Number(customer.current_balance || 0) > 0.01) {
    return res.status(400).json({
      error: `Cannot delete: outstanding balance of Rs. ${Number(customer.current_balance).toFixed(2)}`,
    });
  }

  db.prepare(
    `
    UPDATE customers
    SET status = 'inactive', updated_at = datetime('now')
    WHERE id = ? AND shop_id = ?
  `,
  ).run(customerId, shopId);

  res.json({ ok: true });
});

// ─── POST /api/customers/:id/payment ─────────────────────────────────────────
router.post("/:id/payment", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const { amount, note = "" } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "Valid payment amount required" });
  }

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`)
    .get(customerId, shopId);

  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (Number(customer.current_balance || 0) <= 0.01) {
    return res.status(400).json({ error: "No outstanding balance to clear" });
  }

  const paymentAmount = Math.min(
    parseFloat(amount),
    Number(customer.current_balance || 0),
  );

  try {
    db.transaction(() => {
      const newBalance = parseFloat(
        (Number(customer.current_balance || 0) - paymentAmount).toFixed(2),
      );

      db.prepare(
        `
        UPDATE customers
        SET current_balance = ?, updated_at = datetime('now')
        WHERE id = ?
      `,
      ).run(newBalance, customerId);

      db.prepare(
        `
        INSERT INTO customer_ledger (customer_id, shop_id, type, amount, balance_after, note, created_by)
        VALUES (?, ?, 'payment', ?, ?, ?, ?)
      `,
      ).run(
        customerId,
        shopId,
        paymentAmount,
        newBalance,
        note || "Payment received",
        req.session.user.id,
      );
    })();

    const updated = db
      .prepare(`SELECT current_balance FROM customers WHERE id = ?`)
      .get(customerId);

    res.json({
      ok: true,
      payment_amount: paymentAmount,
      new_balance: updated.current_balance,
    });
  } catch (e) {
    console.error("Payment error:", e);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// ─── GET /api/customers/:id/ledger.pdf ───────────────────────────────────────
router.get("/:id/ledger.pdf", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const { from, to } = parseDateFilters(req.query);

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`)
    .get(customerId, shopId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shopId);

  const params = [customerId];
  const dateClause = buildDateClause("cl.created_at", from, to, params);

  const ledger = db
    .prepare(
      `
    SELECT cl.*, u.name as created_by_name
    FROM customer_ledger cl
    LEFT JOIN users u ON cl.created_by = u.id
    WHERE cl.customer_id = ?
      ${dateClause}
    ORDER BY cl.created_at ASC, cl.id ASC
  `,
    )
    .all(...params);

  const totalDebits = ledger
    .filter((e) => e.type === "sale")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalCredits = ledger
    .filter((e) => e.type === "payment")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const closingBalance =
    ledger.length > 0
      ? Number(ledger[ledger.length - 1].balance_after || 0)
      : Number(customer.current_balance || 0);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ledger-${safeFilename(customer.name)}.pdf"`,
  );

  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);

  const W = 515;
  const accent = "#4f46e5";
  const tDark = "#111827";
  const tMid = "#374151";
  const tLight = "#6b7280";
  const bdr = "#e5e7eb";

  doc.rect(0, 0, doc.page.width, 75).fill(accent);
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .text(shop ? shop.name.toUpperCase() : "YOUR STORE", 40, 16);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("rgba(255,255,255,0.75)")
    .text("CUSTOMER ACCOUNT STATEMENT", 40, 42);

  const periodLabel =
    from || to ? `${from || "All"} → ${to || "Today"}` : "ALL TIME";
  doc
    .fillColor("rgba(255,255,255,0.85)")
    .text(
      `Period: ${periodLabel}   |   Generated: ${new Date().toLocaleDateString("en-GB")}`,
      40,
      57,
      { align: "right", width: W },
    );

  let y = 90;
  doc.rect(40, y, W, 65).fill("#f9fafb").stroke(bdr);
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(tDark)
    .text(customer.name, 55, y + 10);
  doc.fontSize(8).font("Helvetica").fillColor(tLight);

  const infoLines = [
    customer.phone && `Phone: ${customer.phone}`,
    customer.email && `Email: ${customer.email}`,
    customer.address && `Address: ${customer.address}`,
  ].filter(Boolean);

  infoLines.forEach((line, i) => doc.text(line, 55, y + 28 + i * 13));

  const summaryItems = [
    {
      label: "TOTAL DEBIT",
      val: `Rs. ${fmtMoney(totalDebits)}`,
      bg: "#fef3c7",
      fg: "#92400e",
    },
    {
      label: "TOTAL CREDIT",
      val: `Rs. ${fmtMoney(totalCredits)}`,
      bg: "#d1fae5",
      fg: "#065f46",
    },
    {
      label: "CLOSING BALANCE",
      val: `Rs. ${fmtMoney(closingBalance)}`,
      bg: closingBalance > 0.01 ? "#fee2e2" : "#d1fae5",
      fg: closingBalance > 0.01 ? "#991b1b" : "#065f46",
    },
  ];

  summaryItems.forEach((item, i) => {
    const bx = 40 + W - (3 - i) * 107;
    doc.rect(bx, y + 8, 102, 46).fill(item.bg);
    doc
      .fontSize(6.5)
      .font("Helvetica-Bold")
      .fillColor(item.fg)
      .text(item.label, bx + 4, y + 14, { width: 94 });
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(item.fg)
      .text(item.val, bx + 4, y + 28, { width: 94 });
  });

  y = 170;
  const C = {
    date: 40,
    ref: 110,
    type: 190,
    note: 255,
    debit: 385,
    credit: 440,
    bal: 480,
  };
  doc.rect(40, y, W, 20).fill(accent);
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#fff");
  [
    ["DATE", C.date + 3],
    ["REFERENCE", C.ref + 3],
    ["TYPE", C.type + 3],
    ["DESCRIPTION", C.note + 3],
  ].forEach(([t, x]) => doc.text(t, x, y + 6));
  doc.text("DEBIT (Rs.)", C.debit, y + 6, { width: 52, align: "right" });
  doc.text("CREDIT (Rs.)", C.credit, y + 6, { width: 37, align: "right" });
  doc.text("BALANCE", C.bal, y + 6, { width: 75, align: "right" });
  y += 20;

  ledger.forEach((entry, idx) => {
    if (y > 750) {
      doc.addPage();
      y = 40;
    }

    const rH = 18;
    doc.rect(40, y, W, rH).fill(idx % 2 === 0 ? "#ffffff" : "#f9fafb");
    doc.fontSize(7.5).font("Helvetica").fillColor(tMid);

    const d = new Date(entry.created_at);
    doc.text(d.toLocaleDateString("en-GB"), C.date + 3, y + 5);

    const ref = entry.sale_id
      ? `SALE-${String(entry.sale_id).padStart(5, "0")}`
      : `PAY-${String(entry.id).padStart(5, "0")}`;

    doc.text(ref, C.ref + 3, y + 5, { width: 76 });

    const typeColor = entry.type === "sale" ? "#dc2626" : "#059669";
    doc
      .fillColor(typeColor)
      .font("Helvetica-Bold")
      .text(entry.type === "sale" ? "SALE" : "PAYMENT", C.type + 3, y + 5, {
        width: 60,
      });
    doc
      .fillColor(tMid)
      .font("Helvetica")
      .text(entry.note || "—", C.note + 3, y + 5, { width: 128 });

    if (entry.type === "sale") {
      doc
        .fillColor("#dc2626")
        .font("Helvetica-Bold")
        .text(fmtMoney(entry.amount), C.debit, y + 5, {
          width: 52,
          align: "right",
        });
      doc
        .fillColor(tLight)
        .font("Helvetica")
        .text("—", C.credit, y + 5, { width: 37, align: "right" });
    } else {
      doc
        .fillColor(tLight)
        .font("Helvetica")
        .text("—", C.debit, y + 5, { width: 52, align: "right" });
      doc
        .fillColor("#059669")
        .font("Helvetica-Bold")
        .text(fmtMoney(entry.amount), C.credit, y + 5, {
          width: 37,
          align: "right",
        });
    }

    const bColor =
      Number(entry.balance_after || 0) > 0.01 ? "#b91c1c" : "#059669";
    doc
      .fillColor(bColor)
      .font("Helvetica-Bold")
      .text(fmtMoney(entry.balance_after), C.bal, y + 5, {
        width: 75,
        align: "right",
      });
    doc
      .moveTo(40, y + rH)
      .lineTo(555, y + rH)
      .strokeColor(bdr)
      .lineWidth(0.3)
      .stroke();
    y += rH;
  });

  if (ledger.length === 0) {
    doc
      .fillColor(tLight)
      .fontSize(10)
      .text("No transactions found for this period.", 40, y + 20, {
        width: W,
        align: "center",
      });
    y += 50;
  }

  y += 4;
  doc.rect(40, y, W, 22).fill("#f3f4f6");
  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor(tDark)
    .text("TOTALS", C.date + 3, y + 7);
  doc
    .fillColor("#dc2626")
    .text(fmtMoney(totalDebits), C.debit, y + 7, { width: 52, align: "right" });
  doc.fillColor("#059669").text(fmtMoney(totalCredits), C.credit, y + 7, {
    width: 37,
    align: "right",
  });

  const fc = closingBalance > 0.01 ? "#b91c1c" : "#059669";
  doc.fillColor(fc).text(fmtMoney(closingBalance), C.bal, y + 7, {
    width: 75,
    align: "right",
  });

  const addFooter = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bot = doc.page.height - 30;
      doc
        .moveTo(40, bot - 8)
        .lineTo(555, bot - 8)
        .strokeColor(bdr)
        .lineWidth(0.5)
        .stroke();
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(tLight)
        .text("System-generated document — POS System", 40, bot, {
          width: W / 2,
        })
        .text(`Page ${i + 1} of ${range.count}`, 40, bot, {
          align: "right",
          width: W,
        });
    }
  };

  addFooter();
  doc.end();
});

// ─── GET /api/customers/:id/report.pdf ───────────────────────────────────────
router.get("/:id/report.pdf", requireAuth, (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  const shopId = req.session.user.shop_id;
  const { from, to } = parseDateFilters(req.query);

  const customer = db
    .prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`)
    .get(customerId, shopId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shopId);

  const legacyPhone = customer.phone ? String(customer.phone).trim() : "";
  const legacyName = customer.name ? String(customer.name).trim() : "";

  const params = [shopId, customerId, legacyPhone, legacyName];
  const dateClause = buildDateClause("s.created_at", from, to, params);

  const sales = db
    .prepare(
      `
    SELECT s.*, u.name as served_by
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.shop_id = ?
      AND (
        s.customer_id = ?
        OR (
          s.customer_id IS NULL
          AND (
            (s.customer_phone IS NOT NULL AND s.customer_phone = ?)
            OR (s.customer_name IS NOT NULL AND lower(s.customer_name) = lower(?))
          )
        )
      )
      ${dateClause}
    ORDER BY s.created_at DESC
  `,
    )
    .all(...params);

  const salesWithItems = sales.map((sale) => {
    const items = db
      .prepare(
        `
      SELECT
        si.*,
        COALESCE(p.name, si.custom_name) as product_name,
        p.sku,
        b.name as brand_name
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE si.sale_id = ?
      ORDER BY si.id
    `,
      )
      .all(sale.id);

    return { ...sale, items };
  });

  const totalBilled = sales.reduce((s, sale) => s + Number(sale.total || 0), 0);
  const totalPaid = sales.reduce(
    (s, sale) => s + Number(sale.amount_received || 0),
    0,
  );
  const totalDue = totalBilled - totalPaid;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sales-report-${safeFilename(customer.name)}.pdf"`,
  );

  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.pipe(res);

  const W = 515;
  const accent = "#059669";
  const tDark = "#111827";
  const tMid = "#374151";
  const tLight = "#6b7280";
  const bdr = "#e5e7eb";

  doc.rect(0, 0, doc.page.width, 75).fill(accent);
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .text(shop ? shop.name.toUpperCase() : "STORE", 40, 16);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("rgba(255,255,255,0.75)")
    .text("CUSTOMER SALES REPORT", 40, 42);

  const periodLabel =
    from || to ? `${from || "All"} → ${to || "Today"}` : "ALL TIME";
  doc
    .fillColor("rgba(255,255,255,0.85)")
    .text(
      `Period: ${periodLabel}   |   Generated: ${new Date().toLocaleDateString("en-GB")}`,
      40,
      57,
      { align: "right", width: W },
    );

  let y = 90;
  doc.rect(40, y, W, 60).fill("#f9fafb").stroke(bdr);
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(tDark)
    .text(customer.name, 55, y + 10);
  doc.fontSize(8).font("Helvetica").fillColor(tLight);

  const infoLines = [
    customer.phone && `Phone: ${customer.phone}`,
    customer.email && `Email: ${customer.email}`,
    customer.address && `Address: ${customer.address}`,
  ].filter(Boolean);

  infoLines.forEach((line, i) => doc.text(line, 55, y + 28 + i * 13));

  const statsItems = [
    {
      label: "TOTAL SALES",
      val: sales.length.toString(),
      bg: "#dbeafe",
      fg: "#1e40af",
    },
    {
      label: "AMOUNT BILLED",
      val: `Rs. ${fmtMoney(totalBilled)}`,
      bg: "#d1fae5",
      fg: "#065f46",
    },
    {
      label: "OUTSTANDING DUE",
      val: `Rs. ${fmtMoney(totalDue)}`,
      bg: totalDue > 0.01 ? "#fee2e2" : "#d1fae5",
      fg: totalDue > 0.01 ? "#991b1b" : "#065f46",
    },
  ];

  statsItems.forEach((item, i) => {
    const bx = 40 + W - (3 - i) * 107;
    doc.rect(bx, y + 6, 102, 46).fill(item.bg);
    doc
      .fontSize(6.5)
      .font("Helvetica-Bold")
      .fillColor(item.fg)
      .text(item.label, bx + 4, y + 12, { width: 94 });
    doc
      .fontSize(i === 0 ? 18 : 9)
      .font("Helvetica-Bold")
      .fillColor(item.fg)
      .text(item.val, bx + 4, i === 0 ? y + 24 : y + 28, {
        width: 94,
        align: i === 0 ? "center" : "right",
      });
  });

  y = 163;

  salesWithItems.forEach((sale) => {
    if (y > 680) {
      doc.addPage();
      y = 40;
    }

    const due = Number(sale.total || 0) - Number(sale.amount_received || 0);
    const isPaid = due <= 0.01;

    doc
      .rect(40, y, W, 22)
      .fill(isPaid ? "#f0fdf4" : "#fff7ed")
      .stroke(bdr);
    doc
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .fillColor(tDark)
      .text(`SALE #${String(sale.id).padStart(5, "0")}`, 48, y + 7);

    const dateStr = new Date(sale.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(tLight)
      .text(dateStr, 140, y + 7);

    const mBg = sale.payment_method === "cash" ? "#d1fae5" : "#dbeafe";
    const mFg = sale.payment_method === "cash" ? "#065f46" : "#1e40af";
    doc.rect(248, y + 5, 52, 13).fill(mBg);
    doc
      .fontSize(7)
      .font("Helvetica-Bold")
      .fillColor(mFg)
      .text(String(sale.payment_method || "").toUpperCase(), 249, y + 8, {
        width: 50,
        align: "center",
      });

    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(tLight)
      .text(`By: ${sale.served_by || "Staff"}`, 310, y + 8);

    const bBg = isPaid ? "#d1fae5" : "#fee2e2";
    const bFg = isPaid ? "#065f46" : "#991b1b";
    const bText = isPaid ? "✓ PAID" : `DUE: Rs. ${fmtMoney(due)}`;
    doc.rect(40 + W - 112, y + 4, 107, 14).fill(bBg);
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(bFg)
      .text(bText, 40 + W - 110, y + 8, { width: 103, align: "center" });

    y += 22;

    doc.rect(40, y, W, 14).fill("#f3f4f6");
    doc.fontSize(7).font("Helvetica-Bold").fillColor(tLight);
    doc.text("ITEM", 48, y + 4);
    doc.text("SKU", 268, y + 4);
    doc.text("QTY", 338, y + 4, { width: 38, align: "right" });
    doc.text("PRICE", 380, y + 4, { width: 62, align: "right" });
    doc.text("TOTAL", 446, y + 4, { width: 64, align: "right" });

    y += 14;

    sale.items.forEach((item, iIdx) => {
      if (y > 740) {
        doc.addPage();
        y = 40;
      }

      doc.rect(40, y, W, 16).fill(iIdx % 2 === 0 ? "#ffffff" : "#f9fafb");
      doc.fontSize(7.5).font("Helvetica").fillColor(tMid);
      doc.text(item.product_name || "—", 48, y + 4, { width: 216 });
      doc.text(item.sku || "—", 268, y + 4, { width: 66 });
      doc.text(String(item.quantity), 338, y + 4, {
        width: 38,
        align: "right",
      });
      doc.text(`Rs. ${fmtMoney(item.price_at_sale)}`, 380, y + 4, {
        width: 62,
        align: "right",
      });
      doc
        .font("Helvetica-Bold")
        .text(
          `Rs. ${fmtMoney(Number(item.quantity || 0) * Number(item.price_at_sale || 0))}`,
          446,
          y + 4,
          { width: 64, align: "right" },
        );
      y += 16;
    });

    doc.rect(40, y, W, 20).fill("#f9fafb");
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(tLight)
      .text(
        `Subtotal: Rs. ${fmtMoney(Number(sale.total || 0) + Number(sale.discount || 0))}   Discount: Rs. ${fmtMoney(sale.discount)}   Tax: ${sale.tax_percentage}%`,
        48,
        y + 6,
      );
    doc
      .font("Helvetica-Bold")
      .fillColor(tDark)
      .text(
        `TOTAL: Rs. ${fmtMoney(sale.total)}   PAID: Rs. ${fmtMoney(sale.amount_received)}`,
        40,
        y + 6,
        { align: "right", width: W },
      );

    y += 30;
  });

  if (salesWithItems.length === 0) {
    doc
      .fillColor(tLight)
      .fontSize(10)
      .text("No sales found for this period.", 40, y + 20, {
        width: W,
        align: "center",
      });
    y += 50;
  }

  if (y > 720) {
    doc.addPage();
    y = 40;
  }

  doc.rect(40, y, W, 28).fill("#1f2937");
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .text(
      `GRAND TOTALS:   Billed: Rs. ${fmtMoney(totalBilled)}   Paid: Rs. ${fmtMoney(totalPaid)}   Outstanding: Rs. ${fmtMoney(totalDue)}`,
      48,
      y + 10,
      { width: W - 16 },
    );

  const addFooter = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bot = doc.page.height - 30;
      doc
        .moveTo(40, bot - 8)
        .lineTo(555, bot - 8)
        .strokeColor(bdr)
        .lineWidth(0.5)
        .stroke();
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(tLight)
        .text("System-generated document — POS System", 40, bot, {
          width: W / 2,
        })
        .text(`Page ${i + 1} of ${range.count}`, 40, bot, {
          align: "right",
          width: W,
        });
    }
  };

  addFooter();
  doc.end();
});

module.exports = router;

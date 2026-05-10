const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const router = express.Router();

// GET /api/brands — list current user's brands
router.get('/', requireAuth, (req, res) => {
    let shopId = req.session.user.shop_id;
    if (req.session.user.role === 'superadmin' && req.query.shopId) {
        shopId = parseInt(req.query.shopId);
    }
    let brands = db.prepare('SELECT * FROM brands WHERE shop_id = ? ORDER BY name ASC').all(shopId);

    if (brands.length === 0 && shopId) {
        try {
            // Find an appropriate user to own the brand (prefer shop admin, fallback to current user)
            const adminUser = db.prepare("SELECT id FROM users WHERE shop_id = ? AND role = 'admin' LIMIT 1").get(shopId) || req.session.user;

            const insertResult = db.prepare('INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)').run('owner', adminUser.id, shopId);
            const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(insertResult.lastInsertRowid);
            if (newBrand) {
                brands = [newBrand];
            }
        } catch (e) {
            console.error('Failed to auto-create default owner brand:', e);
        }
    }

    res.json(brands);
});

// POST /api/brands — create brand (superadmin only)
router.post('/', requireAuth, (req, res) => {
    if (req.session.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only Master Admins can create brands' });
    }

    const { name, shopId: targetShopId } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name required' });
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required for brand creation' });

    const result = db.prepare('INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)').run(name, req.session.user.id, targetShopId);
    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/brands/:id (superadmin only)
router.put('/:id', requireAuth, (req, res) => {
    if (req.session.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only Master Admins can edit brands' });
    }

    const { name, shopId: targetShopId } = req.body;
    const brandId = parseInt(req.params.id);

    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const shopId = parseInt(targetShopId);

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND shop_id = ?').get(brandId, shopId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    db.prepare('UPDATE brands SET name = ? WHERE id = ? AND shop_id = ?').run(name, brandId, shopId);
    res.json({ ok: true });
});

// DELETE /api/brands/:id (superadmin only)
router.delete('/:id', requireAuth, (req, res) => {
    if (req.session.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only Master Admins can delete brands' });
    }

    const brandId = parseInt(req.params.id);
    const targetShopId = req.query.shopId;

    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const shopId = parseInt(targetShopId);

    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND shop_id = ?').get(brandId, shopId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    db.prepare('DELETE FROM brands WHERE id = ? AND shop_id = ?').run(brandId, shopId);
    res.json({ ok: true });
});

// GET /api/brands/all-months-dues — Fetch all previous months with outstanding brand dues
router.get('/all-months-dues', requireAuth, (req, res) => {
    const shopId = req.session.user.shop_id;
    const currentMonth = new Date().toISOString().slice(0, 7); // Current YYYY-MM

    // 1. Find all previous months (before current) which have expenses recorded
    const monthsWithExp = db.prepare(`
        SELECT DISTINCT strftime('%Y-%m', date) as month 
        FROM expenses 
        WHERE shop_id = ? AND strftime('%Y-%m', date) < ?
        ORDER BY month DESC
    `).all(shopId, currentMonth);

    // 2. Get all current brands
    const brands = db.prepare('SELECT id, name FROM brands WHERE shop_id = ?').all(shopId);
    const brandCount = brands.length;
    if (brandCount === 0) return res.json([]);

    const results = [];

    // 3. For each month, calculate if any brand has dues
    for (const { month } of monthsWithExp) {
        // Total monthly expenses
        const totalExp = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as val 
            FROM expenses 
            WHERE shop_id = ? AND strftime('%Y-%m', date) = ?
        `).get(shopId, month).val;

        if (totalExp === 0) continue;

        const sharePerBrand = totalExp / brandCount;

        // Payments for this month grouped by brand
        const payments = db.prepare(`
            SELECT bep.brand_id, COALESCE(SUM(bep.amount), 0) as paid 
            FROM brand_expense_payments bep
            JOIN brands b ON b.id = bep.brand_id
            WHERE b.shop_id = ? AND bep.month = ?
            GROUP BY bep.brand_id
        `).all(shopId, month);

        const paymentMap = {};
        payments.forEach(p => paymentMap[p.brand_id] = p.paid);

        const brandDues = brands.map(b => {
            const paid = paymentMap[b.id] || 0;
            return {
                brand_id: b.id,
                brand_name: b.name,
                total_share: sharePerBrand,
                paid: paid,
                due: Math.max(0, sharePerBrand - paid)
            };
        }).filter(b => b.due > 0.01); // Only brands that still owe more than 0.01

        if (brandDues.length > 0) {
            results.push({
                month,
                totalExpenses: totalExp,
                totalDue: brandDues.reduce((sum, b) => sum + b.due, 0),
                brandDues
            });
        }
    }

    res.json(results);
});
// GET /api/brands/expense-shares
router.get('/expense-shares', requireAuth, (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const shopId = req.session.user.shop_id;

    // Get total expenses for the month
    const totalExpQuery = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as val 
        FROM expenses 
        WHERE shop_id = ? AND strftime('%Y-%m', date) = ?
    `).get(shopId, month);
    const totalExp = totalExpQuery.val;

    // Get all brands
    const brands = db.prepare('SELECT id, name FROM brands WHERE shop_id = ?').all(shopId);
    const brandCount = brands.length;

    // Per brand share
    const sharePerBrand = brandCount > 0 ? (totalExp / brandCount) : 0;

    // Get payments for the month
    const payments = db.prepare(`
        SELECT brand_expense_payments.brand_id, COALESCE(SUM(brand_expense_payments.amount), 0) as paid 
        FROM brand_expense_payments 
        JOIN brands ON brands.id = brand_expense_payments.brand_id
        WHERE brands.shop_id = ? AND brand_expense_payments.month = ?
        GROUP BY brand_expense_payments.brand_id
    `).all(shopId, month);

    const paymentMap = {};
    payments.forEach(p => paymentMap[p.brand_id] = p.paid);

    const shares = brands.map(b => ({
        brand_id: b.id,
        brand_name: b.name,
        total_share: sharePerBrand,
        paid: paymentMap[b.id] || 0,
        due: sharePerBrand - (paymentMap[b.id] || 0)
    }));

    res.json({ month, totalExpenses: totalExp, brandCount, shares });
});

// POST /api/brands/expense-payments
router.post('/expense-payments', requireAuth, (req, res) => {
    const { brand_id, amount, month } = req.body;
    if (!brand_id || !amount || !month) return res.status(400).json({ error: 'brand_id, amount, month required' });

    // Validate brand belongs to shop
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND shop_id = ?').get(brand_id, req.session.user.shop_id);
    if (!brand) return res.status(403).json({ error: 'Unauthorized brand' });

    db.prepare('INSERT INTO brand_expense_payments (brand_id, user_id, amount, month) VALUES (?, ?, ?, ?)')
        .run(brand_id, req.session.user.id, parseFloat(amount), month);

    res.json({ ok: true });
});

// GET /api/brands/expense-payments
router.get('/expense-payments', requireAuth, (req, res) => {
    const month = req.query.month;
    const shopId = req.session.user.shop_id;

    let query = `
        SELECT bep.*, b.name as brand_name, u.name as admin_name 
        FROM brand_expense_payments bep
        JOIN brands b ON b.id = bep.brand_id
        LEFT JOIN users u ON u.id = bep.user_id
        WHERE b.shop_id = ?
    `;
    const params = [shopId];

    if (month) {
        query += ' AND bep.month = ?';
        params.push(month);
    }

    query += ' ORDER BY bep.created_at DESC';
    res.json(db.prepare(query).all(...params));
});

// PUT /api/brands/expense-payments/:id
router.put('/expense-payments/:id', requireAuth, (req, res) => {
    const { amount } = req.body;
    const paymentId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;

    if (!amount) return res.status(400).json({ error: 'amount required' });

    // Validate payment belongs to shop via brand
    const payment = db.prepare(`
        SELECT bep.id 
        FROM brand_expense_payments bep
        JOIN brands b ON b.id = bep.brand_id
        WHERE bep.id = ? AND b.shop_id = ?
    `).get(paymentId, shopId);

    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    db.prepare('UPDATE brand_expense_payments SET amount = ? WHERE id = ?').run(parseFloat(amount), paymentId);
    res.json({ ok: true });
});

// GET /api/brands/pdf/paid-report
router.get('/pdf/paid-report', requireAuth, (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const shopId = req.session.user.shop_id;

    const payments = db.prepare(`
        SELECT bep.*, b.name as brand_name 
        FROM brand_expense_payments bep
        JOIN brands b ON b.id = bep.brand_id
        WHERE b.shop_id = ? AND bep.month = ?
        ORDER BY b.name ASC
    `).all(shopId, month);

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="paid-expenses-${month}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    // ─── HELPER: FOOTER (Page Numbers) ──────────────────────────
    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').font('Helvetica')
                .text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    // ─── CENTERED HEADER (BRANDING) ──────────────────────────────
    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
    if (shop) {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
        doc.moveDown(0.1);
    }
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('PAID EXPENSES REPORT', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5);

    // Metadata Row
    doc.fontSize(9).font('Helvetica').fillColor('#9ca3af');
    const metaData = `MONTH: ${month}   |   GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`;
    doc.text(metaData, { align: 'center' });
    doc.moveDown(1.5);

    // Decorative Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(2);

    const cols = { brand: 50, date: 300, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('BRAND NAME', cols.brand, doc.y, { align: 'left' });
    const hY = doc.y;
    doc.text('PAYMENT DATE', cols.date, hY, { align: 'left' });
    doc.text('AMOUNT PAID (RS.)', cols.amount, hY, { align: 'right', width: 85 });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#059669').lineWidth(1).stroke();
    doc.moveDown(0.2);

    let total = 0;
    let rowIdx = 0;
    for (const p of payments) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;

        // Zebra Striping
        if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        }

        doc.fillColor('#374151').font('Helvetica').fontSize(9);
        doc.text(p.brand_name.toUpperCase(), cols.brand, y, { width: 240, align: 'left' });
        doc.text(new Date(p.created_at).toLocaleDateString(), cols.date, y, { align: 'left' });
        doc.fillColor('#111827').font('Helvetica-Bold').text(p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols.amount, y, { align: 'right', width: 85 });

        doc.moveDown(0.8);
        total += p.amount;
        rowIdx++;
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(`TOTAL PAID: RS. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { align: 'right' });

    addFooter();
    doc.end();
});

// GET /api/brands/pdf/history
router.get('/pdf/history', requireAuth, (req, res) => {
    const shopId = req.session.user.shop_id;

    const payments = db.prepare(`
        SELECT bep.*, b.name as brand_name 
        FROM brand_expense_payments bep
        JOIN brands b ON b.id = bep.brand_id
        WHERE b.shop_id = ?
        ORDER BY bep.created_at DESC
    `).all(shopId);

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="brand-expense-history.pdf"');

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    // ─── HELPER: FOOTER (Page Numbers) ──────────────────────────
    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').font('Helvetica')
                .text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    // ─── CENTERED HEADER (BRANDING) ──────────────────────────────
    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
    if (shop) {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
        doc.moveDown(0.1);
    }
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('BRAND EXPENSE HISTORY', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5);

    // Metadata Row
    doc.fontSize(9).font('Helvetica').fillColor('#9ca3af');
    const metaData = `GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`;
    doc.text(metaData, { align: 'center' });
    doc.moveDown(1.5);

    // Decorative Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(2);

    const cols = { brand: 50, month: 200, amount: 350, date: 450 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('BRAND NAME', cols.brand, doc.y, { align: 'left' });
    const hY = doc.y;
    doc.text('FOR MONTH', cols.month, hY, { align: 'left' });
    doc.text('AMOUNT PAID', cols.amount, hY, { align: 'left' });
    doc.text('PAYMENT DATE', cols.date, hY, { align: 'left' });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke();
    doc.moveDown(0.2);

    let rowIdx = 0;
    for (const p of payments) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;

        // Zebra Striping
        if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        }

        doc.fillColor('#374151').font('Helvetica').fontSize(9);
        doc.text(p.brand_name.toUpperCase(), cols.brand, y, { width: 140, align: 'left' });
        doc.text(p.month, cols.month, y, { width: 140, align: 'left' });
        doc.fillColor('#111827').font('Helvetica-Bold').text(`RS. ${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, cols.amount, y, { width: 140, align: 'left' });
        doc.fillColor('#374151').font('Helvetica').text(new Date(p.created_at).toLocaleDateString(), cols.date, y);

        doc.moveDown(0.8);
        rowIdx++;
    }

    addFooter();
    doc.end();
});

// GET /api/brands/pdf/monthly-report
router.get('/pdf/monthly-report', requireAuth, (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const shopId = req.session.user.shop_id;
    const isDownload = req.query.download === 'true';

    const expenses = db.prepare(`
        SELECT * FROM expenses 
        WHERE shop_id = ? AND strftime('%Y-%m', date) = ?
        ORDER BY date ASC
    `).all(shopId, month);

    const payments = db.prepare(`
        SELECT bep.*, b.name as brand_name 
        FROM brand_expense_payments bep
        JOIN brands b ON b.id = bep.brand_id
        WHERE b.shop_id = ? AND bep.month = ?
        ORDER BY b.name ASC
    `).all(shopId, month);

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);
    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);

    res.setHeader('Content-Type', 'application/pdf');
    if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="expense-report-${month}.pdf"`);
    } else {
        res.setHeader('Content-Disposition', `inline; filename="expense-report-${month}.pdf"`);
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    // ─── HELPER: MONTH FORMATTER ──────────────────────────────
    const formatMonth = (m) => {
        const [year, monthNum] = m.split('-');
        const date = new Date(year, parseInt(monthNum) - 1);
        return date.toLocaleString('default', { month: 'long', year: 'numeric' });
    };

    // ─── HELPER: FOOTER (Page Numbers) ──────────────────────────
    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').font('Helvetica')
                .text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    // ─── CENTERED HEADER (BRANDING) ──────────────────────────────
    if (shop) {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
        doc.moveDown(0.1);
    }
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('MONTHLY OPERATING REPORT', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5);

    // Metadata Row
    doc.fontSize(9).font('Helvetica').fillColor('#9ca3af');
    const metaData = `PERIOD: ${formatMonth(month)}   |   GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`;
    doc.text(metaData, { align: 'center' });
    doc.moveDown(1.5);

    // Decorative Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(2);

    // ─── SECTION: FINANCIAL SUMMARY ─────────────────────────────
    let totalExp = 0;
    expenses.forEach(e => totalExp += e.amount);
    let totalPaid = 0;
    payments.forEach(p => totalPaid += p.amount);
    const netBalance = totalPaid - totalExp;

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1f2937').text('FINANCIAL SUMMARY', 50, doc.y);
    doc.moveDown(0.5);

    const summaryY = doc.y;
    doc.rect(50, summaryY, 495, 60).fill('#f9fafb');
    doc.fillColor('#374151').font('Helvetica').fontSize(10);
    doc.text('TOTAL OPERATING EXPENSES', 70, summaryY + 15);
    doc.text('TOTAL BRAND SETTLEMENTS', 70, summaryY + 35);

    doc.font('Helvetica-Bold');
    doc.text(`RS. ${totalExp.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 250, summaryY + 15, { align: 'right', width: 275 });
    doc.fillColor('#059669').text(`RS. ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 250, summaryY + 35, { align: 'right', width: 275 });

    doc.moveDown(3);

    // ─── SECTION 1: OPERATING EXPENSES ──────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#4f46e5').text('1. OPERATING EXPENSES', 50, doc.y, { align: 'left' });
    doc.moveDown(0.8);

    // Table Header
    const cols1 = { date: 50, category: 130, title: 210, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('DATE', cols1.date, doc.y, { align: 'left' });
    const h1Y = doc.y;
    doc.text('CATEGORY', cols1.category, h1Y, { align: 'left' });
    doc.text('DESCRIPTION', cols1.title, h1Y, { align: 'left' });
    doc.text('AMOUNT (RS.)', cols1.amount, h1Y, { align: 'right', width: 85 });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke();
    doc.moveDown(0.2);

    let rowIdx = 0;
    for (const e of expenses) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;

        // Zebra Striping
        if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        }
        doc.fillColor('#374151').font('Helvetica').fontSize(9);
        doc.text(e.date, cols1.date, y, { align: 'left' });
        doc.text(e.category.toUpperCase(), cols1.category, y, { align: 'left' });
        doc.text(e.title, cols1.title, y, { width: 240, align: 'left' });
        doc.fillColor('#111827').font('Helvetica-Bold').text(e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols1.amount, y, { align: 'right', width: 85 });

        doc.moveDown(0.8);
        rowIdx++;
    }

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(`TOTAL EXPENSES: RS. ${totalExp.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 385, doc.y, { align: 'right', width: 155 });
    doc.moveDown(2);

    // ─── SECTION 2: BRAND PAYMENTS ────────────────────────────
    if (doc.y > 600) doc.addPage();

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#059669').text('2. BRAND PAYMENTS (SETTLEMENTS)', 50, doc.y, { align: 'left' });
    doc.moveDown(0.8);

    // Table Header
    const cols2 = { brand: 50, date: 220, admin: 340, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('BRAND NAME', cols2.brand, doc.y, { align: 'left' });
    const h2Y = doc.y;
    doc.text('PAYMENT DATE', cols2.date, h2Y, { align: 'left' });
    doc.text('ACTIVITY BY', cols2.admin, h2Y, { align: 'left' });
    doc.text('AMOUNT PAID (RS.)', cols2.amount, h2Y, { align: 'right', width: 85 });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#059669').lineWidth(1).stroke();
    doc.moveDown(0.2);

    rowIdx = 0;
    if (payments.length === 0) {
        doc.fillColor('#9ca3af').font('Helvetica').text('No brand payments recorded for this period.', 50, doc.y + 10, { italic: true, align: 'left' });
        doc.moveDown(2);
    } else {
        for (const p of payments) {
            if (doc.y > 740) doc.addPage();
            const y = doc.y;

            if (rowIdx % 2 === 0) {
                doc.rect(50, y - 2, 495, 14).fill('#ecfdf5');
            }

            doc.fillColor('#374151').font('Helvetica').fontSize(9);
            doc.text(p.brand_name.toUpperCase(), cols2.brand, y, { width: 160, align: 'left' });
            doc.text(new Date(p.created_at).toLocaleDateString(), cols2.date, y);
            doc.text(p.admin_name || 'SYSTEM', cols2.admin, y);
            doc.fillColor('#111827').font('Helvetica-Bold').text(p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols2.amount, y, { align: 'right', width: 85 });

            doc.moveDown(0.8);
            rowIdx++;
        }
    }

    // ─── SECTION 3: DUE PAYMENTS (SUMMARY) ──────────────────────
    if (doc.y > 550) doc.addPage();
    doc.moveDown(2);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#e11d48').text('3. BRAND DUE PAYMENTS (SUMMARY)', 50, doc.y, { align: 'left' });
    doc.moveDown(0.8);

    // Get all brands
    const brandsList = db.prepare('SELECT id, name FROM brands WHERE shop_id = ?').all(shopId);
    const brandsCount = brandsList.length;
    const sharePerBrand = brandsCount > 0 ? (totalExp / brandsCount) : 0;

    // Table Header
    const cols3 = { brand: 50, share: 220, paid: 340, due: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('BRAND NAME', cols3.brand, doc.y, { align: 'left' });
    const h3Y = doc.y;
    doc.text('TOTAL SHARE', cols3.share, h3Y, { align: 'left' });
    doc.text('AMOUNT PAID', cols3.paid, h3Y, { align: 'left' });
    doc.text('REMAINING DUE', cols3.due, h3Y, { align: 'right', width: 85 });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e11d48').lineWidth(1).stroke();
    doc.moveDown(0.2);

    // Map payments to brand_id for easy access
    const paymentMap = {};
    payments.forEach(p => {
        paymentMap[p.brand_id] = (paymentMap[p.brand_id] || 0) + p.amount;
    });

    rowIdx = 0;
    for (const b of brandsList) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;

        if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 495, 14).fill('#fff1f2');
        }

        const bPaid = paymentMap[b.id] || 0;
        const bDue = sharePerBrand - bPaid;

        doc.fillColor('#374151').font('Helvetica').fontSize(9);
        doc.text(b.name.toUpperCase(), cols3.brand, y, { width: 160, align: 'left' });
        doc.text(`RS. ${sharePerBrand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, cols3.share, y);
        doc.text(`RS. ${bPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, cols3.paid, y);
        doc.fillColor(bDue > 0 ? '#e11d48' : '#059669').font('Helvetica-Bold')
            .text(`RS. ${bDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, cols3.due, y, { align: 'right', width: 85 });

        doc.moveDown(0.8);
        rowIdx++;
    }

    addFooter();
    doc.end();
});

module.exports = router;

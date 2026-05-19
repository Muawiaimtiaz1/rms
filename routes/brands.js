const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const router = express.Router();

// GET /api/brands — list current user's brands
router.get('/', requireAuth, async (req, res) => {
    try {
        let shopId = req.session.user.shop_id;
        if (req.session.user.role === 'superadmin' && req.query.shopId) {
            shopId = parseInt(req.query.shopId, 10);
        }

        const isPostgres = usePostgres();
        let brands;
        const qSelect = isPostgres ? 'SELECT * FROM brands WHERE shop_id = $1 ORDER BY name ASC' : 'SELECT * FROM brands WHERE shop_id = ? ORDER BY name ASC';
        
        if (isPostgres) brands = (await getPostgres().query(qSelect, [shopId])).rows;
        else brands = getSqlite().prepare(qSelect).all(shopId);

        if (brands.length === 0 && shopId) {
            const adminQ = isPostgres ? "SELECT id FROM users WHERE shop_id = $1 AND role = 'admin' LIMIT 1" : "SELECT id FROM users WHERE shop_id = ? AND role = 'admin' LIMIT 1";
            let adminUser;
            if (isPostgres) adminUser = (await getPostgres().query(adminQ, [shopId])).rows[0];
            else adminUser = getSqlite().prepare(adminQ).get(shopId);
            
            const ownerId = adminUser ? adminUser.id : req.session.user.id;
            const insertQ = isPostgres ? 'INSERT INTO brands (name, user_id, shop_id) VALUES ($1, $2, $3) RETURNING id' : 'INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)';
            const params = ['owner', ownerId, shopId];
            
            let lastId;
            if (isPostgres) {
                const { rows } = await getPostgres().query(insertQ, params);
                lastId = rows[0].id;
            } else {
                const res = getSqlite().prepare(insertQ).run(...params);
                lastId = res.lastInsertRowid;
            }

            const fetchQ = isPostgres ? 'SELECT * FROM brands WHERE id = $1' : 'SELECT * FROM brands WHERE id = ?';
            if (isPostgres) brands = (await getPostgres().query(fetchQ, [lastId])).rows;
            else brands = [getSqlite().prepare(fetchQ).get(lastId)];
        }
        res.json(brands);
    } catch (err) {
        console.error("Fetch brands error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/brands — create brand (superadmin only)
router.post('/', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Only Master Admins can create brands' });

    const { name, shopId: targetShopId } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name required' });
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });

    try {
        const isPostgres = usePostgres();
        const q = isPostgres ? 'INSERT INTO brands (name, user_id, shop_id) VALUES ($1, $2, $3) RETURNING id' : 'INSERT INTO brands (name, user_id, shop_id) VALUES (?, ?, ?)';
        if (isPostgres) {
            const { rows } = await getPostgres().query(q, [name, req.session.user.id, targetShopId]);
            res.json({ ok: true, id: rows[0].id });
        } else {
            const result = getSqlite().prepare(q).run(name, req.session.user.id, targetShopId);
            res.json({ ok: true, id: result.lastInsertRowid });
        }
    } catch (err) {
        console.error("Create brand error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/brands/:id
router.put('/:id', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Only Master Admins can edit brands' });

    const { name, shopId: targetShopId } = req.body;
    const brandId = parseInt(req.params.id, 10);
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const shopId = parseInt(targetShopId, 10);

    try {
        const isPostgres = usePostgres();
        let brand;
        const qCheck = isPostgres ? 'SELECT * FROM brands WHERE id = $1 AND shop_id = $2' : 'SELECT * FROM brands WHERE id = ? AND shop_id = ?';
        if (isPostgres) brand = (await getPostgres().query(qCheck, [brandId, shopId])).rows[0];
        else brand = getSqlite().prepare(qCheck).get(brandId, shopId);
        
        if (!brand) return res.status(404).json({ error: 'Brand not found' });

        const qUpdate = isPostgres ? 'UPDATE brands SET name = $1 WHERE id = $2 AND shop_id = $3' : 'UPDATE brands SET name = ? WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(qUpdate, [name, brandId, shopId]);
        else getSqlite().prepare(qUpdate).run(name, brandId, shopId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Update brand error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/brands/:id
router.delete('/:id', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: 'Only Master Admins can delete brands' });

    const brandId = parseInt(req.params.id, 10);
    const targetShopId = req.query.shopId;
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const shopId = parseInt(targetShopId, 10);

    try {
        const isPostgres = usePostgres();
        const delQ = isPostgres ? 'DELETE FROM brands WHERE id = $1 AND shop_id = $2' : 'DELETE FROM brands WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(delQ, [brandId, shopId]);
        else getSqlite().prepare(delQ).run(brandId, shopId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Delete brand error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/brands/all-months-dues
router.get('/all-months-dues', requireAuth, async (req, res) => {
    try {
        const shopId = req.session.user.shop_id;
        const isPostgres = usePostgres();
        const currentMonth = new Date().toISOString().slice(0, 7);

        let monthsWithExp;
        let brands;
        if (isPostgres) {
            monthsWithExp = (await getPostgres().query(`
                SELECT DISTINCT TO_CHAR(date, 'YYYY-MM') as month 
                FROM expenses 
                WHERE shop_id = $1 AND TO_CHAR(date, 'YYYY-MM') < $2
                ORDER BY month DESC
            `, [shopId, currentMonth])).rows;
            brands = (await getPostgres().query('SELECT id, name FROM brands WHERE shop_id = $1', [shopId])).rows;
        } else {
            monthsWithExp = getSqlite().prepare(`
                SELECT DISTINCT strftime('%Y-%m', date) as month 
                FROM expenses 
                WHERE shop_id = ? AND strftime('%Y-%m', date) < ?
                ORDER BY month DESC
            `).all(shopId, currentMonth);
            brands = getSqlite().prepare('SELECT id, name FROM brands WHERE shop_id = ?').all(shopId);
        }

        const brandCount = brands.length;
        if (brandCount === 0) return res.json([]);

        const results = [];
        for (const { month } of monthsWithExp) {
            let totalExp;
            let payments;
            if (isPostgres) {
                totalExp = (await getPostgres().query(`SELECT COALESCE(SUM(amount), 0)::float as val FROM expenses WHERE shop_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`, [shopId, month])).rows[0].val;
                if (totalExp === 0) continue;
                payments = (await getPostgres().query(`
                    SELECT bep.brand_id, COALESCE(SUM(bep.amount), 0)::float as paid 
                    FROM brand_expense_payments bep
                    JOIN brands b ON b.id = bep.brand_id
                    WHERE b.shop_id = $1 AND bep.month = $2
                    GROUP BY bep.brand_id
                `, [shopId, month])).rows;
            } else {
                totalExp = getSqlite().prepare(`SELECT COALESCE(SUM(amount), 0) as val FROM expenses WHERE shop_id = ? AND strftime('%Y-%m', date) = ?`).get(shopId, month).val;
                if (totalExp === 0) continue;
                payments = getSqlite().prepare(`
                    SELECT bep.brand_id, COALESCE(SUM(bep.amount), 0) as paid 
                    FROM brand_expense_payments bep
                    JOIN brands b ON b.id = bep.brand_id
                    WHERE b.shop_id = ? AND bep.month = ?
                    GROUP BY bep.brand_id
                `).all(shopId, month);
            }

            const sharePerBrand = totalExp / brandCount;
            const paymentMap = {};
            payments.forEach(p => paymentMap[p.brand_id] = p.paid);

            const brandDues = brands.map(b => {
                const paid = paymentMap[b.id] || 0;
                return { brand_id: b.id, brand_name: b.name, total_share: sharePerBrand, paid, due: Math.max(0, sharePerBrand - paid) };
            }).filter(b => b.due > 0.01);

            if (brandDues.length > 0) {
                results.push({ month, totalExpenses: totalExp, totalDue: brandDues.reduce((sum, b) => sum + b.due, 0), brandDues });
            }
        }
        res.json(results);
    } catch (err) {
        console.error("All months dues error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/brands/expense-shares
router.get('/expense-shares', requireAuth, async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const shopId = req.session.user.shop_id;
        const isPostgres = usePostgres();

        let totalExp, brands, payments;
        if (isPostgres) {
            totalExp = (await getPostgres().query(`SELECT COALESCE(SUM(amount), 0)::float as val FROM expenses WHERE shop_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`, [shopId, month])).rows[0].val;
            brands = (await getPostgres().query('SELECT id, name FROM brands WHERE shop_id = $1', [shopId])).rows;
            payments = (await getPostgres().query(`
                SELECT bep.brand_id, COALESCE(SUM(bep.amount), 0)::float as paid 
                FROM brand_expense_payments bep
                JOIN brands b ON b.id = bep.brand_id
                WHERE b.shop_id = $1 AND bep.month = $2
                GROUP BY bep.brand_id
            `, [shopId, month])).rows;
        } else {
            totalExp = getSqlite().prepare(`SELECT COALESCE(SUM(amount), 0) as val FROM expenses WHERE shop_id = ? AND strftime('%Y-%m', date) = ?`).get(shopId, month).val;
            brands = getSqlite().prepare('SELECT id, name FROM brands WHERE shop_id = ?').all(shopId);
            payments = getSqlite().prepare(`
                SELECT bep.brand_id, COALESCE(SUM(bep.amount), 0) as paid 
                FROM brand_expense_payments bep
                JOIN brands b ON b.id = bep.brand_id
                WHERE b.shop_id = ? AND bep.month = ?
                GROUP BY bep.brand_id
            `).all(shopId, month);
        }

        const brandCount = brands.length;
        const sharePerBrand = brandCount > 0 ? (totalExp / brandCount) : 0;
        const paymentMap = {};
        payments.forEach(p => paymentMap[p.brand_id] = p.paid);

        const shares = brands.map(b => ({
            brand_id: b.id, brand_name: b.name, total_share: sharePerBrand,
            paid: paymentMap[b.id] || 0,
            due: sharePerBrand - (paymentMap[b.id] || 0)
        }));

        res.json({ month, totalExpenses: totalExp, brandCount, shares });
    } catch (err) {
        console.error("Expense shares error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/brands/expense-payments
router.post('/expense-payments', requireAuth, async (req, res) => {
    const { brand_id, amount, month } = req.body;
    const shopId = req.session.user.shop_id;
    const userId = req.session.user.id;
    if (!brand_id || !amount || !month) return res.status(400).json({ error: 'Missing details' });

    try {
        const isPostgres = usePostgres();
        let brand;
        const qCheck = isPostgres ? 'SELECT id FROM brands WHERE id = $1 AND shop_id = $2' : 'SELECT id FROM brands WHERE id = ? AND shop_id = ?';
        if (isPostgres) brand = (await getPostgres().query(qCheck, [brand_id, shopId])).rows[0];
        else brand = getSqlite().prepare(qCheck).get(brand_id, shopId);
        
        if (!brand) return res.status(403).json({ error: 'Unauthorized brand' });

        const qInsert = isPostgres 
            ? 'INSERT INTO brand_expense_payments (brand_id, user_id, amount, month) VALUES ($1, $2, $3, $4)'
            : 'INSERT INTO brand_expense_payments (brand_id, user_id, amount, month) VALUES (?, ?, ?, ?)';
        if (isPostgres) await getPostgres().query(qInsert, [brand_id, userId, parseFloat(amount), month]);
        else getSqlite().prepare(qInsert).run(brand_id, userId, parseFloat(amount), month);

        res.json({ ok: true });
    } catch (err) {
        console.error("Expense payment error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/brands/expense-payments
router.get('/expense-payments', requireAuth, async (req, res) => {
    try {
        const month = req.query.month;
        const shopId = req.session.user.shop_id;
        const isPostgres = usePostgres();

        let queryStr = `
            SELECT bep.*, b.name as brand_name, u.name as admin_name 
            FROM brand_expense_payments bep
            JOIN brands b ON b.id = bep.brand_id
            LEFT JOIN users u ON u.id = bep.user_id
            WHERE b.shop_id = ${isPostgres?'$1':'?'}
        `;
        const params = [shopId];
        if (month) {
            queryStr += ` AND bep.month = ${isPostgres?'$2':'?'}`;
            params.push(month);
        }
        queryStr += ' ORDER BY bep.created_at DESC';
        
        let results;
        if (isPostgres) results = (await getPostgres().query(queryStr, params)).rows;
        else results = getSqlite().prepare(queryStr).all(...params);
        res.json(results);
    } catch (err) {
        console.error("Fetch expense payments error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/brands/expense-payments/:id
router.put('/expense-payments/:id', requireAuth, async (req, res) => {
    const { amount } = req.body;
    const paymentId = parseInt(req.params.id, 10);
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!amount) return res.status(400).json({ error: 'amount required' });

    try {
        const qCheck = `SELECT bep.id FROM brand_expense_payments bep JOIN brands b ON b.id = bep.brand_id WHERE bep.id = ${isPostgres?'$1':'?'} AND b.shop_id = ${isPostgres?'$2':'?'}`;
        let payment;
        if (isPostgres) payment = (await getPostgres().query(qCheck, [paymentId, shopId])).rows[0];
        else payment = getSqlite().prepare(qCheck).get(paymentId, shopId);

        if (!payment) return res.status(404).json({ error: 'Payment record not found' });

        const qUpdate = isPostgres ? 'UPDATE brand_expense_payments SET amount = $1 WHERE id = $2' : 'UPDATE brand_expense_payments SET amount = ? WHERE id = ?';
        if (isPostgres) await getPostgres().query(qUpdate, [parseFloat(amount), paymentId]);
        else getSqlite().prepare(qUpdate).run(parseFloat(amount), paymentId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Update payment error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Helper for repetitive PDF parts
async function getReportData(isPostgres, shopId, userId, month) {
    let payments, user, shop;
    if (isPostgres) {
        payments = (await getPostgres().query(`SELECT bep.*, b.name as brand_name FROM brand_expense_payments bep JOIN brands b ON b.id = bep.brand_id WHERE b.shop_id = $1 ${month ? 'AND bep.month = $2' : ''} ORDER BY b.name ASC`, month ? [shopId, month] : [shopId])).rows;
        user = (await getPostgres().query('SELECT name FROM users WHERE id = $1', [userId])).rows[0];
        shop = (await getPostgres().query('SELECT name FROM shops WHERE id = $1', [shopId])).rows[0];
    } else {
        payments = getSqlite().prepare(`SELECT bep.*, b.name as brand_name FROM brand_expense_payments bep JOIN brands b ON b.id = bep.brand_id WHERE b.shop_id = ? ${month ? 'AND bep.month = ?' : ''} ORDER BY b.name ASC`).all(...(month ? [shopId, month] : [shopId]));
        user = getSqlite().prepare('SELECT name FROM users WHERE id = ?').get(userId);
        shop = getSqlite().prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
    }
    return { payments, user, shop };
}

// GET /api/brands/pdf/paid-report
router.get('/pdf/paid-report', requireAuth, async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const { payments, user, shop } = await getReportData(usePostgres(), req.session.user.shop_id, req.session.user.id, month);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="paid-expenses-${month}.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    if (shop) doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('PAID EXPENSES REPORT', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5).fontSize(9).fillColor('#9ca3af').text(`MONTH: ${month}   |   GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1.5).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke().moveDown(2);

    const cols = { brand: 50, date: 300, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('BRAND NAME', cols.brand, doc.y).text('PAYMENT DATE', cols.date, doc.y).text('AMOUNT PAID (RS.)', cols.amount, doc.y, { align: 'right', width: 85 });
    doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#059669').lineWidth(1).stroke().moveDown(0.2);

    let total = 0, rowIdx = 0;
    for (const p of payments) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;
        if (rowIdx % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        doc.fillColor('#374151').font('Helvetica').fontSize(9).text(p.brand_name.toUpperCase(), cols.brand, y, { width: 240 }).text(new Date(p.created_at).toLocaleDateString(), cols.date, y).fillColor('#111827').font('Helvetica-Bold').text(p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols.amount, y, { align: 'right', width: 85 });
        doc.moveDown(0.8); total += p.amount; rowIdx++;
    }
    doc.moveDown(1).font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(`TOTAL PAID: RS. ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { align: 'right' });
    addFooter(); doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/brands/pdf/history
router.get('/pdf/history', requireAuth, async (req, res) => {
    try {
        const { payments, user, shop } = await getReportData(usePostgres(), req.session.user.shop_id, req.session.user.id, null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="brand-expense-history.pdf"');
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    if (shop) doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('BRAND EXPENSE HISTORY', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5).fontSize(9).fillColor('#9ca3af').text(`GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1.5).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke().moveDown(2);

    const cols = { brand: 50, month: 200, amount: 350, date: 450 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('BRAND NAME', cols.brand, doc.y).text('FOR MONTH', cols.month, doc.y).text('AMOUNT PAID', cols.amount, doc.y).text('PAYMENT DATE', cols.date, doc.y);
    doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke().moveDown(0.2);

    let rowIdx = 0;
    for (const p of payments) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;
        if (rowIdx % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        doc.fillColor('#374151').font('Helvetica').fontSize(9).text(p.brand_name.toUpperCase(), cols.brand, y, { width: 140 }).text(p.month, cols.month, y, { width: 140 }).fillColor('#111827').font('Helvetica-Bold').text(`RS. ${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, cols.amount, y, { width: 140 }).fillColor('#374151').font('Helvetica').text(new Date(p.created_at).toLocaleDateString(), cols.date, y);
        doc.moveDown(0.8); rowIdx++;
    }
    addFooter(); doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/brands/pdf/monthly-report
router.get('/pdf/monthly-report', requireAuth, async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const shopId = req.session.user.shop_id;
        const isPostgres = usePostgres();
        
        let expenses, payments, user, shop;
        if (isPostgres) {
            expenses = (await getPostgres().query(`SELECT * FROM expenses WHERE shop_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 ORDER BY date ASC`, [shopId, month])).rows;
            payments = (await getPostgres().query(`SELECT bep.*, b.name as brand_name FROM brand_expense_payments bep JOIN brands b ON b.id = bep.brand_id WHERE b.shop_id = $1 AND bep.month = $2 ORDER BY b.name ASC`, [shopId, month])).rows;
            user = (await getPostgres().query('SELECT name FROM users WHERE id = $1', [req.session.user.id])).rows[0];
            shop = (await getPostgres().query('SELECT name FROM shops WHERE id = $1', [shopId])).rows[0];
        } else {
            expenses = getSqlite().prepare(`SELECT * FROM expenses WHERE shop_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date ASC`).all(shopId, month);
            payments = getSqlite().prepare(`SELECT bep.*, b.name as brand_name FROM brand_expense_payments bep JOIN brands b ON b.id = bep.brand_id WHERE b.shop_id = ? AND bep.month = ? ORDER BY b.name ASC`).all(shopId, month);
            user = getSqlite().prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);
            shop = getSqlite().prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
        }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="expense-report-${month}.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const addFooter = () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const bottom = doc.page.height - 50;
            doc.moveTo(50, bottom - 10).lineTo(545, bottom - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            doc.fontSize(8).fillColor('#9ca3af').text(`Page ${i + 1} of ${range.count}`, 50, bottom, { align: 'right', width: 495 });
            doc.text('This is a secure, system-generated financial document.', 50, bottom, { align: 'left' });
        }
    };

    if (shop) doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('MONTHLY OPERATING REPORT', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5).fontSize(9).fillColor('#9ca3af').text(`PERIOD: ${month}   |   GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1.5).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke().moveDown(2);

    let totalExp = expenses.reduce((s, e) => s + e.amount, 0);
    let totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1f2937').text('FINANCIAL SUMMARY', 50, doc.y).moveDown(0.5);
    const summaryY = doc.y; doc.rect(50, summaryY, 495, 60).fill('#f9fafb');
    doc.fillColor('#374151').font('Helvetica').fontSize(10).text('TOTAL OPERATING EXPENSES', 70, summaryY + 15).text('TOTAL BRAND SETTLEMENTS', 70, summaryY + 35);
    doc.font('Helvetica-Bold').text(`RS. ${totalExp.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 250, summaryY + 15, { align: 'right', width: 275 }).fillColor('#059669').text(`RS. ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 250, summaryY + 35, { align: 'right', width: 275 });
    doc.moveDown(3);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#4f46e5').text('1. OPERATING EXPENSES', 50, doc.y).moveDown(0.8);
    const cols1 = { date: 50, category: 130, title: 210, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('DATE', cols1.date, doc.y).text('CATEGORY', cols1.category, doc.y).text('DESCRIPTION', cols1.title, doc.y).text('AMOUNT (RS.)', cols1.amount, doc.y, { align: 'right', width: 85 });
    doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke().moveDown(0.2);
    let rIdx = 0;
    for (const e of expenses) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y; if (rIdx % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        doc.fillColor('#374151').font('Helvetica').fontSize(8).text(new Date(e.date).toLocaleDateString(), cols1.date, y).text(e.category.toUpperCase(), cols1.category, y).text(e.title.toUpperCase(), cols1.title, y, { width: 240 }).fillColor('#111827').font('Helvetica-Bold').text(e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols1.amount, y, { align: 'right', width: 85 });
        doc.moveDown(0.8); rIdx++;
    }
    doc.moveDown(2).fontSize(13).font('Helvetica-Bold').fillColor('#059669').text('2. BRAND SETTLEMENTS', 50, doc.y).moveDown(0.8);
    const cols2 = { brand: 50, desc: 300, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('BRAND NAME', cols2.brand, doc.y).text('DETAILS', cols2.desc, doc.y).text('AMOUNT (RS.)', cols2.amount, doc.y, { align: 'right', width: 85 });
    doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#059669').lineWidth(1).stroke().moveDown(0.2);
    rIdx = 0;
    for (const p of payments) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y; if (rIdx % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        doc.fillColor('#374151').font('Helvetica').fontSize(8).text(p.brand_name.toUpperCase(), cols2.brand, y).text(`Settlement for ${month}`, cols2.desc, y).fillColor('#111827').font('Helvetica-Bold').text(p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }), cols2.amount, y, { align: 'right', width: 85 });
        doc.moveDown(0.8); rIdx++;
    }
    addFooter(); doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

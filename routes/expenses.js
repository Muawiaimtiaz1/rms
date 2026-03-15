const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const router = express.Router();

// GET /api/expenses
router.get('/', requireAuth, (req, res) => {
    const { from, to, category } = req.query;
    let query = 'SELECT * FROM expenses WHERE shop_id = ?';
    const params = [req.session.user.shop_id];

    if (from) { query += ' AND date >= ?'; params.push(from); }
    if (to) { query += ' AND date <= ?'; params.push(to); }
    if (category) { query += ' AND category = ?'; params.push(category); }

    query += ' ORDER BY date DESC';
    res.json(db.prepare(query).all(...params));
});

// POST /api/expenses
router.post('/', requireAuth, (req, res) => {
    const { title, category, amount, note, date } = req.body;
    if (!title || !amount) return res.status(400).json({ error: 'title and amount required' });

    const result = db.prepare(
        'INSERT INTO expenses (user_id, shop_id, title, category, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.session.user.id, req.session.user.shop_id, title, category || 'Other', parseFloat(amount), note || null, date || new Date().toISOString().slice(0, 10));

    res.json({ ok: true, id: result.lastInsertRowid });
});

// PUT /api/expenses/bulk — bulk update expenses (MUST be before /:id)
router.put('/bulk', requireAuth, (req, res) => {
    const { expenses } = req.body;
    if (!expenses || !Array.isArray(expenses)) return res.status(400).json({ error: 'expenses array required' });

    const updateStmt = db.prepare(`
        UPDATE expenses 
        SET title = ?, category = ?, amount = ?, date = ?, note = ? 
        WHERE id = ? AND shop_id = ?
    `);

    const transaction = db.transaction((exps) => {
        for (const e of exps) {
            updateStmt.run(
                e.title,
                e.category,
                parseFloat(e.amount),
                e.date,
                e.note || null,
                e.id,
                req.session.user.shop_id
            );
        }
    });

    try {
        transaction(expenses);
        res.json({ ok: true });
    } catch (e) {
        console.error('Bulk update failed:', e);
        res.status(500).json({ error: 'Bulk update failed' });
    }
});

// PUT /api/expenses/:id
router.put('/:id', requireAuth, (req, res) => {
    const { title, category, amount, note, date } = req.body;
    if (!title || !amount) return res.status(400).json({ error: 'title and amount required' });

    const expId = parseInt(req.params.id);

    const exp = db.prepare('SELECT id FROM expenses WHERE id = ? AND shop_id = ?').get(expId, req.session.user.shop_id);
    if (!exp) return res.status(404).json({ error: 'Expense not found' });

    db.prepare(`
        UPDATE expenses 
        SET title = ?, category = ?, amount = ?, note = ?, date = ? 
        WHERE id = ? AND shop_id = ?
    `).run(title, category || 'Other', parseFloat(amount), note || null, date || new Date().toISOString().slice(0, 10), expId, req.session.user.shop_id);

    res.json({ ok: true });
});

// DELETE /api/expenses/:id
router.delete('/:id', requireAuth, (req, res) => {
    const expId = parseInt(req.params.id);
    const exp = db.prepare('SELECT id FROM expenses WHERE id = ? AND shop_id = ?').get(expId, req.session.user.shop_id);
    if (!exp) return res.status(404).json({ error: 'Expense not found' });
    db.prepare('DELETE FROM expenses WHERE id = ? AND shop_id = ?').run(expId, req.session.user.shop_id);
    res.json({ ok: true });
});

// GET /api/expenses/pdf — export filtered expenses as PDF
router.get('/pdf', requireAuth, (req, res) => {
    const { from, to, category } = req.query;
    let query = 'SELECT * FROM expenses WHERE shop_id = ?';
    const params = [req.session.user.shop_id];

    if (from) { query += ' AND date >= ?'; params.push(from); }
    if (to) { query += ' AND date <= ?'; params.push(to); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY date ASC';

    const expenses = db.prepare(query).all(...params);
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses-report.pdf"');

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
    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(req.session.user.shop_id);
    if (shop) {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#111827').text(shop.name.toUpperCase(), { align: 'center' });
        doc.moveDown(0.1);
    }
    doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('EXPENSES REPORT', { align: 'center', characterSpacing: 1 });
    doc.moveDown(0.5);

    // Metadata Row
    doc.fontSize(9).font('Helvetica').fillColor('#9ca3af');
    const metaData = `GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`;
    doc.text(metaData, { align: 'center' });
    if (from || to) {
        doc.text(`PERIOD: ${from || 'ALL'} → ${to || 'NOW'}`, { align: 'center' });
    }
    doc.moveDown(1.5);

    // Decorative Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(2);

    // ─── TABLE: EXPENSES ─────────────────────────────────────────
    const cols = { date: 50, category: 130, title: 210, amount: 460 };
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('DATE', cols.date, doc.y, { align: 'left' });
    const hY = doc.y;
    doc.text('CATEGORY', cols.category, hY, { align: 'left' });
    doc.text('DESCRIPTION', cols.title, hY, { align: 'left' });
    doc.text('AMOUNT (RS.)', cols.amount, hY, { align: 'right', width: 85 });
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke();
    doc.moveDown(0.2);

    let totalAmount = 0;
    let rowIdx = 0;
    for (const exp of expenses) {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;

        // Zebra Striping
        if (rowIdx % 2 === 0) {
            doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
        }

        doc.fillColor('#374151').font('Helvetica').fontSize(9);
        doc.text(exp.date, cols.date, y, { align: 'left' });
        doc.text(exp.category.toUpperCase(), cols.category, y, { align: 'left' });
        doc.text(exp.title, cols.title, y, { width: 240, align: 'left' });
        doc.fillColor('#111827').font('Helvetica-Bold').text(parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }), cols.amount, y, { align: 'right', width: 85 });

        doc.moveDown(0.8);
        totalAmount += parseFloat(exp.amount);
        rowIdx++;
    }

    // Totals
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
        .text(`TOTAL EXPENSES: RS. ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { align: 'right' });

    addFooter();
    doc.end();
});

module.exports = router;

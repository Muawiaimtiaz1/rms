const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const router = express.Router();

// GET /api/expenses
router.get('/', requireAuth, async (req, res) => {
    const { from, to, category } = req.query;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();

    let query = `
        SELECT expenses.*, u.name as added_by 
        FROM expenses 
        LEFT JOIN users u ON expenses.user_id = u.id 
        WHERE expenses.shop_id = ${isPostgres ? '$1' : '?'}
    `;
    const params = [shopId];

    if (from) { query += ` AND expenses.date >= ${isPostgres ? '$'+(params.push(from)) : '?'}`; }
    if (to) { query += ` AND expenses.date <= ${isPostgres ? '$'+(params.push(to)) : '?'}`; }
    if (category) { query += ` AND expenses.category = ${isPostgres ? '$'+(params.push(category)) : '?'}`; }

    query += ' ORDER BY expenses.date DESC';

    try {
        let expenses;
        if (isPostgres) expenses = (await getPostgres().query(query, params)).rows;
        else expenses = getSqlite().prepare(query).all(...params);
        res.json(expenses);
    } catch (err) {
        console.error("Fetch expenses error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/expenses
router.post('/', requireAuth, async (req, res) => {
    const { title, category, amount, note, date } = req.body;
    const shopId = req.session.user.shop_id;
    const userId = req.session.user.id;
    const isPostgres = usePostgres();

    if (!title || !amount) return res.status(400).json({ error: 'title and amount required' });

    try {
        const noteVal = note || null;
        const dateVal = date || new Date().toISOString().slice(0, 10);
        const catVal = category || 'Other';
        const amountVal = parseFloat(amount);

        const insertQ = isPostgres 
            ? 'INSERT INTO expenses (user_id, shop_id, title, category, amount, note, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id'
            : 'INSERT INTO expenses (user_id, shop_id, title, category, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const params = [userId, shopId, title, catVal, amountVal, noteVal, dateVal];

        let id;
        if (isPostgres) id = (await getPostgres().query(insertQ, params)).rows[0].id;
        else id = getSqlite().prepare(insertQ).run(...params).lastInsertRowid;
        res.json({ ok: true, id });
    } catch (err) {
        console.error("Add expense error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/expenses/bulk
router.put('/bulk', requireAuth, async (req, res) => {
    const { expenses } = req.body;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!expenses || !Array.isArray(expenses)) return res.status(400).json({ error: 'expenses array required' });

    try {
        if (isPostgres) {
            await getPostgres().withTransaction(async (client) => {
                for (const e of expenses) {
                    const row = (await client.query('SELECT created_at, date FROM expenses WHERE id = $1 AND shop_id = $2', [e.id, shopId])).rows[0];
                    if (!row) throw new Error(`Expense ID ${e.id} not found`);
                    
                    const payCheck = await client.query(`
                        SELECT 1 FROM brand_expense_payments bep
                        JOIN brands b ON bep.brand_id = b.id
                        WHERE bep.month = TO_CHAR(($1)::DATE, 'YYYY-MM') AND b.shop_id = $2 AND bep.created_at >= $3
                        LIMIT 1
                    `, [row.date, shopId, row.created_at]);

                    if (payCheck.rows.length > 0) throw new Error(`Cannot update expense "${e.title}" — brand payments detected.`);

                    await client.query(`
                        UPDATE expenses SET title = $1, category = $2, amount = $3, date = $4, note = $5 
                        WHERE id = $6 AND shop_id = $7
                    `, [e.title, e.category, parseFloat(e.amount), e.date, e.note || null, e.id, shopId]);
                }
            });
        } else {
            const db = getSqlite();
            const transaction = db.transaction((exps) => {
                const updateStmt = db.prepare('UPDATE expenses SET title = ?, category = ?, amount = ?, date = ?, note = ? WHERE id = ? AND shop_id = ?');
                for (const e of exps) {
                    const row = db.prepare('SELECT created_at, date FROM expenses WHERE id = ? AND shop_id = ?').get(e.id, shopId);
                    if (!row) throw new Error(`Expense ID ${e.id} not found`);

                    const payCheck = db.prepare(`
                        SELECT 1 FROM brand_expense_payments bep
                        JOIN brands b ON bep.brand_id = b.id
                        WHERE bep.month = strftime('%Y-%m', ?) AND b.shop_id = ? AND bep.created_at >= ?
                        LIMIT 1
                    `).get(row.date, shopId, row.created_at);

                    if (payCheck) throw new Error(`Cannot update expense "${e.title}" — brand payments detected.`);

                    updateStmt.run(e.title, e.category, parseFloat(e.amount), e.date, e.note || null, e.id, shopId);
                }
            });
            transaction(expenses);
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('Bulk update error:', e);
        res.status(400).json({ error: e.message });
    }
});

// PUT /api/expenses/:id
router.put('/:id', requireAuth, async (req, res) => {
    const { title, category, amount, note, date } = req.body;
    const expId = req.params.id;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!title || !amount) return res.status(400).json({ error: 'title and amount required' });

    try {
        let exp;
        if (isPostgres) exp = (await getPostgres().query('SELECT id, date, created_at FROM expenses WHERE id = $1 AND shop_id = $2', [expId, shopId])).rows[0];
        else exp = getSqlite().prepare('SELECT id, date, created_at FROM expenses WHERE id = ? AND shop_id = ?').get(expId, shopId);

        if (!exp) return res.status(404).json({ error: 'Expense not found' });

        let paymentsFound = false;
        if (isPostgres) {
            paymentsFound = (await getPostgres().query(`
                SELECT 1 FROM brand_expense_payments bep JOIN brands b ON bep.brand_id = b.id
                WHERE bep.month = TO_CHAR(($1)::DATE, 'YYYY-MM') AND b.shop_id = $2 AND bep.created_at >= $3 LIMIT 1
            `, [exp.date, shopId, exp.created_at])).rows.length > 0;
        } else {
            paymentsFound = !!getSqlite().prepare(`
                SELECT 1 FROM brand_expense_payments bep JOIN brands b ON bep.brand_id = b.id
                WHERE bep.month = strftime('%Y-%m', ?) AND b.shop_id = ? AND bep.created_at >= ? LIMIT 1
            `).get(exp.date, shopId, exp.created_at);
        }

        if (paymentsFound) return res.status(400).json({ error: 'Cannot edit this expense because brand payments have already been made.' });

        const q = isPostgres 
            ? 'UPDATE expenses SET title=$1, category=$2, amount=$3, note=$4, date=$5 WHERE id=$6 AND shop_id=$7'
            : 'UPDATE expenses SET title=?, category=?, amount=?, note=?, date=? WHERE id=? AND shop_id=?';
        const p = [title, category || 'Other', parseFloat(amount), note || null, date || exp.date, expId, shopId];
        if (isPostgres) await getPostgres().query(q, p); else getSqlite().prepare(q).run(...p);

        res.json({ ok: true });
    } catch (err) {
        console.error("Update expense error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const expId = req.params.id;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        let exp;
        if (isPostgres) exp = (await getPostgres().query('SELECT id, date, created_at FROM expenses WHERE id = $1 AND shop_id = $2', [expId, shopId])).rows[0];
        else exp = getSqlite().prepare('SELECT id, date, created_at FROM expenses WHERE id = ? AND shop_id = ?').get(expId, shopId);
        if (!exp) return res.status(404).json({ error: 'Expense not found' });

        let payCheck = false;
        if (isPostgres) {
            payCheck = (await getPostgres().query(`
                SELECT 1 FROM brand_expense_payments bep JOIN brands b ON bep.brand_id = b.id
                WHERE bep.month = TO_CHAR(($1)::DATE, 'YYYY-MM') AND b.shop_id = $2 AND bep.created_at >= $3 LIMIT 1
            `, [exp.date, shopId, exp.created_at])).rows.length > 0;
        } else {
            payCheck = !!getSqlite().prepare(`
                SELECT 1 FROM brand_expense_payments bep JOIN brands b ON bep.brand_id = b.id
                WHERE bep.month = strftime('%Y-%m', ?) AND b.shop_id = ? AND bep.created_at >= ? LIMIT 1
            `).get(exp.date, shopId, exp.created_at);
        }

        if (payCheck) return res.status(400).json({ error: 'Cannot delete expense — brand payments recorded.' });

        const q = isPostgres ? 'DELETE FROM expenses WHERE id = $1 AND shop_id = $2' : 'DELETE FROM expenses WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(q, [expId, shopId]); else getSqlite().prepare(q).run(expId, shopId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Delete expense error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/expenses/pdf
router.get('/pdf', requireAuth, async (req, res) => {
    const { from, to, category } = req.query;
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();

    let query = `SELECT * FROM expenses WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
    const params = [shopId];
    if (from) query += ` AND date >= ${isPostgres ? '$'+(params.push(from)) : '?'}`;
    if (to) query += ` AND date <= ${isPostgres ? '$'+(params.push(to)) : '?'}`;
    if (category) query += ` AND category = ${isPostgres ? '$'+(params.push(category)) : '?'}`;
    query += ' ORDER BY date ASC';

    try {
        let expenses, user, shop;
        if (isPostgres) {
            const pg = getPostgres();
            expenses = (await pg.query(query, params)).rows;
            user = (await pg.query('SELECT name FROM users WHERE id = $1', [req.session.user.id])).rows[0];
            shop = (await pg.query('SELECT name FROM shops WHERE id = $1', [shopId])).rows[0];
        } else {
            const db = getSqlite();
            expenses = db.prepare(query).all(...params);
            user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user.id);
            shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="expenses-report.pdf"');
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
        doc.fontSize(14).font('Helvetica').fillColor('#4b5563').text('EXPENSES REPORT', { align: 'center', characterSpacing: 1 });
        doc.moveDown(0.5).fontSize(9).fillColor('#9ca3af').text(`GENERATED BY: ${user ? user.name.toUpperCase() : 'SYSTEM'}   |   DATE: ${new Date().toLocaleDateString()}`, { align: 'center' });
        if (from || to) doc.text(`PERIOD: ${from || 'ALL'} → ${to || 'NOW'}`, { align: 'center' });
        doc.moveDown(1.5).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke().moveDown(2);

        const cols = { date: 50, category: 130, title: 210, amount: 460 };
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('DATE', cols.date, doc.y).text('CATEGORY', cols.category, doc.y).text('DESCRIPTION', cols.title, doc.y).text('AMOUNT (RS.)', cols.amount, doc.y, { align: 'right', width: 85 });
        doc.moveDown(0.4).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4f46e5').lineWidth(1).stroke().moveDown(0.2);

        let totalAmount = 0, rowIdx = 0;
        for (const exp of expenses) {
            if (doc.y > 740) doc.addPage();
            const y = doc.y; if (rowIdx % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f3f4f6');
            doc.fillColor('#374151').font('Helvetica').fontSize(9).text(exp.date, cols.date, y).text(exp.category.toUpperCase(), cols.category, y).text(exp.title, cols.title, y, { width: 240 }).fillColor('#111827').font('Helvetica-Bold').text(parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }), cols.amount, y, { align: 'right', width: 85 });
            doc.moveDown(0.8); totalAmount += parseFloat(exp.amount); rowIdx++;
        }
        doc.moveDown(1).font('Helvetica-Bold').fontSize(11).fillColor('#000').text(`TOTAL EXPENSES: RS. ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { align: 'right' });
        addFooter(); doc.end();
    } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

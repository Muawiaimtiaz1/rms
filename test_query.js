const db = require('./db/db');

const month = '2026-04';
const shopId = 3;

const paymentsFound = db.prepare(`
    SELECT 1 FROM brand_expense_payments bep
    JOIN brands b ON bep.brand_id = b.id
    WHERE bep.month = ? AND b.shop_id = ?
    LIMIT 1
`).get(month, shopId);

console.log("Payments found for month 2026-04, shop 3:", paymentsFound);

const month2 = '2026-03';
const paymentsFound2 = db.prepare(`
    SELECT 1 FROM brand_expense_payments bep
    JOIN brands b ON bep.brand_id = b.id
    WHERE bep.month = ? AND b.shop_id = ?
    LIMIT 1
`).get(month2, shopId);

console.log("Payments found for month 2026-03, shop 3:", paymentsFound2);

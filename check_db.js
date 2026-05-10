const db = require('./db/db');
console.log("--- Expenses ---");
console.log(db.prepare("SELECT * FROM expenses LIMIT 10").all());
console.log("\n--- Payments ---");
console.log(db.prepare("SELECT * FROM brand_expense_payments LIMIT 10").all());

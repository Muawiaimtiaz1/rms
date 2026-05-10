const db = require('./db/db');
console.log("--- Brands ---");
console.log(db.prepare("SELECT * FROM brands").all());

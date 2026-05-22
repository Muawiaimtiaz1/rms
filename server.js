require("dotenv").config();
require("express-async-errors");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "pos-super-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
  }),
);

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/brands", require("./routes/brands"));
app.use("/api/products", require("./routes/products"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/expense-categories", require("./routes/expense-categories"));
app.use("/api/product-categories", require("./routes/product-categories"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/shops", require("./routes/shops"));
app.use("/api/subscriptions", require("./routes/subscriptions"));
app.use('/api/raw-stock', require('./routes/raw-stock'));
app.use('/api/recipes', require('./routes/recipes'));
app.use("/api/shop-settings", require("./routes/shop-settings"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/tables", require("./routes/tables"));
app.use("/api/kds", require("./routes/kds"));

// Named page routes — MUST be before express.static to avoid index.html conflict
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/admin/store-monitoring", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "store-monitoring.html"));
});

// Static assets (js, css, etc.) served after named routes
app.use(express.static(path.join(__dirname, "public")));

const { initPostgres } = require("./db/db-init");

const PORT = process.env.PORT || 4000;

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`✅ POS System running at http://localhost:${port}`);
    console.log("   Login: admin / admin123");
  });
}

// Global Error Handler - Ensures all errors are returned as JSON
app.use((err, req, res, next) => {
  const errorLog = `${new Date().toISOString()} - ${req.method} ${req.url} - ${err.stack}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, 'error_debug.log'), errorLog);
  } catch (e) {
    console.error("Failed to write to error_debug.log", e);
  }
  console.error("[SERVER ERROR]", err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error',
    stack: err.stack
  });
});

if (require.main === module) {
  (async () => {
    // Initialize Database for PostgreSQL if needed
    await initPostgres();
    startServer();
  })();
}

module.exports = { app, startServer };

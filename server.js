const express = require("express");
const session = require("express-session");
const path = require("path");

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
app.use("/api/customers", require("./routes/customers"));
app.use("/api/shops", require("./routes/shops"));
app.use("/api/subscriptions", require("./routes/subscriptions"));
app.use("/api/shop-settings", require("./routes/shop-settings"));
app.use("/api/admin", require("./routes/admin"));

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

const PORT = process.env.PORT || 4000;

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`✅ POS System running at http://localhost:${port}`);
    console.log("   Login: admin / admin123");
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

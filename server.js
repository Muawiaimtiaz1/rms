require("dotenv").config();
require("express-async-errors");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require('fs');
const db = require("./db/knex");

const app = express();

class KnexSessionStore extends session.Store {
  constructor(knex, options = {}) {
    super();
    this.knex = knex;
    this.tableName = options.tableName || "sessions";
    this.ready = null;
  }

  ensureReady() {
    if (!this.ready) this.ready = this.ensureTable();
    return this.ready;
  }

  async ensureTable() {
    const exists = await this.knex.schema.hasTable(this.tableName);
    if (!exists) {
      await this.knex.schema.createTable(this.tableName, (table) => {
        table.string("sid").primary();
        table.text("sess").notNullable();
        table.dateTime("expires").index();
      });
    }
  }

  getExpiry(sess) {
    return sess?.cookie?.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000));
  }

  async get(sid, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      const row = await this.knex(this.tableName).where({ sid }).first();
      if (!row) return callback(null, null);

      if (row.expires && new Date(row.expires) <= new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sess, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      const expires = this.getExpiry(sess).toISOString();
      await this.knex(this.tableName)
        .insert({ sid, sess: JSON.stringify(sess), expires })
        .onConflict("sid")
        .merge({ sess: JSON.stringify(sess), expires });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  async touch(sid, sess, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      await this.knex(this.tableName)
        .where({ sid })
        .update({ sess: JSON.stringify(sess), expires: this.getExpiry(sess).toISOString() });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  async destroy(sid, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      await this.knex(this.tableName).where({ sid }).del();
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new KnexSessionStore(db),
    secret: process.env.SESSION_SECRET || "pos-super-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000),
    },
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
app.use("/api/print-jobs", require("./routes/print-jobs"));
app.use("/api/printers", require("./routes/printers"));
app.use("/api/shifts", require("./routes/shifts"));
app.use("/api/activity-logs", require("./routes/activity-logs"));
app.use("/print", require("./routes/print"));

// Named page routes — MUST be before express.static to avoid index.html conflict
function sendNoStorePage(res, fileName) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.sendFile(path.join(__dirname, "public", fileName));
}

app.get("/", (req, res) => {
  sendNoStorePage(res, "login.html");
});

app.get("/dashboard", (req, res) => {
  sendNoStorePage(res, "dashboard.html");
});

app.get("/admin/store-monitoring", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "store-monitoring.html"));
});

app.get("/api/download-print-agent", (req, res) => {
  res.download(path.join(__dirname, "print-agent.js"), "print-agent.js");
});

// Static assets (js, css, etc.) served after named routes
app.use(express.static(path.join(__dirname, "public")));

const { initPostgres } = require("./db/db-init");
const { usePostgres } = require("./db/runtime");

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
    if (usePostgres()) {
      await initPostgres();
    } else {
      require("./db/db");
    }
    startServer();
  })();
}

module.exports = { app, startServer };

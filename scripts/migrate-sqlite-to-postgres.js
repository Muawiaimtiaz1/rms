const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { query, withTransaction, close } = require("../db/postgres");

const sqlitePath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(__dirname, "..", "db", "pos.db");
const schemaPath = path.join(__dirname, "..", "db", "postgres-schema.sql");

const tableOrder = [
  "shops",
  "subscriptions",
  "users",
  "brands",
  "product_categories",
  "expense_categories",
  "products",
  "product_batches",
  "product_compositions",
  "floors",
  "tables",
  "customers",
  "sales",
  "sale_items",
  "returns",
  "return_items",
  "customer_ledger",
  "expenses",
  "brand_expense_payments",
  "raw_stocks",
  "raw_stock_batches",
  "raw_stock_waste",
  "recipes",
  "recipe_ingredients",
  "product_recipe_links",
  "support_tickets",
  "ticket_comments",
  "notifications",
  "notification_reads",
  "activity_logs",
];

function pgIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqliteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sourceTableExists(sqlite, table) {
  return Boolean(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function sourceColumns(sqlite, table) {
  return sqlite
    .prepare(`PRAGMA table_info(${sqliteIdent(table)})`)
    .all()
    .map((column) => column.name);
}

async function targetColumns(client, table) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function resetPostgresTables(client) {
  const tableList = tableOrder.map(pgIdent).join(", ");
  await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

async function upsertRows(client, table, columns, rows) {
  if (!rows.length || !columns.length) return 0;

  const quotedTable = pgIdent(table);
  const quotedColumns = columns.map(pgIdent).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updateColumns = columns.filter((column) => column !== "id");
  const conflictClause =
    columns.includes("id") && updateColumns.length
      ? ` ON CONFLICT (${pgIdent("id")}) DO UPDATE SET ${updateColumns
          .map((column) => `${pgIdent(column)} = EXCLUDED.${pgIdent(column)}`)
          .join(", ")}`
      : columns.includes("id")
        ? ` ON CONFLICT (${pgIdent("id")}) DO NOTHING`
        : "";

  const sql = `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})${conflictClause}`;

  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    await client.query(sql, values);
  }

  return rows.length;
}

async function syncIdentitySequence(client, table) {
  const sequence = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS name", [
    table,
  ]);
  const sequenceName = sequence.rows[0] && sequence.rows[0].name;
  if (!sequenceName) return;

  await client.query(
    `
      SELECT setval(
        $1::regclass,
        COALESCE((SELECT MAX(id) FROM ${pgIdent(table)}), 1),
        (SELECT MAX(id) IS NOT NULL FROM ${pgIdent(table)})
      )
    `,
    [sequenceName],
  );
}

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found at ${sqlitePath}`);
  }

  console.log(`Using SQLite source: ${sqlitePath}`);
  console.log("Applying PostgreSQL schema...");
  await query(fs.readFileSync(schemaPath, "utf8"));

  const sqlite = new Database(sqlitePath, { readonly: true });

  try {
    await withTransaction(async (client) => {
      if (process.env.PG_RESET === "true") {
        console.log("PG_RESET=true, clearing PostgreSQL tables first...");
        await resetPostgresTables(client);
      }

      for (const table of tableOrder) {
        if (!sourceTableExists(sqlite, table)) {
          console.log(`Skipping ${table}: not present in SQLite`);
          continue;
        }

        const srcColumns = sourceColumns(sqlite, table);
        const dstColumns = await targetColumns(client, table);
        const columns = dstColumns.filter((column) => srcColumns.includes(column));

        if (!columns.length) {
          console.log(`Skipping ${table}: no matching columns`);
          continue;
        }

        const rows = sqlite.prepare(`SELECT * FROM ${sqliteIdent(table)}`).all();
        const count = await upsertRows(client, table, columns, rows);
        await syncIdentitySequence(client, table);
        console.log(`Migrated ${count} rows into ${table}`);
      }
    });
  } finally {
    sqlite.close();
  }

  console.log("SQLite to PostgreSQL migration completed.");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });

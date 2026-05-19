require('dotenv').config();
const { Pool } = require("pg");

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function buildPoolConfig() {
  const poolMax = parseInt(process.env.PG_POOL_MAX || "20", 10);
  const base = {
    max: Number.isFinite(poolMax) ? poolMax : 20,
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || "30000", 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT_MS || "10000", 10),
  };

  if (process.env.PGSSL || process.env.PGSSLMODE === "require") {
    base.ssl = boolEnv(process.env.PGSSL_REJECT_UNAUTHORIZED)
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connectionString) {
    return { ...base, connectionString };
  }

  return {
    ...base,
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "rms_pos",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
  };
}

const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("[POSTGRES POOL ERROR]", err);
});

function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function close() {
  return pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  close,
};


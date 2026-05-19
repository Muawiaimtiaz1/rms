require('dotenv').config();

function normalizedClientName() {
  return String(process.env.DB_CLIENT || process.env.DB_DIALECT || "sqlite")
    .trim()
    .toLowerCase();
}

function usePostgres() {
  const client = normalizedClientName();
  return client === "postgres" || client === "postgresql" || client === "pg";
}

function getSqlite() {
  return require("./db");
}

function getPostgres() {
  return require("./postgres");
}

module.exports = {
  normalizedClientName,
  usePostgres,
  getSqlite,
  getPostgres,
};


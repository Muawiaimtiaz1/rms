const fs = require("fs");
const path = require("path");
const { query, close } = require("../db/postgres");

const schemaPath = path.join(__dirname, "..", "db", "postgres-schema.sql");

async function main() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  await query(schema);
  console.log("PostgreSQL schema applied successfully.");
}

main()
  .catch((err) => {
    console.error("Failed to apply PostgreSQL schema:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });


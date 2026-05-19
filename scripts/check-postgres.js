const { query, close } = require("../db/postgres");

async function main() {
  const result = await query("SELECT NOW() AS now, current_database() AS database");
  const row = result.rows[0];
  console.log(`PostgreSQL connected: ${row.database} at ${row.now.toISOString()}`);
}

main()
  .catch((err) => {
    console.error("PostgreSQL check failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });


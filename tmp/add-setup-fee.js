const { getSqlite, getPostgres, usePostgres } = require('./db/runtime');

async function run() {
    console.log('--- Adding setup_fee column ---');
    const isPostgres = usePostgres();
    
    if (isPostgres) {
        const pg = getPostgres();
        try {
            await pg.query('ALTER TABLE shops ADD COLUMN IF NOT EXISTS setup_fee DECIMAL(12,2) DEFAULT 0');
            console.log('✅ Postgres: setup_fee column added to shops');
        } catch (e) {
            console.log('⚠️ Postgres Column might already exist:', e.message);
        }
    } else {
        const db = getSqlite();
        try {
            db.prepare('ALTER TABLE shops ADD COLUMN setup_fee DECIMAL(12,2) DEFAULT 0').run();
            console.log('✅ SQLite: setup_fee column added to shops');
        } catch (e) {
            console.log('⚠️ SQLite Column might already exist:', e.message);
        }
    }
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

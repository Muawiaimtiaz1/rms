const knex = require('knex');
require('dotenv').config();

const dbClient = process.env.DB_CLIENT || 'sqlite';

const config = {
  sqlite: {
    client: 'better-sqlite3',
    connection: {
      filename: "./db/pos.db",
    },
    useNullAsDefault: true,
  },
  postgres: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};

const db = knex(config[dbClient === 'postgres' ? 'postgres' : 'sqlite']);

module.exports = db;

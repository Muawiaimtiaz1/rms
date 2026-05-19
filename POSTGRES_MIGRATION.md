# PostgreSQL Migration Guide

The POS system has been successfully migrated to a **dual-mode database architecture**. This allows the application to run on either **SQLite** or **PostgreSQL** based on environment configuration.

## Environment Configuration

To enable PostgreSQL mode, set the following environment variables:

```bash
# Required: Set to postgres to use PostgreSQL
export DB_CLIENT="postgres"

# Required: Connection string OR individual parameters
export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE"

# Optional: For managed databases (e.g., Supabase, Neon)
export PGSSLMODE="require"
```

If `DB_CLIENT` is not set or set to `sqlite`, the app continues using SQLite by default.

## What Was Migrated

All system routes have been refactored to be asynchronous and database-agnostic:

- ✅ `/api/auth` (Authentication & SaaS Restrictions)
- ✅ `/api/users` (Staff & Permission Management)
- ✅ `/api/brands` (Brand Financials & PDF Reports)
- ✅ `/api/products` (Inventory, Batches & Composite Logic)
- ✅ `/api/sales` (Critical Checkout & Return Transactions)
- ✅ `/api/expenses` (Financial Reporting)
- ✅ `/api/customers` (Ledger & Payments)
- ✅ `/api/analytics` (Advanced Date Aggregation)
- ✅ `/api/raw-stock` & `/api/recipes` (FIFO Stock Deduction)
- ✅ `/api/tables` & `/api/floors` (Restaurant Operations)
- ✅ `/api/kds` (Kitchen Display System)
- ✅ `/api/shops` & `/api/admin` (Superadmin Monitoring)

## Migration Commands

### 1. Check Connectivity
Verify the PostgreSQL connection:
```bash
npm run postgres:check
```

### 2. Apply Schema
Create or update the PostgreSQL tables and indexes:
```bash
npm run postgres:schema
```

### 3. Data Migration
Copy your existing SQLite data into PostgreSQL:
```bash
npm run postgres:migrate
```

To clear PostgreSQL tables before migration:
```bash
PG_RESET=true npm run postgres:migrate
```

## Technical Architecture

- **Runtime Selection**: `db/runtime.js` manages the dynamic switching between `better-sqlite3` and `pg` drivers.
- **Async Standardization**: Every route handler is now an `async` function to support non-blocking Postgres queries.
- **SQL Compatibility**: The system uses conditional logic to handle syntax differences (e.g., SQLite `strftime` vs PostgreSQL `TO_CHAR`).
- **Transactions**: Complex operations use the `withTransaction` helper in PostgreSQL to ensure atomicity.

## Verification Checklist

After switching to PostgreSQL, verify the following critical flows:
1. Login and Token authentication.
2. POS checkout with inventory batch deduction.
3. Customer payment and ledger balance accuracy.
4. Recipe-based raw stock deduction.
5. PDF report generation for brands and analytics.

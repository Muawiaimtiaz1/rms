# Software Requirements Specification (SRS) - POS System v2

## 1. Introduction
This document describes the software requirements for the Multi-tenant POS System v2. It is intended for the development and testing teams.

## 2. Functional Requirements

### 2.1 User Management
- **FR.1** Authenticate users via username and hash-matched passwords.
- **FR.2** Enforce session timeouts (default 8 hours).
- **FR.3** Authorize panel access based on `allowed_panels` JSON array in `users` or `shops` tables.

### 2.2 Billing & Checkout
- **FR.4** Calculate subtotal, tax, discount, and grand total in a single transaction.
- **FR.5** Update `stock` and `product_batches` atomically.
- **FR.6** Support for "Due" payments: Update `current_balance` in `customers` table if `amount_received < total`.

### 2.3 Inventory Management
- **FR.7** Maintain FIFO (First-In, First-Out) stock deduction.
- **FR.8** Track "Damaged" stock separate from sellable stock.
- **FR.9** Support for "Composite Products" (Bundles/Recipes) where selling one product deducts multiple raw items.

### 2.4 Multitenancy
- **FR.10** Inject `shop_id` filter automatically in every database query.
- **FR.11** Prevent Superadmin access to specific shop sessions unless explicitly granted.

## 3. Non-Functional Requirements

### 3.1 Performance
- **NR.1** Database queries must resolve in < 100ms for common POS screens.
- **NR.2** Support for up to 1,000 concurrent shop sessions on the PostgreSQL backend.

### 3.2 Security
- **NR.3** All sensitive endpoints must use `requireAuth` middleware.
- **NR.4** All environment variables (Passwords/Secrets) must reside in a `.env` file, never in version control.

### 3.3 Maintainability
- **NR.5** Code must follow the "Layered Architecture": Separation of Routes, Services, and Database Drivers.
- **NR.6** Use Knex.js for all future database migrations to maintain cross-engine compatibility.

## 4. Technical Constraints
- **Runtime**: Node.js 22.x preferred (minimum 20.x).
- **Database**: PostgreSQL 15+ (Production), SQLite (Dev).
- **Architecture**: Monolithic Node.js server with RESTful API endpoints.

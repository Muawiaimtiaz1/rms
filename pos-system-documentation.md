# POS System v2 - Comprehensive Documentation

This document provides a detailed overview of the POS System v2 architecture, its features, logic conditions, and how different modules interact. It serves as a guide for developers and system administrators to understand the underlying mechanics of the project.

---

## 1. System Architecture & Tech Stack
- **Backend**: Node.js with Express.js
- **Database**: SQLite (via `better-sqlite3` and `db.js`)
- **Authentication**: Session-based (`express-session`) with encrypted passwords (`bcryptjs`).
- **Data Isolation (Multi-Tenancy)**: The system is designed as a SaaS platform where multiple shops operate independently. Almost all tables include a `shop_id` foreign key.

---

## 2. Access Control & Authorization Logic

The system employs a strict Hierarchical Role-Based Access Control (RBAC) combined with Panel-level permissions and SaaS Subscription checks.

### 2.1 Roles
1. **Superadmin (System Owner)**:
   - Does not belong to any specific `shop_id` (it evaluates as `null` or ignored).
   - Has full access to the `/api/admin` routes to manage shops, view global statistics, manage subscriptions, and assist via support tickets.
2. **Admin (Shop Owner)**:
   - Belongs to a specific `shop_id`.
   - Has access to all "Panels" that have been granted to their shop by the Superadmin.
   - Can manage their shop's staff (Users), products, sales, and settings.
3. **User (Shop Staff)**:
   - Belongs to a specific `shop_id`.
   - Has restricted access. Their capabilities are limited to a subset of the shop's allowed panels.

### 2.2 Login Conditions & Validations
When a user attempts to log in (`/api/auth/login`), the following conditions are evaluated in sequence:
1. **Credentials Check**: Verifies username and hashed password.
2. **Account Status Check**: If user `status === 'blocked'`, access is denied.
3. **SaaS Level Checks (Skipped for Superadmins)**:
   - **Shop Status**: Must be `active`. If `blocked`, access is denied globally to all shop staff.
   - **Subscription Check**: The system queries the `subscriptions` table for an active plan (`end_date >= current_date`). If none exists, login is blocked.
4. **Panel Permissions Logic**:
   - The shop's `allowed_panels` (JSON array) is retrieved.
   - If User is an `admin`, their session `allowed_panels` equals the shop's full allowed panels.
   - If User is `user`, their assigned panels are intercepted and filtered against the shop's panels (e.g., if a staff member has the "Analytics" panel, but the Shop's subscription doesn't include it, it gets omitted).

---

## 3. Core Modules & Features

### 3.1 Point of Sale (Checkout & Sales)
**Endpoints**: `/api/sales`

**How it works:**
- A cashier loads products into the cart and submits a checkout request.
- The backend wraps the entire checkout in an SQLite **Transaction** so that if any step fails (e.g., insufficient stock), the whole sale rolls back.

**Conditions Applied:**
- **Product Verification**: System checks if `products.shop_id === user.shop_id`.
- **Stock Validation**: Verifies `product.stock >= cartItem.quantity`. If not, throws an error.
- **Calculations**: Computes subtotal, subtracts `discount`, then adds `tax_percentage`.
- **Inventory Deduction**: Reduces `products.stock` automatically for each sold item.
- **Partial/Full Payments**: Captures `total` vs `amount_received`. If `amount_received < total`, the sale is conceptually marked as having a "Due" balance. A patch endpoint (`PATCH /api/sales/:id/pay`) allows marking the remaining balance as paid later.

### 3.2 Inventory Management (Products & Brands)
**Endpoints**: `/api/products`, `/api/brands`

**How it works:**
- Products belong to specific Brands and Categories.
- Brands acts essentially as Suppliers or Partners.
- **Soft Deletion**: Products use an `is_deleted = 1` flag instead of being forcefully removed `DELETE FROM products`. 
  - *Why?* To maintain referential integrity. Removing a product entirely would break past sales records (`sale_items` referencing `product_id`).

### 3.3 Expenses Module
**Endpoints**: `/api/expenses`, `/api/expense-categories`

**How it works:**
- Every shop can track operational expenses (Utility, Rent, Salary).
- **Brand Expense Payments**: There is a specific table (`brand_expense_payments`). This is used when a shop needs to log money paid specifically to a supplier/brand. This helps generating accurate Profit/Loss or Cost of Goods Sold (COGS) reports.

### 3.4 Admin Dashboard / Store Monitoring
**Endpoints**: `/api/admin`

**How it works:**
- Accessed solely by Superadmin.
- Aggregates data ignoring `shop_id` to provide platform-wide metrics: `totalStores`, `globalRevenue`, server CPU/RAM health.
- Can toggle shop statuses (`active`/`blocked`) and forcefully reset a shop admin's password if requested.
- Can modify/extend subscriptions for shops.

### 3.5 Support / Ticketing System
**Endpoints**: `/api/support`

**How it works:**
- Shop users can raise tickets.
- `ticket_comments` table tracks conversation threading.
- **Condition - Internal Notes**: Comments have an `is_internal` flag. If `1`, only the superadmin can see that specific comment. Very useful for system-owner private notes on a client issue.

---

## 4. Helper Mechanisms

### Activity Logging
- `activity_logs` table quietly tracks major actions (e.g., "Status Changed", "Password Reset", "Subscription Updated").
- *Why?* Provides an audit trail for the Superadmin to verify what actions were taken against which shops.

### Background "Cron" Type concepts
- Subscriptions are handled on-the-fly via date comparisons: `WHERE end_date >= date('now')`. Rather than having a cron-job disable shops, the login and route checks dynamically lock the shop out the moment the standard date passes.

## Summary

If you intend to add new features or adjust logic, always keep the **Multi-Tenant Rule** in mind: Every query reading or writing business data (Sales, Products, Expenses) **MUST** include `WHERE shop_id = ?` to ensure users only see and mutate their own shop's data.

# Product Requirements Document (PRD)

**Product Name:** POS System v2 (SaaS Platform)  
**Document Version:** 1.1 (PostgreSQL Update)

## 1. Product Overview
### 1.1 Objective
To provide a comprehensive, multi-tenant Point of Sale (POS) and store management system. The platform allows a central "System Owner" to offer POS software as a Service (SaaS) to independent Shop Owners through subscription plans.

### 1.2 Target Audience
1.  **System Owners (Superadmin)**: Managing the overarching software, billing, and global metrics.
2.  **Shop Owners (Admin)**: Managing their individual business operations, inventory, and staff.
3.  **Shop Staff (User)**: Running day-to-day checkout and sales operations.

---

## 2. User Personas & Access Roles
### 2.1 Superadmin (System Owner)
-   **Scope**: Platform-wide. No specific `shop_id`.
-   **Capabilities**: Global Admin Dashboard, shop status toggling, subscription renewals, global revenue monitoring, and internal support ticketing responses.

### 2.2 Admin (Shop Owner)
-   **Scope**: Tenant-specific (`shop_id`).
-   **Capabilities**: Full access to all modules granted in their plan (`allowed_panels`). Can create/manage staff accounts, inventory, brands, and monitor shop sales.

### 2.3 User (Shop Staff)
-   **Scope**: Tenant-specific (`shop_id`).
-   **Capabilities**: Highly restricted. Access assigned by Shop Admin (e.g., POS terminal only).

---

## 3. Core Features & Functional Requirements

### 3.1 Multi-Tenant SaaS Management
-   **Isolation**: Every business query must filter by `shop_id` to prevent data leaks.
-   **Subscriptions**: Automatic blocking of access if the `end_date` passes.
-   **Panel Control**: Dynamic feature enabling based on shop plan.

### 3.2 Point of Sale (Checkout)
-   **Cart Logic**: Support for products, taxes (%), and discounts (flat).
-   **Atomicity**: Checkout must be transactional (all data or none).
-   **Payment Tracking**: Support for Cash, Due amounts (partial payment), and automated stock deduction.

### 3.3 Inventory & ERP Modules
-   **Multi-Step Stock**: Support for Raw Stock, Recipes, and Finished Goods.
-   **FIFO Batching**: Inventory must be deducted based on Purchase Date (FIFO) to ensure accurate Cost of Goods Sold (COGS).
-   **Soft Deletion**: Products use `is_deleted` flags to maintain historical receipt integrity.

### 3.4 Financials & Analytics
-   **Expenses**: Tracking of utility, rent, and staff salaries.
-   **Brand Settlements**: Tracking payments made to suppliers.
-   **Reporting**: Real-time sales history, hourly/daily/monthly revenue graphs, and PDF export support.

---

## 4. Non-Functional Requirements

### 4.1 Security
-   Passwords hashed with `bcryptjs`.
-   Secure session handling with role-based panel verification.

### 4.2 Reliability & Scaling
-   **Database**: Centralized PostgreSQL in production for high concurrency and data safety.
-   **Architecture**: Layered Service Architecture (Monolith -> Layers) to prevent code regression during scaling.

### 4.3 Auditing
-   `activity_logs` table records all major administrative actions.

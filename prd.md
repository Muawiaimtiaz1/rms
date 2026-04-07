# Product Requirements Document (PRD)
**Product Name:** POS System v2 (SaaS Platform)
**Document Version:** 1.0

## 1. Product Overview
### 1.1 Objective
To provide a comprehensive, multi-tenant Point of Sale (POS) and store management system. The platform allows a central "System Owner" to offer POS software as a Service (SaaS) to independent Shop Owners through subscription plans.

### 1.2 Target Audience
1. **System Owners (Superadmin)**: Managing the overarching software, billing, and global metrics.
2. **Shop Owners (Admin)**: Managing their individual business operations, inventory, and staff.
3. **Shop Staff (User)**: Running day-to-day checkout and sales operations.

---

## 2. User Personas & Access Roles
### 2.1 Superadmin (System Owner)
- **Scope**: Platform-wide. No specific `shop_id`.
- **Primary Goals**: Monitor global revenue, manage shop subscriptions (activate/block/renew), view system health, and resolve shop owner issues.
- **Capabilities**: Access to global Admin Dashboard, shop status toggling, forced password resets, and internal support ticketing responses.

### 2.2 Admin (Shop Owner)
- **Scope**: Tenant-specific (`shop_id`).
- **Primary Goals**: Manage business profitability, oversee staff, track inventory, and pay platform subscription fees.
- **Capabilities**: Full access to all modules granted in their subscription plan (`allowed_panels`). Can create/manage staff accounts and monitor all shop sales.

### 2.3 User (Shop Staff)
- **Scope**: Tenant-specific (`shop_id`).
- **Primary Goals**: Process sales quickly, manage specific inventory tasks.
- **Capabilities**: Highly restricted. Can only access specific panels (e.g., just the POS terminal) as delegated by the Shop Admin.

---

## 3. Core Features & Functional Requirements

### 3.1 Multi-Tenant SaaS & Subscription Management
- **Req 3.1.1**: The system must isolate data so no shop can view or modify data of another shop. Every business query must filter by `shop_id`.
- **Req 3.1.2**: The system must enforce subscription validity dates. If a shop's subscription `end_date` passes, login access for the entire shop (Admins and Users) must be blocked automatically.
- **Req 3.1.3**: The system must allow the Superadmin to assign specific feature modules (Panels) to each shop.

### 3.2 Point of Sale (Checkout)
- **Req 3.2.1**: Users must be able to add products to a cart, apply percentage taxes, and apply flat discounts.
- **Req 3.2.2**: The checkout process must be atomic (transactional) to prevent partial data writes if stock is insufficient.
- **Req 3.2.3**: Inventory stock must automatically deduct upon a successful sale.
- **Req 3.2.4**: The system must record partial payments (Due amounts) if the `amount_received` is less than the `total`.

### 3.3 Inventory & Brand Management
- **Req 3.3.1**: Products must be categorizable by Brand and Category.
- **Req 3.3.2**: Minimum stock levels should be trackable to notify Admins of low inventory.
- **Req 3.3.3**: Products must use "Soft Deletion" (`is_deleted` flag) to preserve historical sales receipts that reference the product ID. Permanent removal is forbidden.

### 3.4 Financials & Expenses
- **Req 3.4.1**: Shop Owners must be able to log daily expenses (rent, utilities, salaries).
- **Req 3.4.2**: The system must track specific payments made to Brands (Suppliers) for Cost of Goods Sold tracking.

### 3.5 Analytics & Reporting
- **Req 3.5.1**: Admins must see daily/monthly revenue, top-selling products, and overall shop profitability.
- **Req 3.5.2**: Superadmins must see global metrics (aggregated revenue across all shops, active vs. suspended store counts).

### 3.6 Support Ticketing
- **Req 3.6.1**: Shop personnel must be able to open support tickets (bug, feature, help) directly to the System Owner.
- **Req 3.6.2**: Superadmins must be able to leave "internal notes" on tickets that are invisible to the shop owner.

---

## 4. Non-Functional Requirements (Technical)

### 4.1 Security & Authentication
- **Req 4.1.1**: Passwords must be hashed using `bcryptjs` before storage.
- **Req 4.1.2**: User sessions must securely distinguish roles and panels. A staff member modifying their frontend state should not bypass backend panel validations.
- **Req 4.1.3**: Failed logins or access attempts to blocked shops should not yield distinct error messages that leak platform state unnecessarily.

### 4.2 Performance & Database Constraints
- **Req 4.2.1**: The system should use SQLite in WAL mode for optimized concurrent reads/writes on a single server setup.
- **Req 4.2.2**: Deleting a Shop or a User must cascade to clean up all related foreign entities (Brands, Products, Sales, Expenses) to prevent database bloat (`ON DELETE CASCADE`).

### 4.3 Auditability
- **Req 4.3.1**: Major administrative actions (Status changes, Subscription modifications) must be logged in `activity_logs` for historical auditing by the Superadmin.

---

## 5. Future Considerations / Out of Scope for v1.0
- External Payment Gateway Integration (Stripe/PayPal) for subscriptions.
- Customer Loyalty Programs.
- Multi-Branch synchronization for a single Shop Owner. 

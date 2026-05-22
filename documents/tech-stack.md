# Technical Stack Documentation

This document explains the technical choices made for the POS System v2 (SaaS Platform) and the rationale behind them.

## 1. Core Backend
- **Node.js + Express**: Used for the server-side logic due to its non-blocking I/O, which is ideal for a high-concurrency POS system.
- **JavaScript (CommonJS)**: Currently using standard Node.js module system for stability and broad compatibility.

## 2. Database Layer
- **Dual-Mode Engine**:
    - **PostgreSQL**: Current production-grade database. Chosen for its advanced transaction isolation, scalability, and robust handling of complex ERP relations.
    - **SQLite**: Maintained for lightweight development and local deployments.
- **Knex.js (Query Builder)**: Replacing raw SQL strings to provide:
    - **Database Independence**: Write queries once, run on both SQLite and Postgres.
    - **Security**: Automatic protection against SQL Injection.
    - **Maintainability**: Cleaner, readable chainable methods instead of brittle string concatenations.

## 3. Data Integrity & Validation
- **Zod**: Implementing strict schema validation for all API inputs.
    - **Why**: Prevent bad data (like negative prices or missing fields) from ever reaching the database.
    - **Benefit**: Provides automatic TypeScript-like safety and high-quality error messages for the frontend.

## 4. Authentication & Security
- **express-session**: For managing multi-tenant sessions.
- **bcryptjs**: Used to hash passwords before storage.
- **Role-Based Access Control (RBAC)**: Custom middleware (`auth.js`) ensures that Users, Admins, and Superadmins only see their authorized data.

## 5. File Management
- **Multer**: For handling multipart/form-data, used for product images and receipt logos.
- **PDFKit**: For server-side generation of financial reports, invoices, and brand settlements.

## 6. Development Tools
- **Dotenv**: Standardized environment variable management for different deployments (Dev, Staging, Production).
- **Git**: Version control using branching strategies (e.g., `rms_postgres`) to maintain stability during refactors.

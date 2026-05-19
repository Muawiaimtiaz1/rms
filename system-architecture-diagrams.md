# RMS/POS System Architecture Diagrams

This file documents the architecture and system design currently implemented in this repository. It is based on the live code paths in `server.js`, `routes/`, `middleware/`, `db/schema.sql`, `db/db.js`, and `public/js/`.

## 1. Runtime Architecture

```mermaid
flowchart TB
  Browser["Browser user"]

  subgraph Public["public/ static frontend"]
    Login["login.html"]
    Dashboard["dashboard.html"]
    StoreMonitor["store-monitoring.html"]
    AppJS["app.js"]
    SettingsJS["settings.js"]
    KitchenJS["kitchen.js"]
    AnalyticsJS["analytics/*.js"]
    HierarchyJS["hierarchy.js"]
    StoreJS["store-monitoring.js"]
    Uploads["public/uploads"]
  end

  subgraph Express["server.js Express app"]
    JSON["JSON and form parsers"]
    Session["express-session cookie session"]
    Static["express.static public"]
    API["Mounted /api routes"]
    ErrorHandler["JSON error handler and error_debug.log"]
  end

  subgraph RouteLayer["routes/ domain modules"]
    Auth["auth"]
    Admin["admin"]
    Shops["shops + subscriptions"]
    Users["users"]
    Products["products + categories"]
    Brands["brands + expense payments"]
    Sales["sales + returns + bills"]
    Customers["customers + ledger"]
    Expenses["expenses + expense categories"]
    Analytics["analytics"]
    RMS["tables + kds + raw-stock + recipes"]
    ShopSettings["shop-settings"]
  end

  subgraph DataLayer["SQLite data and local files"]
    DBJS["db/db.js"]
    SQLite["db/pos.db via better-sqlite3"]
    Schema["db/schema.sql + startup migrations"]
    ProductImages["uploads/products"]
    ReceiptImages["uploads/receipt-assets"]
  end

  Browser --> Login
  Browser --> Dashboard
  Browser --> StoreMonitor
  Login -->|POST /api/auth/login| API
  Dashboard --> AppJS
  Dashboard --> SettingsJS
  Dashboard --> KitchenJS
  Dashboard --> AnalyticsJS
  Dashboard --> HierarchyJS
  StoreMonitor --> StoreJS
  AppJS --> API
  SettingsJS --> API
  KitchenJS --> API
  AnalyticsJS --> API
  HierarchyJS --> API
  StoreJS --> API

  API --> JSON
  API --> Session
  API --> Auth
  API --> Admin
  API --> Shops
  API --> Users
  API --> Products
  API --> Brands
  API --> Sales
  API --> Customers
  API --> Expenses
  API --> Analytics
  API --> RMS
  API --> ShopSettings
  Static --> Uploads
  Express --> ErrorHandler

  RouteLayer --> DBJS
  DBJS --> SQLite
  DBJS --> Schema
  Products --> ProductImages
  ShopSettings --> ReceiptImages
```

## 2. API Surface By Module

```mermaid
flowchart LR
  Server["server.js"]

  Server --> Auth["/api/auth\nlogin, logout, me, forgot-password"]
  Server --> Admin["/api/admin\nstore stats, stores, activity, health, hierarchy, support list, reset password, plan"]
  Server --> Users["/api/users\nstaff CRUD and permissions"]
  Server --> Shops["/api/shops\nshop CRUD for superadmin"]
  Server --> Subs["/api/subscriptions\nsubscription payment tracking"]
  Server --> Brands["/api/brands\nbrand CRUD, expense shares, payments, PDF reports"]
  Server --> Products["/api/products\ncatalog CRUD, image upload, stock batches, harvest, damage"]
  Server --> ProductCats["/api/product-categories\ncategory CRUD"]
  Server --> Expenses["/api/expenses\nexpense CRUD, bulk edit, PDF"]
  Server --> ExpenseCats["/api/expense-categories\ncategory CRUD"]
  Server --> Sales["/api/sales\ncheckout, history, pay due, edit details, bill, returns, return receipt"]
  Server --> Customers["/api/customers\ncustomer list, ledger, payment, adjustment, PDF reports"]
  Server --> Analytics["/api/analytics\nlegacy dashboard and optimized dashboard-data"]
  Server --> Tables["/api/tables\nfloors, tables, table status"]
  Server --> KDS["/api/kds\nactive kitchen orders and status"]
  Server --> RawStock["/api/raw-stock\ningredient stock, batches, waste"]
  Server --> Recipes["/api/recipes\nrecipe CRUD and product mapping"]
  Server --> Settings["/api/shop-settings\nreceipt settings, logo/images, damage policy"]

  Auth --> MW1["public login"]
  Admin --> MW3["requireSuperAdmin"]
  Shops --> MW3
  Subs --> MW3
  Users --> MW2["requireAdmin"]
  Brands --> MW1A["requireAuth plus superadmin checks on brand CRUD"]
  Products --> MW1A
  Expenses --> MW1A
  Sales --> MW1A
  Customers --> MW1A
  Analytics --> MW1A
  Tables --> MW1A
  KDS --> MW1A
  RawStock --> MW1A
  Recipes --> MW1A
  Settings --> MW2A["requireAuth, requireAdmin for writes"]
```

## 3. Authentication, Authorization, And Tenant Isolation

```mermaid
sequenceDiagram
  participant Browser
  participant Auth as routes/auth.js
  participant Session as express-session
  participant DB as SQLite
  participant API as Protected route

  Browser->>Auth: POST /api/auth/login
  Auth->>DB: SELECT user by username
  Auth->>Auth: bcrypt password check
  Auth->>Auth: reject blocked user
  alt user is superadmin
    Auth->>Session: store user id, role, shop_id null
    Auth-->>Browser: ok
  else user belongs to a shop
    Auth->>DB: verify shop exists and status is active
    Auth->>DB: verify active subscription end_date >= today
    Auth->>Session: store user id, role, shop_id
    Auth-->>Browser: ok
  end

  Browser->>Auth: GET /api/auth/me
  Auth->>DB: reload user, shop, allowed_panels
  alt admin
    Auth->>Auth: allowed panels = shop allowed_panels
  else normal staff
    Auth->>Auth: allowed panels = user panels intersect shop panels
  end
  Auth-->>Browser: fresh session user, shop name, shop type

  Browser->>API: call protected /api route
  API->>Session: requireAuth, requireAdmin, or requireSuperAdmin
  API->>DB: query with shop_id scope for tenant data
  API-->>Browser: JSON response
```

## 4. Frontend Navigation And Panel Model

```mermaid
flowchart TD
  LoginPage["login.html"] --> LoginAPI["POST /api/auth/login"]
  LoginAPI --> DashboardPage["/dashboard"]
  DashboardPage --> MeAPI["GET /api/auth/me"]
  MeAPI --> CurrentUser["currentUser with role, shop_id, shop_type, allowed_panels"]

  CurrentUser --> SuperCheck{"role is superadmin?"}
  SuperCheck -->|yes| PlatformPanels["dashboard, hierarchy, subscriptions"]
  SuperCheck -->|no| ShopPanels["shop allowed_panels filtered by user allowed_panels"]

  PlatformPanels --> Lobby["renderLobby module switcher"]
  ShopPanels --> Lobby

  Lobby --> Dashboard["dashboard / analytics"]
  Lobby --> POS["pos"]
  Lobby --> Inventory["products, brands, raw-stock, recipes"]
  Lobby --> Restaurant["tables, kds, delivery"]
  Lobby --> Finance["sales-history, expenses, customers"]
  Lobby --> Settings["settings, users"]

  Dashboard --> AnalyticsAPI["/api/analytics"]
  POS --> SalesAPI["/api/sales"]
  Inventory --> InventoryAPI["/api/products / brands / raw-stock / recipes"]
  Restaurant --> RestaurantAPI["/api/tables / kds"]
  Finance --> FinanceAPI["/api/sales / expenses / customers"]
  Settings --> SettingsAPI["/api/shop-settings / users"]
```

## 5. Database Entity Model

```mermaid
erDiagram
  SHOPS ||--o{ USERS : owns
  SHOPS ||--o{ SUBSCRIPTIONS : has
  SHOPS ||--o{ BRANDS : has
  SHOPS ||--o{ PRODUCTS : has
  SHOPS ||--o{ SALES : has
  SHOPS ||--o{ EXPENSES : has
  SHOPS ||--o{ PRODUCT_CATEGORIES : has
  SHOPS ||--o{ EXPENSE_CATEGORIES : has
  SHOPS ||--o{ CUSTOMERS : has
  SHOPS ||--o{ TABLES : has
  SHOPS ||--o{ FLOORS : has
  SHOPS ||--o{ RAW_STOCKS : has
  SHOPS ||--o{ RECIPES : has
  SHOPS ||--o{ RETURNS : has
  SHOPS ||--o{ SUPPORT_TICKETS : has
  SHOPS ||--o{ ACTIVITY_LOGS : has

  USERS ||--o{ BRANDS : creates
  USERS ||--o{ PRODUCTS : creates
  USERS ||--o{ SALES : records
  USERS ||--o{ EXPENSES : records
  USERS ||--o{ RETURNS : processes
  USERS ||--o{ CUSTOMER_LEDGER : creates

  BRANDS ||--o{ PRODUCTS : groups
  BRANDS ||--o{ BRAND_EXPENSE_PAYMENTS : receives

  PRODUCTS ||--o{ PRODUCT_BATCHES : has
  PRODUCTS ||--o{ SALE_ITEMS : sold_as
  PRODUCTS ||--o{ PRODUCT_COMPOSITIONS : parent
  PRODUCTS ||--o{ PRODUCT_COMPOSITIONS : component
  PRODUCTS ||--o{ PRODUCT_RECIPE_LINKS : maps_to

  SALES ||--o{ SALE_ITEMS : contains
  SALES ||--o{ RETURNS : can_have
  SALES ||--o{ CUSTOMER_LEDGER : creates
  CUSTOMERS ||--o{ SALES : linked_to
  CUSTOMERS ||--o{ CUSTOMER_LEDGER : has

  RETURNS ||--o{ RETURN_ITEMS : contains
  SALE_ITEMS ||--o{ RETURN_ITEMS : returned_from
  PRODUCTS ||--o{ RETURN_ITEMS : returned_product

  FLOORS ||--o{ TABLES : contains
  TABLES ||--o{ SALES : assigned_to

  RAW_STOCKS ||--o{ RAW_STOCK_BATCHES : has
  RAW_STOCKS ||--o{ RAW_STOCK_WASTE : records
  RAW_STOCKS ||--o{ RECIPE_INGREDIENTS : used_by
  RECIPES ||--o{ RECIPE_INGREDIENTS : contains
  RECIPES ||--o{ PRODUCT_RECIPE_LINKS : linked_to

  SUPPORT_TICKETS ||--o{ TICKET_COMMENTS : has

  SHOPS {
    int id PK
    string name
    string status
    string shop_type
    json allowed_panels
    string receipt_settings
  }
  USERS {
    int id PK
    int shop_id FK
    string username
    string role
    string status
    json allowed_panels
  }
  PRODUCTS {
    int id PK
    int shop_id FK
    int brand_id FK
    string sku
    string name
    number buying_price
    number selling_price
    int stock
    int damage_stock
    bool is_deleted
  }
  SALES {
    int id PK
    int shop_id FK
    int user_id FK
    int customer_id FK
    number total
    number amount_received
    string order_type
    string order_status
    int table_id FK
    int kitchen_id FK
  }
  CUSTOMERS {
    int id PK
    int shop_id FK
    string name
    string phone
    number credit_limit
    number current_balance
    string status
  }
  CUSTOMER_LEDGER {
    int id PK
    int customer_id FK
    int shop_id FK
    int sale_id FK
    string type
    number amount
    number balance_after
  }
  RAW_STOCKS {
    int id PK
    int shop_id FK
    string name
    string unit
    string usage_unit
    number conversion_factor
    number current_stock
  }
```

## 6. POS Checkout And Inventory Deduction Flow

```mermaid
flowchart TD
  Start["Cashier submits cart to POST /api/sales"] --> ValidateCart{"items exist?"}
  ValidateCart -->|no| RejectCart["400 Cart is empty"]
  ValidateCart -->|yes| Tx["Start SQLite transaction"]

  Tx --> ResolveItems["Resolve each cart item"]
  ResolveItems --> ProductItem{"has product_id?"}
  ProductItem -->|no| ManualItem["Record manual sale item with custom_name"]
  ProductItem -->|yes| LoadProduct["Load product by id and current shop_id"]
  LoadProduct --> RecipeCheck{"product has recipe link?"}

  RecipeCheck -->|yes| CheckRaw["Check recipe ingredients against raw_stocks"]
  CheckRaw --> RawOK{"enough raw stock?"}
  RawOK -->|no| Rollback["Throw error and rollback"]
  RawOK -->|yes| InsertRecipeItem["Insert sale_items without product batch"]
  InsertRecipeItem --> DeductRawBatches["Deduct raw_stock_batches FIFO"]
  DeductRawBatches --> DeductRawTotal["Update raw_stocks.current_stock"]

  RecipeCheck -->|no| CheckProductStock{"product.stock enough?"}
  CheckProductStock -->|no| Rollback
  CheckProductStock -->|yes| DeductProductBatches["Deduct product_batches FIFO"]
  DeductProductBatches --> InsertBatchLines["Insert sale_items with batch_id and cost"]
  InsertBatchLines --> DeductProductTotal["Update products.stock"]

  ManualItem --> Totals
  DeductRawTotal --> Totals["Calculate subtotal, discount, tax, grand total"]
  DeductProductTotal --> Totals

  Totals --> Customer["Resolve or create customer if name, phone, or id supplied"]
  Customer --> CreditLimit{"credit sale exceeds customer credit limit?"}
  CreditLimit -->|yes| Rollback
  CreditLimit -->|no| InsertSale["Insert sales row with order type, table, waiter, rider, kitchen"]
  InsertSale --> Due{"amount_received < total?"}
  Due -->|yes| Ledger["Increase customer current_balance and insert customer_ledger sale entry"]
  Due -->|no| Commit["Commit transaction"]
  Ledger --> Commit
  Commit --> Response["Return saleId, total, customer details"]
```

## 7. Sales Returns, Due Payment, And Customer Ledger

```mermaid
flowchart TD
  Sale["Existing sale"] --> PayDue["PATCH /api/sales/:id/pay"]
  Sale --> ReturnSale["POST /api/sales/:id/return"]

  PayDue --> UpdateReceived["Update sales.amount_received"]
  UpdateReceived --> PayLedger{"sale has customer_id and due reduced?"}
  PayLedger -->|yes| PaymentEntry["Decrease customer balance and insert ledger payment"]
  PayLedger -->|no| PayDone["Return updated amount"]
  PaymentEntry --> PayDone

  ReturnSale --> ValidateReturn["Validate item belonged to sale and quantity remains returnable"]
  ValidateReturn --> CreateReturn["Insert returns and return_items"]
  CreateReturn --> DamageCheck{"returned item damaged?"}
  DamageCheck -->|yes| DamageStock["Increase products.damage_stock and batch damaged_quantity"]
  DamageCheck -->|no| RestoreStock["Restore product stock and product_batches quantity"]
  DamageStock --> RefundLedger
  RestoreStock --> RefundLedger{"customer sale and refund exists?"}
  RefundLedger -->|payment_method ledger| CreditCustomer["Decrease customer current_balance and insert return ledger entry"]
  RefundLedger -->|cash or online| RecordOnly["Insert return ledger event without changing balance"]
  CreditCustomer --> ReturnDone["Return returnId and refund total"]
  RecordOnly --> ReturnDone
```

## 8. Restaurant RMS Flow

```mermaid
flowchart LR
  subgraph Setup["Restaurant setup"]
    Raw["Raw stock items"]
    RawBatches["Raw stock batches"]
    Recipes["Recipes"]
    Ingredients["Recipe ingredients"]
    ProductLinks["Product recipe links"]
    Tables["Floors and tables"]
    Kitchens["Kitchen users"]
  end

  Raw --> RawBatches
  Raw --> Ingredients
  Recipes --> Ingredients
  Recipes --> ProductLinks
  ProductLinks --> Products["Sellable products"]

  subgraph Ordering["Ordering"]
    POS["POS order"]
    OrderTypes["dine_in, takeaway, delivery"]
    Sale["sales row"]
    Items["sale_items"]
  end

  Products --> POS
  Tables --> POS
  Kitchens --> POS
  POS --> OrderTypes
  POS --> Sale
  POS --> Items
  Sale --> KDS["KDS queue /api/kds"]

  KDS --> Status["pending -> preparing -> ready -> completed"]
  Status --> SaleStatus["sales.order_status"]

  Items --> Consume["Recipe products consume raw stock FIFO"]
  Consume --> RawBatches
  Consume --> Raw
```

## 9. Product Catalog, Batches, Composite Products, And Damage

```mermaid
flowchart TD
  ProductCreate["Create or update product"] --> HasImage{"image uploaded?"}
  HasImage -->|yes| StoreProductImage["Save to public/uploads/products"]
  HasImage -->|no| ValidateProduct["Validate sku, name, category, brand, price"]
  StoreProductImage --> ValidateProduct

  ValidateProduct --> ProductType{"product uses ingredients?"}
  ProductType -->|yes| RecipeProduct["Create or update recipe and recipe_ingredients"]
  RecipeProduct --> RecipeLink["Link product to recipe"]
  ProductType -->|no| RetailProduct["Use buying_price and selling_price"]

  RetailProduct --> InitialStock{"stock > 0?"}
  InitialStock -->|yes| ProductBatch["Create product_batches record"]
  InitialStock -->|no| SaveProduct["Save product"]
  ProductBatch --> SaveProduct
  RecipeLink --> SaveProduct

  SaveProduct --> Composite{"composite_products panel and components?"}
  Composite -->|yes| Components["Create product_compositions and auto-create missing component products"]
  Composite -->|no| ManageStock["Manage stock"]
  Components --> ManageStock

  ManageStock --> Adjust["PATCH /stock creates or deducts batches FIFO"]
  ManageStock --> Harvest["POST /harvest breaks parent stock into component stock"]
  ManageStock --> Damage["PATCH /damage/loss moves stock to damage tracking"]
  Damage --> Recovery["PATCH /damage/recovery restores or writes recovery amount"]
```

## 10. Superadmin Platform Management

```mermaid
flowchart TB
  Owner["Superadmin"] --> StoreMonitor["/admin/store-monitoring"]
  Owner --> Dashboard["/dashboard platform panels"]

  StoreMonitor --> AdminAPI["/api/admin"]
  Dashboard --> ShopsAPI["/api/shops"]
  Dashboard --> SubsAPI["/api/subscriptions"]
  Dashboard --> HierarchyAPI["/api/admin/hierarchy-data"]

  AdminAPI --> Stats["Global store stats and revenue"]
  AdminAPI --> Stores["List stores with owner and plan"]
  AdminAPI --> Activity["Activity logs"]
  AdminAPI --> Health["System health summary"]
  AdminAPI --> Reset["Reset shop admin password"]
  AdminAPI --> Plan["Change subscription plan"]
  AdminAPI --> SupportList["Read support_tickets list"]

  ShopsAPI --> CreateShop["Create shop"]
  CreateShop --> CreateAdmin["Create shop admin"]
  CreateShop --> CreateEmployees["Optional employees"]
  CreateShop --> CreateKitchens["Optional kitchen terminals"]
  CreateShop --> LogCreation["Insert activity_logs"]

  SubsAPI --> RecordPayment["Record subscription payment"]
  RecordPayment --> ActivateShop["Set shop active"]
  Plan --> Subscriptions["subscriptions table"]
  Stores --> Shops["shops table"]
```

## 11. Reporting, PDF, And Upload Paths

```mermaid
flowchart LR
  Browser["Browser"] --> PDFRoutes["PDF-producing API routes"]
  PDFRoutes --> PDFKit["pdfkit"]
  PDFKit --> PDFResponse["application/pdf response"]

  PDFRoutes --> ExpensesPDF["/api/expenses/pdf"]
  PDFRoutes --> BrandPDF["/api/brands/pdf/*"]
  PDFRoutes --> CustomerPDF["/api/customers/:id/ledger.pdf\n/api/customers/:id/report.pdf"]
  PDFRoutes --> BillData["/api/sales/:id/bill\n/returns/:id/receipt returns JSON for printable UI"]

  Browser --> UploadRoutes["Upload API routes"]
  UploadRoutes --> Multer["multer diskStorage"]
  Multer --> ProductUploads["public/uploads/products"]
  Multer --> ReceiptUploads["public/uploads/receipt-assets"]

  ProductUploads --> ProductsTable["products.image_path"]
  ReceiptUploads --> ShopsTable["shops.logo_path and receipt_images_json"]
```

## 12. Current Implementation Notes

```mermaid
flowchart TD
  Notes["Implementation notes from current code"] --> Monolith["Single Express monolith with domain route modules"]
  Notes --> MultiTenant["Most operational reads and writes are scoped by shop_id"]
  Notes --> SessionAuth["Session cookie auth, not JWT"]
  Notes --> SQLite["SQLite with WAL, PRAGMAs, startup migrations, and indexes"]
  Notes --> Panels["Panel permissions are JSON arrays on shops and users"]
  Notes --> ShopTypes["shop_type switches retail vs restaurant behavior in frontend"]
  Notes --> FIFOBatches["Product and raw stock deductions use FIFO batches"]
  Notes --> Reports["Reports are generated synchronously through pdfkit"]
  Notes --> Uploads["Uploaded images are stored locally under public/uploads"]
  Notes --> SupportGap["Support tables exist and admin list route exists, but /api/support is not mounted"]
  Notes --> SchemaGap["customer and receipt/RMS additions are partly in startup migrations, not only schema.sql"]
```


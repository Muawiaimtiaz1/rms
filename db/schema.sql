CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, blocked
  allowed_panels TEXT, -- JSON array of panel IDs allotted by master
  auto_calculate_damage_to_loss INTEGER DEFAULT 1,
  use_logo_on_receipt INTEGER DEFAULT 1,
  use_text_on_receipt INTEGER DEFAULT 1,
  customer_bill_printer TEXT,
  unpaid_bill_printer TEXT,
  logo_data TEXT,
  user_count INTEGER DEFAULT 0,
  product_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL DEFAULT '1_month', -- 1_month, 3_months, 1_year
  start_date TEXT DEFAULT (date('now')),
  end_date TEXT,
  month TEXT NOT NULL, -- YYYY-MM (for backward compatibility or reporting)
  paid_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saas_financial_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER,
  subscription_id INTEGER,
  amount REAL NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  payment_method TEXT DEFAULT 'Cash',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_shop_id ON saas_financial_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_subscription_id ON saas_financial_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_category ON saas_financial_logs(category);
CREATE INDEX IF NOT EXISTS idx_saas_financial_logs_created_at ON saas_financial_logs(created_at);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER, -- NULL for superadmin
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- superadmin, admin, user
  printer_station TEXT,
  status TEXT DEFAULT 'active', -- active, blocked
  allowed_panels TEXT, -- JSON array of panel IDs (subset of shop's allowed_panels)
  can_manage_register INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL DEFAULT 'share_based',
  ownership_percent REAL NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS third_party_persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  barcode TEXT,
  description TEXT,
  brand_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  buying_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  damage_stock INTEGER NOT NULL DEFAULT 0,
  recovered_damage_amount REAL NOT NULL DEFAULT 0,
  manual_damage_loss REAL NOT NULL DEFAULT 0,
  recovered_damage_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 0,
  image_path TEXT,
  is_commission_based INTEGER NOT NULL DEFAULT 0,
  third_party_person_id INTEGER,
  commission_percentage REAL NOT NULL DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (third_party_person_id) REFERENCES third_party_persons(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS floors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  floor_id INTEGER,
  table_number TEXT NOT NULL,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available', -- available, occupied, reserved
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (floor_id) REFERENCES floors(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax_percentage REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  amount_received REAL NOT NULL DEFAULT 0,
  order_type TEXT DEFAULT 'dine_in', -- dine_in, takeaway, delivery
  order_status TEXT DEFAULT 'pending', -- pending, preparing, ready, completed
  table_id INTEGER,
  waiter_id INTEGER,
  rider_id INTEGER,
  kitchen_id INTEGER,
  shift_id INTEGER,
  payment_receiver_id INTEGER,
  payment_received_at TEXT,
  guest_count INTEGER DEFAULT 1,
  token_number TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (table_id) REFERENCES tables(id),
  FOREIGN KEY (waiter_id) REFERENCES users(id),
  FOREIGN KEY (rider_id) REFERENCES users(id),
  FOREIGN KEY (kitchen_id) REFERENCES users(id),
  FOREIGN KEY (payment_receiver_id) REFERENCES users(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  parent_id INTEGER,
  custom_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_at_sale REAL NOT NULL DEFAULT 0,
  buying_price_at_sale REAL NOT NULL DEFAULT 0,
  batch_id INTEGER, -- Track specific batch sold
  special_instructions TEXT,
  variants_json TEXT,
  addons_json TEXT,
  third_party_person_id INTEGER,
  commission_percentage_at_sale REAL NOT NULL DEFAULT 0,
  commission_amount_at_sale REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (parent_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES product_batches(id),
  FOREIGN KEY (third_party_person_id) REFERENCES third_party_persons(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  shift_id INTEGER,
  date TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  printer_station TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS print_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  station_name TEXT NOT NULL,
  content_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  claimed_at TEXT,
  printed_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_print_queue_shop_id ON print_queue(shop_id);
CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_print_queue_claimed_at ON print_queue(claimed_at);

CREATE TABLE IF NOT EXISTS printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  system_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_printers_shop_id ON printers(shop_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  color_class TEXT DEFAULT 'bg-slate-700 text-slate-300',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brand_expense_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  user_id INTEGER,
  amount REAL NOT NULL DEFAULT 0,
  month TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'help', -- bug, feature, help
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment TEXT NOT NULL,
  is_internal INTEGER DEFAULT 0, -- 1 for internal notes (superadmin only)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER,
  target_user_id INTEGER,
  created_by_user_id INTEGER,
  type TEXT NOT NULL DEFAULT 'announcement',
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_label TEXT,
  action_url TEXT,
  publish_at TEXT,
  expires_at TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  read_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    reference_id INTEGER,
    reference_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_reference ON activity_logs(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON notifications(shop_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id);

CREATE TABLE IF NOT EXISTS product_compositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_product_id INTEGER NOT NULL,
  component_product_id INTEGER,
  custom_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL,
  FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  total_refund REAL NOT NULL DEFAULT 0,
  reason TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  shift_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  product_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  refund_price REAL NOT NULL DEFAULT 0,
  buying_price_at_sale REAL NOT NULL DEFAULT 0,
  is_damage INTEGER DEFAULT 0,
  FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS product_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  shop_id INTEGER NOT NULL,
  buying_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  damaged_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

-- --- RMS (Restaurant Management System) Extensions ---

CREATE TABLE IF NOT EXISTS raw_stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- purchase unit (kg, liter, pcs, etc.)
  usage_unit TEXT, -- small unit (g, ml, etc.)
  conversion_factor REAL NOT NULL DEFAULT 1, -- how many usage_units in one unit
  current_stock REAL NOT NULL DEFAULT 0,
  min_stock_level REAL NOT NULL DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raw_stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_stock_id INTEGER NOT NULL,
  shop_id INTEGER NOT NULL,
  buying_price REAL NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (raw_stock_id) REFERENCES raw_stocks(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raw_stock_waste (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_stock_id INTEGER NOT NULL,
  shop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  reason TEXT,
  date TEXT DEFAULT (date('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (raw_stock_id) REFERENCES raw_stocks(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  raw_stock_id INTEGER NOT NULL,
  quantity REAL NOT NULL, -- The amount required for this recipe
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_stock_id) REFERENCES raw_stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_recipe_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  variant_name TEXT, -- Optional: link to a specific variant (like 'Large', 'Extra Cheese')
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage', -- percentage, amount
  value REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0,
  linked_payment_method TEXT, -- cash, card, online
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  start_time TEXT NOT NULL DEFAULT (datetime('now')),
  end_time TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  closing_balance REAL,
  expected_balance REAL,
  net_cash_sales REAL DEFAULT 0,
  net_card_sales REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  cash_drops REAL DEFAULT 0,
  cash_handovers REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  note TEXT,
  closed_by_user_id INTEGER,
  terminal_id TEXT,
  shortage_reason TEXT,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cash_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  shift_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  verified_at TEXT,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cash_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  shift_id INTEGER NOT NULL,
  requested_by_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  verified_by_user_id INTEGER,
  verified_at TEXT,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  FOREIGN KEY (verified_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shifts_shop_id ON shifts(shop_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_handovers_shift_id ON cash_handovers(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_drops_shift_id ON cash_drops(shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_drops_status ON cash_drops(status);
CREATE INDEX IF NOT EXISTS idx_third_party_persons_shop_id ON third_party_persons(shop_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_third_party_person_id ON sale_items(third_party_person_id);

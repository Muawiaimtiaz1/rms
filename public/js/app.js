// ─── Helpers ─────────────────────────────────────────────────────────
const $c = document.getElementById.bind(document);

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
    return data;
  } else {
    const text = await res.text();
    if (!res.ok) throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}...`);
    return text;
  }
}

const toast = (msg, type = "success") => {
  const el = document.createElement("div");
  const base =
    "fixed top-8 right-8 z-[100] px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-right-10 duration-300 transform flex items-center gap-3";
  el.className = `${base} ${type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`;
  el.innerHTML = `<span>${type === "success" ? "✓" : "✕"}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("animate-out", "fade-out", "slide-out-to-right-10");
    setTimeout(() => el.remove(), 300);
  }, 3000);
};

// ─── Theme ───────────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  } else {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }
}

// ─── Dropdown ──────────────────────────────────────────────────────────
function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("profile-dropdown");
  if (dropdown) dropdown.classList.toggle("active");
}

window.addEventListener("click", (e) => {
  const dropdown = document.getElementById("profile-dropdown");
  const trigger = document.getElementById("profile-trigger");
  if (dropdown && dropdown.classList.contains("active")) {
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
      dropdown.classList.remove("active");
    }
  }
});

// ─── State ──────────────────────────────────────────────────────────
let currentUser = null;
let cart = [];
let allProducts = [];
let productMap = {}; // Index for O(1) lookups

function syncProductMap(products) {
  productMap = {};
  products.forEach((p) => (productMap[p.id] = p));
}

function debounce(func, timeout = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}

function getLooseUnits(p) {
  if (!p.components || p.components.length === 0) return 0;
  let maxLoose = 0;
  p.components.forEach((c) => {
    const child = productMap[c.id]; // Fast O(1) lookup
    if (child && child.stock > 0) {
      const units = Math.ceil(child.stock / c.quantity);
      if (units > maxLoose) maxLoose = units;
    }
  });
  return maxLoose;
}
let _expenseView = "list";
let _expenseMonth = new Date().toISOString().slice(0, 7);
let _expensePage = 1;
let _posFloors = [];
let _posAllTables = [];
let _posActiveOrders = [];
let _expenseCategories = [];
let _productCategories = [];
let _kdsOrdersCache = [];
let shops = [];
let managedShopId = null;
let _posCustomerResults = [];
let _posSelectedCustomer = null;
let _currentPage = "dashboard"; // ─── Setup ────────────────────────────────────────────────────────
const AVAILABLE_PANELS = [
  {
    id: "dashboard",
    icon: `<rect x="3" y="3" width="7" height="7" rx="1" fill="#4F46E5"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0EA5E9"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#10B981"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#F59E0B"/>`,
    label: "Dashboards",
    desc: "Overview of sales, revenue, and store health analytics."
  },
  {
    id: "pos",
    icon: `<path d="M4 6h16v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6z" fill="#F59E0B"/><path d="M3 6h18v2H3V6z" fill="#D97706"/><circle cx="12" cy="12" r="2" fill="white"/>`,
    label: "Point of Sale",
    desc: "Process sales, generate bills, and manage customer checkouts."
  },
  {
    id: "brands",
    icon: `<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#8B5CF6"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Brand Management",
    desc: "Manage brand profiles and track their specific performance."
  },
  {
    id: "products",
    icon: `<path d="M12 3L4 7v10l8 4 8-4V7l-8-4z" fill="#10B981"/><path d="M4 7l8 4 8-4M12 11v10" stroke="white" stroke-width="1.5"/>`,
    label: "Inventory",
    desc: "Inventory tracking, stock alerts, and product catalog management."
  },
  {
    id: "sales-history",
    icon: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="#EF4444"/><path d="M7 7h10M7 12h10M7 17h7" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Sales",
    desc: "Review past transactions, handle returns, and audit sales."
  },
  {
    id: "analytics",
    icon: `<path d="M3 3v18h18M7 16l4-4 4 4 6-6" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Analytics & Reports",
    desc: "Store performance, order rates, and activity heatmaps."
  },
  {
    id: "expenses",
    icon: `<circle cx="12" cy="12" r="9" fill="#3B82F6"/><path d="M12 7v10M9 10l3-3 3 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Expenses",
    desc: "Track operating costs, utilities, and brand expense shares."
  },
  {
    id: "customers",
    icon: `<circle cx="12" cy="8" r="4" fill="#10B981"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#10B981" opacity="0.6"/>`,
    label: "Customer Ledger",
    desc: "Client relationship management and credit history tracking."
  },
  {
    id: "settings",
    icon: `<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="#8B5CF6"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1h.09a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" fill="#8B5CF6" opacity="0.3"/>`,
    label: "Settings",
    desc: "Configure shop preferences, receipts, and user access."
  },
  {
    id: "users",
    icon: `<circle cx="8" cy="8" r="3" fill="#6366F1"/><circle cx="16" cy="8" r="3" fill="#6366F1" opacity="0.5"/><path d="M2 18c0-3 2.5-5 6-5s6 2 6 5M12 18c0-2.5 2-4 5-4s5 1.5 5 4" fill="#6366F1" opacity="0.8"/>`,
    label: "Employees",
    desc: "Manage user accounts, roles, and permissions."
  },
  {
    id: "hierarchy",
    icon: `<path d="M12 2L4 6v4c0 4.4 3.6 8 8 10 4.4-2 8-5.6 8-10V6l-8-4z" fill="#0EA5E9"/><path d="M12 7v5m-3-3h6" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Master Platform Hierarchy",
    desc: "Create new shops, connect databases, and manage global settings."
  },
  {
    id: "subscriptions",
    icon: `<rect x="3" y="4" width="18" height="16" rx="2" fill="#F59E0B"/><path d="M3 10h18" stroke="white" stroke-width="2"/><path d="M7 15h3M14 15h3" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Subscription Tracking",
    desc: "Manage shop limits, payment plans, and active licenses."
  },
  {
    id: "tables",
    icon: `<rect x="3" y="8" width="18" height="10" rx="2" fill="#10B981"/><rect x="7" y="4" width="2" height="4" fill="#10B981"/><rect x="15" y="4" width="2" height="4" fill="#10B981"/><rect x="7" y="18" width="2" height="4" fill="#10B981"/><rect x="15" y="18" width="2" height="4" fill="#10B981"/>`,
    label: "Table Management",
    desc: "View floor plan, monitor table status, assign guests and waiters."
  },
  {
    id: "kds",
    icon: `<rect x="2" y="4" width="20" height="14" rx="2" fill="#F97316"/><path d="M7 9h10M7 12h7" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M2 20h20" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>`,
    label: "Kitchen Display (KDS)",
    desc: "Real-time order queue for the kitchen. Mark orders as ready."
  },
  {
    id: "delivery",
    icon: `<path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3" fill="none" stroke="#3B82F6" stroke-width="2"/><rect x="9" y="11" width="14" height="10" rx="2" fill="#3B82F6"/><circle cx="12" cy="23" r="1" fill="#3B82F6"/><circle cx="20" cy="23" r="1" fill="#3B82F6"/>`,
    label: "Delivery Orders",
    desc: "Track and manage delivery orders, assign riders, update status."
  },
  {
    id: "raw-stock",
    icon: `<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#F97316"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Raw Ingredients",
    desc: "Manage base stock, track ingredient batches and record waste."
  },
];

const PLATFORM_OWNER_PANELS = ["dashboard", "hierarchy", "subscriptions"];

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    currentUser.total_users = data.total_users || 1;
    currentUser.total_brands = data.total_brands || 1;
    document.getElementById("user-name-sidebar").textContent =
      currentUser.name || currentUser.username;
    document.getElementById("user-role-sidebar").textContent = currentUser.role;
    document.getElementById("user-avatar").textContent = (currentUser.name ||
      currentUser.username)[0].toUpperCase();

    // Display Shop Name in header
    const shopNameHeader = document.getElementById("header-shop-name");
    const shopMgmtHeader = document.getElementById("header-shop-mgmt");
    const lobbyUserDisplay = document.getElementById("header-username-display");

    if (shopNameHeader)
      shopNameHeader.textContent = currentUser.shop_name || "POS System";
    if (shopMgmtHeader) {
      shopMgmtHeader.textContent =
        currentUser.role === "superadmin"
          ? "Master Control"
          : "Shop Management";
    }
    if (lobbyUserDisplay) {
      lobbyUserDisplay.textContent = currentUser.username || currentUser.name;
    }


    if (currentUser.role === "superadmin") {
      const sData = await fetch("/api/shops").then((r) => r.json());
      shops = Array.isArray(sData) ? sData : [];
    }

    await fetchCategories();


    if (!sessionStorage.getItem("lobby_selected")) return renderLobby();
    let startPage = localStorage.getItem("pos_page") || "dashboard";
    if (
      currentUser.role !== "superadmin" &&
      currentUser.allowed_panels &&
      !currentUser.allowed_panels.includes(startPage)
    ) {
      startPage = currentUser.allowed_panels[0] || "dashboard";
    }
    navigate(startPage);
  } catch (e) {
    console.error("Init Error:", e);
    window.location.href = "/";
  }
}

// ─── Router ──────────────────────────────────────────────────────────
function navigate(page) {
  _currentPage = page;
  if (currentUser.role === "superadmin" && !PLATFORM_OWNER_PANELS.includes(page)) {
    // Superadmins can only access platform-level pages
    return false;
  }

  if (
    currentUser.role !== "superadmin" &&
    !AVAILABLE_PANELS.map((p) => p.id).includes(page)
  ) {
    // Check sub-pages
    const parentMap = {
      "products-low-stock": "products",
      "sales-pending": "sales-history",
      "pending-dues": "sales-history",
    };
    const parent = parentMap[page];
    if (
      parent &&
      (!currentUser.allowed_panels ||
        !currentUser.allowed_panels.includes(parent))
    )
      return false;
    if (
      !parent &&
      page !== "users" &&
      (!currentUser.allowed_panels ||
        !currentUser.allowed_panels.includes(page))
    )
      return false;
  }

  localStorage.setItem("pos_page", page);
  sessionStorage.setItem("lobby_selected", "true");
  document.body.classList.remove("lobby-active");

  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.remove("active"));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add("active");
  const titles = {
    dashboard: "Dashboard",
    brands: "Brands",
    products: "Products",
    pos: "POS / Checkout",
    "sales-history": "Sales History",
    expenses: "Expenses",
    customers: "Customer Ledger",
    settings: "Settings",
    users: "Users (Admin)",
    subscriptions: "Subscription Tracking",
    hierarchy: "Master Platform Hierarchy",
    tables: "Table Management",
    kds: "Kitchen Display System",
    delivery: "Delivery Orders",
    "raw-stock": "Raw Ingredients",
    recipes: "Manage Recipes",
    "pending-dues": "Pending Dues Ledger",
    analytics: "Analytics & Reports",
  };
  if (page === "dashboard" && currentUser.role === "superadmin")
    titles.dashboard = "System Overview (Master Admin)";
  document.getElementById("page-title").textContent = titles[page] || page;
  const content = document.getElementById("page-content");
  content.innerHTML =
    '<div class="flex items-center justify-center h-40 text-slate-600">Loading…</div>';
  const pages = {
    dashboard: renderDashboard,
    brands: renderBrands,
    products: renderProducts,
    "products-low-stock": () => renderProducts(true),
    pos: renderPOS,
    "sales-history": renderSalesHistory,
    "sales-pending": () => renderSalesHistory(true),
    expenses: renderExpenses,
    customers: renderCustomers,
    settings: renderSettings,
    users: renderUsers,
    subscriptions: renderSubscriptions,
    hierarchy: renderHierarchy,
    tables: renderTables,
    kds: renderKDS,
    delivery: renderDeliveryOrders,
    "raw-stock": renderRawStock,
    recipes: renderRecipes,
    "pending-dues": () => renderSalesHistory(true),
    analytics: renderAnalytics,
  };
  if (pages[page]) {
    try {
      const res = pages[page]();
      if (res instanceof Promise) {
        res.catch(err => {
          console.error("Page load error:", err);
          content.innerHTML = `<div class="flex items-center justify-center h-40 text-red-500 font-bold">Error loading page: ${err.message}</div>`;
        });
      }
    } catch (err) {
      console.error("Page load sync error:", err);
      content.innerHTML = `<div class="flex items-center justify-center h-40 text-red-500 font-bold">Error loading page: ${err.message}</div>`;
    }
  }

  // Highlight active menu for sub-filters
  if (page === "products-low-stock") {
    $c("page-title").textContent = "Low Stock Products";
    const navProducts = document.getElementById("nav-products");
    if (navProducts) navProducts.classList.add("active");
  } else if (page === "sales-pending") {
    $c("page-title").textContent = "Pending Dues";
    const navSales = document.getElementById("nav-sales-history");
    if (navSales) navSales.classList.add("active");
  }

  return false;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

async function fetchCategories() {
  try {
    const pc = await api("/api/product-categories");
    _productCategories = Array.isArray(pc) ? pc : [];
    const ec = await api("/api/expense-categories");
    _expenseCategories = Array.isArray(ec) ? ec : [];
  } catch (e) {
    console.warn("Failed to fetch categories:", e);
  }
}

let _activeSettingsTab = "profile";

async function renderSettings(tab) {
  if (tab) _activeSettingsTab = tab;

  // Fetch receipt settings if on receipt tab
  if (_activeSettingsTab === "receipt") {
    await fetchReceiptSettings();
  }

  const contentHtml = `
    <div class="flex flex-col lg:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-2 duration-500">
      <!-- Settings Sidebar -->
      <aside class="w-full lg:w-72 flex flex-col gap-1.5 sticky top-24">
        <div class="px-5 py-3 mb-2">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">System Control</h4>
            <p class="text-xs text-slate-500 lowercase italic line-clamp-1">Personalise your dashboard</p>
        </div>
        
        <button onclick="renderSettings('profile')" class="flex items-center justify-between px-5 py-3.5 rounded-2xl text-sm font-bold transition-all group ${_activeSettingsTab === "profile"
      ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30"
      : "text-slate-500 hover:bg-white dark:hover:bg-slate-900 border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
    }">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 ${_activeSettingsTab === "profile"
      ? "text-white"
      : "text-slate-400 group-hover:text-indigo-500"
    }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            Account Profile
          </div>
          ${_activeSettingsTab === "profile" ? '<div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>' : ""}
        </button>

        <button onclick="renderSettings('receipt')" class="flex items-center justify-between px-5 py-3.5 rounded-2xl text-sm font-bold transition-all group ${_activeSettingsTab === "receipt"
      ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30"
      : "text-slate-500 hover:bg-white dark:hover:bg-slate-900 border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
    }">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 ${_activeSettingsTab === "receipt"
      ? "text-white"
      : "text-slate-400 group-hover:text-indigo-500"
    }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Receipt Settings
          </div>
          ${_activeSettingsTab === "receipt" ? '<div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>' : ""}
        </button>

        <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 px-5">
            <button onclick="logout()" class="w-full flex items-center gap-3 text-rose-500 dark:text-rose-400 hover:text-rose-600 font-black text-xs uppercase tracking-widest transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Sign Out
            </button>
        </div>
      </aside>

      <!-- Main Settings Panel -->
      <div class="flex-1 w-full bg-white dark:bg-slate-900/50 rounded-[2.5rem] p-8 lg:p-12 border border-slate-200 dark:border-slate-800 shadow-sm min-h-[70vh]">
        ${renderActiveSettingsContent()}
      </div>
    </div>
  `;

  document.getElementById("page-content").innerHTML = contentHtml;
}

function renderActiveSettingsContent() {
  if (_activeSettingsTab === "profile") {
    return `
      <div class="max-w-4xl animate-in fade-in slide-in-from-right-4 duration-500">
        <header class="mb-12">
            <h3 class="text-3xl font-black text-slate-950 dark:text-white mb-2 tracking-tight">Account Profile</h3>
            <p class="text-slate-500 dark:text-slate-400 text-sm italic">Manage your identification and store assignment here.</p>
        </header>
        
        <div class="flex flex-col md:flex-row items-center gap-10 p-10 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 mb-10 shadow-inner">
          <div class="relative">
              <div class="w-32 h-32 rounded-[2.5rem] bg-indigo-600 flex items-center justify-center text-white text-5xl font-black shadow-2xl relative z-10">
                ${(currentUser.name || "A")[0]}
              </div>
              <div class="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-indigo-600 shadow-lg z-20 border border-slate-100 dark:border-slate-700">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </div>
          </div>
          <div class="text-center md:text-left">
            <h4 class="text-3xl font-black text-slate-950 dark:text-white leading-tight mb-2 tracking-tight">${currentUser.name
      }</h4>
            <div class="flex flex-wrap items-center justify-center md:justify-start gap-3">
               <span class="px-4 py-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.15em] shadow-lg shadow-indigo-600/30">
                 ${currentUser.role}
               </span>
               <span class="px-4 py-1.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black tracking-widest lowercase border border-slate-300 dark:border-slate-700">
                 @${currentUser.username}
               </span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div class="space-y-3">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Shop Assignment</label>
            <div class="w-full px-6 py-5 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold shadow-sm group hover:border-indigo-500 transition-colors">
              <div class="text-xs text-slate-400 font-normal mb-1">Company / Branch</div>
              ${currentUser.shop_name}
            </div>
          </div>
          <div class="space-y-3">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Access Credentials</label>
            <div class="w-full px-6 py-5 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 font-black shadow-sm flex items-center justify-between group hover:border-emerald-500 transition-colors">
              <div>
                <div class="text-xs text-slate-400 font-normal mb-1">Status</div>
                VERIFIED ACTIVE
              </div>
              <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
            </div>
          </div>
          <div class="space-y-3 sm:col-span-2">
             <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Internal Reference</label>
             <div class="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 text-slate-400 font-mono text-xs cursor-default flex items-center justify-between">

               <div>
                  <span class="text-slate-300 font-normal mr-2">UID:</span>${currentUser.id}
                  <span class="mx-4 text-slate-800 opacity-10">|</span>
                  <span class="text-slate-300 font-normal mr-2">SID:</span>${currentUser.shop_id || "GLOBAL"}
               </div>
               <span class="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-black uppercase text-slate-500 tracking-tighter">Read Only</span>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  // Receipt Settings Tab
  if (_activeSettingsTab === "receipt") {
    return renderReceiptSettings();
  }

  return "";
}


function toggleAddCategoryMenu() {
  const el = document.getElementById("add-category-menu");
  if (el) el.classList.toggle("hidden");
}

function toggleLobbyCategoryMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("lobby-category-menu");
  if (!menu) return;
  menu.classList.toggle("hidden");

  // Close menu when clicking outside
  if (!menu.classList.contains("hidden")) {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.add("hidden");
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 10);
  }
}

function openAddCategoryPopup(type) {
  // Hide both potential menus
  const menu1 = document.getElementById("add-category-menu");
  const menu2 = document.getElementById("lobby-category-menu");
  if (menu1) menu1.classList.add("hidden");
  if (menu2) menu2.classList.add("hidden");

  const isProduct = type === 'product';
  const title = isProduct ? 'Add Product Category' : 'Add Expense Category';
  const emojiHtml = !isProduct ? `
    <div>
      <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Emoji</label>
      <input id="pop-cat-emoji" value="📦" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl text-xl text-center outline-none focus:border-indigo-500 transition-all font-bold" />
    </div>` : '';

  openModal(
    title,
    `
    <div class="space-y-6">
      <div class="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
        <p class="text-[10px] font-black text-indigo-800 dark:text-indigo-200 uppercase tracking-[0.2em] mb-1">New Category</p>
        <p class="text-xs text-indigo-700/70 dark:text-indigo-400/70 italic">Organize your ${isProduct ? 'products' : 'expenses'} more effectively.</p>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Category Label</label>
          <input id="pop-cat-name" onkeydown="if(event.key==='Enter') submitPopCategory('${type}')" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-indigo-500 transition-all outline-none font-bold text-lg" placeholder="e.g. ${isProduct ? 'Beverages' : 'Rent'}" />
        </div>
        ${emojiHtml}
        <button onclick="submitPopCategory('${type}')" class="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Save Category
        </button>
      </div>

      <div id="pop-cat-list-wrap" class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
         <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-1">Manage Existing Categories</p>
         <div id="pop-cat-list" class="space-y-2 max-h-[250px] overflow-y-auto pr-2">
            <!-- List injected here -->
         </div>
      </div>
    </div>
    `
  );
  updateCategoryListInPopup(type);
  setTimeout(() => {
    const input = document.getElementById("pop-cat-name");
    if (input) input.focus();
  }, 50);
}

async function submitPopCategory(type) {
  const name = document.getElementById("pop-cat-name").value.trim();
  if (!name) return toast("Name required", "error");

  const payload = { name };
  if (type === "expense") {
    payload.emoji = document.getElementById("pop-cat-emoji").value || "📦";
  }

  const url = type === "product" ? "/api/product-categories" : "/api/expense-categories";
  const r = await api(url, "POST", payload);
  if (r.error) return toast(r.error, "error");

  const input = document.getElementById("pop-cat-name");
  if (input) {
    input.value = "";
    input.focus();
  }

  toast("Category added successfully!");
  await fetchCategories();
  updateCategoryListInPopup(type);
  if (_currentPage === 'dashboard') renderDashboard();
}

function updateCategoryListInPopup(type) {
  const container = document.getElementById("pop-cat-list");
  if (!container) return;

  const categories = type === "product" ? _productCategories : _expenseCategories;

  if (categories.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 italic text-center py-4">No categories added yet.</div>`;
    return;
  }

  container.innerHTML = categories.map(c => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 transition-all hover:border-indigo-300 dark:hover:border-indigo-700 group">
      <div class="flex items-center gap-3">
        ${type === 'expense' && c.emoji ? `<span class="text-lg">${c.emoji}</span>` : `<div class="w-2 h-2 rounded-full bg-indigo-500"></div>`}
        <span class="text-sm font-bold text-slate-800 dark:text-slate-200">${c.name}</span>
      </div>
      <button onclick="deleteCategoryFromPopup('${type}', ${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  `).join('');
}

async function deleteCategoryFromPopup(type, id, name) {
  if (!confirm(`Are you sure you want to delete the "${name}" category?`)) return;

  const url = type === 'product' ? `/api/product-categories/${id}` : `/api/expense-categories/${id}`;

  try {
    const r = await api(url, 'DELETE');
    if (r.error) return toast(r.error, 'error');

    toast('Category deleted successfully!');
    await fetchCategories();
    updateCategoryListInPopup(type);
    if (_currentPage === 'dashboard') renderDashboard();
  } catch (e) {
    toast('Failed to delete category', 'error');
  }
}

async function addCategory(type) {
  const name = $c("new-cat-name").value.trim();
  const emoji = type === "expense" ? $c("new-cat-emoji").value.trim() : null;

  if (!name) return toast("Name label required", "error");

  const endpoint =
    type === "product" ? "/api/product-categories" : "/api/expense-categories";
  const payload = type === "product" ? { name } : { name, emoji };

  try {
    const r = await api(endpoint, "POST", payload);
    if (r.error) return toast(r.error, "error");

    toast("Architecture updated!");
    await fetchCategories();
    renderSettings();
  } catch (e) {
    toast("Network error while adding category", "error");
  }
}

async function deleteCategory(type, id) {
  if (
    !confirm(
      "Confirm permanent deletion of this category? It must be completely unused across all ledger entries.",
    )
  )
    return;

  const endpoint =
    type === "product"
      ? "/api/product-categories/" + id
      : "/api/expense-categories/" + id;

  try {
    const r = await api(endpoint, "DELETE");
    if (r.error) {
      if (r.error.includes("in use"))
        return toast(
          "Access denied: node is currently in use by active entries.",
          "error",
        );
      return toast(r.error, "error");
    }

    toast("Node decommissioned successfully.");
    await fetchCategories();
    renderSettings();
  } catch (e) {
    toast("Network error during decommission.", "error");
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────
// ─── Dashboard state ──────────────────────────────────────────────────────────
let _dashPeriod = "all";
let _dashBrandId = "";
let _dashFrom = "";
let _dashTo = "";

async function renderDashboard(period, brandId, from, to) {
  if (period !== undefined) _dashPeriod = period;
  if (brandId !== undefined) _dashBrandId = brandId;
  if (from !== undefined) _dashFrom = from;
  if (to !== undefined) _dashTo = to;

  // Build query string
  const qs = new URLSearchParams();
  if (_dashFrom || _dashTo) {
    if (_dashFrom) qs.set("from", _dashFrom);
    if (_dashTo) qs.set("to", _dashTo);
  } else if (_dashPeriod && _dashPeriod !== "all") {
    qs.set("period", _dashPeriod);
  }

  if (_dashBrandId && _dashBrandId !== "") qs.set("brand_id", _dashBrandId);
  const url = "/api/analytics" + (qs.toString() ? "?" + qs.toString() : "");

  const data = await api(url);
  if (data.isGlobal) return renderGlobalDashboard(data);

  const brands = data.brands || [];

  const PERIOD_OPTS = [
    { val: "all", label: "All Time" },
    { val: "1m", label: "Last 1 Month" },
    { val: "2m", label: "Last 2 Months" },
    { val: "6m", label: "Last 6 Months" },
    { val: "1y", label: "Last Year" },
  ];

  const periodSelect = `
    <select id="dash-period-filter" onchange="renderDashboard(this.value, document.getElementById('dash-brand-filter')?.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
      ${PERIOD_OPTS.map((o) => `<option value="${o.val}" ${_dashPeriod === o.val ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>`;

  const fromInput = `
    <input type="date" id="dash-from-filter" value="${_dashFrom || ""}" onchange="renderDashboard(undefined, undefined, this.value, undefined)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">`;

  const toInput = `
    <input type="date" id="dash-to-filter" value="${_dashTo || ""}" onchange="renderDashboard(undefined, undefined, undefined, this.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">`;

  const brandSelect =
    brands.length > 1
      ? `
    <select id="dash-brand-filter" onchange="renderDashboard(undefined, this.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
      <option value="">All Brands</option>
      ${brands.map((b) => `<option value="${b.id}" ${String(_dashBrandId) === String(b.id) ? "selected" : ""}>${b.name}</option>`).join("")}
    </select>`
      : "";

  // Determine whether any filter is active for a subtle badge
  const isFiltered =
    _dashPeriod !== "all" ||
    (_dashBrandId !== "" && _dashBrandId !== null) ||
    _dashFrom !== "" ||
    _dashTo !== "";

  $c("page-content").innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <h3 class="text-3xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Main Dashboard</h3>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">Real-time overview of your store performance</p>
      </div>
    </div>
    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
        </svg>
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Filter Sales</span>
        ${isFiltered ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800">ACTIVE</span>' : ""}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Time Period</span>
          ${periodSelect}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">From</span>
          ${fromInput}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">To</span>
          ${toInput}
        </div>
        ${brandSelect
      ? `<div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Brand</span>
          ${brandSelect}
        </div>`
      : ""
    }
        ${isFiltered ? `<button onclick="_dashFrom='';_dashTo='';renderDashboard('all', '')" class="text-xs font-semibold text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-800 transition-all flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>Clear</button>` : ""}
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
      ${statCard("Total Revenue", "Rs. " + Number(data.totalRevenue).toLocaleString(), `${data.totalSales} transaction${data.totalSales !== 1 ? "s" : ""}`, "blue")}
      ${statCard("Cost of Goods Sold", "Rs. " + Number(data.totalCOGS).toLocaleString(), "Sum of buying prices", "purple")}
      ${statCard("Gross Profit", "Rs. " + Number(data.netProfit).toLocaleString(), "Revenue − COGS", "emerald")}
      ${statCard("Damage Value", "Rs. " + Number(data.damageTotal || 0).toLocaleString(), "Inventory & Returns", "rose")}
      ${statCard("Products", data.totalProducts, "in catalog", "amber")}
    </div>

    <!-- Tables -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Products -->
      <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Top Products by Sales</h3>
        </div>
        <div class="p-4">
          ${data.topProducts.length
      ? `
            <div class="space-y-1">
              ${data.topProducts
        .map(
          (p, i) => `
                <div class="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <span class="w-6 h-6 flex-shrink-0 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">${i + 1}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-800 dark:text-gray-200 font-semibold truncate">${p.name}</div>
                    ${p.brand_name ? `<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">${p.brand_name}</div>` : ""}
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold">${p.qty_sold} sold</span>
                    <div class="text-right">
                      <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">Rs. ${Number(p.revenue).toLocaleString()}</div>
                      <div class="text-[10px] text-rose-500 font-mono">COGS: Rs. ${Number(p.cogs || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>`,
        )
        .join("")}
            </div>`
      : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'
    }
        </div>
      </div>

      <!-- Recent Sales -->
      <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Recent Sales</h3>
        </div>
        <div class="p-4">
          ${data.recentSales.length
      ? `
            <div class="space-y-0.5">
              ${data.recentSales
        .map(
          (s) => `
                <div class="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                  <div class="text-xs text-gray-500 dark:text-gray-400">${new Date(s.created_at).toLocaleString()}</div>
                  <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">Rs. ${Number(s.total).toLocaleString()}</div>
                </div>`,
        )
        .join("")}
            </div>`
      : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'
    }
        </div>
      </div>
    </div>`;
}

function renderGlobalDashboard(data) {
  $c("page-content").innerHTML = `
    <div class="max-w-4xl mx-auto mt-10">
      <div class="glass rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300">
         <h3 class="font-bold text-gray-700 dark:text-gray-200 mb-6 flex items-center gap-2 uppercase tracking-widest text-[12px]">
          <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          System Owner Quick Actions
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onclick="window.location.href = '/admin/store-monitoring'" class="flex flex-col items-start p-6 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group shadow-sm hover:shadow-md h-full text-left">
            <svg class="w-8 h-8 text-indigo-500 mb-4 bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            <span class="block text-base font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-2">SaaS Command Center</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Monitor all stores, view growth charts, and manage tenants and statuses</span>
          </button>
           <button onclick="navigate('subscriptions')" class="flex flex-col items-start p-6 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all group shadow-sm hover:shadow-md h-full text-left">
            <svg class="w-8 h-8 text-emerald-500 mb-4 bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="block text-base font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Track Payments</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Manage shop subscriptions, view due payments and update plans</span>
          </button>
        </div>
      </div>
    </div>`;
}

// ─── Brands ───────────────────────────────────────────────────────
async function renderBrands(shopId = null) {
  // If we are coming from Master Hierarchy, shopId is provided.
  // If we are clicking 'Brands' from sidebar, shopId is null (defaults to current user's shop).
  managedShopId = shopId;
  const url = managedShopId
    ? `/api/brands?shopId=${managedShopId}`
    : "/api/brands";

  const brands = await api(url);

  const shopName = managedShopId
    ? ` for ${shops.find((s) => s.id === managedShopId)?.name}`
    : "";

  const getAvatar = (name) => {
    const init = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const colors = [
      "bg-indigo-500",
      "bg-rose-500",
      "bg-emerald-500",
      "bg-amber-500",
      "bg-blue-500",
      "bg-violet-500",
    ];
    const idx = (name.charCodeAt(0) + name.length) % colors.length;
    return { init, color: colors[idx] };
  };

  const cardsHtml = brands
    .map((b) => {
      const { init, color } = getAvatar(b.name);
      return `
      <div class="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all group bg-white dark:bg-gray-900">
         <div class="flex flex-col items-center text-center">
            <div class="w-20 h-20 rounded-2xl ${color} flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg shadow-${color.split("-")[1]}-500/20">
              ${init}
            </div>
            <h4 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">${b.name}</h4>
            <p class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">Verified Brand</p>
         </div>
         <div class="mt-8 pt-5 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Registered</span>
              <span class="text-xs text-gray-600 dark:text-gray-400 font-medium">${new Date(b.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" })}</span>
            </div>
            ${currentUser.role === "superadmin"
          ? `
            <div class="flex gap-2">
               <button onclick="openEditBrand(${b.id}, '${b.name.replace(/'/g, "\\'")}')" class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-transparent hover:bg-indigo-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
               </button>
               <button onclick="deleteBrand(${b.id})" class="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-rose-600 dark:text-rose-400 border border-transparent hover:bg-red-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
            </div>
            `
          : ""
        }
         </div>
      </div>
    `;
    })
    .join("");

  $c("page-content").innerHTML = `
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div>
        <h3 class="text-3xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Partner Brands${shopName}</h3>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">Directory of ${brands.length} official brands in the system</p>
      </div>
      ${currentUser.role === "superadmin"
      ? `
        <button onclick="openAddBrand()" class="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 text-white text-sm font-bold transition-all active:scale-95">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Add Partner Brand
        </button>
      `
      : ""
    }
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
      ${cardsHtml ||
    `<div class="col-span-full py-32 text-center">
          <div class="text-gray-300 dark:text-gray-700 mb-4 flex justify-center">
            <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          </div>
          <p class="text-gray-400 italic">No brands found in the registry.</p>
        </div>`
    }
    </div>
  `;
}

function openAddBrand() {
  openModal(
    "Add Brand",
    `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Nike" /></div>
      <button onclick="saveBrand()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Save Brand</button>
    </div>`,
  );
  setTimeout(() => $c("brand-name").focus(), 50);
}

function openEditBrand(id, name) {
  openModal(
    "Edit Brand",
    `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" value="${name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <button onclick="saveBrand(${id})" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Brand</button>
    </div>`,
  );
}

async function saveBrand(id) {
  const name = $c("brand-name").value.trim();
  if (!name) return toast("Brand name required", "error");

  const payload = { name };
  if (managedShopId) payload.shopId = managedShopId;

  if (id) {
    await api(`/api/brands/${id}`, "PUT", payload);
  } else {
    await api("/api/brands", "POST", payload);
  }
  closeModal();
  toast("Brand saved!");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderBrands(managedShopId);
  }
}

async function deleteBrand(id) {
  if (
    !confirm("Delete this brand? Products linked to it will also be deleted.")
  )
    return;
  const url = managedShopId
    ? `/api/brands/${id}?shopId=${managedShopId}`
    : `/api/brands/${id}`;
  const r = await api(url, "DELETE");
  if (r.error) return toast(r.error, "error");
  toast("Brand deleted");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderBrands(managedShopId);
  }
}

function payBrandExpense(brandId, month, dueAmount) {
  openModal(
    "Submit Brand Payment",
    `
    <div class="space-y-4">
      <p class="text-sm text-slate-400">Total remaining due for this month: <strong>Rs. ${Number(dueAmount).toLocaleString()}</strong></p>
      <div><label class="block text-xs text-slate-400 mb-1.5">Amount Paid (Rs.)</label>
        <input id="brand-exp-amount" type="number" min="1" max="${dueAmount}" value="${dueAmount}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <button onclick="submitBrandExpensePayment(${brandId}, '${month}')" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg hover:shadow-emerald-500/25">Confirm Payment</button>
    </div>
  `,
  );
}

async function submitBrandExpensePayment(brandId, month) {
  const amountInput = document.getElementById("brand-exp-amount");
  if (!amountInput) return;
  const amount = parseFloat(amountInput.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");

  const r = await api("/api/brands/expense-payments", "POST", {
    brand_id: brandId,
    amount,
    month,
  });
  if (r.error) return toast(r.error, "error");

  toast("Payment recorded successfully!");
  closeModal();
  renderBrands(); // Refresh list to update UI
}

// ─── Products ────────────────────────────────────────────────────────
async function renderProducts(onlyLowStock = false) {
  const [products, brands] = await Promise.all([
    api("/api/products"),
    api("/api/brands"),
  ]);
  // Filter out components from global list for UI purposes
  allProducts = products;
  syncProductMap(products);
  const mainProducts = products.filter((p) => p.is_component !== 1);
  updateLowStockBadge(mainProducts);

  const displayList = onlyLowStock
    ? mainProducts.filter((p) => p.stock <= p.min_stock_level)
    : mainProducts;
  const listTitle = onlyLowStock ? "low stock product(s)" : "product(s)";

  $c("page-content").innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <p class="text-slate-400 text-sm">${displayList.length} ${listTitle}</p>
        ${onlyLowStock ? `<button onclick="navigate('products')" class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Clear Filter</button>` : ""}
      </div>
      <div class="flex items-center gap-2">
        <button onclick="openAddCategoryPopup('product')" class="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 transition-all">+ Add Category</button>
        <button onclick="openAddProduct()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">+ Add Product</button>
      </div>
    </div>
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-200 dark:border-slate-700 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">SKU</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Product</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Category</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Brand</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Batches (Cost)</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Fine Stock</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Selling Price</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${displayList.length
      ? displayList
        .map(
          (p) => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">${p.sku}</td>
              <td class="px-5 py-4"><div class="font-bold text-slate-800 dark:text-slate-200">${p.name}</div><div class="text-[10px] text-slate-500">${p.description || ""}</div></td>
              <td class="px-5 py-4"><span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">${p.category}</span></td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400 font-medium">${p.brand_name || "—"}</td>
              <td class="px-5 py-4">
                ${p.batches && p.batches.length > 1
              ? `
                  <div class="relative inline-block">
                    <select class="appearance-none text-xs bg-transparent text-indigo-600 dark:text-indigo-400 rounded-lg pl-0 pr-6 py-1 font-black cursor-pointer transition-all focus:outline-none focus:ring-0 uppercase tracking-tight">
                      <option disabled selected class="bg-white dark:bg-slate-900">Multiple Prices (${p.batches.length})</option>
                      ${p.batches.map(b => `<option class="bg-white dark:bg-slate-900 text-sm font-bold">Rs. ${b.buying_price} (${b.quantity} qty)</option>`).join('')}
                    </select>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/50">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                `
              : (p.batches && p.batches.length === 1)
                ? `<div class="inline-flex flex-col">
                           <span class="text-[11px] font-black text-slate-900 dark:text-white">Rs. ${p.batches[0].buying_price}</span>
                           <span class="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Standard Cost</span>
                         </div>`
                : '<span class="text-slate-300">No Batches</span>'
            }
              </td>
              <td class="px-5 py-4">
                <div class="flex flex-col gap-1">
                  ${p.ingredients && p.ingredients.length > 0
              ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                        🍳 Recipe-Based
                       </span>`
              : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${p.stock > p.min_stock_level ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : p.stock > 0 ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"}">
                        ${p.stock} Full Kits
                       </span>`
            }
                  ${(() => {
              if (!p.components || p.components.length === 0) return "";
              return p.components.map(c => {
                if (!c.stock || c.stock <= 0) return "";
                return `<div class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest pl-1">+ ${c.stock} ${c.name} (Loose)</div>`;
              }).join("");
            })()}
                  ${!(p.ingredients && p.ingredients.length > 0) ? `<div class="text-[10px] text-slate-500 pl-1 italic">Threshold: ${p.min_stock_level}</div>` : ""}
                </div>
              </td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400">Rs. ${p.selling_price || 0}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.damage_stock > 0 ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}">
                  ${p.damage_stock || 0} Damaged
                </span>
              </td>
              <td class="px-5 py-4 text-right space-x-1">
                ${!(p.ingredients && p.ingredients.length > 0)
              ? `<button onclick="adjustStock(${p.id},'${p.name.replace(/'/g, "\\'")}',${p.stock},${p.buying_price})" class="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700">Stock</button>`
              : ""
            }
                <div class="inline-flex rounded-lg shadow-sm" role="group">
                  <button onclick="openLossPopup(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="px-2 py-1 text-xs rounded-l-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-800/50 transition-all border border-rose-200 dark:border-rose-900/50 border-r-0">Loss</button>
                  <button onclick="openRecoveryPopup(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.damage_stock})" class="px-2 py-1 text-xs rounded-r-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/50 transition-all border border-emerald-200 dark:border-emerald-900/50">Recov</button>
                </div>
                <button onclick="openEditProduct(${p.id})" class="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-all border border-indigo-200 dark:border-indigo-900/50">Edit</button>
              </td>
            </tr>`,
        )
        .join("")
      : `<tr><td colspan="8" class="px-6 py-12 text-center text-slate-500">No products. Add brands first, then products.</td></tr>`
    }
        </tbody>
      </table>
    </div>`;
  window._productBrands = brands;
}

function productFormHtml(p = {}, brands = []) {
  const brandOptions = brands
    .map(
      (b) =>
        `<option value="${b.id}" ${p.brand_id == b.id ? "selected" : ""}>${b.name}</option>`,
    )
    .join("");

  // Helper for numeric inputs with +/- buttons
  const numInput = (id, label, value, placeholder = "") => `
    <div class="col-span-2 sm:col-span-1">
      <label class="block text-xs text-slate-400 mb-1">${label}</label>
      <div class="flex items-center gap-2">
        <button type="button" onclick="const inp = this.nextElementSibling; inp.stepDown(); inp.dispatchEvent(new Event('input', {bubbles:true})); ${id === "add-cart-qty" ? "" : "if(window.calculateCartTotal) calculateCartTotal();"}" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">-</button>
        <input id="${id}" type="number" value="${value}" class="flex-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="${placeholder}" />
        <button type="button" onclick="const inp = this.previousElementSibling; inp.stepUp(); inp.dispatchEvent(new Event('input', {bubbles:true})); ${id === "add-cart-qty" ? "" : "if(window.calculateCartTotal) calculateCartTotal();"}" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">+</button>
      </div>
    </div>`;

  const isRestaurant = currentUser.shop_type === "restaurant";
  const labelComp = isRestaurant ? "Ingredients (Recipe)" : "Unit Breakdown / Loose Items";
  const descComp = isRestaurant
    ? "Define raw ingredients for this item. Cost will be auto-calculated from raw stock prices."
    : "Define how many smaller items (e.g. pieces in a box) are in one unit. Selling these will automatically break a unit from stock.";
  const btnComp = isRestaurant ? "Add Ingredient" : "Add Loose Item";

  const hasCompositePermission =
    currentUser.allowed_panels &&
    currentUser.allowed_panels.includes("composite_products");

  const compHtml = hasCompositePermission
    ? `
    <div class="col-span-2 border-b border-slate-100 dark:border-slate-800 pb-2 mt-4 mb-2 flex items-center justify-between">
      <div>
        <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">${labelComp}</h4>
        <p class="text-[10px] text-slate-500 italic mt-0.5">${descComp}</p>
      </div>
      <button type="button" onclick="addComponentToForm(${isRestaurant})" class="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold hover:bg-emerald-100 transition-all flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        ${btnComp}
      </button>
    </div>
    <div class="col-span-2 space-y-2" id="pf-comp-list">
        <!-- Rendered by renderFormCompositionList() -->
    </div>
  `
    : "";

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Basic Information</h4>
        </div>
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2 hidden sm:block"></div>

        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">SKU *</label>
          <input id="pf-sku" value="${p.sku || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Unique code" /></div>
        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">Category *</label>
          <select id="pf-category" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="">Select Category</option>
            ${_productCategories.map((c) => `<option value="${c.name}" ${p.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Product Name *</label>
          <input id="pf-name" value="${p.name || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Product name" /></div>
        ${(isRestaurant || brands.length <= 1)
      ? `<input type="hidden" id="pf-brand" value="${brands[0] ? brands[0].id : ""}" />`
      : `<div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Brand *</label>
             <select id="pf-brand" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"><option value="">Select brand</option>${brandOptions}</select></div>`
    }
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Description</label>
          <input id="pf-desc" value="${p.description || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Optional description" /></div>

        <div class="col-span-2 border-b border-slate-100 dark:border-slate-800 pb-2 mt-4 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Pricing & Inventory</h4>
        </div>

        <div id="pricing-cost-container" class="col-span-2 sm:col-span-1">
          ${numInput("pf-buy", "Cost Price", p.buying_price ?? "")}
        </div>
        <div id="pricing-sell-container" class="col-span-2 sm:col-span-1">
          ${numInput("pf-sell", "Selling Price", p.selling_price ?? "")}
        </div>
        <div id="pricing-stock-container" class="col-span-2 sm:col-span-1">
          ${numInput("pf-stock", "Initial Stock", p.stock ?? "")}
        </div>
        <div id="pricing-min-stock-container" class="col-span-2 sm:col-span-1">
           ${numInput("pf-min-stock", "Minimum Stock Level", p.min_stock_level ?? "", "Alert threshold")}
        </div>
        ${compHtml}

        <div class="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Product Image</h4>
          <div class="flex items-start gap-4">
            <div id="pf-img-preview" class="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center flex-shrink-0">
              ${p.image_url
      ? `<img src="${p.image_url}" class="w-full h-full object-cover" />`
      : `<svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
    }
            </div>
            <div class="flex-1">
              <label class="block text-xs text-slate-500 mb-2">Upload a photo of this product (JPG, PNG, WebP, max 2MB)</label>
              <label for="pf-image" class="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Choose Image
              </label>
              <input id="pf-image" type="file" accept="image/*" class="hidden" onchange="previewProductImage(this)" />
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function previewProductImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('pf-img-preview');
    if (preview) preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover" />`;
  };
  reader.readAsDataURL(file);
}

async function openAddProduct() {
  let brands = window._productBrands || (await api("/api/brands"));

  // GET /api/brands auto-creates a default brand if none exist
  if (!brands.length) {
    return toast("Failed to load brands. Please refresh and try again.", "error");
  }

  window._formComponents = [];
  const randomSku = 'SKU-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  openModal(
    "Add Product",
    productFormHtml({ sku: randomSku }, brands) +
    `<button onclick="saveProduct()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Save Product</button>`,
    "max-w-xl",
  );
  renderFormCompositionList();

  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  if (buyEl) buyEl.addEventListener("input", recalculateComponentPrices);
  if (sellEl) sellEl.addEventListener("input", recalculateComponentPrices);
}

async function openEditProduct(id) {
  const brands = window._productBrands || (await api("/api/brands"));
  const product = allProducts.find((p) => p.id === id) || {};

  // Decide what to load into form components
  if (currentUser.shop_type === 'restaurant' && product.ingredients) {
    window._formComponents = product.ingredients.map(i => ({ ...i, is_ingredient: true, raw_stock_id: i.id }));
  } else {
    window._formComponents = product.components ? product.components.map(c => ({ ...c, is_ingredient: false })) : [];
  }

  openModal(
    "Edit Product",
    productFormHtml(product, brands) +
    `<button onclick="saveProduct(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Product</button>`,
    "max-w-xl",
  );
  recalculateComponentPrices(); // To handle readOnly/hidden states
  renderFormCompositionList();

  // Attach redistribution listeners
  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  if (buyEl) buyEl.addEventListener("input", recalculateComponentPrices);
  if (sellEl) sellEl.addEventListener("input", recalculateComponentPrices);
}

async function saveProduct(id) {
  try {
    const isRestaurant = currentUser.shop_type === 'restaurant';
    const components = (isRestaurant) ? [] : (window._formComponents || []);
    const ingredients = isRestaurant ?
      (window._formComponents || []).map(i => ({ raw_stock_id: i.raw_stock_id, quantity: i.quantity })) : [];

    const imageFile = document.getElementById('pf-image')?.files?.[0];

    const sku = $c("pf-sku").value.trim();
    const name = $c("pf-name").value.trim();
    const category = $c("pf-category").value.trim();

    if (!sku || !category || !name) return toast("SKU, Category, and Name required", "error");
    let brand_id = parseInt($c("pf-brand").value);
    if (!brand_id) {
      // Auto-resolve: fetch brands and use first one
      try {
        const brands = await api("/api/brands");
        if (brands && brands.length > 0) {
          brand_id = brands[0].id;
          window._productBrands = brands;
        } else {
          return toast("No brands available. Contact an administrator.", "error");
        }
      } catch (e) {
        return toast("Could not load brands. Try again.", "error");
      }
    }

    const formData = new FormData();
    formData.append('sku', sku);
    formData.append('name', name);
    formData.append('category', category);
    formData.append('description', $c("pf-desc").value.trim());
    formData.append('brand_id', brand_id);
    formData.append('buying_price', parseFloat($c("pf-buy").value) || 0);
    formData.append('selling_price', parseFloat($c("pf-sell").value) || 0);
    formData.append('stock', parseInt($c("pf-stock").value) || 0);
    formData.append('min_stock_level', parseInt($c("pf-min-stock").value) || 0);
    formData.append('components', JSON.stringify(components));
    formData.append('ingredients', JSON.stringify(ingredients));
    if (imageFile) formData.append('image', imageFile);

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, body: formData });

    let r;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      r = await res.json();
    } else {
      const errorText = await res.text();
      throw new Error(`Server returned non-JSON response (${res.status}): ${errorText.substring(0, 100)}...`);
    }

    if (!res.ok || r.error) return toast(r.error || 'Error saving product', 'error');

    closeModal();
    toast("Product saved successfully!");
    renderProducts();
  } catch (err) {
    console.error("[CRITICAL] saveProduct failed:", err);
    toast("Error: " + err.message, "error");
  }
}

async function addComponentToForm(isIngredient = false) {
  if (isIngredient) {
    const stocks = await api("/api/raw-stock");
    if (!stocks.length) return toast("Add Raw Ingredients first!", "error");
    window._formComponents.push({ raw_stock_id: stocks[0].id, name: stocks[0].name, quantity: 1, cost: stocks[0].buying_price, unit: stocks[0].unit, is_ingredient: true });
    window._rawStocksList = stocks; // Cache for dropdown
  } else {
    window._formComponents.push({ name: "", quantity: 1, price: 0, cost: 0, is_ingredient: false });
  }
  recalculateComponentPrices();
  renderFormCompositionList();
}

function removeComponentFromForm(idx) {
  window._formComponents.splice(idx, 1);
  recalculateComponentPrices();
  renderFormCompositionList();
}

function updateComponentQtyInForm(index, qty) {
  const comp = window._formComponents[index];
  if (comp) comp.quantity = parseFloat(qty) || 1;
  recalculateComponentPrices();
}

function updateComponentNameInForm(index, name) {
  const comp = window._formComponents[index];
  if (comp) comp.name = name;
}

function updateComponentPriceInForm(index, price) {
  const comp = window._formComponents[index];
  if (comp) comp.price = parseFloat(price) || 0;
}

function updateIngredientInForm(index, rawStockId) {
  const comp = window._formComponents[index];
  const stock = window._rawStocksList.find(s => s.id == rawStockId);
  if (comp && stock) {
    comp.raw_stock_id = stock.id;
    comp.name = stock.name;
    comp.cost = stock.buying_price;
    comp.unit = stock.unit;
    recalculateComponentPrices();
  }
}

function recalculateComponentPrices() {
  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  const stockCont = document.getElementById('pricing-stock-container');
  const minStockCont = document.getElementById('pricing-min-stock-container');

  if (!buyEl || !sellEl) return;

  const isRestaurant = currentUser.shop_type === 'restaurant';
  const components = window._formComponents || [];
  const count = components.length;

  if (isRestaurant) {
    let totalCost = 0;
    components.forEach(c => {
      totalCost += (c.cost || 0) * (c.quantity || 1);
    });
    if (count > 0) {
      buyEl.value = totalCost.toFixed(2);
      buyEl.readOnly = true;
      buyEl.classList.add('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed');
    } else {
      buyEl.readOnly = false;
      buyEl.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed');
    }

    // Hide stock fields for recipe items
    if (stockCont) stockCont.classList.toggle('hidden', count > 0);
    if (minStockCont) minStockCont.classList.toggle('hidden', count > 0);

  } else {
    if (count === 0) return;
    const parentBuy = parseFloat(buyEl.value) || 0;
    const parentSell = parseFloat(sellEl.value) || 0;

    const shareBuy = parentBuy / count;
    const shareSell = parentSell / count;

    components.forEach((c, idx) => {
      // Auto-define price based on parent / quantity
      const qty = parseFloat(c.quantity) || 1;
      c.cost = Number((shareBuy / qty).toFixed(2));
      c.price = Number((shareSell / qty).toFixed(2));

      // Direct DOM Update to prevent focus loss
      const costEl = document.getElementById(`comp-cost-${idx}`);
      const priceEl = document.getElementById(`comp-price-${idx}`);
      if (costEl) costEl.value = c.cost;
      if (priceEl) priceEl.value = c.price;
    });
  }
}

function renderFormCompositionList() {
  const el = $c("pf-comp-list");
  if (!el) return;
  const isRestaurant = currentUser.shop_type === 'restaurant';

  if (!window._formComponents.length) {
    const msg = isRestaurant ? 'Click "+ Add Ingredient" to start building your recipe' : 'Click "+ Add Component" to start building your bundle';
    el.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-xs text-slate-400 italic">${msg}</div>`;
    return;
  }

  el.innerHTML = window._formComponents
    .map(
      (c, idx) => `
    <div class="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800 group relative">
      <div class="grid grid-cols-12 gap-2 items-end">
        ${isRestaurant
          ? `<!-- Ingredient Selector -->
             <div class="col-span-12 sm:col-span-10">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Ingredient</label>
                <select onchange="updateIngredientInForm(${idx}, this.value)" class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none">
                    ${(window._rawStocksList || []).map(s => `<option value="${s.id}" ${s.id == c.raw_stock_id ? 'selected' : ''}>${s.name} (Rs. ${s.buying_price}/${s.unit})</option>`).join('')}
                </select>
             </div>`
          : `<!-- Part Name (Free Text) -->
             <div class="col-span-12 sm:col-span-5">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Part Name</label>
                <input type="text" value="${c.name || ""}" oninput="updateComponentNameInForm(${idx}, this.value)" placeholder="e.g. SSD 256GB"
                   class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold focus:border-indigo-500 outline-none" />
             </div>
             <!-- Cost -->
             <div class="col-span-4 sm:col-span-2">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Unit Cost</label>
                <input id="comp-cost-${idx}" type="number" value="${c.cost || 0}" readonly
                   class="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none text-rose-500 cursor-not-allowed" />
             </div>
             <!-- Price -->
             <div class="col-span-4 sm:col-span-3">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Unit Price (Sell)</label>
                <input id="comp-price-${idx}" type="number" value="${c.price || 0}" min="0" oninput="updateComponentPriceInForm(${idx}, this.value)"
                   class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold focus:border-indigo-500 outline-none text-indigo-500" />
             </div>`
        }

        <!-- Qty -->
        <div class="col-span-6 sm:col-span-2">
           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Qty ${c.unit ? `(${c.unit})` : ""}</label>
           <input type="number" value="${c.quantity || 1}" step="0.01" min="0.01" oninput="updateComponentQtyInForm(${idx}, this.value)"
              class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-center focus:border-indigo-500 outline-none" />
        </div>

        <!-- Delete -->
        <div class="col-span-6 ${isRestaurant ? 'sm:col-span-12' : 'sm:col-span-2'} flex justify-end">
          <button onclick="removeComponentFromForm(${idx})" class="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all opacity-0 group-hover:opacity-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function removeComponentFromForm(idx) {
  window._formComponents.splice(idx, 1);
  renderFormCompositionList();
}

function adjustStock(id, name, current, buyingPrice) {
  openModal(
    `Stock: ${name}`,
    `
    <div class="space-y-4">
      <p class="text-slate-400 text-sm">Current stock: <strong class="text-white">${current}</strong></p>
      
      <div>
        <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Adjust by (use negative to reduce)</label>
        <input id="stock-delta" type="number" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" />
      </div>

      <div>
        <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Batch Buying Price (Rs.)</label>
        <input id="stock-buying-price" type="number" value="${buyingPrice || 0}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 focus:outline-none focus:border-emerald-500 transition-all font-bold text-lg" />
        <p class="text-[10px] text-slate-500 mt-1 italic">When adding stock, this will create a new batch with this cost.</p>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="doAdjustStock(${id},1)" class="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-50 text-white hover:text-emerald-700 font-bold transition-all shadow-lg shadow-emerald-900/10">Add Stock</button>
        <button onclick="doAdjustStock(${id},-1)" class="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-50 text-white hover:text-rose-700 font-bold transition-all shadow-lg shadow-rose-900/10">Remove Stock</button>
      </div>
    </div>`,
  );
}

async function doAdjustStock(id, sign) {
  const delta = parseInt($c("stock-delta").value) * sign;
  const buyingPrice = parseFloat($c("stock-buying-price").value) || 0;

  const r = await api(`/api/products/${id}/stock`, "PATCH", { delta, buying_price: buyingPrice });
  if (r.error) return toast(r.error, "error");
  closeModal();
  toast(`Stock updated for ${id}`);
  renderProducts();
}

// ─── Damage Management ────────────────────────────────────────────────
async function toggleDamageAutoCalc(cb) {
  try {
    const autoCalc = cb.checked;
    const r = await api("/api/shop-settings", "POST", {
      auto_calculate_damage_to_loss: autoCalc
    });
    if (r.error) {
      cb.checked = !autoCalc;
      return toast(r.error, "error");
    }
    toast(`Auto calculation ${autoCalc ? "enabled" : "disabled"}`);
    // Update local settings if exists
    if (_receiptSettings) _receiptSettings.auto_calculate_damage_to_loss = autoCalc ? 1 : 0;
  } catch (e) {
    cb.checked = !cb.checked;
    toast("Error updating settings", "error");
  }
}

function openLossPopup(productId, productName) {
  openModal(
    `Report Loss: ${productName}`,
    `
    <div class="space-y-6 p-2">
      <div class="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/50">
        <p class="text-[10px] font-black text-rose-800 dark:text-rose-200 uppercase tracking-[0.2em] mb-1">Loss Management</p>
        <p class="text-xs text-rose-700/70 dark:text-rose-400/70 italic">Record inventory damage and wastage.</p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Number of Units Lost</label>
          <input id="loss-count" type="number" min="0" value="1" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 focus:border-rose-500 transition-all outline-none font-bold text-xl" />
        </div>

        ${(() => {
      const product = allProducts.find(p => p.id === productId);
      if (!product || !product.batches || product.batches.length === 0) return '';

      return `
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Select Batch to Deduct From</label>
            <select id="loss-batch-id" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 focus:border-indigo-500 transition-all outline-none font-bold text-sm">
              ${product.batches.map(b => `<option value="${b.id}">Cost: Rs. ${b.buying_price} (Available: ${b.quantity})</option>`).join('')}
            </select>
          </div>
          `;
    })()}

        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Additional Loss Amount (Optional, Rs.)</label>
          <input id="loss-manual-amount" type="number" min="0" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 focus:border-rose-500 transition-all outline-none font-bold text-xl" />
        </div>
      </div>

      <button onclick="submitLoss(${productId})" class="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
         Confirm Loss Record
      </button>
    </div>
  `,
    "max-w-md"
  );
}

async function submitLoss(productId) {
  const count = parseInt($c("loss-count").value) || 0;
  const manualLoss = parseFloat($c("loss-manual-amount").value) || 0;
  const batchId = $c("loss-batch-id") ? parseInt($c("loss-batch-id").value) : null;

  if (count <= 0 && manualLoss <= 0) return toast("Quantity or Loss Amount must be provided", "error");

  try {
    const r = await api(`/api/products/${productId}/damage/loss`, "PATCH", {
      damage_count: count,
      manual_loss_amount: manualLoss,
      batch_id: batchId
    });

    if (r.error) return toast(r.error, "error");

    toast("Loss recorded successfully!");
    closeModal();
    renderProducts();
  } catch (e) {
    toast("Network error", "error");
  }
}

function openRecoveryPopup(productId, productName, currentDamageStock) {
  openModal(
    `Report Recovery: ${productName}`,
    `
    <div class="space-y-6 p-2">
      <div class="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
        <p class="text-[10px] font-black text-emerald-800 dark:text-emerald-200 uppercase tracking-[0.2em] mb-1">Salvage & Recovery</p>
        <p class="text-xs text-emerald-700/70 dark:text-emerald-400/70 italic">Current Damaged Pool: <b>${currentDamageStock} units</b></p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Units Recovered (Back to Stock)</label>
          <input id="recovery-count" type="number" min="0" max="${currentDamageStock}" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 transition-all outline-none font-bold text-xl" />
        </div>

        ${(() => {
      const product = allProducts.find(p => p.id === productId);
      if (!product || !product.batches) return '';
      const damagedBatches = product.batches.filter(b => (b.damaged_quantity || 0) > 0);
      if (damagedBatches.length === 0) return '';

      return `
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Recover From Which Batch?</label>
            <select id="recovery-batch-id" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-indigo-500 transition-all outline-none font-bold text-sm">
              ${damagedBatches.map(b => `<option value="${b.id}">Cost: Rs. ${b.buying_price} (${b.damaged_quantity} units damaged)</option>`).join('')}
            </select>
          </div>
          `;
    })()}

        <div class="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <input id="recovery-restock" type="checkbox" checked class="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
          <label for="recovery-restock" class="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Add recovered units back to saleable stock?</label>
        </div>

        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Cash Recovered Amount (Rs.)</label>
          <input id="recovery-amount" type="number" min="0" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 transition-all outline-none font-bold text-xl" />
        </div>
      </div>

      <button onclick="submitRecovery(${productId})" class="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
         Confirm Recovery Record
      </button>
    </div>
  `,
    "max-w-md"
  );
}

async function submitRecovery(productId) {
  const count = parseInt($c("recovery-count").value) || 0;
  const amount = parseFloat($c("recovery-amount").value) || 0;
  const batchId = $c("recovery-batch-id") ? parseInt($c("recovery-batch-id").value) : null;
  const isRestocking = $c("recovery-restock").checked;

  if (count <= 0 && amount <= 0) return toast("Recovery quantity or cash must be provided", "error");

  try {
    const r = await api(`/api/products/${productId}/damage/recovery`, "PATCH", {
      recovery_count: count,
      recovery_amount: amount,
      batch_id: batchId,
      is_restocking: isRestocking
    });

    if (r.error) return toast(r.error, "error");

    toast("Recovery recorded successfully!");
    closeModal();
    renderProducts();
  } catch (e) {
    toast("Network error", "error");
  }
}

// ─── POS ─────────────────────────────────────────────────────────────
async function renderPOS() {
  const [products, tables, waiters, floors] = await Promise.all([
    api("/api/products"),
    api("/api/tables").catch(() => []),
    api("/api/users").catch(() => []),
    api("/api/tables/floors").catch(() => [])
  ]);
  allProducts = products;
  _posFloors = floors;
  _posAllTables = tables;
  syncProductMap(products);
  updateLowStockBadge(products);

  cart = [];
  _posCustomerResults = [];
  _posSelectedCustomer = null;
  const waiterList = (waiters || []).filter(u => ['admin', 'user', 'waiter'].includes(u.role));
  const kitchenList = (waiters || []).filter(u => u.role === 'kitchen');

  let baseShopType = currentUser.shop_type;
  if (currentUser.role === 'superadmin' && managedShopId) {
    const targetShop = (shops || []).find(s => s.id === managedShopId);
    if (targetShop) baseShopType = targetShop.shop_type;
  }
  const isRetail = baseShopType === 'retail';
  const orderTypeClass = isRetail ? 'hidden' : 'flex';

  $c("page-content").innerHTML = `
    <div class="flex flex-col gap-4">
      <!-- Order Type Selector (Hidden for Retail) -->
      <div class="${orderTypeClass} items-center gap-2 p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <button id="otype-dine_in" onclick="switchOrderType('dine_in')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm transition-all">
          🍽️ Dine-in
        </button>
        <button id="otype-takeaway" onclick="switchOrderType('takeaway')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          🛍️ Takeaway
        </button>
        <button id="otype-delivery" onclick="switchOrderType('delivery')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          🚚 Delivery
        </button>
        <button id="otype-orders" onclick="switchOrderType('orders')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          📋 Orders
        </button>
      </div>

      <div id="pos-content-grid" class="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full transition-all">
        <!-- Products Panel -->
        <div class="lg:col-span-3 space-y-4">
          <div class="flex gap-2">
            <input id="pos-search" oninput="filterPOSProducts()" placeholder="Search products…"
              class="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" />
          </div>
          <!-- Category pills -->
          <div id="pos-category-pills" class="flex flex-wrap gap-2">
            <button onclick="filterPOSByCategory(null)" class="cat-pill active px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border border-transparent transition-all" data-cat="">All</button>
            ${(_productCategories || []).map(c => `<button onclick="filterPOSByCategory('${c.name}')" class="cat-pill px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all" data-cat="${c.name}">${c.name}</button>`).join('')}
          </div>
          <div id="pos-products" class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[72vh] overflow-y-auto pr-1"></div>
        </div>

        <!-- Cart / Order Panel -->
        <div class="lg:col-span-2 glass rounded-2xl p-3 flex flex-col shadow-sm border border-slate-200 dark:border-slate-800 transition-all sticky top-24">
          <h3 class="font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 uppercase tracking-tighter text-base">
            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            Current Order
          </h3>
          
          <div id="cart-items" class="space-y-2 min-h-20"></div>

          <!-- Restaurant Fields (Hidden for Retail) -->
          <div id="pos-restaurant-fields" class="${isRetail ? 'hidden' : ''} mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <!-- Dine-in specific: Table & Waiter -->
            <div id="pos-dine-fields" class="mb-2 space-y-2">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Floor</label>
                <select id="pos-floor" onchange="onPosFloorChange()" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                  <option value="">-- All Floors --</option>
                  ${(_posFloors || []).map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                </select>
              </div>
              <div class="grid grid-cols-1 gap-2">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Table</label>
                  <select id="pos-table" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                    <option value="">-- Select Table --</option>
                    ${(tables || []).map(t => `<option value="${t.id}">${t.table_number} (${t.status})</option>`).join('')}
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Waiter</label>
                <select id="pos-waiter" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                  <option value="">-- Select Waiter --</option>
                  ${waiterList.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Kitchen</label>
                <select id="pos-kitchen" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                  <option value="">-- Select Kitchen --</option>
                  ${kitchenList.map(k => `<option value="${k.id}">${k.username} (${k.name})</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Delivery specific: Customer details + address -->
            <div id="pos-delivery-fields" class="mb-2 space-y-2 hidden">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer Name</label>
                <input id="pos-delivery-name" type="text" placeholder="Customer name" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone</label>
                  <input id="pos-delivery-phone" type="text" placeholder="Phone" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rider</label>
                  <select id="pos-rider" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                    <option value="">-- Rider --</option>
                    ${waiterList.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</label>
                <input id="pos-delivery-addr" type="text" placeholder="Full address" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
              </div>
            </div>

            <!-- Takeaway: Token + walkup customer details -->
            <div id="pos-takeaway-fields" class="mb-4 space-y-2 hidden">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Token #</label>
                  <input id="pos-token" type="text" placeholder="Auto or manual" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</label>
                  <input id="pos-takeaway-name" type="text" placeholder="Optional" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
                </div>
              </div>
            </div>
          </div>

          <div class="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4 space-y-4">
            <div class="space-y-2 text-base text-slate-600 dark:text-slate-300">
               <div class="flex justify-between"><span>Subtotal</span><span id="cart-subtotal" class="font-bold text-slate-900 dark:text-white">Rs. 0</span></div>
               <div class="flex justify-between text-rose-500"><span class="text-xs font-bold uppercase tracking-widest">Tax Amount</span><span id="cart-tax-amt" class="font-bold">Rs. 0.00</span></div>
            </div>

            <div class="flex justify-between items-center text-2xl font-black text-indigo-600 dark:text-indigo-400 border-t border-slate-200 dark:border-slate-800 pt-4">
              <span class="text-slate-900 dark:text-white text-lg">Grand Total</span>
              <span id="cart-total" data-total="0">Rs. 0.00</span>
            </div>

            <div class="grid grid-cols-2 gap-4 text-base bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
               <div><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Discount (Rs)</label>
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-discount').stepDown();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">-</button>
                   <input id="pos-discount" type="number" min="0" value="" oninput="calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-discount').stepUp();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">+</button>
                 </div>
               </div>

               <div><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Tax (%)</label>
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-tax').stepDown();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">-</button>
                   <input id="pos-tax" type="number" min="0" value="" oninput="calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-tax').stepUp();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">+</button>
                 </div>
               </div>
            </div>

            <div class="grid grid-cols-2 gap-4 text-base pt-2 border-t border-slate-200 dark:border-slate-800">
               <!-- Customer Identity for Pending Dues -->
               <div class="col-span-1 relative">
                 <label id="pos-cust-name-label" class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Cust. Name</label>
                 <input id="pos-cust-name" type="text" placeholder="Optional" 
                        oninput="suggestPOSCustomers(this.value, 'pos-cust-name')"
                        autocomplete="off"
                        class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-bold shadow-sm" />
                 <!-- Suggestions Dropdown -->
                 <div id="pos-cust-name-suggestions" class="hidden absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"></div>
               </div>
               <div class="col-span-1 relative">
                 <label id="pos-cust-phone-label" class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Cust. Phone</label>
                 <input id="pos-cust-phone" type="tel" placeholder="Optional" 
                        oninput="suggestPOSCustomers(this.value, 'pos-cust-phone')"
                        autocomplete="off"
                        class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-bold shadow-sm" />
                 <!-- Suggestions Dropdown -->
                 <div id="pos-cust-phone-suggestions" class="hidden absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"></div>
               </div>

               <div><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Payment</label>
               <select id="pos-method" onchange="handlePOSMethodChange(this.value)" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base shadow-sm font-bold">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
               </select></div>

               <div><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Received</label>
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-received').stepDown();calculateRemaining()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">-</button>
                   <input id="pos-received" type="number" min="0" value="" oninput="calculateRemaining()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-received').stepUp();calculateRemaining()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">+</button>
                 </div>
               </div>
            </div>

            <div class="flex justify-between items-center text-lg font-black mt-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
              <span class="text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-widest">Change / Dues</span>
              <span id="cart-remaining" class="text-emerald-600 dark:text-emerald-400">Rs. 0.00</span>
            </div>

            <div class="flex items-center gap-2 mb-2 p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl">
              <input type="checkbox" id="pos-is-quotation" class="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer" onchange="toggleQuotationMode(this.checked)" />
              <label for="pos-is-quotation" class="text-xs font-black text-amber-700 dark:text-amber-400 cursor-pointer select-none">
                Generate Quotation (Estimate Only)
              </label>
            </div>

            <div class="${isRetail ? 'grid-cols-1' : 'grid-cols-2'} grid gap-3 mt-1">
              <button onclick="checkout()" id="checkout-btn"
                class="py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-lg shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-40 h-14">
                ✅ Place Order
              </button>
              <button onclick="sendToKitchen()" id="kitchen-btn"
                class="${isRetail ? 'hidden' : 'flex'} py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm shadow-lg shadow-orange-500/20 transition-all disabled:opacity-40 items-center justify-center h-14">
                👨‍🍳 Kitchen
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Orders View (Hidden by default) -->
      <div id="pos-orders-container" class="hidden">
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[70vh]">
          <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h3 class="font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-sm">📋</span>
              Active Orders
            </h3>
            <div class="flex items-center gap-3">
              <div class="relative">
                <input type="text" id="pos-orders-search" oninput="renderPOSOrders()" placeholder="Search Order ID..." class="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-indigo-500 w-40 transition-all" />
                <svg class="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <select id="pos-orders-type-filter" onchange="renderPOSOrders()" class="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all">
                <option value="">All Types</option>
                <option value="dine_in">Dine-in</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
              </select>
              <button onclick="renderPOSOrders()" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400 transition-all active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/50">
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Table / Details</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Waiter</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="pos-orders-table-body">
                <tr>
                  <td colspan="7" class="px-4 py-20 text-center text-slate-400">
                    <div class="animate-pulse">Loading orders...</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  // Track current order type state
  window._posOrderType = isRetail ? 'takeaway' : 'dine_in';

  if (isRetail) {
    switchOrderType('takeaway');
  }

  // Input listener for pos-customer (legacy compatibility)
  const posCustomerInput = $c('pos-customer-input-compat');
  if (posCustomerInput) {
    posCustomerInput.addEventListener('input', function () {
      searchPOSCustomers(this.value);
      syncPOSCustomerManualEntry();
    });
  }

  const mainProducts = products.filter((p) => p.is_component !== 1);
  renderPOSProducts(mainProducts);
}

function switchOrderType(type) {
  window._posOrderType = type;
  ['dine_in', 'takeaway', 'delivery', 'orders'].forEach(t => {
    const btn = $c(`otype-${t}`);
    if (!btn) return;
    if (t === type) {
      btn.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm transition-all';
    } else {
      btn.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
    }
  });

  const dineEl = $c('pos-dine-fields');
  const deliveryEl = $c('pos-delivery-fields');
  const takeawayEl = $c('pos-takeaway-fields');
  const contentGrid = $c('pos-content-grid');
  const ordersContainer = $c('pos-orders-container');

  const isRetail = (currentUser && currentUser.shop_type === 'retail');

  if (type === 'orders') {
    if (contentGrid) contentGrid.classList.add('hidden');
    if (ordersContainer) ordersContainer.classList.remove('hidden');
    renderPOSOrders();
  } else {
    if (contentGrid) contentGrid.classList.remove('hidden');
    if (ordersContainer) ordersContainer.classList.add('hidden');
    if (dineEl) dineEl.classList.toggle('hidden', type !== 'dine_in' || isRetail);
    if (deliveryEl) deliveryEl.classList.toggle('hidden', type !== 'delivery' || isRetail);
    if (takeawayEl) takeawayEl.classList.toggle('hidden', type !== 'takeaway' || isRetail);
  }
}

async function renderPOSOrders() {
  const tbody = $c('pos-orders-table-body');
  if (!tbody) return;

  const searchQuery = $c('pos-orders-search')?.value || '';
  const typeFilter = $c('pos-orders-type-filter')?.value || '';

  try {
    const sales = await api('/api/sales');
    // Show active orders (pending, preparing, ready) but hide fully completed ones
    let filteredOrders = (sales || []).filter(s => s.order_status !== 'completed');

    if (typeFilter) {
      filteredOrders = filteredOrders.filter(o => o.order_type === typeFilter);
    }

    if (searchQuery) {
      filteredOrders = filteredOrders.filter(o => String(o.id).includes(searchQuery));
    }

    filteredOrders = filteredOrders.slice(0, 50);

    _posActiveOrders = filteredOrders;

    if (filteredOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-20 text-center text-slate-400">No active orders found</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredOrders.map(s => {
      const date = new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const typeLabel = s.order_type === 'dine_in' ? '🍽️ Dine-in' : s.order_type === 'takeaway' ? '🛍️ Takeaway' : '🚚 Delivery';
      const detail = s.order_type === 'dine_in' ? `Table: ${s.table_number || 'N/A'}` : s.customer_name || 'Walk-in';

      let statusColor = 'bg-slate-100 text-slate-600';
      if (s.order_status === 'pending') statusColor = 'bg-amber-100 text-amber-600';
      if (s.order_status === 'preparing') statusColor = 'bg-blue-100 text-blue-600';
      if (s.order_status === 'ready') statusColor = 'bg-emerald-100 text-emerald-600';

      return `
        <tr class="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
          <td class="px-4 py-4 font-bold text-slate-900 dark:text-white text-sm">#${s.id}</td>
          <td class="px-4 py-4 text-xs font-bold text-slate-500">${typeLabel}</td>
          <td class="px-4 py-4">
            <div class="text-sm font-black text-slate-700 dark:text-slate-200">${detail}</div>
          </td>
          <td class="px-4 py-4 text-xs font-bold text-slate-500">
            ${s.waiter_name || '-'}
          </td>
          <td class="px-4 py-4">
            <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusColor}">
              ${s.order_status}
            </span>
          </td>
          <td class="px-4 py-4 font-black text-slate-900 dark:text-white text-sm">PKR ${Number(s.total).toLocaleString()}</td>
          <td class="px-4 py-4 text-xs font-medium text-slate-400">${date}</td>
          <td class="px-4 py-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="showOrderPrintModal(${s.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase hover:bg-slate-200 transition-all">
                Print
              </button>
              ${s.order_status !== 'pending' ? `
              <button onclick="completeOrderFromPOS(${s.id})" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-[10px] uppercase hover:bg-emerald-600 transition-all shadow-sm">
                Complete
              </button>
              ` : `
              <button disabled class="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 font-bold text-[10px] uppercase cursor-not-allowed">
                Complete
              </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-20 text-center text-rose-500">Failed to load orders: ${e.message}</td></tr>`;
  }
}

async function completeOrderFromPOS(id) {
  if (!confirm('Are you sure you want to complete this order and move it to sales history?')) return;
  try {
    await api(`/api/kds/${id}/status`, 'PATCH', { status: 'completed' });
    toast('Order completed!');
    renderPOSOrders();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showOrderPrintModal(id) {
  const s = _posActiveOrders.find(o => o.id === id);
  if (!s) return toast('Order not found', 'error');

  const name = s.customer_name || '';
  const phone = s.customer_phone || '';
  const method = s.payment_method || 'cash';
  const received = s.amount_received || s.total;
  const total = s.total;

  openModal('Order Payment Details', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Customer Name</label>
          <input id="op-name" type="text" placeholder="Customer name" value="${name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
          <input id="op-phone" type="text" placeholder="Phone" value="${phone}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
          <select id="op-method" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold">
            <option value="cash" ${method === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="card" ${method === 'card' ? 'selected' : ''}>Card</option>
            <option value="online" ${method === 'online' ? 'selected' : ''}>Online Transfer</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Amount Received</label>
          <input id="op-received" type="number" step="0.01" value="${received}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
        </div>
      </div>
      <div class="pt-2">
        <div class="flex justify-between text-sm mb-2 px-1">
          <span class="text-slate-500 font-bold">Order Total:</span>
          <span class="text-slate-900 dark:text-white font-black">PKR ${total.toLocaleString()}</span>
        </div>
        <button onclick="updateAndPrintOrder(${id})" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg shadow-indigo-600/25 transition-all">
          🖨️ Update & Print Receipt
        </button>
      </div>
    </div>
  `, 'max-w-md');
}

async function updateAndPrintOrder(id) {
  const nameEl = $c('op-name');
  if (!nameEl) return;

  const data = {
    customer_name: nameEl.value.trim(),
    customer_phone: $c('op-phone').value.trim(),
    payment_method: $c('op-method').value,
    amount_received: parseFloat($c('op-received').value) || 0
  };

  try {
    await api(`/api/sales/${id}/details`, 'PATCH', data);
    toast('Order details updated!');
    closeModal();
    printBill(id);
    renderPOSOrders();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function filterPOSByCategory(cat) {
  document.querySelectorAll('.cat-pill').forEach(pill => {
    const isActive = (!cat && !pill.dataset.cat) || pill.dataset.cat === cat;
    pill.className = isActive
      ? 'cat-pill active px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border border-transparent transition-all'
      : 'cat-pill px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all';
  });
  const filtered = cat
    ? allProducts.filter(p => p.is_component !== 1 && p.category === cat)
    : allProducts.filter(p => p.is_component !== 1);
  renderPOSProducts(filtered);
}

function onPosFloorChange() {
  const floorId = $c('pos-floor').value;
  const tableSelect = $c('pos-table');
  if (!tableSelect) return;

  const filteredTables = floorId
    ? _posAllTables.filter(t => t.floor_id == floorId)
    : _posAllTables;

  tableSelect.innerHTML = `
    <option value="">-- Select Table --</option>
    ${filteredTables.map(t => `<option value="${t.id}">${t.table_number} (${t.status})</option>`).join('')}
  `;
}

function renderPOSProducts(products) {
  const el = $c("pos-products");
  el.innerHTML =
    products
      .map(
        (p) => `
    <button onclick="addToCart(${p.id})" ${(p.stock === 0 && !(p.ingredients && p.ingredients.length > 0)) ? "disabled" : ""}
      class="product-card bg-white dark:bg-slate-900 rounded-2xl text-left flex flex-col ${(p.stock === 0 && !(p.ingredients && p.ingredients.length > 0)) ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:shadow-xl hover:-translate-y-1"} transition-all overflow-hidden">
      ${p.image_url
            ? `<div class="relative w-full h-28 overflow-hidden">
            <img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <span class="absolute bottom-2 left-3 text-white font-bold text-sm uppercase tracking-tight leading-tight drop-shadow">${p.name}</span>
           </div>`
            : ''
          }
      <div class="p-4 flex-1 flex flex-col justify-between">
        ${p.image_url ? '' : `<h2 class="text-lg font-medium text-slate-900 dark:text-white uppercase tracking-tight mb-1 truncate">${p.name}</h2>`}

        <!-- Brand + SKU -->
        <div>
          <div class="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400 mb-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span class="text-xs font-semibold">${p.brand_name || "No Brand"}</span>
          </div>
          <div class="inline-flex items-center px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-800 mb-3">
            <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mr-1.5">SKU:</span>
            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">${p.sku}</span>
          </div>
        </div>

        <!-- Price + Stock -->
        <div class="mt-auto space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Selling Price</span>
              <span class="text-lg font-black text-indigo-600 dark:text-indigo-400">Rs. ${p.selling_price}</span>
            </div>
            <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            </div>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              ${(p.ingredients && p.ingredients.length > 0) ? "Status" : "In Stock"}
            </span>
            ${(p.ingredients && p.ingredients.length > 0)
            ? `<span class="text-xs font-black text-amber-500 uppercase">🍳 Recipe</span>`
            : (p.components && p.components.length > 0)
              ? `
                 <div class="flex flex-col items-end">
                    <div class="flex items-baseline gap-1">
                       <span class="text-sm font-black ${p.stock > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-500"}">${p.stock}</span>
                       <span class="text-[8px] font-bold text-slate-400 uppercase">Units</span>
                    </div>
                    <div class="flex flex-wrap justify-end gap-x-2 gap-y-0.5 mt-0.5">
                      ${p.components.map(c => `
                        <div class="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                          <span class="text-indigo-500">${c.stock || 0}</span>
                          <span class="text-[8px] text-slate-400">${c.name}</span>
                        </div>
                      `).join('')}
                    </div>
                 </div>
                 `
              : `<span class="text-sm font-black ${p.stock > 10 ? "text-emerald-600 dark:text-emerald-400" : p.stock > 0 ? "text-amber-600 dark:text-amber-500" : "text-rose-600 dark:text-rose-500"}">${p.stock}</span>`
          }
          </div>
        </div>
      </div>
    </button>`,
      )
      .join("") ||
    '<p class="text-slate-500 dark:text-slate-400 col-span-3 py-10 text-center italic text-lg">No products matched your search.</p>';
}

var filterPOSProducts = debounce(() => {
  const q = $c("pos-search").value.toLowerCase();
  renderPOSProducts(
    allProducts.filter(
      (p) =>
        !p.is_component &&
        (p.name.toLowerCase().includes(q) ||
          (p.brand_name || "").toLowerCase().includes(q)),
    ),
  );
});

/**
 * Prompts user for quantity and selling price before adding to cart
 */
function addToCart(productId) {
  const product = productMap[productId];
  if (!product) return;
  const isRecipe = product.ingredients && product.ingredients.length > 0;
  if (!isRecipe && product.stock <= 0) return toast("Out of stock", "error");

  // COMPOSITE PRODUCTS STILL NEED MODAL
  if (product.components && product.components.length > 0) {
    const compRows = product.components
      .map((c) => {
        const child = productMap[c.id];
        const looseStock = child ? child.stock : 0;
        const isOutOfStock = looseStock <= 0;
        const price = c.price || 0;

        return `
      <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 px-2 -mx-2 rounded-xl transition-all">
        <div class="flex flex-col flex-1">
          <span class="text-xs font-bold text-slate-700 dark:text-slate-200">${c.name}</span>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">${c.quantity} per kit</span>
            <span class="text-[9px] font-medium text-slate-400 italic">| Rs. ${price}</span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex flex-col items-end">
            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">In Bin</span>
            <span class="text-xs font-black ${isOutOfStock ? "text-rose-500" : "text-emerald-500"}">
              ${looseStock}
            </span>
          </div>

          <button onclick="sellPartModally(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${price}, ${product.id}, ${c.quantity})"
            class="px-3 py-1.5 rounded-xl ${isOutOfStock ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 border-amber-100" : "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 border-indigo-100"} text-[10px] font-bold hover:scale-105 transition-all border shadow-sm flex items-center gap-1.5">
            ${isOutOfStock ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Harvest & Sell' : "Sell Part"}
          </button>
        </div>
      </div>
    `;
      })
      .join("");

    const content = `
      <div class="space-y-6">
        <div class="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
          <div class="flex items-center gap-4 mb-3">
             <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
             </div>
             <div>
                <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-tight">${product.name}</h4>
                <div class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Full Product Composition</div>
             </div>
          </div>
          
          <div id="composite-stock-sum" class="p-3 mb-2 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-indigo-100 dark:border-indigo-800/50 flex gap-6">
             <div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Complete Units</div>
                <div class="text-xl font-black text-indigo-600 dark:text-indigo-400">${product.stock}</div>
             </div>
             <div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Current Loose</div>
                <div class="text-xl font-black text-amber-500">
                   ${(() => {
        const c = product.components[0];
        const child = productMap[c.id];
        if (!child || child.stock <= 0) return '0';

        const looseUnits = Math.ceil(child.stock / c.quantity);
        const remnant = child.stock % c.quantity;
        return `${looseUnits} <span class="text-[10px] font-black opacity-60">(${remnant || c.quantity} pcs left)</span>`;
      })()}
                </div>
             </div>
          </div>

          <p class="text-[11px] text-indigo-700/70 dark:text-indigo-300/60 leading-relaxed italic">This product is a bundle. Selling it will automatically deduct all components listed below from the inventory in the quantities specified.</p>
        </div>

        <div class="space-y-1">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-1 h-1 rounded-full bg-slate-400"></span> Components Breakdown
          </div>
          <div class="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            ${compRows}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div class="space-y-1.5">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Sell Quantity</label>
            <input id="add-cart-qty" type="number" value="1" min="1" ${isRecipe ? '' : `max="${product.stock}"`} class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Bundle Price (Rs)</label>
            <input id="add-cart-price" type="number" value="${product.selling_price || 0}" min="0" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
        </div>

        <div class="flex flex-col gap-2 pt-2">
        
          <button onclick="commitAddCart(${product.id})" class="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2">
             <span>Add Full Product to Cart</span>
             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          </button>
        </div>
      </div>
    `;
    openModal("Composite Product breakdown", content, "max-w-md");
    setTimeout(() => $c("add-cart-qty").focus(), 100);
    return;
  }

  // STANDARD MODAL FOR REGULAR PRODUCTS
  const content = `
    <div class="space-y-4 py-1">
      <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
        <div class="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div class="font-bold text-slate-900 dark:text-white">${product.name}</div>
          <div class="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 mt-0.5">
            SKU: ${product.sku} | ${isRecipe ? '🍳 Recipe-Based' : `In Stock: ${product.stock}`}
            ${product.batches && product.batches.length > 0 ? `<br/><span class="text-rose-500 font-bold uppercase">Cost: Rs. ${product.batches[0].buying_price}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Quantity</label>
          <div class="flex items-center gap-2">
            <button type="button" onclick="$c('add-cart-qty').stepDown()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">-</button>
            <input id="add-cart-qty" type="number" value="1" min="1" ${isRecipe ? '' : `max="${product.stock}"`} class="flex-1 w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            <button type="button" onclick="$c('add-cart-qty').stepUp()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">+</button>
          </div>
        </div>
        <div class="space-y-2">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Selling Price (Rs)</label>
          <input id="add-cart-price" type="number" value="${product.selling_price || 0}" min="0" class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
        </div>
      </div>

      <div class="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold transition-all">Cancel</button>
        <button onclick="commitAddCart(${productId})" class="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all">Add to Cart</button>
      </div>
    </div>
  `;
  openModal("Add to Cart", content, "max-w-xl");
  setTimeout(() => $c("add-cart-qty").focus(), 100);
}

function commitAddCart(productId) {
  const qtyInput = $c("add-cart-qty");
  const priceInput = $c("add-cart-price");
  const qty = parseInt(qtyInput.value);
  const price = parseFloat(priceInput.value);
  const product = allProducts.find((p) => p.id === productId);

  if (isNaN(qty) || qty <= 0) return toast("Invalid quantity", "error");
  if (isNaN(price) || price <= 0)
    return toast("Selling price must be greater than 0", "error");
  const isRecipe = product.ingredients && product.ingredients.length > 0;

  if (!isRecipe) {
    if (qty > product.stock)
      return toast(`Only ${product.stock} items available`, "error");

    const existing = cart.find((c) => c.product_id === productId);
    if (existing) {
      if (existing.quantity + qty > product.stock)
        return toast("Exceeds available stock", "error");
      existing.quantity += qty;
      existing.selling_price = price;
    } else {
      addToCartObject();
    }
  } else {
    // Recipe item bypasses stock checks
    const existing = cart.find((c) => c.product_id === productId);
    if (existing) {
      existing.quantity += qty;
      existing.selling_price = price;
    } else {
      addToCartObject();
    }
  }

  function addToCartObject() {
    const defaultBatch = (product.batches && product.batches.length > 0) ? product.batches[0].id : null;
    cart.push({
      product_id: productId,
      quantity: qty,
      selling_price: price,
      product,
      batch_id: defaultBatch
    });
  }

  closeModal();
  renderCart();
  toast("Item added to cart", "success");
}

async function commitAddManualCart(name, price, parentId) {
  // Function logic improved and moved to commitSellPart
  sellPartModally(name, price, parentId, 1);
}

function sellPartModally(id, name, price, parentId, qtyInParent) {
  const parent = productMap[parentId];
  const content = `
    <div class="space-y-6">
      <div class="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
        <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-tight">${name}</h4>
        <div class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Selling from: ${parent.name}</div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</label>
          <input id="part-sell-qty" type="number" value="1" min="1" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white outline-none" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Price (Rs)</label>
          <input id="part-sell-price" type="number" value="${price}" min="0" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white outline-none" />
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs">Cancel</button>
        <button onclick="commitSellPart(${id}, '${name.replace(/'/g, "\\'")}', ${parentId}, ${qtyInParent})" class="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs">
           Add Component to Cart
        </button>
      </div>
    </div>
  `;
  openModal("Sell Individual Component", content, "max-w-sm");
  setTimeout(() => $c("part-sell-qty").focus(), 100);
}

async function commitSellPart(id, name, parentId, qtyInParent) {
  const qty = parseInt($c("part-sell-qty").value);
  const price = parseFloat($c("part-sell-price").value);
  if (isNaN(qty) || qty <= 0) return toast("Invalid quantity", "error");

  let product = productMap[id];
  const parent = productMap[parentId];
  const currentStock = product ? product.stock : 0;

  // SMART HARVESTING LOGIC
  const neededStock = qty - currentStock;
  if (neededStock > 0) {
    const buildsToHarvest = Math.ceil(neededStock / qtyInParent);
    if (parent.stock < buildsToHarvest) {
      return toast(
        `Error: Even after breaking ${parent.stock} units of "${parent.name}", you only have ${currentStock + parent.stock * qtyInParent} pieces of "${name}" available.`,
        "error",
      );
    }

    try {
      toast(
        `Auto-harvesting ${buildsToHarvest} units of "${parent.name}"...`,
        "info",
      );
      const r = await api(`/api/products/${parentId}/harvest`, "POST", {
        count: buildsToHarvest,
      });
      if (r.error) return toast(r.error, "error");

      // Refresh local data
      allProducts = await api("/api/products");
      syncProductMap(allProducts); // Critical to update the map for child/parent links
      product = productMap[id];
      toast(`Successfully harvested ${name} from ${parent.name}`, "success");
    } catch (err) {
      return toast("Auto-harvest failed: " + err.message, "error");
    }
  }

  const productId = product ? product.id : null;
  // Key cart check: matches name AND parentId to keep rows distinct if needed
  const existing = cart.find(
    (c) =>
      (productId && c.product_id === productId && c.parent_id === parentId) ||
      (c.name === name && c.parent_id === parentId),
  );

  if (existing) {
    existing.quantity += qty;
    existing.selling_price = price;
  } else {
    // Default to first available batch
    const defaultBatch = (product && product.batches && product.batches.length > 0) ? product.batches[0].id : null;
    cart.push({
      product_id: productId,
      parent_id: parentId,
      name: name,
      quantity: qty,
      selling_price: price,
      product: product,
      batch_id: defaultBatch
    });
  }

  closeModal();
  renderCart();
  toast(`"${name}" added to cart`, "success");
}

async function harvestBuild(id) {
  try {
    const r = await api(`/api/products/${id}/harvest`, "POST");
    if (r.error) return toast(r.error, "error");
    toast("Build broken down into components!", "success");
    closeModal();
    renderProducts();
    renderPOS();
  } catch (err) {
    toast(err.message, "error");
  }
}

function updateCartQty(productId, qty) {
  const product = productMap[productId];
  const isRecipe = product.ingredients && product.ingredients.length > 0;
  if (!isRecipe && product && qty > product.stock) return toast("Exceeds stock", "error");

  // Don't allow qty < 1. User must use delete button to remove.
  if (qty < 1) return toast("Quantity cannot be less than 1", "warning");

  const item = cart.find((c) => c.product_id === productId);
  if (item) item.quantity = qty;

  renderCart();
}

function updateCartBatch(productId, batchId) {
  const item = cart.find((c) => c.product_id === productId);
  if (!item) return;
  item.batch_id = parseInt(batchId);
}

function removeFromCart(productId) {
  cart = cart.filter((c) => c.product_id !== productId);
  renderCart();
}

function renderCart() {
  const cartEl = $c("cart-items");

  if (!cart.length) {
    cartEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 opacity-30">
        <svg class="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        <p class="text-[10px] font-black uppercase tracking-widest">Cart is Empty</p>
      </div>`;
    calculateCartTotal();
    return;
  }

  cartEl.innerHTML = `
    <div class="space-y-2 mb-3">
      ${cart.map(item => `
        <div class="group relative grid grid-cols-10 items-center gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 transition-all overflow-hidden">
          <!-- Image -->
          <div class="col-span-1 w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 overflow-hidden">
             ${(item.product && item.product.image_url)
      ? `<img src="${item.product.image_url}" class="w-full h-full object-cover" />`
      : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
    }
          </div>

          <!-- Name -->
          <div class="col-span-4 min-w-0">
             <div class="text-[11px] font-black text-slate-900 dark:text-white truncate">${item.product?.name || item.name}</div>
          </div>

          <!-- Price -->
          <div class="col-span-2 text-right">
             <div class="text-[10px] font-black text-indigo-600 dark:text-indigo-400">Rs. ${item.selling_price}</div>
          </div>

          <!-- Quantity -->
          <div class="col-span-2 flex items-center justify-center gap-1 bg-slate-50 dark:bg-slate-800 p-0.5 rounded-lg">
            <button onclick="updateCartQty(${item.product_id}, ${item.quantity - 1})" class="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-500 transition-all font-bold">-</button>
            <span class="w-4 text-center text-[10px] font-black">${item.quantity}</span>
            <button onclick="updateCartQty(${item.product_id}, ${item.quantity + 1})" class="w-6 h-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-700 text-slate-500 transition-all font-bold group-hover:shadow-sm">+</button>
          </div>

          <!-- Delete -->
          <div class="col-span-1 flex justify-end">
            <button onclick="removeFromCart(${item.product_id})" class="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all shadow-sm" title="Remove Item">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
    <button onclick="showCartModal()" class="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 shadow-inner">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
      Expand Cart Management
    </button>`;

  calculateCartTotal();
}

/**
 * Opens a large modal to manage cart items details (useful for long carts)
 */
function showCartModal() {
  if (!cart.length) return toast("Cart is empty", "info");

  const content = `
    <div class="max-h-[65vh] overflow-y-auto custom-scrollbar pr-2">
      <table class="w-full text-left border-collapse">
        <thead class="sticky top-0 bg-white dark:bg-slate-900 z-10">
          <tr class="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-extrabold tracking-widest border-b border-slate-100 dark:border-slate-800">
            <th class="py-3 px-2">Product Info</th>
            <th class="py-3 px-2">Unit Price</th>
            <th class="py-3 px-2 text-center">Quantity</th>
            <th class="py-3 px-2 text-right">Total</th>
            <th class="py-3 px-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
          ${cart
      .map(
        (item) => `
            <tr class="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
              <td class="py-2 px-2">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-110">
                    ${(item.product && item.product.image_url)
            ? `<img src="${item.product.image_url}" class="w-full h-full object-cover" />`
            : `<svg class="w-6 h-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
          }
                  </div>
                  <div>
                    <div class="font-bold text-slate-800 dark:text-slate-200 leading-tight">${item.product ? item.product.name : item.name}</div>
                ${item.product && item.product.batches && item.product.batches.length > 1
            ? `
                  <div class="mt-2">
                    <label class="text-[9px] uppercase font-bold text-slate-400 block mb-1">Select Batch (Cost)</label>
                    <select onchange="updateCartBatch(${item.product_id}, this.value)" class="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 font-bold text-indigo-600 dark:text-indigo-400">
                      ${item.product.batches.map(b => `<option value="${b.id}" ${item.batch_id == b.id ? 'selected' : ''}>Cost: Rs. ${b.buying_price} (Qty: ${b.quantity})</option>`).join('')}
                    </select>
                  </div>
                `
            : (item.product && item.product.batches && item.product.batches.length === 1)
              ? `<div class="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Cost: Rs. ${item.product.batches[0].buying_price}</div>`
              : ''
          }
                ${item.parent_id
            ? `
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded tracking-widest uppercase">Kit Component</span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic">From: ${productMap[item.parent_id]?.name || "Unknown"}</span>
                  </div>
                `
            : `
                  <div class="text-[10px] font-mono text-slate-400 dark:text-indigo-400 mt-0.5">${item.product ? item.product.sku : "MANUAL ITEM"}</div>
                `
          }
                  </div>
              </td>
              <td class="py-2 px-2 text-slate-600 dark:text-slate-400 font-medium">Rs. ${item.selling_price}</td>
              <td class="py-2 px-2">
                <div class="flex items-center justify-center gap-3">
                  <button onclick="if(${item.quantity} > 1) { updateCartQty(${item.product_id}, ${item.quantity - 1}); showCartModal(); } else { toast('Use delete button to remove', 'info'); }"
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 transition-all font-bold group-hover:shadow-sm">−</button>
                  <span class="w-6 text-center text-sm font-black text-slate-900 dark:text-slate-100">${item.quantity}</span>
                  <button onclick="updateCartQty(${item.product_id}, ${item.quantity + 1}); showCartModal();"
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-600 dark:text-slate-400 hover:text-emerald-600 transition-all font-bold group-hover:shadow-sm">+</button>
                </div>
              </td>
              <td class="py-2 px-2 text-right font-black text-indigo-600 dark:text-indigo-400">
                Rs. ${(item.selling_price * item.quantity).toFixed(0)}
              </td>
              <td class="py-2 px-2 text-right">
                <button onclick="removeFromCart(${item.product_id}); cart.length ? showCartModal() : closeModal();"
                  class="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" title="Remove">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </td>
            </tr>
          `,
      )
      .join("")}
        </tbody>
      </table>
    </div>
    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 -mx-6 -mb-6 p-4 rounded-b-2xl">
       <div class="text-sm text-slate-500 dark:text-slate-400">Total Items: <span class="font-bold text-slate-900 dark:text-slate-100">${cart.reduce((a, b) => a + b.quantity, 0)}</span></div>
       <div class="text-xl font-black text-slate-900 dark:text-white flex items-baseline gap-2">
         <span class="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Total:</span>
         Rs. ${cart.reduce((a, b) => a + b.selling_price * b.quantity, 0).toFixed(0)}
       </div>
    </div>
  `;
  openModal("Detailed Cart Management", content, "max-w-7xl");
}

function calculateCartTotal() {
  const subtotal = cart.reduce((s, c) => s + c.selling_price * c.quantity, 0);
  const discount = parseFloat($c("pos-discount").value) || 0;
  const taxPct = parseFloat($c("pos-tax").value) || 0;

  const taxable = subtotal - discount;
  const taxAmt = taxable > 0 ? taxable * (taxPct / 100) : 0;
  const grandTotal = taxable > 0 ? taxable + taxAmt : 0;

  $c("cart-subtotal").textContent = "Rs. " + subtotal.toLocaleString();
  $c("cart-tax-amt").textContent = "Rs. " + taxAmt.toFixed(2);
  $c("cart-total").textContent = "Rs. " + grandTotal.toFixed(2);
  $c("cart-total").dataset.total = grandTotal;

  // Auto-populate received amount if it's currently 0 or matches the old total
  if (cart.length > 0) {
    const currentRecv = parseFloat($c("pos-received").value) || 0;
    if (currentRecv === 0) {
      $c("pos-received").value = grandTotal.toFixed(2);
    }
  } else {
    $c("pos-received").value = 0;
  }

  calculateRemaining();
}

function calculateRemaining() {
  const grandTotal = parseFloat($c("cart-total").dataset.total) || 0;
  const received = parseFloat($c("pos-received").value) || 0;
  const remaining = Number((grandTotal - received).toFixed(2));

  const el = $c("cart-remaining");
  const nameInp = $c("pos-cust-name");
  const phoneInp = $c("pos-cust-phone");
  const nameLabel = $c("pos-cust-name-label");
  const phoneLabel = $c("pos-cust-phone-label");

  if (remaining <= 0) {
    el.textContent = "Change: Rs. " + Math.abs(remaining).toFixed(2);
    el.className = "font-bold text-emerald-400 text-xl";
    if (nameInp) {
      nameInp.placeholder = "Optional";
      nameInp.classList.remove("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (nameLabel) nameLabel.classList.remove("text-rose-500");
    if (phoneInp) {
      phoneInp.placeholder = "Optional";
      phoneInp.classList.remove("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (phoneLabel) phoneLabel.classList.remove("text-rose-500");
  } else {
    el.textContent = "Due: Rs. " + remaining.toFixed(2);
    el.className = "font-bold text-rose-400 text-xl";
    if (nameInp) {
      nameInp.placeholder = "REQUIRED for Dues";
      nameInp.classList.add("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (nameLabel) nameLabel.classList.add("text-rose-500");
    if (phoneInp) {
      phoneInp.placeholder = "REQUIRED for Dues";
      phoneInp.classList.add("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (phoneLabel) phoneLabel.classList.add("text-rose-500");
  }
}

let _posCustSuggestTimeout = null;
async function suggestPOSCustomers(query, targetId) {
  const q = String(query || "").trim();
  const suggestionEl = document.getElementById(targetId + "-suggestions");
  if (!suggestionEl) return;

  // Hide the other one if open
  const otherId = targetId === 'pos-cust-name' ? 'pos-cust-phone' : 'pos-cust-name';
  const otherEl = document.getElementById(otherId + "-suggestions");
  if (otherEl) otherEl.classList.add("hidden");

  if (q.length < 1) {
    suggestionEl.innerHTML = "";
    suggestionEl.classList.add("hidden");
    return;
  }

  // Clear previous timeout for debouncing
  if (_posCustSuggestTimeout) clearTimeout(_posCustSuggestTimeout);

  _posCustSuggestTimeout = setTimeout(async () => {
    try {
      const customers = await api(`/api/customers?status=active&search=${encodeURIComponent(q)}`);
      const results = Array.isArray(customers) ? customers.slice(0, 5) : [];

      if (results.length === 0) {
        suggestionEl.innerHTML = "";
        suggestionEl.classList.add("hidden");
        return;
      }

      suggestionEl.innerHTML = results.map(c => {
        const balBadge = c.current_balance > 0
          ? `<span class="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[8px] font-black">DUE: RS. ${c.current_balance}</span>`
          : '';

        return `
        <button type="button" onclick="selectSuggestedCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})" 
                class="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border-b border-slate-100 dark:border-slate-800 last:border-0 flex flex-col gap-0.5">
          <div class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">${c.name}</div>
          <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>${c.phone || 'No Phone'}</span>
            ${balBadge}
          </div>
        </button>`;
      }).join("");

      suggestionEl.classList.remove("hidden");
    } catch (err) {
      console.error("Suggestion error:", err);
    }
  }, 300);
}

function selectSuggestedCustomer(c) {
  const nameInp = document.getElementById("pos-cust-name");
  const phoneInp = document.getElementById("pos-cust-phone");

  if (nameInp) nameInp.value = c.name;
  if (phoneInp) phoneInp.value = c.phone || "";

  // Hide both containers
  ['pos-cust-name-suggestions', 'pos-cust-phone-suggestions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
      el.classList.add("hidden");
    }
  });
}

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
  const nameInp = document.getElementById("pos-cust-name");
  const phoneInp = document.getElementById("pos-cust-phone");

  ['pos-cust-name-suggestions', 'pos-cust-phone-suggestions'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.contains(e.target) && e.target !== nameInp && e.target !== phoneInp) {
      el.classList.add("hidden");
    }
  });
});

function toggleQuotationMode(isQuotation) {
  const btn = $c("checkout-btn");
  if (isQuotation) {
    btn.textContent = "📑 Print Quotation";
    btn.className = btn.className.replace("from-indigo-600 to-violet-600", "from-amber-500 to-orange-600");
    btn.className = btn.className.replace("from-indigo-50 hover:from-indigo-500", "from-amber-400 hover:to-orange-500"); // safety check for Hover
  } else {
    btn.textContent = "✅ Place Order";
    btn.className = btn.className.replace("from-amber-500 to-orange-600", "from-indigo-600 to-violet-600");
  }
}


/**
 * Auto-fills Amount Received if method is Card or Online
 */
function handlePOSMethodChange(method) {
  if (method === "card" || method === "online") {
    const total = parseFloat($c("cart-total").dataset.total) || 0;
    if (total > 0) {
      $c("pos-received").value = total.toFixed(2);
      calculateRemaining();
    }
  }
}

async function checkout() {
  if (!cart.length) return toast("Cart is empty", "error");

  // CLIENT SIDE QUOTATION CHECK
  if ($c("pos-is-quotation")?.checked) {
    return generateQuotation();
  }

  const discount = parseFloat($c("pos-discount").value) || 0;
  const tax_percentage = parseFloat($c("pos-tax").value) || 0;
  const payment_method = $c("pos-method").value;
  const amount_received = parseFloat($c("pos-received").value) || 0;
  const grandTotal = parseFloat($c("cart-total").dataset.total) || 0;

  // Gather restaurant-specific fields
  const orderType = window._posOrderType || 'dine_in';
  let table_id = null, waiter_id = null, rider_id = null, kitchen_id = null, token_number = null,
    delivery_address = '', customer_name = '', customer_phone = '', guest_count = 1;

  if (orderType === 'dine_in') {
    table_id = parseInt($c('pos-table')?.value) || null;
    waiter_id = parseInt($c('pos-waiter')?.value) || null;
    guest_count = 1;
    customer_name = '';
    customer_phone = '';
  } else if (orderType === 'delivery') {
    customer_name = $c('pos-delivery-name')?.value.trim() || '';
    customer_phone = $c('pos-delivery-phone')?.value.trim() || '';
    delivery_address = $c('pos-delivery-addr')?.value.trim() || '';
    rider_id = parseInt($c('pos-rider')?.value) || null;
    if (!customer_name) return toast("Customer name required for delivery", "error");
    if (!customer_phone) return toast("Customer phone required for delivery", "error");
  } else if (orderType === 'takeaway') {
    token_number = $c('pos-token')?.value.trim() || `TK-${Date.now()}`;
    customer_name = $c('pos-takeaway-name')?.value.trim() || '';
  }

  // Common field for all restaurant types
  kitchen_id = parseInt($c('pos-kitchen')?.value) || null;

  // Unified Customer Details (override if set in the new sidebar fields)
  const sidebarName = $c('pos-cust-name')?.value.trim();
  const sidebarPhone = $c('pos-cust-phone')?.value.trim();
  if (sidebarName) customer_name = sidebarName;
  if (sidebarPhone) customer_phone = sidebarPhone;

  // Validation for Pending Dues
  if (amount_received < grandTotal - 0.01) {
    if (!customer_name || !customer_phone) {
      $c('pos-cust-name').focus();
      return toast("Customer Name & Phone are REQUIRED for Pending Dues", "error");
    }
  }

  // Legacy credit validation: only apply for dine-in
  if (orderType === 'dine_in') {
    const legacy_name = $c('pos-customer') ? $c('pos-customer').value.trim() : '';
    const legacy_phone = $c('pos-phone') ? $c('pos-phone').value.trim() : '';
    if (amount_received < grandTotal - 0.01 && (!legacy_name || !legacy_phone)) {
      // Allow if customer not required in restaurant mode
    }
  }

  const btn = $c("checkout-btn");
  btn.disabled = true;
  btn.textContent = "Processing…";

  const payload = {
    items: cart.map((c) => ({
      product_id: c.product_id,
      parent_id: c.parent_id || null,
      name: c.name || null,
      quantity: c.quantity,
      selling_price: c.selling_price,
      special_instructions: c.special_instructions || null,
      variants: c.variants || null,
      addons: c.addons || null,
    })),
    discount,
    tax_percentage,
    payment_method,
    amount_received,
    customer_name,
    customer_phone,
    delivery_address,
    order_type: orderType,
    table_id,
    waiter_id,
    rider_id,
    kitchen_id,
    guest_count,
    token_number,
  };

  try {
    const r = await api("/api/sales", "POST", payload);
    if (r.error) {
      toast(r.error, "error");
      btn.disabled = false;
      btn.textContent = "✅ Place Order";
      return;
    }
    toast("Order placed! Rs. " + r.total);
    openModal(
      "Order Placed!",
      `
      <div class="text-center space-y-4">
        <div class="text-5xl">🎉</div>
        <p class="text-slate-300">Order #${r.saleId} — <span class="text-emerald-400 font-bold">Rs. ${r.total.toFixed(2)}</span></p>
        ${orderType === 'takeaway' ? `<p class="text-amber-400 font-bold text-lg">Token: ${token_number}</p>` : ''}
        <div class="flex gap-3">
          <button onclick="printBill(${r.saleId})" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">🖨 Print Bill</button>
          <button onclick="closeModal();renderPOS();" class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all">New Order</button>
        </div>
      </div>`,
      "max-w-xl",
      true,
    );
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.textContent = "✅ Place Order";
  }
}

async function sendToKitchen() {
  if (!cart.length) return toast("Add items to the order first", "error");
  toast("Order sent to kitchen! Placing order...");
  checkout();
}

async function printBill(saleId) {
  const data = await api(`/api/sales/${saleId}/bill`);
  const { sale, items, seller, shop } = data;

  const grandTotal = Number(sale.total);
  const discount = Number(sale.discount || 0);
  const taxPct = Number(sale.tax_percentage || 0);
  const methodMap = {
    'cash': 'Cash',
    'card': 'Card',
    'online': 'Online Transfer'
  };
  const method = methodMap[sale.payment_method] || sale.payment_method?.toUpperCase() || "Cash";
  const received = Number(sale.amount_received || 0);
  const remaining = grandTotal - received;

  const subtotal = items.reduce((s, i) => s + i.quantity * i.price_at_sale, 0);
  const taxAmt = (subtotal - discount) * (taxPct / 100);
  const groupedItems = items; // Simply use items from backend response

  // Typography settings
  const headerFontSize = shop?.header_font_size || 18;
  const headerFontWeight = shop?.header_font_weight || "bold";
  const headerSpacing = shop?.header_spacing || 10;
  const contactFontSize = shop?.contact_font_size || 10;
  const contactAlign = shop?.contact_align || "center";
  const contactPadding = shop?.contact_padding || 10;
  const footerFontSize = shop?.footer_font_size || 9;
  const footerFontStyle = shop?.footer_font_style || "normal";
  const footerMargin = shop?.footer_margin || 10;
  const dividerStyle = shop?.divider_style || "dashed";
  const dividerWidth = shop?.divider_width || 1;
  const sectionGap = shop?.section_gap || 10;
  const dividerCss = dividerStyle === "none" ? "none" : `${dividerWidth}px ${dividerStyle} #000`;

  // Build receipt header based on settings
  let headerHtml = "";
  const useLogo = shop?.use_logo_on_receipt && shop?.logo_path;
  const useText = shop?.use_text_on_receipt !== false; // Default true
  const headerText = shop?.receipt_header_text || shop?.name || "STORE";

  if (useLogo) {
    headerHtml += `<div style="margin-bottom: ${headerSpacing}px;"><img src="${shop.logo_path}" style="max-width: 60mm; max-height: 22mm; margin: 0 auto; display: block;" alt="${headerText}"></div>`;
  }
  if (useText) {
    headerHtml += `<h1 style="font-size: ${headerFontSize}px; font-weight: ${headerFontWeight}; margin: 0; text-transform: uppercase; text-align: center;">${headerText}</h1>`;
  }
  if (shop?.receipt_extended_name) {
    const extFontSize = shop.extended_name_font_size || 10;
    const extFontWeight = shop.extended_name_font_weight || "normal";
    const extSpacing = shop.extended_name_spacing || 2;
    headerHtml += `<div style="font-size: ${extFontSize}px; font-weight: ${extFontWeight}; margin-top: ${extSpacing}px; text-align: center; text-transform: none;">${shop.receipt_extended_name}</div>`;
  }

  // Build contact details section
  let contactHtml = "";
  if (shop?.receipt_phone || shop?.receipt_address) {
    contactHtml = `<div style="font-size: ${contactFontSize}px; margin-top: 5px; text-align: ${contactAlign}; border-bottom: ${dividerCss}; padding-bottom: ${contactPadding}px;">`;
    if (shop.receipt_phone) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${shop.receipt_phone}</div>`;
    if (shop.receipt_address) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${shop.receipt_address}</div>`;
    contactHtml += `</div>`;
  }

  // Build promotional images section
  let promoImagesHtml = "";
  if (shop?.receipt_images && shop.receipt_images.length > 0) {
    promoImagesHtml = `<div style="margin-top: ${sectionGap}px; border-top: ${dividerCss}; padding-top: ${sectionGap}px;">`;
    shop.receipt_images.forEach((img) => {
      promoImagesHtml += `<img src="${img.path}" style="max-width: 70mm; max-height: 25mm; margin: 3px auto; display: block;" alt="${img.description || ""}">`;
      if (img.description) {
        promoImagesHtml += `<div style="font-size: ${footerFontSize}px; text-align: center; margin-top: 2px;">${img.description}</div>`;
      }
    });
    promoImagesHtml += `</div>`;
  }

  // Build footer/policies section
  let footerHtml = `<div class="footer text-center">`;
  if (shop?.receipt_policies) {
    // Convert newlines to <br>
    const policies = shop.receipt_policies.replace(/\n/g, "<br>");
    footerHtml += `<div style="font-size: ${footerFontSize}px; font-style: ${footerFontStyle}; margin: ${footerMargin}px 0; white-space: pre-wrap;">${policies}</div>`;
  }
  footerHtml += `<div style="font-size: ${parseInt(footerFontSize) + 1}px; margin-top: ${footerMargin}px;">Thank you for your purchase!</div>`;
  if (shop?.name && !useLogo) {
    footerHtml += `<div style="font-size: ${parseInt(footerFontSize) + 1}px;">${shop.name}</div>`;
  }
  footerHtml += `</div>`;

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Bill #${sale.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'bit array-a2';
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot');
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot?#iefix') format('embedded-opentype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff2') format('woff2'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff') format('woff'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.ttf') format('truetype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.svg#BIT') format('svg');
      font-weight: normal;
      font-style: normal;
    }
    @page { margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f0f0f0;
    }
    .receipt {
      font-family: ${shop?.receipt_font_family || "'Courier New', Courier, monospace"};
      width: 80mm;
      margin: 0 auto;
      padding: 4mm;
      color: #000;
      font-size: 12px;
      line-height: 1.2;
      background: #fff;
      min-height: 100vh;
      box-sizing: border-box;
    }
    @media print {
      html, body { background: #fff; }
      .receipt { margin: 0; width: 100%; min-height: auto; }
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
    h2 { font-size: 14px; margin: 2px 0; }
    .divider { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
    td { padding: 3px 0; vertical-align: top; }
    .total-row { font-size: 14px; }
    .footer { font-size: 10px; margin-top: 10px; }
  </style></head><body>
  <div class="receipt">
    <div class="text-center">
      ${headerHtml}
      <div class="bold">Sales Receipt</div>
      ${contactHtml}
    </div>

    <hr class="divider" />

    <div style="font-size: 11px;">
      <strong>Bill #:</strong> ${sale.id}<br>
      <strong>Date:</strong> ${new Date(sale.created_at).toLocaleString()}<br>
      <strong>Seller:</strong> ${seller ? seller.name : "Staff"}<br>
      <strong>Customer:</strong> ${sale.customer_name || "Walk-in"}<br>
      ${sale.customer_phone ? `<strong>Phone:</strong> ${sale.customer_phone}<br>` : ""}
      <strong>Order Type:</strong> ${sale.order_type === 'dine_in' ? 'Dine-in' : sale.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}<br>
    </div>

    <hr class="divider" />

    <table>
      <thead>
        <tr>
          <th style="width: 50%;">Item</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${groupedItems
      .map(
        (i) => `
          <tr>
            <td>${i.product_name}</td>
            <td class="text-center">${i.quantity}</td>
            <td class="text-right">${i.price_at_sale}</td>
            <td class="text-right">${(i.quantity * i.price_at_sale).toFixed(0)}</td>
          </tr>
        `,
      )
      .join("")}
      </tbody>
    </table>

    <hr class="divider" />

    <div class="text-right">
      <div>Subtotal: Rs. ${subtotal.toFixed(0)}</div>
      ${discount > 0 ? `<div>Discount: -Rs. ${discount.toFixed(0)}</div>` : ""}
      ${taxPct > 0 ? `<div>Tax (${taxPct}%): Rs. ${taxAmt.toFixed(0)}</div>` : ""}
      <div class="bold total-row" style="margin-top: 4px;">GRAND TOTAL: Rs. ${grandTotal.toFixed(0)}</div>
    </div>

    <hr class="divider" />

    <div style="font-size: 11px;">
      <div><strong>Method:</strong> ${method}</div>
      <div><strong>Received:</strong> Rs. ${received.toFixed(0)}</div>
      ${remaining > 0 ? `<div class="bold"><strong>Due:</strong> Rs. ${remaining.toFixed(0)}</div>` : ""}
      ${remaining < 0 ? `<div class="bold"><strong>Change:</strong> Rs. ${Math.abs(remaining).toFixed(0)}</div>` : ""}
    </div>

    <hr class="divider" />

    ${promoImagesHtml}
    ${footerHtml}
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();setTimeout(()=>{if(!window.closed)window.close();},5000);}<\/script>
  </body></html>`);
  win.document.close();
}

async function returnSaleItems(saleId) {
  try {
    const data = await api(`/api/sales/${saleId}/bill`);
    const { sale, items } = data;

    const itemsHtml = items
      .map((i) => {
        const available = i.quantity - (i.returned_qty || 0);
        const isFullyReturned = available <= 0;
        return `
      <div class="p-3 ${isFullyReturned ? "opacity-50 grayscale bg-slate-100" : "bg-slate-50 dark:bg-slate-800/50"} rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <label class="flex items-center gap-3 ${isFullyReturned ? "cursor-not-allowed" : "cursor-pointer"} flex-1">
          <input type="checkbox" class="return-item-check w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" 
            data-pid="${i.product_id}" data-id="${i.id}" data-max="${available}" ${isFullyReturned ? "disabled" : ""} />
          <div class="flex flex-col">
            <p class="font-bold text-sm text-slate-800 dark:text-slate-200">${i.product_name}</p>
            <span class="text-[10px] text-slate-500 uppercase font-black">Sold: ${i.quantity} @ Rs. ${i.price_at_sale}</span>
            <span class="text-[9px] text-emerald-500 font-bold block">Cost logic ID: ${i.id} (Cost: Rs. ${i.buying_price_at_sale || 0})</span>
            ${i.returned_qty > 0 ? `<span class="text-[9px] text-rose-500 font-bold italic">Already Returned: ${i.returned_qty}</span>` : ""}
          </div>
        </label>
        <div class="flex items-center gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Qty</span>
            <input type="number" class="return-item-qty w-14 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600" 
              value="${available}" min="1" max="${available}" ${isFullyReturned ? "disabled" : ""} />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Refund/Unit</span>
            <input type="number" class="return-item-price w-16 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-600" 
              value="${i.price_at_sale}" step="0.01" ${isFullyReturned ? "disabled" : ""} />
          </div>
          <div class="flex flex-col items-center gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Damage?</span>
            <input type="checkbox" class="return-item-damage w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500" />
          </div>
        </div>
      </div>
    `;
      })
      .join("");

    openModal(
      `Return Items — Sale #${saleId}`,
      `
      <div class="space-y-4">
        <div class="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl">
           <p class="text-xs text-rose-600 dark:text-rose-400 font-medium">Select the items you wish to return. Quantities will be restocked automatically.</p>
        </div>

        <div class="space-y-2 max-h-[350px] overflow-y-auto px-1 no-scrollbar">
          ${itemsHtml}
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Refund Method</label>
          <select id="return-method" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-rose-500 text-sm font-bold text-slate-700 dark:text-slate-200">
            <option value="cash">Cash Refund</option>
            <option value="online">Bank Transfer / Online</option>
            <option value="ledger">Credit to Customer Account (Store Credit)</option>
          </select>
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Reason for Return</label>
          <textarea id="return-reason" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-rose-500 text-sm h-20 placeholder-slate-400" placeholder="Optional notes..."></textarea>
        </div>

        <div class="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button onclick="closeModal()" class="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold transition-all hover:bg-slate-200">Cancel</button>
          <button onclick="submitSaleReturn(${saleId})" class="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/20">Process Return</button>
        </div>
      </div>
    `,
      "max-w-2xl",
    );
  } catch (err) {
    toast(err.message, "error");
  }
}

async function submitSaleReturn(saleId) {
  const checkboxElements = document.querySelectorAll(
    ".return-item-check:checked",
  );
  if (checkboxElements.length === 0)
    return toast("Please select at least one item to return", "error");

  const returns = [];
  let modalError = null;

  checkboxElements.forEach((cb) => {
    const parent = cb.closest(".p-3");
    const qtyInput = parent.querySelector(".return-item-qty");
    const priceInput = parent.querySelector(".return-item-price");

    const qty = parseInt(qtyInput.value) || 0;
    const max = parseInt(cb.dataset.max);
    const refundPrice = parseFloat(priceInput.value) || 0;
    const isDamage = parent.querySelector(".return-item-damage").checked;

    if (qty <= 0) modalError = "Return quantity must be greater than zero.";
    if (qty > max)
      modalError = `Return quantity exceeds original sold amount for some items.`;

    returns.push({
      sale_item_id: parseInt(cb.dataset.id) || null,
      product_id: parseInt(cb.dataset.pid) || null,
      quantity: qty,
      refund_price: refundPrice,
      is_damage: isDamage,
    });
  });

  if (modalError) return toast(modalError, "error");

  const reason = document.getElementById("return-reason").value.trim();
  const payment_method = document.getElementById("return-method").value;

  try {
    const res = await api(`/api/sales/${saleId}/return`, "POST", {
      items: returns,
      reason,
      payment_method,
    });
    if (res.error) throw new Error(res.error);

    toast(`Return process completed. Total Refund: Rs. ${res.totalRefund}`);

    // Prompt for return receipt
    openModal("Return Complete!", `
      <div class="text-center space-y-4">
        <div class="text-5xl">✅</div>
        <p class="text-slate-300">Return processed successfully — <span class="text-rose-400 font-bold">Refund: Rs. ${res.totalRefund.toFixed(2)}</span></p>
        <div class="flex gap-3">
          <button onclick="printReturnReceipt(${res.returnId})" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">🖨 Print Return Receipt</button>
          <button onclick="closeModal();renderSalesHistory();" class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all">Back to History</button>
        </div>
      </div>
    `, "max-w-md", true);

    _renderSalesTable(); // Refresh table
    renderProducts();   // Refresh product panel stocks
  } catch (err) {
    toast(err.message, "error");
  }
}

async function printReturnReceipt(returnId) {
  const data = await api(`/api/sales/returns/${returnId}/receipt`);
  const { return: ret, items, sale, user, shop } = data;

  // Build receipt header based on settings
  let headerHtml = "";
  const useLogo = shop?.use_logo_on_receipt && shop?.logo_path;
  const useText = shop?.use_text_on_receipt !== false;
  const headerText = shop?.receipt_header_text || shop?.name || "STORE";

  if (useLogo) {
    headerHtml += `<img src="${shop.logo_path}" style="max-width: 60mm; max-height: 20mm; margin: 0 auto; display: block;" alt="${headerText}">`;
  }
  if (useText) {
    headerHtml += `<h1>${headerText}</h1>`;
  }
  if (shop?.receipt_extended_name) {
    const extFontSize = shop.extended_name_font_size || 10;
    const extFontWeight = shop.extended_name_font_weight || "normal";
    const extSpacing = shop.extended_name_spacing || 2;
    headerHtml += `<div style="font-size: ${extFontSize}px; font-weight: ${extFontWeight}; margin-top: ${extSpacing}px; text-align: center; text-transform: none;">${shop.receipt_extended_name}</div>`;
  }

  // Build contact details section
  let contactHtml = "";
  if (shop?.receipt_phone || shop?.receipt_address) {
    contactHtml = `<div style="font-size: 10px; margin-top: 3px;">`;
    if (shop.receipt_phone) contactHtml += `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${shop.receipt_phone}</div>`;
    if (shop.receipt_address) contactHtml += `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${shop.receipt_address}</div>`;
    contactHtml += `</div>`;
  }

  // Build footer/policies section
  let footerHtml = `<div class="text-center" style="font-size: 10px; margin-top: 10px;">`;
  if (shop?.receipt_policies) {
    const policies = shop.receipt_policies.replace(/\n/g, "<br>");
    footerHtml += `<div style="font-size: 9px; margin-bottom: 5px; white-space: pre-wrap;">${policies}</div>`;
  }
  footerHtml += `Thank you for your visit!`;
  if (shop?.name && !useLogo) {
    footerHtml += `<br>${shop.name}`;
  }
  footerHtml += `</div>`;

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Return Receipt #${ret.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'bit array-a2';
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot');
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot?#iefix') format('embedded-opentype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff2') format('woff2'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff') format('woff'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.ttf') format('truetype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.svg#BIT') format('svg');
      font-weight: normal;
      font-style: normal;
    }
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; background: #f0f0f0; font-family: ${shop?.receipt_font_family || "'Courier New', Courier, monospace"}; }
    .receipt { width: 80mm; margin: 0 auto; padding: 4mm; color: #000; font-size: 12px; line-height: 1.2; background: #fff; min-height: 100vh; box-sizing: border-box; }
    @media print { html, body { background: #fff; } .receipt { margin: 0; width: 100%; min-height: auto; } }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
    .divider { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
    td { padding: 3px 0; vertical-align: top; }
  </style></head><body>
  <div class="receipt">
    <div class="text-center">
      ${headerHtml}
      <div class="bold">RETURN RECEIPT</div>
      ${contactHtml}
    </div>
    <hr class="divider" />
    <div style="font-size: 11px;">
      <strong>Return #:</strong> ${ret.id}<br>
      <strong>Date:</strong> ${new Date(ret.created_at).toLocaleString()}<br>
      <strong>Orig. Sale:</strong> #${ret.sale_id}<br>
      <strong>Customer:</strong> ${sale.customer_name || "Walk-in"}<br>
      <strong>Processed By:</strong> ${user ? user.name : "Staff"}
    </div>
    <hr class="divider" />
    <table>
      <thead><tr><th>Item</th><th class="text-center">Qty</th><th class="text-right">Refund</th></tr></thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td>${i.product_name}${i.is_damage ? ' <span class="bold">(Damaged)</span>' : ''}</td>
            <td class="text-center">${i.quantity}</td>
            <td class="text-right">${(i.refund_price * i.quantity).toFixed(0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <hr class="divider" />
    <div class="text-right bold" style="font-size: 14px;">TOTAL REFUND: Rs. ${ret.total_refund.toFixed(0)}</div>
    <div class="text-right" style="font-size: 11px; margin-top: 4px;">Method: ${ret.payment_method.toUpperCase()}</div>
    ${ret.reason ? `<div style="font-size: 10px; margin-top: 5px;"><strong>Reason:</strong> ${ret.reason}</div>` : ''}
    <hr class="divider" />
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();setTimeout(()=>{if(!window.closed)window.close();},5000);}<\/script>
  </body></html>`);
  win.document.close();
}

// ─── Sales History ─────────────────────────────────────────────────────────
// ─── Sales History ─────────────────────────────────────────────────────────

let _allSalesCache = [];
let _salesPendingFilter = false;
let _salesPage = 1;
const _salesPageSize = 25;

async function renderSalesHistory(onlyPendingDues = false) {
  try {
    _allSalesCache = await api("/api/sales");
    if (!Array.isArray(_allSalesCache)) _allSalesCache = [];
    updatePendingDuesBadge(_allSalesCache);
    _salesPendingFilter = onlyPendingDues;
    _salesPage = 1;

    const today = new Date().toISOString().split("T")[0];
    const statusLabel = onlyPendingDues ? "PENDING DUES" : "PAID SLIPS";
    const statusColor = onlyPendingDues ? "text-rose-500" : "text-emerald-500";

    $c("page-content").innerHTML = `
    <div class="flex flex-col gap-6 mb-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 class="text-2xl font-bold ${statusColor} mb-1">${statusLabel}</h2>
          <div class="flex items-center gap-4">
            <p class="text-slate-500 dark:text-slate-400 text-sm">Showing <span id="sales-count" class="font-bold">0</span> records</p>
            ${onlyPendingDues ? `<p class="text-rose-500 font-black text-sm px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">Total Dues: Rs. <span id="sales-total-dues">0</span></p>` : ""}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">From</label>
            <input type="date" id="sales-from" value="${today}" onchange="_renderSalesTable()" class="bg-transparent text-sm focus:outline-none dark:text-white" />
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">To</label>
            <input type="date" id="sales-to" value="${today}" onchange="_renderSalesTable()" class="bg-transparent text-sm focus:outline-none dark:text-white" />
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">Type</label>
            <select id="sales-type-filter" onchange="_renderSalesTable()" class="bg-transparent text-sm focus:outline-none dark:text-white font-bold cursor-pointer">
              <option value="">All Types</option>
              <option value="dine_in">Dine-in</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <button onclick="navigate('${onlyPendingDues ? 'sales-history' : 'pending-dues'}')" class="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-100 dark:border-transparent hover:bg-indigo-100 transition-all text-xs">
            ${onlyPendingDues ? '📄 View Paid Slips' : '🔴 View Pending Dues'}
          </button>
        </div>
      </div>

      <div class="w-full">
        <input id="sales-search" oninput="_renderSalesTable()" placeholder="Search by Bill ID, Name, or Phone..."
          class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all text-sm shadow-sm" />
      </div>
    </div>

    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
        <thead class="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-700"><tr>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Inv #</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Total</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Paid</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Pending</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Served By</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody id="sales-table-body" class="divide-y divide-slate-800">
        </tbody></table>
      </div>
      <div id="sales-pagination" class="bg-slate-50/50 dark:bg-black/20 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
      </div>
    </div>`;

    _renderSalesTable();
  } catch (err) {
    console.error("Sales History Error:", err);
    $c("page-content").innerHTML =
      `<div class="p-10 text-center text-rose-500 font-bold">Failed to load sales: ${err.message}</div>`;
  }
}

function _renderSalesTable() {
  try {
    const searchInput = $c("sales-search");
    const fromInput = $c("sales-from");
    const toInput = $c("sales-to");
    const typeFilter = $c("sales-type-filter")?.value;
    if (!searchInput || !fromInput || !toInput) return;

    const query = (searchInput.value || "").toLowerCase().trim();
    const fromDate = fromInput.value;
    const toDate = toInput.value;

    console.log(
      "Rendering table. Cache:",
      _allSalesCache.length,
      "Filter:",
      _salesPendingFilter,
      "Range:",
      fromDate,
      "to",
      toDate,
    );

    // Initial filter by Status (Paid/Pending)
    let displayList = _salesPendingFilter
      ? _allSalesCache.filter(
        (s) => Number(s.total || 0) - Number(s.amount_received || 0) > 0.01,
      )
      : _allSalesCache.filter(
        (s) => Number(s.total || 0) - Number(s.amount_received || 0) <= 0.01,
      );

    // Filter by Date Range
    if (fromDate || toDate) {
      displayList = displayList.filter((s) => {
        const sDate = s.created_at.split(" ")[0]; // Extract YYYY-MM-DD
        if (fromDate && sDate < fromDate) return false;
        if (toDate && sDate > toDate) return false;
        return true;
      });
    }

    // Filter by Order Type
    if (typeFilter) {
      displayList = displayList.filter(s => s.order_type === typeFilter);
    }

    // Filter by Search Query
    if (query) {
      displayList = displayList.filter((s) => {
        const id = (s.id || "").toString().toLowerCase();
        const name = (s.customer_name || "").toLowerCase();
        const phone = (s.customer_phone || "").toLowerCase();
        const sellerName = (s.served_by_name || "").toLowerCase();
        const sellerUser = (s.served_by_username || "").toLowerCase();
        return (
          id === query ||
          name.includes(query) ||
          phone.includes(query) ||
          sellerName.includes(query) ||
          sellerUser.includes(query)
        );
      });
    }

    if ($c("sales-count")) $c("sales-count").textContent = displayList.length;
    if ($c("sales-total-dues")) {
      const totalPending = displayList.reduce((sum, s) => sum + (Number(s.total || 0) - Number(s.amount_received || 0)), 0);
      $c("sales-total-dues").textContent = totalPending.toLocaleString("en-IN", { minimumFractionDigits: 0 });
    }

    const totalPages = Math.ceil(displayList.length / _salesPageSize) || 1;
    if (_salesPage > totalPages) _salesPage = 1;

    const startIdx = (_salesPage - 1) * _salesPageSize;
    const pageItems = displayList.slice(startIdx, startIdx + _salesPageSize);

    $c("sales-table-body").innerHTML = pageItems.length
      ? pageItems
        .map((s) => {
          const due = Number(s.total || 0) - Number(s.amount_received || 0);
          const isPending = due > 0.01;

          return `
        <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
          <td class="px-5 py-4 font-bold">
            <div class="text-indigo-600 dark:text-indigo-400">#${s.id}</div>
            ${s.items_returned > 0 ? `
              <div class="mt-1 flex items-center gap-1">
                <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-[9px] font-black text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                  RETURNED (${s.items_returned})
                </span>
              </div>
            ` : ""}
          </td>
          <td class="px-5 py-4">
             <div class="font-medium text-slate-700 dark:text-slate-200 text-sm mb-1">${new Date(s.created_at).toLocaleDateString()}</div>
             <div class="text-[10px] text-slate-500">${new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </td>
          <td class="px-5 py-4">
             <div class="font-bold text-slate-800 dark:text-slate-200">${s.customer_name || '<span class="text-slate-400 dark:text-slate-500 italic font-normal">Walk-in</span>'}</div>
             <div class="text-xs ${s.customer_phone ? "text-slate-500 dark:text-slate-400" : "text-slate-400 dark:text-slate-600 italic"} mt-1 flex items-center gap-1">
               <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
               ${s.customer_phone || "No phone"}
             </div>
          </td>
          <td class="px-5 py-4 text-slate-700 dark:text-slate-200 font-bold">Rs. ${parseFloat(s.total || 0).toFixed(0)}</td>
          <td class="px-5 py-4 text-emerald-600 dark:text-emerald-400 font-medium">Rs. ${parseFloat(s.amount_received || 0).toFixed(0)}</td>
          <td class="px-5 py-4 font-black">
             ${isPending ? `<span class="text-rose-600 dark:text-rose-400">Rs. ${parseFloat(due).toFixed(0)}</span>` : `<span class="text-slate-400 dark:text-slate-600 font-normal">None</span>`}
          </td>
          <td class="px-5 py-4">
            <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold border border-slate-200 dark:border-slate-700 uppercase">${s.served_by_name || s.served_by_username || "Staff"}</span>
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              ${s.customer_id && !_salesPendingFilter ? `<button onclick="viewCustomerLedger(${s.customer_id})" class="p-1.5 rounded bg-indigo-100 dark:bg-indigo-500/10 hover:bg-indigo-200 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 transition-colors" title="Open Customer Account"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></button>` : ""}
              ${isPending ? `<button onclick="markSalePaid(${s.id}, ${s.total}, ${s.amount_received})" class="p-1.5 rounded bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors" title="Collect Payment / Update Dues"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>` : ""}
              <button onclick="showSaleDuesDetails(${s.id})" class="p-1.5 rounded bg-blue-100 dark:bg-blue-500/10 hover:bg-blue-200 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 transition-colors" title="View Due Details & History">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <button onclick="returnSaleItems(${s.id})" class="p-1.5 rounded bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 transition-colors" title="Return Items">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15L12 19M12 19L8 15M12 19V9C12 5.68629 14.6863 3 18 3" /></svg>
              </button>
              <button onclick="printBill(${s.id})" class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 transition-colors" title="Print Bill">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
        })
        .join("")
      : `<tr><td colspan="8" class="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm italic border-t border-slate-100 dark:border-slate-800">No sales found for this filter.</td></tr>`;

    $c("sales-pagination").innerHTML =
      totalPages > 1
        ? `
      <div class="text-xs text-slate-500 font-medium">
        Showing <span class="font-bold text-slate-900 dark:text-slate-200">${pageItems.length}</span> of <span class="font-bold text-slate-900 dark:text-slate-200">${displayList.length}</span> sales
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changeSalesPage(${_salesPage - 1})" ${_salesPage <= 1 ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Previous</button>
        <span class="text-xs font-bold text-slate-500 px-2">Page ${_salesPage} of ${totalPages}</span>
        <button onclick="changeSalesPage(${_salesPage + 1})" ${_salesPage >= totalPages ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next</button>
      </div>
    `
        : "";
  } catch (err) {
    console.error("Table Render Error:", err);
  }
}

function changeSalesPage(page) {
  _salesPage = page;
  _renderSalesTable();
}

async function markSalePaid(saleId, grandTotal, currentReceived) {
  const currentDue = grandTotal - currentReceived;
  // Use a customized prompt to allow partial or full payment
  const html = `
    <div class="space-y-4">
      <p class="text-sm text-slate-500 dark:text-slate-400">Total remaining due is <strong>Rs. ${currentDue.toFixed(2)}</strong>.</p>
      <div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">How much is being received now?</label>
        <input id="dues-recvd-${saleId}" type="number" min="0" value="${currentDue.toFixed(2)}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Payment Note (optional)</label>
        <input id="dues-note-${saleId}" type="text" placeholder="e.g. Cash received at counter" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <button onclick="doMarkSalePaid(${saleId}, ${currentReceived})" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg hover:shadow-emerald-500/25">Confirm Received</button>
    </div>
  `;
  openModal("Collect Dues: Bill #" + saleId, html);
}

async function doMarkSalePaid(saleId, currentReceived) {
  const amountInput = document.getElementById(`dues-recvd-${saleId}`);
  const noteInput = document.getElementById(`dues-note-${saleId}`);
  if (!amountInput) return toast("Input not found", "error");

  const adding = parseFloat(amountInput.value) || 0;
  if (adding <= 0) return toast("Amount must be > 0", "error");

  const totalRecvd = currentReceived + adding;
  const note = noteInput ? noteInput.value.trim() : "";
  const r = await api(`/api/sales/${saleId}/pay`, "PATCH", {
    amount: totalRecvd,
    note,
  });
  if (r.error) return toast(r.error, "error");

  toast("Dues updated successfully!");
  closeModal();
  renderSalesHistory(_salesPendingFilter); // Refresh list
}

async function showSaleDuesDetails(saleId) {
  try {
    const data = await api(`/api/sales/${saleId}/bill`);
    const { sale, payments } = data;
    const totalDue = Number(sale.total || 0);
    const amountReceived = Number(sale.amount_received || 0);
    const balance = totalDue - amountReceived;

    const historyHtml = payments.length
      ? payments.map(p => `
          <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white">Rs. ${Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
              <div class="text-[10px] text-slate-500">${new Date(p.created_at).toLocaleString()}</div>
            </div>
            <div class="text-[10px] text-slate-400 italic font-medium max-w-[150px] text-right truncate">${p.note || 'No note'}</div>
          </div>
        `).join('')
      : '<div class="py-10 text-center text-slate-400 text-sm italic">No installment payments recorded yet.</div>';

    const html = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
            <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Bill</p>
            <p class="text-xl font-black text-indigo-700 dark:text-indigo-300">Rs. ${totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </div>
          <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800">
            <p class="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Remaining Due</p>
            <p class="text-xl font-black text-rose-700 dark:text-rose-300">Rs. ${balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div>
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Payment Timeline</h4>
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 overflow-y-auto max-h-[300px]">
            ${historyHtml}
          </div>
        </div>

        <div class="text-center pt-2">
           <p class="text-xs text-slate-500 italic font-medium">Customer: <span class="font-bold text-slate-700 dark:text-slate-300">${sale.customer_name || 'Walk-in'}</span></p>
        </div>
      </div>
    `;

    openModal(`Due Details — SALE #${saleId}`, html, "max-w-md");
  } catch (err) {
    toast("Error loading details", "error");
  }
}

// ─── Expenses ───────────────────────────────────────────────────────
// ─── Expenses ───────────────────────────────────────────────────────
async function renderExpenses() {
  const [allExpenses, sharesRes, previousDues, categories] = await Promise.all([
    api("/api/expenses"),
    api(`/api/brands/expense-shares?month=${_expenseMonth}`),
    api("/api/brands/all-months-dues"),
    api("/api/expense-categories"),
  ]);

  _expenseCategories = categories;

  // Sort by date desc and filter by selected month (YYYY-MM)
  const filtered = allExpenses
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter((e) => e.date.startsWith(_expenseMonth));
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  // Pagination logic (10 per page)
  const pageSize = 5;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const startIdx = (_expensePage - 1) * pageSize;
  const pageExpenses = filtered.slice(startIdx, startIdx + pageSize);

  let contentHtml = "";

  if (_expenseView === "add") {
    // Render Add Form View
    contentHtml = `
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Add New Expense</h3>
        <button onclick="toggleExpenseView('list')" class="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-sm font-medium flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back to List
        </button>
      </div>
      <div class="glass rounded-2xl p-8 max-w-2xl mx-auto border border-gray-200 dark:border-gray-800 shadow-sm">
        <div class="space-y-6">
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Title *</label>
            <input id="exp-title" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Electricity Bill" /></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
              <select id="exp-cat" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all">
                ${_expenseCategories.map((c) => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join("")}
              </select></div>
            <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date</label>
              <input id="exp-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
          </div>
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Amount (Rs.) *</label>
            <input id="exp-amount" type="number" min="0" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" placeholder="0" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Note (optional)</label>
            <textarea id="exp-note" rows="3" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all resize-none" placeholder="Add some details…"></textarea></div>
          <button onclick="saveExpense()" class="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/25">Save Expense</button>
        </div>
      </div>`;
  } else {
    // Render Expenses List View
    contentHtml = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div class="flex items-center gap-4">
          <div class="flex flex-col">
            <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Expenses Management - <span class="text-indigo-600 dark:text-indigo-400 font-black">${new Date(_expenseMonth + "-01").toLocaleDateString("default", { month: "long", year: "numeric" })}</span></h2>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Month: <span class="text-slate-900 dark:text-slate-200">${_expenseMonth}</span> — Total: <span class="text-rose-600 dark:text-rose-400">Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <!-- History Icon -->
          <button onclick="openExpensesHistory()" title="Expenses History" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-900 shadow-sm transition-all active:scale-95 group">
            <svg class="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>

          <button onclick="openPayBrandExpenses()" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-sm font-bold shadow-lg shadow-emerald-900/10 transition-all hover:-translate-y-0.5 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
             Pay Brand
          </button>

          <button onclick="openAddCategoryPopup('expense')" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 group">
             <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
             Add Category
          </button>

          <button onclick="toggleExpenseView('add')" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white text-sm font-bold shadow-lg shadow-indigo-900/10 transition-all hover:-translate-y-0.5 active:scale-95">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Expense
          </button>
        </div>
      </div>

      <!-- Brand Payments Panel -->
      <div class="glass rounded-2xl border border-gray-200 dark:border-gray-800 mb-10 overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
           <div class="flex items-center gap-3">
             <h3 class="font-bold text-gray-800 dark:text-gray-100">Brand Expense Shares</h3>
             <span class="text-[10px] font-bold px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full text-indigo-500">${sharesRes.month}</span>
           </div>
           <div class="flex items-center gap-2">
             <!-- Edit Icon -->
             <button onclick="openBulkEditExpenses('${sharesRes.month}')" title="Bulk Edit Month Expenses" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-indigo-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
             </button>
             <!-- View Icon -->
             <button onclick="openViewExpenses('${sharesRes.month}')" title="View Monthly Report" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-emerald-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
             </button>
             <!-- Download Icon -->
             <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${sharesRes.month}&download=true'" title="Download Monthly Report PDF" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-amber-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
             </button>
           </div>
        </div>
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 dark:border-gray-800">
          ${statCard("Total Month Expenses", "Rs. " + Number(sharesRes.totalExpenses).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "Operating costs", "rose")}
          ${statCard("Split Per Brand", "Rs. " + (sharesRes.brandCount > 0 ? Number(sharesRes.totalExpenses / sharesRes.brandCount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0"), `${sharesRes.brandCount} brands total`, "blue")}
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 bg-gray-50/30 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800">
                <th class="px-6 py-3 font-semibold text-[10px] uppercase">Brand</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Target Share</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Paid</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Due</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              ${sharesRes.shares
        .map(
          (s) => `
                <tr class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td class="px-6 py-4 font-medium">${s.brand_name}</td>
                  <td class="px-6 py-4 text-right text-gray-500">Rs. ${parseFloat(s.total_share).toFixed(2)}</td>
                  <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2 group">
                      <span class="text-emerald-600 dark:text-emerald-400 font-bold">Rs. ${parseFloat(s.paid).toFixed(2)}</span>
                      <button onclick="openEditBrandPayments(${s.brand_id}, '${sharesRes.month}')" class="p-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right text-rose-500 font-bold">Rs. ${parseFloat(s.due).toFixed(2)}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="glass rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 mb-6">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">Operating Expenses</h3>
        </div>

        <table class="w-full text-sm">
          <thead><tr class="border-b border-gray-100 dark:border-gray-800 text-left bg-gray-50 dark:bg-gray-900/50">
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Title</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Category</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Added By</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Amount</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500"></th>
           </tr></thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            ${pageExpenses.length
        ? pageExpenses
          .map(
            (e) => `
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td class="px-6 py-4">
                  <div class="font-medium text-gray-800 dark:text-gray-200">${e.title}</div>
                  ${e.note ? `<div class="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate" title="${e.note}">${e.note}</div>` : ""}
                </td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${catBadge(e.category)}">${catEmoji(e.category)} ${e.category}</span></td>
                 <td class="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">${e.date}</td>
                 <td class="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                   <div class="flex items-center gap-1.5">
                     <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                     ${e.added_by || 'Admin'}
                   </div>
                 </td>
                 <td class="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                 <td class="px-6 py-4 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button onclick="openEditExpense(${e.id})" class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <button onclick="deleteExpense(${e.id})" class="p-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </td>
              </tr>`,
          )
          .join("")
        : `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No expenses found for this month.</td></tr>`
      }
          </tbody>
        </table>

        <!-- Pagination -->
        ${totalPages > 1
        ? `
        <div class="bg-gray-50/50 dark:bg-gray-900/20 px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Showing <span class="font-bold">${pageExpenses.length}</span> of <span class="font-bold">${filtered.length}</span> expenses
          </div>
          <div class="flex items-center gap-2">
            <button onclick="prevExpensePage()" ${_expensePage <= 1 ? "disabled" : ""} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
            <span class="text-xs text-gray-500 px-2">Page <span class="font-bold text-gray-800 dark:text-gray-200">${_expensePage}</span> of ${totalPages}</span>
            <button onclick="nextExpensePage(${totalPages})" ${_expensePage >= totalPages ? "disabled" : ""} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>`
        : ""
      }
      </div>

      ${renderPreviousDuesCard(previousDues)}


    `;
  }

  $c("page-content").innerHTML = contentHtml;
}

// ─── Previous Months Dues Helpers ────────────────────────────────────
function renderPreviousDuesCard(previousDues) {
  if (!previousDues || previousDues.length === 0) return "";

  const totalOutstanding = previousDues.reduce((sum, m) => sum + m.totalDue, 0);

  return `
    <div class="glass rounded-2xl border border-rose-200 dark:border-rose-900/30 mb-10 overflow-hidden shadow-lg shadow-rose-500/5 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div class="px-6 py-4 flex items-center justify-between border-b border-rose-100 dark:border-rose-900/20 bg-rose-50/50 dark:bg-rose-950/10">
         <div class="flex items-center gap-3">
           <div class="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white shadow-sm">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </div>
           <h3 class="font-bold text-rose-900 dark:text-rose-200 uppercase tracking-tight">Previous Months Record/Dues</h3>
         </div>
         <button onclick="openPreviousDuesModal()" class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all active:scale-95">
           Details & Pay
         </button>
      </div>
      <div class="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p class="text-sm text-rose-700 dark:text-rose-400 font-medium">There are outstanding dues from <span class="font-bold">${previousDues.length}</span> previous month(s).</p>
          <p class="text-[10px] text-rose-500/60 uppercase tracking-widest mt-1 font-bold">Please settle these amounts to clear individual brand ledgers.</p>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Total Outstanding</div>
          <div class="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">Rs. ${totalOutstanding.toLocaleString()}</div>
        </div>
      </div>
    </div>
  `;
}

async function openPreviousDuesModal() {
  const previousDues = await api("/api/brands/all-months-dues");

  if (!previousDues || previousDues.length === 0) {
    return openModal("Previous Dues", '<p class="text-center py-10 text-slate-400 italic">No previous dues found. You are all caught up!</p>');
  }

  const html = `
    <div class="space-y-8 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      ${previousDues.map(m => `
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/50">
          <div class="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">${new Date(m.month + "-01").toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
              <span class="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">Rs. ${m.totalExpenses.toLocaleString()} Total</span>
            </div>
            <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${m.month}&download=true'" class="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-amber-500 transition-colors" title="Download Monthly Report">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
          </div>
          <div class="p-4 space-y-3">
            ${m.brandDues.map(b => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50 group">
                <div>
                  <div class="text-sm font-bold text-slate-800 dark:text-slate-200">${b.brand_name}</div>
                  <div class="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">Due: Rs. ${b.due.toFixed(2)}</div>
                </div>
                <div class="flex items-center gap-2">
                  <input id="prev-due-${m.month}-${b.brand_id}" type="number" value="${b.due.toFixed(2)}" class="w-24 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-right outline-none focus:border-indigo-500" />
                  <button onclick="doPayPreviousDue(${b.brand_id}, '${m.month}', 'prev-due-${m.month}-${b.brand_id}')" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">Pay</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  openModal("Previous Months Outstanding Dues", html, "max-w-3xl");
}

async function doPayPreviousDue(brandId, month, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");

  const r = await api("/api/brands/expense-payments", "POST", {
    brand_id: brandId,
    amount,
    month,
  });
  if (r.error) return toast(r.error, "error");

  toast("Outstanding due settled!");
  openPreviousDuesModal(); // Refresh modal
  renderExpenses(); // Refresh background dashboard
}

// ─── Expense Helpers ────────────────────────────────────────────────
function toggleExpenseView(view) {
  _expenseView = view;
  _expensePage = 1;
  renderExpenses();
}

function filterExpenseMonth(val) {
  _expenseMonth = val;
  _expensePage = 1;
  renderExpenses();
}

function prevExpensePage() {
  if (_expensePage > 1) {
    _expensePage--;
    renderExpenses();
  }
}

function nextExpensePage(totalPages) {
  if (_expensePage < totalPages) {
    _expensePage++;
    renderExpenses();
  }
}

function openAddExpenseModal() {
  toggleExpenseView("add");
}

async function openPayBrandExpenses() {
  const sharesRes = await api(`/api/brands/expense-shares?month=${_expenseMonth}`);
  const rows = (sharesRes.shares || []).filter((s) => s.due > 0);

  if (!rows.length) {
    return openModal(
      "Pay Brand Expenses",
      `
      <p class="text-center text-gray-400 py-6">✔ All brands are fully paid for <strong>${sharesRes.month}</strong>.</p>
    `,
    );
  }

  openModal(
    "Pay Brand Expenses",
    `
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Month: <strong class="text-gray-800 dark:text-gray-200">${sharesRes.month}</strong></p>
    <div class="space-y-3">
      ${rows
      .map(
        (s) => `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div class="flex-1">
            <div class="font-semibold text-gray-800 dark:text-gray-200 text-sm">${s.brand_name}</div>
            <div class="text-xs text-gray-500">Due: <span class="text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(s.due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          </div>
          <input id="bep-${s.brand_id}" type="number" min="1" max="${s.due}" value="${s.due}"
            class="w-32 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-bold text-right"/>
          <button onclick="doPayBrandExpense(${s.brand_id}, '${sharesRes.month}')" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all">Pay</button>
        </div>
      `,
      )
      .join("")}
    </div>
    <div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
      <button onclick="closeModal()" class="px-6 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        Close
      </button>
    </div>
  `,
  );
}

async function doPayBrandExpense(brandId, month) {
  const input = document.getElementById("bep-" + brandId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");
  const r = await api("/api/brands/expense-payments", "POST", {
    brand_id: brandId,
    amount,
    month,
  });
  if (r.error) return toast(r.error, "error");
  toast("Payment recorded!");
  openPayBrandExpenses(); // Refresh modal content
  renderExpenses(); // Refresh background
}

function catBadge(c) {
  const cat = _expenseCategories.find((x) => x.name === c);
  return cat ? cat.color_class : "bg-slate-700 text-slate-300";
}
function catEmoji(c) {
  const cat = _expenseCategories.find((x) => x.name === c);
  return cat ? cat.emoji : "📦";
}


async function saveExpense() {
  const payload = {
    title: $c("exp-title").value.trim(),
    category: $c("exp-cat").value,
    amount: parseFloat($c("exp-amount").value),
    date: $c("exp-date").value,
    note: $c("exp-note").value.trim(),
  };
  if (!payload.title || !payload.amount)
    return toast("Title and amount required", "error");
  const r = await api("/api/expenses", "POST", payload);
  if (r.error) return toast(r.error, "error");
  toast("Expense added!");
  toggleExpenseView("list");
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  try {
    await api(`/api/expenses/${id}`, "DELETE");
    toast("Expense removed");
    renderExpenses();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function openEditExpense(id) {
  const expenses = await api("/api/expenses");
  const e = expenses.find((x) => x.id === id);
  if (!e) return toast("Expense not found", "error");

  openModal(
    "Edit Expense",
    `
    <div class="space-y-4">
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title *</label>
        <input id="edit-exp-title" value="${e.title}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
        <select id="edit-exp-cat" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all">
          ${_expenseCategories.map((c) => `<option value="${c.name}" ${e.category === c.name ? "selected" : ""}>${c.emoji} ${c.name}</option>`).join("")}
        </select></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Amount (Rs.) *</label>
          <input id="edit-exp-amount" type="number" min="0" value="${e.amount}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
          <input id="edit-exp-date" type="date" value="${e.date}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      </div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Note (optional)</label>
        <textarea id="edit-exp-note" rows="2" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all resize-none">${e.note || ""}</textarea></div>
      <button onclick="updateExpense(${e.id})" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md">Update Expense</button>
    </div>
  `,
  );
}

async function updateExpense(id) {
  const payload = {
    title: $c("edit-exp-title").value.trim(),
    category: $c("edit-exp-cat").value,
    amount: parseFloat($c("edit-exp-amount").value),
    date: $c("edit-exp-date").value,
    note: $c("edit-exp-note").value.trim(),
  };
  if (!payload.title || !payload.amount)
    return toast("Title and amount required", "error");
  try {
    await api("/api/expenses/" + id, "PUT", payload);
    closeModal();
    toast("Expense updated!");
    renderExpenses();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────
let _customersCache = [];
let _customersSearch = "";
let _customersStatus = "active";
let _customersFrom = "";
let _customersTo = "";
let _customersSort = "purchase_desc";

async function renderCustomers() {
  try {
    const params = new URLSearchParams();
    params.set("status", _customersStatus);
    if (_customersSearch) params.set("search", _customersSearch);
    if (_customersFrom) params.set("from", _customersFrom);
    if (_customersTo) params.set("to", _customersTo);
    if (_customersSort) params.set("sort", _customersSort);

    _customersCache = await api(`/api/customers?${params.toString()}`);
    if (!Array.isArray(_customersCache)) _customersCache = [];

    const totalDue = _customersCache.reduce(
      (s, c) => s + Number(c.current_balance || 0),
      0,
    );
    const periodPurchases = _customersCache.reduce(
      (s, c) => s + Number(c.total_purchase_amount || 0),
      0,
    );
    const withDues = _customersCache.filter(
      (c) => Number(c.current_balance || 0) > 0.01,
    ).length;

    $c("page-content").innerHTML = `
      <div class="flex flex-col gap-6">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-800 dark:text-white">Customer Accounts</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              ${_customersCache.length} customers &nbsp;·&nbsp;
              <span class="text-emerald-600 dark:text-emerald-400 font-semibold">Purchases in filter: Rs. ${periodPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> &nbsp;·&nbsp;
              <span class="text-rose-500 font-semibold">${withDues} with dues</span> &nbsp;·&nbsp;
              Total outstanding: <span class="font-bold text-rose-600 dark:text-rose-400">Rs. ${totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <button onclick="openAddCustomerModal()"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Customer
          </button>
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input id="cust-search" type="text" value="${_customersSearch}" placeholder="Search by name or phone…"
            oninput="_customersSearch=this.value; renderCustomers()"
            class="md:col-span-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <input id="cust-from" type="date" value="${_customersFrom}" onchange="_customersFrom=this.value; renderCustomers()"
            class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <input id="cust-to" type="date" value="${_customersTo}" onchange="_customersTo=this.value; renderCustomers()"
            class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <div class="flex gap-3">
            <select id="cust-status" onchange="_customersStatus=this.value; renderCustomers()"
              class="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm">
              <option value="active" ${_customersStatus === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${_customersStatus === "inactive" ? "selected" : ""}>Inactive</option>
              <option value="all" ${_customersStatus === "all" ? "selected" : ""}>All</option>
            </select>
            <select id="cust-sort" onchange="_customersSort=this.value; renderCustomers()"
              class="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm">
              <option value="purchase_desc" ${_customersSort === "purchase_desc" ? "selected" : ""}>Top Purchase</option>
              <option value="name_asc" ${_customersSort === "name_asc" ? "selected" : ""}>Name A-Z</option>
              <option value="recent_desc" ${_customersSort === "recent_desc" ? "selected" : ""}>Recent</option>
              <option value="due_desc" ${_customersSort === "due_desc" ? "selected" : ""}>Highest Due</option>
            </select>
          </div>
        </div>

        <!-- Table -->
        <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Phone</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Purchases</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Sales Count</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Balance</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Last Purchase</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${_customersCache.length === 0
        ? `<tr><td colspan="7" class="px-5 py-12 text-center text-slate-400 italic">No customers found.</td></tr>`
        : _customersCache
          .map((c) => {
            const hasDue = Number(c.current_balance || 0) > 0.01;
            return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td class="px-5 py-4">
                        <div class="font-semibold text-slate-800 dark:text-slate-100">${c.name}</div>
                        ${c.email ? `<div class="text-xs text-slate-400 mt-0.5">${c.email}</div>` : ""}
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">${c.phone || "—"}</td>
                      <td class="px-5 py-4">
                        <div class="font-bold text-emerald-600 dark:text-emerald-400">Rs. ${Number(c.total_purchase_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                        <div class="text-[11px] text-slate-400">Paid in filter: Rs. ${Number(c.total_paid_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">${c.total_sales || 0} sales</td>
                      <td class="px-5 py-4">
                        ${hasDue
                ? `<span class="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs font-bold">Rs. ${Number(c.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>`
                : `<span class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold">Cleared</span>`
              }
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">${c.last_purchase_at ? new Date(c.last_purchase_at).toLocaleDateString("en-GB") : "—"}</td>
                      <td class="px-5 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button onclick="viewCustomerLedger(${c.id})" title="View Ledger & Reports"
                            class="p-1.5 rounded bg-indigo-100 dark:bg-indigo-500/10 hover:bg-indigo-200 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                          </button>
                          ${hasDue
                ? `
                          <button onclick="openPaymentModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.current_balance})" title="Record Payment"
                            class="p-1.5 rounded bg-emerald-100 dark:bg-emerald-500/10 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          </button>`
                : ""
              }
                          <button onclick="openEditCustomerModal(${c.id})" title="Edit Customer"
                            class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>`;
          })
          .join("")
      }
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch (err) {
    $c("page-content").innerHTML =
      `<div class="p-10 text-center text-rose-500 font-bold">Failed to load customers: ${err.message}</div>`;
  }
}

function openAddCustomerModal() {
  const html = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Full Name *</label>
          <input id="cust-name" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Ahmed Khan" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Phone</label>
          <input id="cust-phone" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="03xx-xxxxxxx" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email</label>
          <input id="cust-email" type="email" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="email@example.com" /></div>
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Address</label>
          <input id="cust-address" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Street, City" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Opening Balance (Rs.)</label>
          <input id="cust-opening" type="number" min="0" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400 focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Credit Limit (Rs.)</label>
          <input id="cust-limit" type="number" min="0" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Notes</label>
          <input id="cust-notes" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Optional" /></div>
      </div>
      <button onclick="saveNewCustomer()" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Save Customer</button>
    </div>`;
  openModal("Add New Customer", html, "max-w-lg");
}

async function saveNewCustomer() {
  const name = $c("cust-name")?.value.trim();
  const phone = $c("cust-phone")?.value.trim();
  const email = $c("cust-email")?.value.trim();
  const address = $c("cust-address")?.value.trim();
  const credit_limit = parseFloat($c("cust-limit")?.value) || 0;
  const opening_balance = parseFloat($c("cust-opening")?.value) || 0;
  const notes = $c("cust-notes")?.value.trim();
  if (!name) return toast("Customer name is required", "error");
  try {
    await api("/api/customers", "POST", {
      name,
      phone,
      email,
      address,
      credit_limit,
      opening_balance,
      notes,
    });
    toast("Customer saved!");
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}



async function openEditCustomerModal(customerId) {
  try {
    const data = await api(`/api/customers/${customerId}`);
    const c = data.customer;
    const html = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Full Name *</label>
            <input id="edit-cust-name" value="${c.name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Phone</label>
            <input id="edit-cust-phone" value="${c.phone || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email</label>
            <input id="edit-cust-email" value="${c.email || ""}" type="email" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Address</label>
            <input id="edit-cust-address" value="${c.address || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Credit Limit (Rs.)</label>
            <input id="edit-cust-limit" type="number" min="0" value="${c.credit_limit || 0}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Status</label>
            <select id="edit-cust-status" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
              <option value="active" ${c.status === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${c.status === "inactive" ? "selected" : ""}>Inactive</option>
            </select></div>
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Notes</label>
            <input id="edit-cust-notes" value="${c.notes || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        </div>
        <button onclick="saveEditCustomer(${c.id})" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Save Changes</button>
      </div>`;
    openModal("Edit Customer", html, "max-w-lg");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function saveEditCustomer(customerId) {
  const name = $c("edit-cust-name")?.value.trim();
  const phone = $c("edit-cust-phone")?.value.trim();
  const email = $c("edit-cust-email")?.value.trim();
  const address = $c("edit-cust-address")?.value.trim();
  const credit_limit = parseFloat($c("edit-cust-limit")?.value) || 0;
  const status = $c("edit-cust-status")?.value;
  const notes = $c("edit-cust-notes")?.value.trim();
  if (!name) return toast("Name required", "error");
  try {
    await api(`/api/customers/${customerId}`, "PUT", {
      name,
      phone,
      email,
      address,
      credit_limit,
      status,
      notes,
    });
    toast("Customer updated!");
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}

function openPaymentModal(customerId, customerName, currentBalance) {
  const html = `
    <div class="space-y-4">
      <div class="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30">
        <p class="text-sm font-medium text-rose-700 dark:text-rose-400">Outstanding Balance</p>
        <p class="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">Rs. ${Number(currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
      </div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Amount Received (Rs.) *</label>
        <input id="pay-amount" type="number" min="0.01" step="0.01" max="${currentBalance}" value="${currentBalance.toFixed(2)}"
          class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Note (Optional)</label>
        <input id="pay-note" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Cash payment, cheque #1234" /></div>
      <button onclick="submitPayment(${customerId})" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg">Confirm Payment</button>
    </div>`;
  openModal(`Record Payment — ${customerName}`, html, "max-w-md");
}

async function submitPayment(customerId) {
  const amount = parseFloat($c("pay-amount")?.value) || 0;
  const note = $c("pay-note")?.value.trim();
  if (amount <= 0) return toast("Enter a valid amount", "error");
  try {
    const r = await api(`/api/customers/${customerId}/payment`, "POST", {
      amount,
      note,
    });
    toast(
      `Payment of Rs. ${r.payment_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} recorded!`,
    );
    closeModal();
    if (_currentPage === 'pending-dues') {
      renderPendingDues();
    } else {
      renderCustomers();
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

async function viewCustomerLedger(customerId) {
  try {
    const from = $c("cust-from")?.value || "";
    const to = $c("cust-to")?.value || "";
    const params = new URLSearchParams();
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const data = await api(
      `/api/customers/${customerId}${params.toString() ? `?${params.toString()}` : ""}`,
    );
    const { customer, ledger, sales, summary } = data;

    const totalDebits =
      summary?.total_ledger_debit ||
      ledger.filter((e) => e.type === "sale").reduce((s, e) => s + e.amount, 0);
    const totalCredits =
      summary?.total_ledger_credit ||
      ledger
        .filter((e) => e.type === "payment")
        .reduce((s, e) => s + e.amount, 0);
    const fmt = (n) =>
      Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

    const ledgerRows = ledger.length
      ? ledger
        .map((e, idx) => {
          const d = new Date(e.created_at).toLocaleDateString("en-GB");

          let ref = "—";
          if (e.sale_id) {
            ref = `SALE-${String(e.sale_id).padStart(5, "0")}`;
          } else if (e.type === "payment") {
            ref = `PAY-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "return") {
            ref = `RET-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "adjustment") {
            ref = `ADJ-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "opening") {
            ref = `OPN-${String(e.id).padStart(5, "0")}`;
          }

          const isDebit =
            e.type === "sale" ||
            (e.type === "adjustment" &&
              e.balance_after >
              (idx > 0 ? ledger[idx - 1].balance_after : e.balance_after - e.amount)) ||
            (e.type === "opening" && e.amount > 0);

          // For returns, we want to know if it actually reduced the debt or was just a cash refund
          const prevBal = idx > 0 ? ledger[idx - 1].balance_after : (e.balance_after + (isDebit ? -e.amount : e.amount));
          const wasBalanceAffected = Math.abs(e.balance_after - prevBal) > 0.01;

          const typeMap = {
            sale: { label: "CREDIT SALE", color: "rose" },
            payment: { label: "PAYMENT", color: "emerald" },
            return: { label: wasBalanceAffected ? "RETURN (CREDIT)" : "RETURN (CASH)", color: "blue" },
            adjustment: { label: "ADJUSTMENT", color: "slate" },
            opening: { label: "OPENING", color: "indigo" },
          };
          const style = typeMap[e.type] || { label: e.type.toUpperCase(), color: "slate" };

          return `
            <tr class="${idx % 2 === 0 ? "" : "bg-slate-50 dark:bg-white/[0.02]"} border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-white/[0.04]">
              <td class="px-4 py-2.5 text-sm text-slate-500">${d}</td>
              <td class="px-4 py-2.5 text-xs font-mono text-indigo-600 dark:text-indigo-400">${ref}</td>
              <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-${style.color}-100 dark:bg-${style.color}-500/10 text-${style.color}-700 dark:text-${style.color}-400">${style.label}</span></td>
              <td class="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title="${e.note || ""}">
                ${e.note || "—"}
              </td>
              <td class="px-4 py-2.5 text-right text-sm font-semibold ${isDebit ? "text-rose-600 dark:text-rose-400" : "text-slate-300 dark:text-slate-600"}">${isDebit ? "Rs. " + fmt(e.amount) : "—"}</td>
              <td class="px-4 py-2.5 text-right text-sm font-semibold ${!isDebit ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}">${!isDebit ? "Rs. " + fmt(e.amount) : "—"}</td>
              <td class="px-4 py-2.5 text-right text-sm font-bold ${e.balance_after > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(e.balance_after)}</td>
            </tr>`;
        })
        .join("")
      : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400 italic text-sm">No transactions yet.</td></tr>`;

    const salesRows =
      sales
        .slice(0, 8)
        .map((s) => {
          const due = s.total - s.amount_received;
          return `
        <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
          <td class="px-4 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">#${s.id}</td>
          <td class="px-4 py-2.5 text-sm text-slate-500">${new Date(s.created_at).toLocaleDateString("en-GB")}</td>
          <td class="px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100">Rs. ${fmt(s.total)}</td>
          <td class="px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">Rs. ${fmt(s.amount_received)}</td>
          <td class="px-4 py-2.5 text-sm font-bold ${due > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(due)}</td>
          <td class="px-4 py-2.5 text-right">
            <button onclick="printBill(${s.id})" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Print</button>
          </td>
        </tr>`;
        })
        .join("") ||
      `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic text-sm">No sales.</td></tr>`;

    const today = new Date().toISOString().slice(0, 10);
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const html = `
      <div class="space-y-6">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 text-center">
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase mb-1">Total Debited</p>
            <p class="text-lg font-bold text-rose-700 dark:text-rose-300">Rs. ${fmt(totalDebits)}</p>
          </div>
          <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 text-center">
            <p class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">Total Paid</p>
            <p class="text-lg font-bold text-emerald-700 dark:text-emerald-300">Rs. ${fmt(totalCredits)}</p>
          </div>
          <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-center">
            <p class="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Purchases</p>
            <p class="text-lg font-bold text-blue-700 dark:text-blue-300">Rs. ${fmt(summary?.total_purchase_amount || 0)}</p>
          </div>
          <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30 text-center">
            <p class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Sales Count</p>
            <p class="text-lg font-bold text-indigo-700 dark:text-indigo-300">${summary?.total_sales_count || sales.length}</p>
          </div>
          <div class="p-3 rounded-xl ${customer.current_balance > 0.01 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/30" : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"} border text-center">
            <p class="text-xs font-bold ${customer.current_balance > 0.01 ? "text-amber-600 dark:text-amber-400" : "text-slate-500"} uppercase mb-1">Balance Due</p>
            <p class="text-lg font-bold ${customer.current_balance > 0.01 ? "text-amber-700 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(customer.current_balance)}</p>
          </div>
        </div>

        <!-- PDF Download buttons -->
        <div class="flex flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <input type="date" id="ledger-from" value="${from30}" class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 transition-all dark:text-white" />
            <span class="text-slate-400 text-sm">→</span>
            <input type="date" id="ledger-to" value="${today}" class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 transition-all dark:text-white" />
          </div>
          <button onclick="downloadLedgerPDF(${customer.id})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            Account Ledger PDF
          </button>
          <button onclick="downloadSalesReportPDF(${customer.id})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Sales Report PDF
          </button>
          <button onclick="openAdjustmentModal(${customer.id}, '${customer.name.replace(/'/g, "\\'")}')"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
            Adjust Balance
          </button>
          ${customer.current_balance > 0.01
        ? `
          <button onclick="closeModal(); openPaymentModal(${customer.id}, '${customer.name.replace(/'/g, "\\'")}', ${customer.current_balance})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Record Payment
          </button>`
        : ""
      }
        </div>

        <!-- Ledger table -->
        <div>
          <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 uppercase tracking-wide">Transaction Ledger</h4>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Ref</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Note</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Debit</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Credit</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Balance</th>
                </tr>
              </thead>
              <tbody>${ledgerRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Recent Sales -->
        <div>
          <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 uppercase tracking-wide">Recent Sales (last ${Math.min(8, sales.length)})</h4>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Sale #</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Total</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Paid</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Due</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody>${salesRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    openModal(`${customer.name} — Account Ledger`, html, "max-w-4xl");
  } catch (err) {
    toast(err.message, "error");
  }
}

function downloadLedgerPDF(customerId) {
  const from = $c("ledger-from")?.value || "";
  const to = $c("ledger-to")?.value || "";
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  window.open(`/api/customers/${customerId}/ledger.pdf?${params}`, "_blank");
}

function downloadSalesReportPDF(customerId) {
  const from = $c("ledger-from")?.value || "";
  const to = $c("ledger-to")?.value || "";
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  window.open(`/api/customers/${customerId}/report.pdf?${params}`, "_blank");
}

function openAdjustmentModal(customerId, customerName) {
  const html = `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Adjustment Type</label>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('bg-indigo-600','bg-slate-100')); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('text-white','text-slate-600')); this.classList.replace('bg-slate-100','bg-indigo-600'); this.classList.replace('text-slate-600','text-white');" id="adj-type-debit" data-type="debit" class="py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm transition-all border border-indigo-200 dark:border-indigo-900/50">Increase Debt</button>
          <button onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('bg-indigo-600','bg-slate-100')); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('text-white','text-slate-600')); this.classList.replace('bg-slate-100','bg-indigo-600'); this.classList.replace('text-slate-600','text-white');" id="adj-type-credit" data-type="credit" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm transition-all border border-slate-200 dark:border-slate-700">Decrease Debt</button>
        </div>
      </div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Amount (Rs.) *</label>
        <input id="adj-amount" type="number" min="0.01" step="0.01" placeholder="0.00"
          class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Reason / Note *</label>
        <input id="adj-note" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Service charge, previous discount, etc." /></div>
      <button onclick="submitAdjustment(${customerId})" class="w-full py-3 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Process Adjustment</button>
    </div>`;
  openModal(`Manual Adjustment — ${customerName}`, html, "max-w-md");
}

async function submitAdjustment(customerId) {
  const amount = parseFloat($c("adj-amount")?.value) || 0;
  const note = $c("adj-note")?.value.trim();
  const type = $c("adj-type-debit").classList.contains("bg-indigo-600") ? "debit" : "credit";

  if (amount <= 0) return toast("Enter a valid amount", "error");
  if (!note) return toast("Reason is required for adjustments", "error");

  try {
    const r = await api(`/api/customers/${customerId}/adjustment`, "POST", {
      amount,
      type,
      note,
    });
    toast(`Adjustment recorded! New balance: Rs. ${r.new_balance.toLocaleString()}`);
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function searchPOSCustomers(query) {
  const resultsEl = $c("pos-customer-results");
  const hiddenIdEl = $c("pos-customer-id");
  if (!resultsEl || !hiddenIdEl) return;

  if (
    _posSelectedCustomer &&
    query !== (_posSelectedCustomer.name || "") &&
    query !== (_posSelectedCustomer.phone || "")
  ) {
    hiddenIdEl.value = "";
    _posSelectedCustomer = null;
    renderPOSSelectedCustomerBadge();
  }

  const q = String(query || "").trim();
  if (q.length < 1) {
    _posCustomerResults = [];
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    return;
  }

  try {
    const customers = await api(
      `/api/customers?status=active&search=${encodeURIComponent(q)}`,
    );
    _posCustomerResults = Array.isArray(customers) ? customers.slice(0, 8) : [];
    if (!_posCustomerResults.length) {
      resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No customer found. Continue typing to create/link on checkout.</div>`;
      resultsEl.classList.remove("hidden");
      return;
    }

    resultsEl.innerHTML = _posCustomerResults
      .map(
        (c) => `
      <button type="button" onclick="selectPOSCustomer(${c.id})" class="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-b border-slate-100 dark:border-slate-800 last:border-b-0">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-slate-800 dark:text-slate-100">${c.name}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">${c.phone || "No phone"}${c.email ? ` · ${c.email}` : ""}</div>
          </div>
          <div class="text-right">
            <div class="text-[11px] font-bold ${Number(c.current_balance || 0) > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">
              ${Number(c.current_balance || 0) > 0.01 ? `Due Rs. ${Number(c.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "Cleared"}
            </div>
          </div>
        </div>
      </button>
    `,
      )
      .join("");
    resultsEl.classList.remove("hidden");
  } catch (err) {
    resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-rose-500">Search failed: ${err.message}</div>`;
    resultsEl.classList.remove("hidden");
  }
}

function selectPOSCustomer(customerId) {
  const customer = _posCustomerResults.find((c) => c.id === customerId);
  if (!customer) return;

  _posSelectedCustomer = customer;
  if ($c("pos-customer-id")) $c("pos-customer-id").value = customer.id;
  if ($c("pos-customer")) $c("pos-customer").value = customer.name || "";
  if ($c("pos-phone")) $c("pos-phone").value = customer.phone || "";

  const resultsEl = $c("pos-customer-results");
  if (resultsEl) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
  }

  renderPOSSelectedCustomerBadge();
}

function clearPOSCustomerSelection() {
  _posSelectedCustomer = null;
  _posCustomerResults = [];
  if ($c("pos-customer-id")) $c("pos-customer-id").value = "";
  if ($c("pos-customer")) $c("pos-customer").value = "";
  if ($c("pos-phone")) $c("pos-phone").value = "";
  const resultsEl = $c("pos-customer-results");
  if (resultsEl) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
  }
  renderPOSSelectedCustomerBadge();
}

function syncPOSCustomerManualEntry() {
  const currentName = $c("pos-customer")?.value.trim() || "";
  const currentPhone = $c("pos-phone")?.value.trim() || "";
  if (_posSelectedCustomer) {
    const sameName = currentName === (_posSelectedCustomer.name || "");
    const samePhone = currentPhone === (_posSelectedCustomer.phone || "");
    if (!sameName || !samePhone) {
      _posSelectedCustomer = null;
      if ($c("pos-customer-id")) $c("pos-customer-id").value = "";
      renderPOSSelectedCustomerBadge();
    }
  }
}

function renderPOSSelectedCustomerBadge() {
  const badge = $c("pos-selected-customer-badge");
  if (!badge) return;

  if (!_posSelectedCustomer) {
    badge.classList.add("hidden");
    badge.innerHTML = "";
    return;
  }

  badge.classList.remove("hidden");
  badge.innerHTML = `
    <div class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30">
      <div>
        <div class="text-xs uppercase font-black tracking-widest text-indigo-500 dark:text-indigo-400">Linked Customer</div>
        <div class="font-semibold text-slate-800 dark:text-slate-100">${_posSelectedCustomer.name}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${_posSelectedCustomer.phone || "No phone"} · ${Number(_posSelectedCustomer.current_balance || 0) > 0.01 ? `Current Due Rs. ${Number(_posSelectedCustomer.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "No due balance"}</div>
      </div>
      <button type="button" onclick="clearPOSCustomerSelection()" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
        Unlink
      </button>
    </div>
  `;
}
// ─── Close modal on backdrop click (prevent if static) ───────────────────
$c("modal").addEventListener("click", (e) => {
  if (e.target === $c("modal")) {
    if ($c("modal").dataset.static === "true") return;
    closeModal();
  }
});

// ─── Start (moved to end of file after all functions are defined) ───
function renderLobby() {
  document.body.classList.add("lobby-active");
  const content = document.getElementById("page-content");

  // Filter panels based on user permissions
  const allowed = AVAILABLE_PANELS.filter(p => {
    if (currentUser.role === 'superadmin') {
      return PLATFORM_OWNER_PANELS.includes(p.id);
    }
    const allowedPanels = currentUser.allowed_panels || [];
    return allowedPanels.includes(p.id);
  });

  if (allowed.length === 0) {
    const dash = AVAILABLE_PANELS.find(p => p.id === 'dashboard');
    if (dash) allowed.push(dash);
  }

  content.innerHTML = `
    <div class="flex items-center justify-between gap-4 mb-10 pb-6 border-b border-indigo-200 dark:border-indigo-900/50">
      <div>
        <h3 class="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Switch Modules</h3>
        <p class="text-sm text-slate-500 font-medium italic mt-1">Select an active node to manage your operations</p>
      </div>
    </div>

    <div class="lobby-grid">
        ${(() => {
      return allowed.map((p, i) => {
        return `
              <div class="lobby-item" onclick="navigate('${p.id}')" style="animation-delay: ${i * 50}ms">
                  <div class="lobby-icon-wrap">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                          ${p.icon}
                      </svg>
                  </div>
                  <div class="lobby-label">${p.label}</div>
              </div>
            `;
      }).join("");
    })()}
    </div>
  `;
}

// ─── TABLE MANAGEMENT ────────────────────────────────────────────────────────
let _allTables = [];
async function renderTables() {
  let tables = [];
  try { tables = await api('/api/tables'); } catch (e) { }
  _allTables = tables;

  const isReadOnly = currentUser.role !== 'admin' && currentUser.role !== 'superadmin' && currentUser.role !== 'manager';
  const statusColor = { available: 'bg-emerald-500', occupied: 'bg-red-500', reserved: 'bg-amber-500' };
  const statusLabel = { available: '✅ Available', occupied: '🔴 Occupied', reserved: '🟡 Reserved' };
  const statusBg = { available: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', occupied: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800', reserved: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' };

  $c('page-content').innerHTML = `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Header Bar -->
      <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-xl">🪑</div>
          <div>
            <h3 class="font-black text-slate-900 dark:text-white text-sm">Floor Plan</h3>
            <p class="text-xs text-slate-500">${tables.filter(t => t.status === 'available').length} available, ${tables.filter(t => t.status === 'occupied').length} occupied</p>
          </div>
        </div>
        ${!isReadOnly ? `
        <div class="flex gap-2">
          <button onclick="renderFloors()" class="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-2">
            🏢 Floors
          </button>
          <button onclick="showAddTableModal()" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            Add Table
          </button>
        </div>
        ` : ''}
      </div>

      <!-- Status Legend -->
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-emerald-500"></div><span class="text-xs font-bold text-slate-500">Available</span></div>
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-red-500"></div><span class="text-xs font-bold text-slate-500">Occupied</span></div>
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-amber-500"></div><span class="text-xs font-bold text-slate-500">Reserved</span></div>
      </div>

      <!-- Table Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        ${tables.length === 0 ? `
          <div class="col-span-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div class="text-5xl mb-3">🪑</div>
            <p class="text-slate-500 text-sm font-medium">No tables configured yet</p>
            <button onclick="showAddTableModal()" class="mt-4 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all">Add Your First Table</button>
          </div>
        ` : tables.map(t => `
          <div class="group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl ${statusBg[t.status] || 'bg-white border-slate-200'}"
               onclick="showTableActions(${t.id}, '${t.table_number}', '${t.status}', ${t.capacity})">
            <div class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${statusColor[t.status] || 'bg-slate-400'}"></div>
            <div class="text-3xl mb-1">🪑</div>
            <div class="font-black text-slate-900 dark:text-white text-lg">${t.table_number}</div>
            <div class="text-xs font-medium text-slate-500 mt-1">Cap: ${t.capacity} guests</div>
            <div class="text-[10px] font-black uppercase tracking-wide mt-1 ${t.status === 'available' ? 'text-emerald-600' : t.status === 'occupied' ? 'text-red-600' : 'text-amber-600'}">${t.status}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── FLOOR MANAGEMENT ─────────────────────────────────────────────────────────
async function renderFloors() {
  let floors = [];
  try { floors = await api('/api/tables/floors'); } catch (e) { }

  $c('page-content').innerHTML = `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white text-xl">🏢</div>
          <div>
            <h3 class="font-black text-slate-900 dark:text-white text-sm">Floor Management</h3>
            <p class="text-xs text-slate-500">${floors.length} floors configured</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="renderTables()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs transition-all">
            Back to Tables
          </button>
          <button onclick="showAddFloorModal()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2">
            + Add Floor
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${floors.length === 0 ? `
          <div class="col-span-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <p class="text-slate-500 text-sm font-medium">No floors configured yet</p>
          </div>
        ` : floors.map(f => `
          <div class="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
            <div class="flex items-center gap-4">
              <div class="text-2xl">🏢</div>
              <div class="font-black text-slate-900 dark:text-white">${f.name}</div>
            </div>
            <button onclick="deleteFloor(${f.id})" class="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function showAddFloorModal() {
  openModal('Add New Floor', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Floor Name</label>
        <input id="new-floor-name" type="text" placeholder="e.g. Ground Floor, Rooftop" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
      </div>
      <button onclick="addFloor()" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all">Create Floor</button>
    </div>
  `, 'max-w-sm');
}

async function addFloor() {
  const name = $c('new-floor-name').value.trim();
  if (!name) return toast('Floor name is required', 'error');
  try {
    await api('/api/tables/floors', 'POST', { name });
    toast('Floor created!');
    closeModal();
    renderFloors();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteFloor(id) {
  if (!confirm('Are you sure you want to delete this floor? Tables assigned to it will remain but won\'t have a floor.')) return;
  try {
    await api(`/api/tables/floors/${id}`, 'DELETE');
    toast('Floor deleted');
    renderFloors();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showAddTableModal() {
  let floors = [];
  try { floors = await api('/api/tables/floors'); } catch (e) { }

  openModal('Add New Table', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Floor</label>
        <select id="new-table-floor" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold">
          <option value="">-- No Floor --</option>
          ${floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Table Number / Name</label>
        <input id="new-table-number" type="text" placeholder="e.g. T5, VIP-1, Terrace-2" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold" />
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Capacity (guests)</label>
        <input id="new-table-capacity" type="number" min="1" value="4" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold" />
      </div>
      <button onclick="addTable()" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all">Add Table</button>
    </div>
  `, 'max-w-sm');
}

async function addTable() {
  const table_number = $c('new-table-number').value.trim();
  const capacity = parseInt($c('new-table-capacity').value) || 4;
  const floor_id = parseInt($c('new-table-floor')?.value) || null;
  if (!table_number) return toast('Table number/name is required', 'error');
  try {
    await api('/api/tables', 'POST', { table_number, capacity, floor_id });
    toast('Table added!');
    closeModal();
    renderTables();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showTableActions(id, tableNumber, status, capacity) {
  const isReadOnly = currentUser.role !== 'admin' && currentUser.role !== 'superadmin' && currentUser.role !== 'manager';
  openModal(`Table ${tableNumber}`, `
    <div class="space-y-3">
      <p class="text-slate-500 text-sm">Current status: <span class="font-bold ${status === 'available' ? 'text-emerald-600' : status === 'occupied' ? 'text-red-600' : 'text-amber-600'}">${status.toUpperCase()}</span></p>
      <div class="grid grid-cols-1 gap-2">
        ${!isReadOnly ? `
        <button onclick="setTableStatus(${id},'available')" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all flex items-center justify-center gap-2">✅ Mark Available</button>
        <button onclick="setTableStatus(${id},'occupied')" class="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all flex items-center justify-center gap-2">🔴 Mark Occupied</button>
        <button onclick="setTableStatus(${id},'reserved')" class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold transition-all flex items-center justify-center gap-2">🟡 Mark Reserved</button>
        ` : ''}
        <button onclick="closeModal();navigate('pos')" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center justify-center gap-2">🍽️ New Order for this Table</button>
      </div>
    </div>
  `, 'max-w-sm');
}

async function setTableStatus(id, status) {
  try {
    await api(`/api/tables/${id}/status`, 'PATCH', { status });
    toast(`Table marked as ${status}!`);
    closeModal();
    renderTables();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Quotation System (Client Side) ───────────────────────────────────

async function generateQuotation() {
  if (!cart.length)
    return toast("No items in cart to generate quotation.", "error");

  const discount = parseFloat($c("pos-discount").value) || 0;
  const tax_percentage = parseFloat($c("pos-tax").value) || 0;

  // Get customer info based on order type
  const orderType = window._posOrderType || "dine_in";
  let customer_name = "Valued Customer";
  let customer_phone = "";

  if (orderType === "dine_in") {
    customer_name = $c("pos-customer")?.value.trim() || "Valued Customer";
    customer_phone = $c("pos-phone")?.value.trim() || "";
  } else if (orderType === "delivery") {
    customer_name = $c("pos-delivery-name")?.value.trim() || "Valued Customer";
    customer_phone = $c("pos-delivery-phone")?.value.trim() || "";
  } else if (orderType === "takeaway") {
    customer_name = $c("pos-takeaway-name")?.value.trim() || "Valued Customer";
  }

  // Fetch shop settings for proper branding
  const shop = await fetchReceiptSettings();

  const quotationData = {
    items: cart.map((c) => ({
      name: c.product ? c.product.name : c.name || "Unknown Item",
      sku: c.product ? c.product.sku : "",
      brand: c.product ? c.product.brand_name : "",
      quantity: c.quantity,
      price: c.selling_price,
      total: c.quantity * c.selling_price,
    })),
    discount,
    tax_percentage,
    customer_name,
    customer_phone,
    shop,
    seller: currentUser.name || currentUser.username,
    date: new Date().toLocaleString(),
    orderType: orderType.toUpperCase(),
  };

  printQuotation(quotationData);
}

function printQuotation(data) {
  const {
    items,
    discount,
    tax_percentage,
    customer_name,
    customer_phone,
    shop,
    seller,
    date,
    orderType,
  } = data;

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmt = (subtotal - discount) * (tax_percentage / 100);
  const grandTotal = subtotal - discount + taxAmt;

  const shopName = shop?.name || "Our Menu";
  const logoPath = shop?.logo_path || "";
  const address = shop?.receipt_address || "";
  const phone = shop?.receipt_phone || "";
  const policies = shop?.receipt_policies || "";

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Estimate - ${customer_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; background: #f8fafc; }
        .page { width: 210mm; min-height: 297mm; margin: 10mm auto; background: white; padding: 20mm; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); box-sizing: border-box; position: relative; }
        @media print {
            @page { size: A4; margin: 0; }
            body { background: white; margin: 0; padding: 0; }
            .page { margin: 0; box-shadow: none; border: none; width: 210mm; height: 297mm; padding: 15mm; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
        .shop-info h1 { margin: 0; color: #4338ca; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase; }
        .shop-info p { margin: 2px 0; font-size: 13px; color: #64748b; font-weight: 500; }
        .quote-title-box { text-align: right; }
        .quote-title-box h2 { margin: 0; font-size: 32px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 2px; }
        .quote-title-box p { margin: 5px 0 0; font-size: 14px; font-weight: 600; color: #6366f1; }
        
        .meta-grid { display: flex; justify-content: space-between; margin-bottom: 40px; background: #fcfdfe; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
        .meta-col h3 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 0 0 8px; }
        .meta-col p { margin: 0; font-size: 14px; font-weight: 700; color: #334155; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
        td { padding: 15px 10px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #475569; }
        .col-qty { text-align: center; }
        .col-price, .col-total { text-align: right; }
        .row-item-name { font-weight: 700; color: #1e293b; }
        
        .footer-grid { display: flex; justify-content: space-between; margin-top: 20px; }
        .notes-section { width: 60%; }
        .notes-section h4 { font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 10px; text-transform: uppercase; text-decoration: underline; }
        .notes-content { font-size: 12px; color: #64748b; font-style: italic; white-space: pre-wrap; }
        
        .totals-section { width: 35%; }
        .total-item { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; font-weight: 500; color: #475569; }
        .total-grand { border-top: 2px solid #1e293b; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: 800; color: #1e293b; }
        
        .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 120px; font-weight: 900; color: rgba(0,0,0,0.03); pointer-events: none; text-transform: uppercase; white-space: nowrap; }
    </style>
</head>
<body>
    <div class="page">
        <div class="watermark">QUOTATION</div>
        <div class="header">
            <div class="shop-info">
                ${logoPath ? `<img src="${logoPath}" style="max-height: 60px; margin-bottom: 10px; display: block;">` : `<h1>${shopName}</h1>`}
                <p>${address}</p>
                <p>Phone: ${phone}</p>
            </div>
            <div class="quote-title-box">
                <h2>ESTIMATE</h2>
                <p>Service Type: ${orderType}</p>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-col">
                <h3>Customer</h3>
                <p>${customer_name}</p>
                <p style="font-weight: 500; font-size: 12px;">${customer_phone}</p>
            </div>
            <div class="meta-col">
                <h3>Quote Date</h3>
                <p>${date}</p>
            </div>
            <div class="meta-col">
                <h3>Wait Staff</h3>
                <p>${seller}</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 50%;">Menu Item</th>
                    <th class="col-qty">Quantity</th>
                    <th class="col-price">Unit Price</th>
                    <th class="col-total">Total</th>
                </tr>
            </thead>
            <tbody>
                ${items
      .map(
        (item) => `
                <tr>
                    <td>
                        <span class="row-item-name">${item.name}</span>
                        ${item.sku ? `<div style="font-size: 10px; color: #94a3b8;">Code: ${item.sku}</div>` : ""}
                    </td>
                    <td class="col-qty">${item.quantity}</td>
                    <td class="col-price">Rs. ${item.price.toFixed(0)}</td>
                    <td class="col-total">Rs. ${item.total.toFixed(0)}</td>
                </tr>
                `,
      )
      .join("")}
            </tbody>
        </table>

        <div class="footer-grid">
            <div class="notes-section">
                <h4>Terms & Conditions</h4>
                <div class="notes-content">
1. This is a price estimate only. 
2. Inventory is not reserved. Prices may vary.
3. This is NOT a taxable fiscal receipt. 
${policies ? `\n${policies}` : ""}
                </div>
            </div>
            <div class="totals-section">
                <div class="total-item">
                    <span>Subtotal</span>
                    <span>Rs. ${subtotal.toFixed(0)}</span>
                </div>
                ${discount > 0 ? `<div class="total-item" style="color: #ef4444;"><span>Discount</span><span>-Rs. ${discount.toFixed(0)}</span></div>` : ""}
                ${tax_percentage > 0 ? `<div class="total-item"><span>Tax (${tax_percentage}%)</span><span>Rs. ${taxAmt.toFixed(0)}</span></div>` : ""}
                <div class="total-item total-grand">
                    <span>Estimated Total</span>
                    <span>Rs. ${grandTotal.toFixed(0)}</span>
                </div>
            </div>
        </div>

        <div style="margin-top: 80px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
           <p style="font-size: 11px; color: #94a3b8; font-weight: 600;">Computer Generated Estimate — Valid for 24 Hours</p>
        </div>
    </div>
    <script>
        window.onload = () => { window.print(); }
    <\/script>
</body>
</html>`);
  win.document.close();
}

init();

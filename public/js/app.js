// ─── Theme ───────────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
}

// ─── State ──────────────────────────────────────────────────────────
let currentUser = null;
let cart = [];
let allProducts = [];
let _expenseView = 'list';
let _expenseMonth = new Date().toISOString().slice(0, 7);
let _expensePage = 1;
let _expenseCategories = [];
let shops = [];
let managedShopId = null; // ─── Setup ────────────────────────────────────────────────────────
const AVAILABLE_PANELS = [
  { id: 'dashboard', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>', label: 'Dashboard' },
  { id: 'pos', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>', label: 'POS Terminal' },
  { id: 'brands', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>', label: 'Brand Management' },
  { id: 'products', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>', label: 'Products & Inventory' },
  { id: 'sales-history', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>', label: 'Sales Operations' },
  { id: 'expenses', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>', label: 'Expense Management' },
  { id: 'support', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>', label: 'Support Hub' }
];

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    currentUser = data.user;
    document.getElementById('user-name-sidebar').textContent = currentUser.name || currentUser.username;
    document.getElementById('user-role-sidebar').textContent = currentUser.role;
    document.getElementById('user-avatar').textContent = (currentUser.name || currentUser.username)[0].toUpperCase();

    // Panel visibility
    AVAILABLE_PANELS.forEach(p => {
      const el = document.getElementById(`nav-${p.id}`);
      if (el) {
        if (currentUser.role === 'superadmin') {
          // Master Admin only sees Dashboard (Global stats later)
          el.style.display = p.id === 'dashboard' ? 'flex' : 'none';
        } else if (p.id === 'support' || (currentUser.allowed_panels && currentUser.allowed_panels.includes(p.id))) {
          el.style.display = 'flex';
        } else {
          el.style.display = 'none';
        }
      }
    });

    // Side badges depend on Products and Sales
    if (currentUser.role === 'superadmin') {
      document.getElementById('nav-products-low-stock').style.display = 'none';
      document.getElementById('nav-sales-pending').style.display = 'none';
    } else {
      if (!currentUser.allowed_panels || !currentUser.allowed_panels.includes('products')) document.getElementById('nav-products-low-stock').style.display = 'none';
      if (!currentUser.allowed_panels || !currentUser.allowed_panels.includes('sales-history')) document.getElementById('nav-sales-pending').style.display = 'none';
    }

    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') document.getElementById('nav-users-wrap').classList.remove('hidden');
    if (currentUser.role === 'superadmin') {
      document.getElementById('nav-shops-wrap').classList.remove('hidden');
      const sData = await fetch('/api/shops').then(r => r.json());
      shops = Array.isArray(sData) ? sData : [];
    }

    setInterval(() => {
      document.getElementById('header-time').textContent = new Date().toLocaleString();
    }, 1000);

    let startPage = localStorage.getItem('pos_page') || 'dashboard';
    if (currentUser.role !== 'superadmin' && currentUser.allowed_panels && !currentUser.allowed_panels.includes(startPage)) {
      startPage = currentUser.allowed_panels[0] || 'dashboard';
    }
    navigate(startPage);
  } catch (e) { console.error('Init Error:', e); window.location.href = '/'; }
}

// ─── Router ──────────────────────────────────────────────────────────
function navigate(page) {
  if (currentUser.role !== 'superadmin' && !AVAILABLE_PANELS.map(p => p.id).includes(page)) {
    // Check sub-pages
    const parentMap = { 'products-low-stock': 'products', 'sales-pending': 'sales-history' };
    const parent = parentMap[page];
    if (parent && (!currentUser.allowed_panels || !currentUser.allowed_panels.includes(parent))) return false;
    if (!parent && page !== 'support' && page !== 'users' && (!currentUser.allowed_panels || !currentUser.allowed_panels.includes(page))) return false;
  }

  localStorage.setItem('pos_page', page);
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
  const titles = {
    dashboard: 'Dashboard',
    brands: 'Brands',
    products: 'Products',
    pos: 'POS / Checkout',
    'sales-history': 'Sales History',
    expenses: 'Expenses',
    users: 'Users (Admin)',
    subscriptions: 'Subscription Tracking',
    hierarchy: 'Master Platform Hierarchy',
    support: 'Support Hub'
  };
  if (page === 'dashboard' && currentUser.role === 'superadmin') titles.dashboard = 'System Overview (Master Admin)';
  document.getElementById('page-title').textContent = titles[page] || page;
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="flex items-center justify-center h-40 text-slate-600">Loading…</div>';
  const pages = {
    dashboard: renderDashboard,
    brands: renderBrands,
    products: renderProducts,
    'products-low-stock': () => renderProducts(true),
    pos: renderPOS,
    'sales-history': renderSalesHistory,
    'sales-pending': () => renderSalesHistory(true),
    expenses: renderExpenses,
    users: renderUsers,
    subscriptions: renderSubscriptions,
    hierarchy: renderHierarchy,
    support: renderSupportHub
  };
  if (pages[page]) pages[page]();

  // Highlight active menu for sub-filters
  if (page === 'products-low-stock') {
    $c('page-title').textContent = 'Low Stock Products';
    const navProducts = document.getElementById('nav-products');
    if (navProducts) navProducts.classList.add('active');
  } else if (page === 'sales-pending') {
    $c('page-title').textContent = 'Pending Dues';
    const navSales = document.getElementById('nav-sales-history');
    if (navSales) navSales.classList.add('active');
  }

  return false;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function openSettings() {
  const html = `
    <div class="space-y-6">
      <div class="flex flex-col items-center text-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
        <div class="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg">
          ${(currentUser.name || 'A')[0]}
        </div>
        <div>
          <h4 class="text-xl font-bold text-slate-800 dark:text-white">${currentUser.name}</h4>
          <p class="text-indigo-600 dark:text-indigo-400 font-medium font-mono text-sm">@${currentUser.username}</p>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div class="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Email</label>
          <div class="font-medium dark:text-slate-200">${currentUser.email || 'Not provided'}</div>
        </div>
        <div class="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Phone</label>
          <div class="font-medium dark:text-slate-200">${currentUser.phone || 'Not provided'}</div>
        </div>
        <div class="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Role</label>
          <div class="font-medium dark:text-slate-200 uppercase">${currentUser.role.replace('_', ' ')}</div>
        </div>
        <div class="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Status</label>
          <div class="font-medium text-emerald-600 dark:text-emerald-400 uppercase">${currentUser.status || 'Active'}</div>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
        <p class="text-xs text-amber-700 dark:text-amber-400">Settings currently only allows viewing profile details. Password change and other settings are coming soon.</p>
      </div>
      
      <button onclick="logout()" class="w-full py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 font-bold border border-rose-100 dark:border-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all">Sign Out</button>
    </div>
  `;
  openModal("User Settings", html, "max-w-md");
}

// ─── Helpers ─────────────────────────────────────────────────────────
const $c = document.getElementById.bind(document);

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'API Error');
  }
  return data;
}

function updateLowStockBadge(productsArray) {
  const lowItems = productsArray.filter(p => p.stock <= p.min_stock_level);
  const countSpan = $c('low-stock-count');
  if (countSpan) {
    if (lowItems.length > 0) {
      countSpan.textContent = lowItems.length;
      countSpan.classList.remove('hidden');
    } else {
      countSpan.classList.add('hidden');
    }
  }
}

function updatePendingDuesBadge(salesArray) {
  const pendingSales = salesArray.filter(s => (s.total - s.amount_received) > 0);
  const countSpan = $c('pending-dues-count');
  if (countSpan) {
    if (pendingSales.length > 0) {
      countSpan.textContent = pendingSales.length;
      countSpan.classList.remove('hidden');
    } else {
      countSpan.classList.add('hidden');
    }
  }
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  const base = 'fixed top-5 right-5 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all transform flex items-center gap-2';
  el.className = `${base} ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(title, bodyHtml, sizeClass = 'max-w-lg', isStatic = false) {
  const modal = document.getElementById('modal');
  const closeBtn = modal.querySelector('button[onclick="closeModal()"]');

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-box').className = `glass rounded-2xl w-full shadow-xl transition-all ${sizeClass}`;

  if (isStatic) {
    if (closeBtn) closeBtn.classList.add('hidden');
    modal.dataset.static = "true";
  } else {
    if (closeBtn) closeBtn.classList.remove('hidden');
    delete modal.dataset.static;
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  $c('modal').classList.add('hidden');
}

// Click outside to close modal (if not static)
document.getElementById('modal').addEventListener('click', function (e) {
  if (e.target === this && this.dataset.static !== "true") {
    closeModal();
  }
});

function statCard(label, value, sub, color = 'blue') {
  const themes = {
    blue: { light: 'bg-blue-50 border-blue-200', dark: 'dark:bg-blue-950/30 dark:border-blue-800', label: 'text-blue-700 dark:text-blue-300', val: 'text-blue-900 dark:text-white' },
    emerald: { light: 'bg-emerald-50 border-emerald-200', dark: 'dark:bg-emerald-950/30 dark:border-emerald-800', label: 'text-emerald-700 dark:text-emerald-300', val: 'text-emerald-900 dark:text-white' },
    rose: { light: 'bg-rose-50 border-rose-200', dark: 'dark:bg-rose-950/30 dark:border-rose-800', label: 'text-rose-700 dark:text-rose-300', val: 'text-rose-900 dark:text-white' },
    amber: { light: 'bg-amber-50 border-amber-200', dark: 'dark:bg-amber-950/30 dark:border-amber-800', label: 'text-amber-700 dark:text-amber-300', val: 'text-amber-900 dark:text-white' },
  };
  const t = themes[color] || themes.blue;
  return `<div class="rounded-2xl p-6 border ${t.light} ${t.dark} shadow-sm transition-all duration-300">
    <div class="text-xs font-semibold ${t.label} uppercase tracking-wider mb-2">${label}</div>
    <div class="text-3xl font-bold ${t.val} mb-1 leading-tight">${value}</div>
    ${sub ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${sub}</div>` : ''}
  </div>`;
}

// ─── Dashboard ───────────────────────────────────────────────────────
// ─── Dashboard state ──────────────────────────────────────────────────────────
let _dashPeriod = 'all';
let _dashBrandId = '';
let _dashFrom = '';
let _dashTo = '';

async function renderDashboard(period, brandId, from, to) {
  if (period !== undefined) _dashPeriod = period;
  if (brandId !== undefined) _dashBrandId = brandId;
  if (from !== undefined) _dashFrom = from;
  if (to !== undefined) _dashTo = to;

  // Build query string
  const qs = new URLSearchParams();
  if (_dashFrom || _dashTo) {
    if (_dashFrom) qs.set('from', _dashFrom);
    if (_dashTo) qs.set('to', _dashTo);
  } else if (_dashPeriod && _dashPeriod !== 'all') {
    qs.set('period', _dashPeriod);
  }

  if (_dashBrandId && _dashBrandId !== '') qs.set('brand_id', _dashBrandId);
  const url = '/api/analytics' + (qs.toString() ? '?' + qs.toString() : '');

  const data = await api(url);
  if (data.isGlobal) return renderGlobalDashboard(data);

  const brands = data.brands || [];

  const PERIOD_OPTS = [
    { val: 'all', label: 'All Time' },
    { val: '1m', label: 'Last 1 Month' },
    { val: '2m', label: 'Last 2 Months' },
    { val: '6m', label: 'Last 6 Months' },
    { val: '1y', label: 'Last Year' },
  ];

  const periodSelect = `
    <select id="dash-period-filter" onchange="renderDashboard(this.value, document.getElementById('dash-brand-filter')?.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
      ${PERIOD_OPTS.map(o => `<option value="${o.val}" ${_dashPeriod === o.val ? 'selected' : ''}>${o.label}</option>`).join('')}
    </select>`;

  const fromInput = `
    <input type="date" id="dash-from-filter" value="${_dashFrom || ''}" onchange="renderDashboard(undefined, undefined, this.value, undefined)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">`;

  const toInput = `
    <input type="date" id="dash-to-filter" value="${_dashTo || ''}" onchange="renderDashboard(undefined, undefined, undefined, this.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">`;

  const brandSelect = brands.length > 1 ? `
    <select id="dash-brand-filter" onchange="renderDashboard(undefined, this.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
      <option value="">All Brands</option>
      ${brands.map(b => `<option value="${b.id}" ${String(_dashBrandId) === String(b.id) ? 'selected' : ''}>${b.name}</option>`).join('')}
    </select>` : '';

  // Determine whether any filter is active for a subtle badge
  const isFiltered = _dashPeriod !== 'all' || (_dashBrandId !== '' && _dashBrandId !== null) || _dashFrom !== '' || _dashTo !== '';

  $c('page-content').innerHTML = `
    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
        </svg>
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Filter Sales</span>
        ${isFiltered ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800">ACTIVE</span>' : ''}
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
        ${brandSelect ? `<div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Brand</span>
          ${brandSelect}
        </div>` : ''}
        ${isFiltered ? `<button onclick="_dashFrom='';_dashTo='';renderDashboard('all', '')" class="text-xs font-semibold text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-800 transition-all flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>Clear</button>` : ''}
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      ${statCard('Total Revenue', 'Rs. ' + Number(data.totalRevenue).toLocaleString(), `${data.totalSales} transaction${data.totalSales !== 1 ? 's' : ''}`, 'blue')}
      ${statCard('Cost of Goods Sold', 'Rs. ' + Number(data.totalCOGS).toLocaleString(), 'Sum of buying prices', 'rose')}
      ${statCard('Gross Profit', 'Rs. ' + Number(data.netProfit).toLocaleString(), 'Revenue − COGS', 'emerald')}
      ${statCard('Products', data.totalProducts, 'in catalog', 'amber')}
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
          ${data.topProducts.length ? `
            <div class="space-y-1">
              ${data.topProducts.map((p, i) => `
                <div class="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <span class="w-6 h-6 flex-shrink-0 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">${i + 1}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-800 dark:text-gray-200 font-semibold truncate">${p.name}</div>
                    ${p.brand_name ? `<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">${p.brand_name}</div>` : ''}
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold">${p.qty_sold} sold</span>
                    <div class="text-right">
                      <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">Rs. ${Number(p.revenue).toLocaleString()}</div>
                      <div class="text-[10px] text-rose-500 font-mono">COGS: Rs. ${Number(p.cogs || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>`).join('')}
            </div>` : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'}
        </div>
      </div>

      <!-- Recent Sales -->
      <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Recent Sales</h3>
        </div>
        <div class="p-4">
          ${data.recentSales.length ? `
            <div class="space-y-0.5">
              ${data.recentSales.map(s => `
                <div class="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                  <div class="text-xs text-gray-500 dark:text-gray-400">${new Date(s.created_at).toLocaleString()}</div>
                  <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">Rs. ${Number(s.total).toLocaleString()}</div>
                </div>`).join('')}
            </div>` : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'}
        </div>
      </div>
    </div>`;
}

function renderGlobalDashboard(data) {
  $c('page-content').innerHTML = `
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
  const url = managedShopId ? `/api/brands?shopId=${managedShopId}` : '/api/brands';

  const brands = await api(url);

  const shopName = managedShopId ? ` for ${shops.find(s => s.id === managedShopId)?.name}` : '';

  const getAvatar = (name) => {
    const init = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const colors = ['bg-indigo-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 'bg-blue-500', 'bg-violet-500'];
    const idx = (name.charCodeAt(0) + name.length) % colors.length;
    return { init, color: colors[idx] };
  };

  const cardsHtml = brands.map(b => {
    const { init, color } = getAvatar(b.name);
    return `
      <div class="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all group bg-white dark:bg-gray-900">
         <div class="flex flex-col items-center text-center">
            <div class="w-20 h-20 rounded-2xl ${color} flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg shadow-${color.split('-')[1]}-500/20">
              ${init}
            </div>
            <h4 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">${b.name}</h4>
            <p class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">Verified Brand</p>
         </div>
         <div class="mt-8 pt-5 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Registered</span>
              <span class="text-xs text-gray-600 dark:text-gray-400 font-medium">${new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: 'numeric' })}</span>
            </div>
            ${currentUser.role === 'superadmin' ? `
            <div class="flex gap-2">
               <button onclick="openEditBrand(${b.id}, '${b.name.replace(/'/g, "\\'")}')" class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-transparent hover:bg-indigo-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
               </button>
               <button onclick="deleteBrand(${b.id})" class="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-rose-600 dark:text-rose-400 border border-transparent hover:bg-red-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
            </div>
            ` : ''}
         </div>
      </div>
    `;
  }).join('');

  $c('page-content').innerHTML = `
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div>
        <h3 class="text-3xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Partner Brands${shopName}</h3>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">Directory of ${brands.length} official brands in the system</p>
      </div>
      ${currentUser.role === 'superadmin' ? `
        <button onclick="openAddBrand()" class="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 text-white text-sm font-bold transition-all active:scale-95">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Add Partner Brand
        </button>
      ` : ''}
    </div>
    
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
      ${cardsHtml || `<div class="col-span-full py-32 text-center">
          <div class="text-gray-300 dark:text-gray-700 mb-4 flex justify-center">
            <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          </div>
          <p class="text-gray-400 italic">No brands found in the registry.</p>
        </div>`}
    </div>
  `;
}

function openAddBrand() {
  openModal('Add Brand', `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Nike" /></div>
      <button onclick="saveBrand()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Save Brand</button>
    </div>`);
  setTimeout(() => $c('brand-name').focus(), 50);
}

function openEditBrand(id, name) {
  openModal('Edit Brand', `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" value="${name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <button onclick="saveBrand(${id})" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Brand</button>
    </div>`);
}

async function saveBrand(id) {
  const name = $c('brand-name').value.trim();
  if (!name) return toast('Brand name required', 'error');

  const payload = { name };
  if (managedShopId) payload.shopId = managedShopId;

  if (id) {
    await api(`/api/brands/${id}`, 'PUT', payload);
  } else {
    await api('/api/brands', 'POST', payload);
  }
  closeModal();
  toast('Brand saved!');
  renderBrands(managedShopId);
}

async function deleteBrand(id) {
  if (!confirm('Delete this brand? Products linked to it will also be deleted.')) return;
  const url = managedShopId ? `/api/brands/${id}?shopId=${managedShopId}` : `/api/brands/${id}`;
  const r = await api(url, 'DELETE');
  if (r.error) return toast(r.error, 'error');
  toast('Brand deleted');
  renderBrands(managedShopId);
}

function payBrandExpense(brandId, month, dueAmount) {
  openModal('Submit Brand Payment', `
    <div class="space-y-4">
      <p class="text-sm text-slate-400">Total remaining due for this month: <strong>Rs. ${Number(dueAmount).toLocaleString()}</strong></p>
      <div><label class="block text-xs text-slate-400 mb-1.5">Amount Paid (Rs.)</label>
        <input id="brand-exp-amount" type="number" min="1" max="${dueAmount}" value="${dueAmount}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <button onclick="submitBrandExpensePayment(${brandId}, '${month}')" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg hover:shadow-emerald-500/25">Confirm Payment</button>
    </div>
  `);
}

async function submitBrandExpensePayment(brandId, month) {
  const amountInput = document.getElementById('brand-exp-amount');
  if (!amountInput) return;
  const amount = parseFloat(amountInput.value) || 0;
  if (amount <= 0) return toast('Amount must be > 0', 'error');

  const r = await api('/api/brands/expense-payments', 'POST', { brand_id: brandId, amount, month });
  if (r.error) return toast(r.error, 'error');

  toast('Payment recorded successfully!');
  closeModal();
  renderBrands(); // Refresh list to update UI
}

// ─── Products ────────────────────────────────────────────────────────
async function renderProducts(onlyLowStock = false) {
  const [products, brands] = await Promise.all([api('/api/products'), api('/api/brands')]);
  allProducts = products;
  updateLowStockBadge(products);

  const displayList = onlyLowStock ? products.filter(p => p.stock <= p.min_stock_level) : products;
  const listTitle = onlyLowStock ? 'low stock product(s)' : 'product(s)';

  $c('page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <p class="text-slate-400 text-sm">${displayList.length} ${listTitle}</p>
        ${onlyLowStock ? `<button onclick="navigate('products')" class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Clear Filter</button>` : ''}
      </div>
      <button onclick="openAddProduct()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">+ Add Product</button>
    </div>
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-200 dark:border-slate-700 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">SKU</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Product</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Category</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Brand</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Cost</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Stock</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${displayList.length ? displayList.map(p => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">${p.sku}</td>
              <td class="px-5 py-4"><div class="font-medium text-slate-800 dark:text-slate-200">${p.name}</div><div class="text-xs text-slate-500">${p.description || ''}</div></td>
              <td class="px-5 py-4"><span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs">${p.category}</span></td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400">${p.brand_name || '—'}</td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400">Rs. ${p.buying_price}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${p.stock > p.min_stock_level ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : p.stock > 0 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}">
                  ${p.stock} units
                </span>
                <div class="text-[10px] text-slate-500 mt-1">Min: ${p.min_stock_level}</div>
              </td>
              <td class="px-5 py-4 text-right space-x-1">
                <button onclick="adjustStock(${p.id},'${p.name.replace(/'/g, "\\'")}',${p.stock})" class="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-transparent">Stock</button>
                <button onclick="openEditProduct(${p.id})" class="px-2 py-1 text-xs rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-all border border-indigo-200 dark:border-transparent">Edit</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500">No products. Add brands first, then products.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  window._productBrands = brands;
}

function productFormHtml(p = {}, brands = []) {
  const brandOptions = brands.map(b => `<option value="${b.id}" ${p.brand_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('');

  // Helper for numeric inputs with +/- buttons
  const numInput = (id, label, value, placeholder = '') => `
    <div class="col-span-2 sm:col-span-1">
      <label class="block text-xs text-slate-400 mb-1">${label}</label>
      <div class="flex items-center gap-2">
        <button type="button" onclick="this.nextElementSibling.stepDown()" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">-</button>
        <input id="${id}" type="number" value="${value}" class="flex-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="${placeholder}" />
        <button type="button" onclick="this.previousElementSibling.stepUp()" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">+</button>
      </div>
    </div>`;

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Basic Information</h4>
        </div>
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2 hidden sm:block"></div>

        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">SKU *</label>
          <input id="pf-sku" value="${p.sku || ''}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Unique code" /></div>
        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">Category *</label>
          <input id="pf-category" value="${p.category || ''}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="e.g. Electronics" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Product Name *</label>
          <input id="pf-name" value="${p.name || ''}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Product name" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Brand *</label>
          <select id="pf-brand" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"><option value="">Select brand</option>${brandOptions}</select></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Description</label>
          <input id="pf-desc" value="${p.description || ''}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Optional description" /></div>
        
        <div class="col-span-2 border-b border-slate-100 dark:border-slate-800 pb-2 mt-4 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Pricing & Inventory</h4>
        </div>

        ${numInput('pf-buy', 'Cost Price', p.buying_price || 0)}
        ${numInput('pf-stock', 'Initial Stock', p.stock || 0)}
        <div class="col-span-2">
           ${numInput('pf-min-stock', 'Minimum Stock Level', p.min_stock_level || 0, 'Alert threshold')}
        </div>
      </div>
    </div>`;
}

async function openAddProduct() {
  const brands = window._productBrands || await api('/api/brands');
  if (!brands.length) return toast('Create a brand first!', 'error');
  openModal('Add Product', productFormHtml({}, brands) + `<button onclick="saveProduct()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Save Product</button>`);
}

async function openEditProduct(id) {
  const brands = window._productBrands || await api('/api/brands');
  const product = allProducts.find(p => p.id === id) || {};
  openModal('Edit Product', productFormHtml(product, brands) + `<button onclick="saveProduct(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Product</button>`);
}

async function saveProduct(id) {
  const payload = {
    sku: $c('pf-sku').value.trim(),
    category: $c('pf-category').value.trim(),
    name: $c('pf-name').value.trim(),
    description: $c('pf-desc').value.trim(),
    brand_id: parseInt($c('pf-brand').value),
    buying_price: parseFloat($c('pf-buy').value),
    stock: parseInt($c('pf-stock').value),
    min_stock_level: parseInt($c('pf-min-stock').value)
  };
  if (!payload.sku || !payload.category || !payload.name || !payload.brand_id) return toast('SKU, Category, Name, and Brand required', 'error');
  const r = id ? await api(`/api/products/${id}`, 'PUT', payload) : await api('/api/products', 'POST', payload);
  if (r.error) return toast(r.error, 'error');
  closeModal(); toast('Product saved!'); renderProducts();
}


function adjustStock(id, name, current) {
  openModal(`Stock: ${name}`, `
    <div class="space-y-4">
      <p class="text-slate-400 text-sm">Current stock: <strong class="text-white">${current}</strong></p>
      <div><label class="block text-xs text-slate-400 mb-1.5">Adjust by (use negative to reduce)</label>
        <input id="stock-delta" type="number" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <div class="flex gap-2">
        <button onclick="doAdjustStock(${id},1)" class="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-all">Add Stock</button>
        <button onclick="doAdjustStock(${id},-1)" class="flex-1 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-medium transition-all">Remove Stock</button>
      </div>
    </div>`);
}

async function doAdjustStock(id, sign) {
  const delta = parseInt($c('stock-delta').value) * sign;
  const r = await api(`/api/products/${id}/stock`, 'PATCH', { delta });
  if (r.error) return toast(r.error, 'error');
  closeModal(); toast(`Stock updated to ${r.stock}`); renderProducts();
}

// ─── POS ─────────────────────────────────────────────────────────────
async function renderPOS() {
  const products = await api('/api/products');
  allProducts = products;
  updateLowStockBadge(products);

  cart = [];
  $c('page-content').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full transition-all">
      <!-- Products Panel -->
      <div class="lg:col-span-2 space-y-4">
        <input id="pos-search" oninput="filterPOSProducts()" placeholder="Search products…"
          class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" />
        <div id="pos-products" class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1"></div>
      </div>
      <!-- Cart Panel -->
      <div class="glass rounded-2xl p-5 flex flex-col shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
        <h3 class="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17"/></svg>
          Cart Items
        </h3>
        <div id="cart-items" class="flex-1 space-y-2 overflow-y-auto min-h-20"></div>
        <div class="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4 space-y-4">
          <div class="grid grid-cols-2 gap-4 text-base">
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Discount (Rs)</label>
               <div class="flex items-center gap-1">
                 <button type="button" onclick="$c('pos-discount').stepDown();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">-</button>
                 <input id="pos-discount" type="number" min="0" value="0" oninput="calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-medium shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                 <button type="button" onclick="$c('pos-discount').stepUp();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">+</button>
               </div>
             </div>
             
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Tax (%)</label>
               <div class="flex items-center gap-1">
                 <button type="button" onclick="$c('pos-tax').stepDown();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">-</button>
                 <input id="pos-tax" type="number" min="0" value="0" oninput="calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-medium shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                 <button type="button" onclick="$c('pos-tax').stepUp();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">+</button>
               </div>
             </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4 text-base pb-4 border-b border-slate-200 dark:border-slate-700">
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">Customer Name <span id="req-name" class="text-rose-500 hidden">*</span></label>
             <input id="pos-customer" type="text" placeholder="Optional" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all text-base shadow-sm" /></div>
             
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">Phone Number <span id="req-phone" class="text-rose-500 hidden">*</span></label>
             <input id="pos-phone" type="text" placeholder="Optional" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all text-base shadow-sm" /></div>
          </div>
          
          <div class="space-y-2 text-base text-slate-600 dark:text-slate-300">
             <div class="flex justify-between"><span>Subtotal</span><span id="cart-subtotal" class="font-medium">Rs. 0</span></div>
             <div class="flex justify-between"><span>Tax Amount</span><span id="cart-tax-amt" class="font-medium">Rs. 0.00</span></div>
          </div>
          
          <div class="flex justify-between text-xl font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-800 pt-4">
            <span>Grand Total</span>
            <span id="cart-total" data-total="0" class="text-indigo-600 dark:text-indigo-400">Rs. 0.00</span>
          </div>

          <div class="grid grid-cols-2 gap-4 text-base pt-4 border-t border-slate-200 dark:border-slate-800">
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Payment Method</label>
             <select id="pos-method" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base shadow-sm">
                <option value="cash">Cash</option>
                <option value="online">Online Transfer</option>
             </select></div>

             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Amount Received <span id="req-recv" class="text-rose-500 hidden">*</span></label>
               <div class="flex items-center gap-1">
                 <button type="button" onclick="$c('pos-received').stepDown();calculateRemaining()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">-</button>
                 <input id="pos-received" type="number" min="0" value="0" oninput="calculateRemaining()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-medium shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                 <button type="button" onclick="$c('pos-received').stepUp();calculateRemaining()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold">+</button>
               </div>
             </div>
          </div>

          <div class="flex justify-between text-lg font-bold mt-2">
            <span class="text-slate-500 dark:text-slate-300">Remaining / Change</span>
            <span id="cart-remaining" class="text-slate-800 dark:text-slate-100">Rs. 0.00</span>
          </div>

          <button onclick="checkout()" id="checkout-btn"
            class="w-full py-4 mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-lg shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-40">
            Checkout Sale
          </button>
        </div>
      </div>
    </div>`;
  renderPOSProducts(products);
}

function renderPOSProducts(products) {
  const el = $c('pos-products');
  el.innerHTML = products.map(p => `
    <button onclick="addToCart(${p.id})" ${p.stock === 0 ? 'disabled' : ''}
      class="product-card bg-white dark:bg-slate-900 rounded-2xl p-4 text-left flex flex-col ${p.stock === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} transition-all">
      <div>
        <!-- Product Name -->
        <h2 class="text-lg font-medium text-slate-900 dark:text-white uppercase tracking-tight mb-1 truncate">
          ${p.name}
        </h2>
        
        <!-- Brand Info -->
        <div class="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400 mb-4">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span class="text-sm font-semibold">${p.brand_name || 'No Brand'}</span>
        </div>

        <!-- SKU Badge -->
        <div class="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-800 mb-4">
          <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mr-2">SKU:</span>
          <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">${p.sku}</span>
        </div>
      </div>

      <!-- Stock Available -->
      <div class="flex items-end justify-between">
        <div class="flex flex-col">
          <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Available Stock</span>
          <span class="text-3xl font-black ${p.stock > 10 ? 'text-emerald-600 dark:text-emerald-400' : p.stock > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-rose-600 dark:text-rose-500'}">
            ${p.stock}
          </span>
        </div>
      </div>
    </button>`).join('') || '<p class="text-slate-500 dark:text-slate-400 col-span-3 py-10 text-center italic text-lg">No products matched your search.</p>';
}

function filterPOSProducts() {
  const q = $c('pos-search').value.toLowerCase();
  renderPOSProducts(allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.brand_name || '').toLowerCase().includes(q)));
}

/**
 * Prompts user for quantity and selling price before adding to cart
 */
function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  if (product.stock <= 0) return toast('Out of stock', 'error');

  const content = `
    <div class="space-y-6 py-2">
      <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
        <div class="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div class="font-bold text-slate-900 dark:text-white">${product.name}</div>
          <div class="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 mt-0.5">SKU: ${product.sku} | In Stock: ${product.stock}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Quantity</label>
          <div class="flex items-center gap-2">
            <button type="button" onclick="$c('add-cart-qty').stepDown()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">-</button>
            <input id="add-cart-qty" type="number" value="1" min="1" max="${product.stock}" class="flex-1 w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            <button type="button" onclick="$c('add-cart-qty').stepUp()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">+</button>
          </div>
        </div>
        <div class="space-y-2">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Selling Price (Rs)</label>
          <input id="add-cart-price" type="number" value="${product.buying_price || 0}" min="0" class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
        </div>
      </div>

      <div class="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold transition-all">Cancel</button>
        <button onclick="commitAddCart(${productId})" class="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all">Add to Cart</button>
      </div>
    </div>
  `;
  openModal('Add to Cart', content, 'max-w-md');
  setTimeout(() => $c('add-cart-qty').focus(), 100);
}

function commitAddCart(productId) {
  const qtyInput = $c('add-cart-qty');
  const priceInput = $c('add-cart-price');
  const qty = parseInt(qtyInput.value);
  const price = parseFloat(priceInput.value);
  const product = allProducts.find(p => p.id === productId);

  if (isNaN(qty) || qty <= 0) return toast('Invalid quantity', 'error');
  if (isNaN(price) || price < 0) return toast('Invalid price', 'error');
  if (qty > product.stock) return toast(`Only ${product.stock} items available`, 'error');

  const existing = cart.find(c => c.product_id === productId);
  if (existing) {
    if (existing.quantity + qty > product.stock) return toast('Exceeds available stock', 'error');
    existing.quantity += qty;
    existing.selling_price = price; // Update to latest price
  } else {
    cart.push({ product_id: productId, quantity: qty, selling_price: price, product });
  }

  closeModal();
  renderCart();
  toast('Item added to cart', 'success');
}

function updateCartQty(productId, qty) {
  const product = allProducts.find(p => p.id === productId);
  if (product && qty > product.stock) return toast('Exceeds stock', 'error');

  // Don't allow qty < 1. User must use delete button to remove.
  if (qty < 1) return toast('Quantity cannot be less than 1', 'warning');

  const item = cart.find(c => c.product_id === productId);
  if (item) item.quantity = qty;

  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.product_id !== productId);
  renderCart();
}

function renderCart() {
  const cartEl = $c('cart-items');
  const count = cart.reduce((a, b) => a + b.quantity, 0);

  // Show a simplified view instead of a long list
  cartEl.innerHTML = `
    <div class="flex flex-col items-center justify-center py-3 px-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
      <div class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 italic">Short Summary</div>
      <div class="text-xl font-black text-slate-900 dark:text-white mb-3">
        ${count} <span class="text-xs font-medium text-slate-400">Products</span>
      </div>
      <button onclick="showCartModal()" class="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 text-sm font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all flex items-center justify-center gap-2 group shadow-sm">
        <svg class="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
        Expand Cart & Manage
      </button>
    </div>`;

  calculateCartTotal();
}

/**
 * Opens a large modal to manage cart items details (useful for long carts)
 */
function showCartModal() {
  if (!cart.length) return toast('Cart is empty', 'info');

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
          ${cart.map(item => `
            <tr class="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
              <td class="py-4 px-2">
                <div class="font-bold text-slate-800 dark:text-slate-200">${item.product.name}</div>
                <div class="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 mt-0.5">${item.product.sku}</div>
              </td>
              <td class="py-4 px-2 text-slate-600 dark:text-slate-400 font-medium">Rs. ${item.selling_price}</td>
              <td class="py-4 px-2">
                <div class="flex items-center justify-center gap-3">
                  <button onclick="if(${item.quantity} > 1) { updateCartQty(${item.product_id}, ${item.quantity - 1}); showCartModal(); } else { toast('Use delete button to remove', 'info'); }" 
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 transition-all font-bold group-hover:shadow-sm">−</button>
                  <span class="w-6 text-center text-sm font-black text-slate-900 dark:text-slate-100">${item.quantity}</span>
                  <button onclick="updateCartQty(${item.product_id}, ${item.quantity + 1}); showCartModal();" 
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-600 dark:text-slate-400 hover:text-emerald-600 transition-all font-bold group-hover:shadow-sm">+</button>
                </div>
              </td>
              <td class="py-4 px-2 text-right font-black text-indigo-600 dark:text-indigo-400">
                Rs. ${(item.selling_price * item.quantity).toFixed(0)}
              </td>
              <td class="py-4 px-2 text-right">
                <button onclick="removeFromCart(${item.product_id}); cart.length ? showCartModal() : closeModal();" 
                  class="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" title="Remove">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 -mx-6 -mb-6 p-6 rounded-b-2xl">
       <div class="text-sm text-slate-500 dark:text-slate-400">Total Items: <span class="font-bold text-slate-900 dark:text-slate-100">${cart.reduce((a, b) => a + b.quantity, 0)}</span></div>
       <div class="text-xl font-black text-slate-900 dark:text-white flex items-baseline gap-2">
         <span class="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Total:</span>
         Rs. ${cart.reduce((a, b) => a + (b.selling_price * b.quantity), 0).toFixed(0)}
       </div>
    </div>
  `;
  openModal('Detailed Cart Management', content, 'max-w-4xl');
}

function calculateCartTotal() {
  const subtotal = cart.reduce((s, c) => s + c.selling_price * c.quantity, 0);
  const discount = parseFloat($c('pos-discount').value) || 0;
  const taxPct = parseFloat($c('pos-tax').value) || 0;

  const taxable = subtotal - discount;
  const taxAmt = taxable > 0 ? taxable * (taxPct / 100) : 0;
  const grandTotal = taxable > 0 ? taxable + taxAmt : 0;

  $c('cart-subtotal').textContent = 'Rs. ' + subtotal.toLocaleString();
  $c('cart-tax-amt').textContent = 'Rs. ' + taxAmt.toFixed(2);
  $c('cart-total').textContent = 'Rs. ' + grandTotal.toFixed(2);
  $c('cart-total').dataset.total = grandTotal;

  // Auto-populate received amount if it's currently 0 or matches the old total
  if (cart.length > 0) {
    const currentRecv = parseFloat($c('pos-received').value) || 0;
    if (currentRecv === 0) {
      $c('pos-received').value = grandTotal.toFixed(2);
    }
  } else {
    $c('pos-received').value = 0;
  }

  calculateRemaining();
}

function calculateRemaining() {
  const grandTotal = parseFloat($c('cart-total').dataset.total) || 0;
  const received = parseFloat($c('pos-received').value) || 0;
  const remaining = grandTotal - received;

  const el = $c('cart-remaining');
  const reqName = $c('req-name');
  const reqPhone = $c('req-phone');

  if (remaining <= 0) {
    el.textContent = 'Change: Rs. ' + Math.abs(remaining).toFixed(2);
    el.className = 'font-bold text-emerald-400 text-xl';
    if (reqName) reqName.classList.add('hidden');
    if (reqPhone) reqPhone.classList.add('hidden');
  } else {
    el.textContent = 'Due: Rs. ' + remaining.toFixed(2);
    el.className = 'font-bold text-rose-400 text-xl';
    if (reqName) reqName.classList.remove('hidden');
    if (reqPhone) reqPhone.classList.remove('hidden');
  }
}

async function checkout() {
  if (!cart.length) return toast('Cart is empty', 'error');

  const discount = parseFloat($c('pos-discount').value) || 0;
  const tax_percentage = parseFloat($c('pos-tax').value) || 0;
  const payment_method = $c('pos-method').value;
  const amount_received = parseFloat($c('pos-received').value) || 0;

  const customer_name = $c('pos-customer').value.trim();
  const customer_phone = $c('pos-phone').value.trim();
  const grandTotal = parseFloat($c('cart-total').dataset.total) || 0;

  // Use a small margin to prevent floating point validation bugs
  if (amount_received < (grandTotal - 0.01) && (!customer_name || !customer_phone)) {
    return toast('Name and Phone are strictly required when the payment received is less than the Grand Total.', 'error');
  }

  const btn = $c('checkout-btn');
  btn.disabled = true; btn.textContent = 'Processing…';
  const payload = {
    items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, selling_price: c.selling_price })),
    discount, tax_percentage, payment_method, amount_received, customer_name, customer_phone
  };
  const r = await api('/api/sales', 'POST', payload);
  if (r.error) { toast(r.error, 'error'); btn.disabled = false; btn.textContent = 'Checkout'; return; }
  toast('Sale complete! Rs. ' + r.total);
  // Show print bill prompt
  openModal('Sale Complete!', `
    <div class="text-center space-y-4">
      <div class="text-5xl">🎉</div>
      <p class="text-slate-300">Sale #${r.saleId} — <span class="text-emerald-400 font-bold">Rs. ${r.total.toFixed(2)}</span></p>
      <div class="flex gap-3">
        <button onclick="printBill(${r.saleId})" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">🖨 Print Bill</button>
        <button onclick="closeModal();renderPOS();" class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all">New Sale</button>
      </div>
    </div>`, 'max-w-md', true);
}

async function printBill(saleId) {
  const data = await api(`/api/sales/${saleId}/bill`);
  const { sale, items, seller, shop } = data;

  const grandTotal = Number(sale.total);
  const discount = Number(sale.discount || 0);
  const taxPct = Number(sale.tax_percentage || 0);
  const method = sale.payment_method === 'online' ? 'Online Transfer' : 'Cash';
  const received = Number(sale.amount_received || 0);
  const remaining = grandTotal - received;

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.price_at_sale), 0);
  const taxAmt = (subtotal - discount) * (taxPct / 100);

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Bill #${sale.id}</title>
  <style>
    @page { margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f0f0f0; /* Light gray background to see the receipt clearly in preview */
    }
    .receipt { 
      font-family: 'Courier New', Courier, monospace; 
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
      <h1>${shop ? shop.name : 'STORE'}</h1>
      <div class="bold">Sales Receipt</div>
    </div>
    
    <hr class="divider" />
    
    <div style="font-size: 11px;">
      <strong>Bill #:</strong> ${sale.id}<br>
      <strong>Date:</strong> ${new Date(sale.created_at).toLocaleString()}<br>
      <strong>Seller:</strong> ${seller ? seller.name : 'Staff'}<br>
      <strong>Customer:</strong> ${sale.customer_name || 'Walk-in'}<br>
      ${sale.customer_phone ? `<strong>Phone:</strong> ${sale.customer_phone}` : ''}
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
        ${items.map(i => `
          <tr>
            <td>${i.product_name}</td>
            <td class="text-center">${i.quantity}</td>
            <td class="text-right">${i.price_at_sale}</td>
            <td class="text-right">${(i.quantity * i.price_at_sale).toFixed(0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <hr class="divider" />
    
    <div class="text-right">
      <div>Subtotal: Rs. ${subtotal.toFixed(0)}</div>
      ${discount > 0 ? `<div>Discount: -Rs. ${discount.toFixed(0)}</div>` : ''}
      ${taxPct > 0 ? `<div>Tax (${taxPct}%): Rs. ${taxAmt.toFixed(0)}</div>` : ''}
      <div class="bold total-row" style="margin-top: 4px;">GRAND TOTAL: Rs. ${grandTotal.toFixed(0)}</div>
    </div>
    
    <hr class="divider" />
    
    <div style="font-size: 11px;">
      <div><strong>Method:</strong> ${method}</div>
      <div><strong>Received:</strong> Rs. ${received.toFixed(0)}</div>
      ${remaining > 0 ? `<div class="bold"><strong>Due:</strong> Rs. ${remaining.toFixed(0)}</div>` : ''}
      ${remaining < 0 ? `<div class="bold"><strong>Change:</strong> Rs. ${Math.abs(remaining).toFixed(0)}</div>` : ''}
    </div>
    
    <hr class="divider" />
    
    <div class="footer text-center">
      Thank you for your purchase!<br>
      ${shop ? shop.name : ''}
    </div>
  </div>
  
  <script>window.onload=()=>{window.print();window.close();}<\/script>
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
    _allSalesCache = await api('/api/sales');
    if (!Array.isArray(_allSalesCache)) _allSalesCache = [];
    updatePendingDuesBadge(_allSalesCache);
    _salesPendingFilter = onlyPendingDues;
    _salesPage = 1;

    const today = new Date().toISOString().split('T')[0];
    const statusLabel = onlyPendingDues ? 'PENDING DUES' : 'PAID SLIPS';
    const statusColor = onlyPendingDues ? 'text-rose-500' : 'text-emerald-500';

    $c('page-content').innerHTML = `
    <div class="flex flex-col gap-6 mb-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 class="text-2xl font-bold ${statusColor} mb-1">${statusLabel}</h2>
          <p class="text-slate-500 dark:text-slate-400 text-sm">Showing <span id="sales-count" class="font-bold">0</span> records</p>
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
          ${onlyPendingDues ? `<button onclick="navigate('sales-history')" class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 rounded-xl font-medium border border-indigo-100 dark:border-transparent">View Paid Slips</button>` : ''}
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
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Received</th>
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
    console.error('Sales History Error:', err);
    $c('page-content').innerHTML = `<div class="p-10 text-center text-rose-500 font-bold">Failed to load sales: ${err.message}</div>`;
  }
}

function _renderSalesTable() {
  try {
    const searchInput = $c('sales-search');
    const fromInput = $c('sales-from');
    const toInput = $c('sales-to');
    if (!searchInput || !fromInput || !toInput) return;

    const query = (searchInput.value || '').toLowerCase().trim();
    const fromDate = fromInput.value;
    const toDate = toInput.value;

    console.log('Rendering table. Cache:', _allSalesCache.length, 'Filter:', _salesPendingFilter, 'Range:', fromDate, 'to', toDate);

    // Initial filter by Status (Paid/Pending)
    let displayList = _salesPendingFilter
      ? _allSalesCache.filter(s => (Number(s.total || 0) - Number(s.amount_received || 0)) > 0.01)
      : _allSalesCache.filter(s => (Number(s.total || 0) - Number(s.amount_received || 0)) <= 0.01);

    // Filter by Date Range
    if (fromDate || toDate) {
      displayList = displayList.filter(s => {
        const sDate = s.created_at.split(' ')[0]; // Extract YYYY-MM-DD
        if (fromDate && sDate < fromDate) return false;
        if (toDate && sDate > toDate) return false;
        return true;
      });
    }

    // Filter by Search Query
    if (query) {
      displayList = displayList.filter(s => {
        const id = (s.id || '').toString().toLowerCase();
        const name = (s.customer_name || '').toLowerCase();
        const phone = (s.customer_phone || '').toLowerCase();
        const sellerName = (s.served_by_name || '').toLowerCase();
        const sellerUser = (s.served_by_username || '').toLowerCase();
        return id === query || name.includes(query) || phone.includes(query) || sellerName.includes(query) || sellerUser.includes(query);
      });
    }

    $c('sales-count').textContent = displayList.length;

    const totalPages = Math.ceil(displayList.length / _salesPageSize) || 1;
    if (_salesPage > totalPages) _salesPage = 1;

    const startIdx = (_salesPage - 1) * _salesPageSize;
    const pageItems = displayList.slice(startIdx, startIdx + _salesPageSize);

    $c('sales-table-body').innerHTML = pageItems.length ? pageItems.map(s => {
      const due = Number(s.total || 0) - Number(s.amount_received || 0);
      const isPending = due > 0.01;

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
          <td class="px-5 py-4 font-bold text-indigo-600 dark:text-indigo-400">#${s.id}</td>
          <td class="px-5 py-4">
             <div class="font-medium text-slate-700 dark:text-slate-200 text-sm mb-1">${new Date(s.created_at).toLocaleDateString()}</div>
             <div class="text-[10px] text-slate-500">${new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </td>
          <td class="px-5 py-4">
             <div class="font-bold text-slate-800 dark:text-slate-200">${s.customer_name || '<span class="text-slate-400 dark:text-slate-500 italic font-normal">Walk-in</span>'}</div>
             <div class="text-xs ${s.customer_phone ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-600 italic'} mt-1 flex items-center gap-1">
               <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg> 
               ${s.customer_phone || 'No phone'}
             </div>
          </td>
          <td class="px-5 py-4 text-slate-700 dark:text-slate-200 font-bold">Rs. ${parseFloat(s.total || 0).toFixed(0)}</td>
          <td class="px-5 py-4 text-emerald-600 dark:text-emerald-400 font-medium">Rs. ${parseFloat(s.amount_received || 0).toFixed(0)}</td>
          <td class="px-5 py-4">
            <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold border border-slate-200 dark:border-slate-700 uppercase">${s.served_by_name || s.served_by_username || 'Staff'}</span>
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              ${isPending ? `<button onclick="markSalePaid(${s.id}, ${s.total}, ${s.amount_received})" class="p-1.5 rounded bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors" title="Edit / Collect Dues"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>` : ''}
              <button onclick="printBill(${s.id})" class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 transition-colors" title="Print Bill">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="7" class="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm italic border-t border-slate-100 dark:border-slate-800">No sales found for this filter.</td></tr>`;


    $c('sales-pagination').innerHTML = totalPages > 1 ? `
      <div class="text-xs text-slate-500 font-medium">
        Showing <span class="font-bold text-slate-900 dark:text-slate-200">${pageItems.length}</span> of <span class="font-bold text-slate-900 dark:text-slate-200">${displayList.length}</span> sales
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changeSalesPage(${_salesPage - 1})" ${_salesPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Previous</button>
        <span class="text-xs font-bold text-slate-500 px-2">Page ${_salesPage} of ${totalPages}</span>
        <button onclick="changeSalesPage(${_salesPage + 1})" ${_salesPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next</button>
      </div>
    ` : '';
  } catch (err) {
    console.error('Table Render Error:', err);
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
        <input id="dues-recvd-${String(saleId)}" type="number" min="0" value="${currentDue.toFixed(2)}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <button onclick="doMarkSalePaid(${String(saleId)}, ${String(currentReceived)})" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg hover:shadow-emerald-500/25">Confirm Received</button>
    </div>
  `;
  openModal("Collect Dues: Bill #" + saleId, html);
}

async function doMarkSalePaid(saleId, currentReceived) {
  const amountInput = document.getElementById(`dues-recvd-${saleId}`);
  if (!amountInput) return toast('Input not found', 'error');

  const adding = parseFloat(amountInput.value) || 0;
  if (adding <= 0) return toast('Amount must be > 0', 'error');

  const totalRecvd = currentReceived + adding;
  const r = await api(`/api/sales/${saleId}/pay`, 'PATCH', { amount: totalRecvd });
  if (r.error) return toast(r.error, 'error');

  toast('Dues updated successfully!');
  closeModal();
  renderSalesHistory(_salesPendingFilter); // Refresh list
}

// ─── Expenses ───────────────────────────────────────────────────────
// ─── Expenses ───────────────────────────────────────────────────────
async function renderExpenses() {
  const [allExpenses, sharesRes, categories] = await Promise.all([
    api('/api/expenses'),
    api('/api/brands/expense-shares'),
    api('/api/expense-categories')
  ]);

  _expenseCategories = categories;

  // Sort by date desc and filter by selected month (YYYY-MM)
  const filtered = allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)).filter(e => e.date.startsWith(_expenseMonth));
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // Pagination logic (10 per page)
  const pageSize = 5;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const startIdx = (_expensePage - 1) * pageSize;
  const pageExpenses = filtered.slice(startIdx, startIdx + pageSize);

  let contentHtml = '';

  if (_expenseView === 'add') {
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
                ${_expenseCategories.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('')}
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
            <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Expenses Management</h2>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Month: <span class="text-slate-900 dark:text-slate-200">${_expenseMonth}</span> — Total: <span class="text-rose-600 dark:text-rose-400">Rs. ${total.toLocaleString()}</span>
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
          
          <button onclick="openManageCategories()" title="Manage Categories" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-900 shadow-sm transition-all active:scale-95 group">
            <svg class="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
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
          ${statCard('Total Month Expenses', 'Rs. ' + Number(sharesRes.totalExpenses).toLocaleString(), 'Operating costs', 'rose')}
          ${statCard('Split Per Brand', 'Rs. ' + (sharesRes.brandCount > 0 ? Number(sharesRes.totalExpenses / sharesRes.brandCount).toLocaleString() : '0'), `${sharesRes.brandCount} brands total`, 'blue')}
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
              ${sharesRes.shares.map(s => `
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
              `).join('')}
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
            <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Amount</th>
            <th class="px-6 py-4 text-xs font-semibold text-gray-500"></th>
          </tr></thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            ${pageExpenses.length ? pageExpenses.map(e => `
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td class="px-6 py-4">
                  <div class="font-medium text-gray-800 dark:text-gray-200">${e.title}</div>
                  ${e.note ? `<div class="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate" title="${e.note}">${e.note}</div>` : ''}
                </td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${catBadge(e.category)}">${catEmoji(e.category)} ${e.category}</span></td>
                <td class="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">${e.date}</td>
                <td class="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(e.amount).toLocaleString()}</td>
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
              </tr>`).join('') : `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No expenses found for this month.</td></tr>`}
          </tbody>
        </table>
        
        <!-- Pagination -->
        ${totalPages > 1 ? `
        <div class="bg-gray-50/50 dark:bg-gray-900/20 px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Showing <span class="font-bold">${pageExpenses.length}</span> of <span class="font-bold">${filtered.length}</span> expenses
          </div>
          <div class="flex items-center gap-2">
            <button onclick="prevExpensePage()" ${_expensePage <= 1 ? 'disabled' : ''} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
            <span class="text-xs text-gray-500 px-2">Page <span class="font-bold text-gray-800 dark:text-gray-200">${_expensePage}</span> of ${totalPages}</span>
            <button onclick="nextExpensePage(${totalPages})" ${_expensePage >= totalPages ? 'disabled' : ''} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>` : ''}
      </div>

     
    `;
  }

  $c('page-content').innerHTML = contentHtml;
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
  toggleExpenseView('add');
}


async function openPayBrandExpenses() {
  const sharesRes = await api('/api/brands/expense-shares');
  const rows = (sharesRes.shares || []).filter(s => s.due > 0);

  if (!rows.length) {
    return openModal('Pay Brand Expenses', `
      <p class="text-center text-gray-400 py-6">✔ All brands are fully paid for <strong>${sharesRes.month}</strong>.</p>
    `);
  }

  openModal('Pay Brand Expenses', `
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Month: <strong class="text-gray-800 dark:text-gray-200">${sharesRes.month}</strong></p>
    <div class="space-y-3">
      ${rows.map(s => `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div class="flex-1">
            <div class="font-semibold text-gray-800 dark:text-gray-200 text-sm">${s.brand_name}</div>
            <div class="text-xs text-gray-500">Due: <span class="text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(s.due).toLocaleString()}</span></div>
          </div>
          <input id="bep-${s.brand_id}" type="number" min="1" max="${s.due}" value="${s.due}"
            class="w-32 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-bold text-right"/>
          <button onclick="doPayBrandExpense(${s.brand_id}, '${sharesRes.month}')" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all">Pay</button>
        </div>
      `).join('')}
    </div>
  `);
}

async function doPayBrandExpense(brandId, month) {
  const input = document.getElementById('bep-' + brandId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast('Amount must be > 0', 'error');
  const r = await api('/api/brands/expense-payments', 'POST', { brand_id: brandId, amount, month });
  if (r.error) return toast(r.error, 'error');
  toast('Payment recorded!');
  closeModal();
  renderExpenses();
}

function catBadge(c) {
  const cat = _expenseCategories.find(x => x.name === c);
  return cat ? cat.color_class : 'bg-slate-700 text-slate-300';
}
function catEmoji(c) {
  const cat = _expenseCategories.find(x => x.name === c);
  return cat ? cat.emoji : '📦';
}

function openManageCategories() {
  const html = `
    <div class="space-y-4">
      <div class="flex items-center gap-2 mb-4">
        <input id="new-cat-name" placeholder="Category Name" class="flex-1 px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
        <input id="new-cat-emoji" placeholder="Emoji" class="w-16 px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center text-sm focus:outline-none focus:border-indigo-500 transition-all" />
        <button onclick="addExpenseCategory()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all">Add</button>
      </div>
      <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
        ${_expenseCategories.map(c => `
          <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <div class="flex items-center gap-3">
              <span class="text-xl">${c.emoji}</span>
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">${c.name}</span>
            </div>
            <button onclick="deleteExpenseCategory(${c.id})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  openModal("Manage Expense Categories", html, "max-w-md");
}

async function addExpenseCategory() {
  const name = $c('new-cat-name').value.trim();
  const emoji = $c('new-cat-emoji').value.trim();
  if (!name) return toast('Name required', 'error');
  const r = await api('/api/expense-categories', 'POST', { name, emoji });
  if (r.error) return toast(r.error, 'error');
  toast('Category added!');
  closeModal();
  renderExpenses();
}

async function deleteExpenseCategory(id) {
  if (!confirm('Delete this category? it should only be deleted if not in use.')) return;
  const r = await api('/api/expense-categories/' + id, 'DELETE');
  if (r.error) return toast(r.error, 'error');
  toast('Category removed');
  closeModal();
  renderExpenses();
}

async function saveExpense() {
  const payload = {
    title: $c('exp-title').value.trim(),
    category: $c('exp-cat').value,
    amount: parseFloat($c('exp-amount').value),
    date: $c('exp-date').value,
    note: $c('exp-note').value.trim()
  };
  if (!payload.title || !payload.amount) return toast('Title and amount required', 'error');
  const r = await api('/api/expenses', 'POST', payload);
  if (r.error) return toast(r.error, 'error');
  toast('Expense added!');
  toggleExpenseView('list');
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await api(`/api/expenses/${id}`, 'DELETE');
  toast('Expense removed'); renderExpenses();
}

async function openEditExpense(id) {
  const expenses = await api('/api/expenses');
  const e = expenses.find(x => x.id === id);
  if (!e) return toast('Expense not found', 'error');

  openModal('Edit Expense', `
    <div class="space-y-4">
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title *</label>
        <input id="edit-exp-title" value="${e.title}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
        <select id="edit-exp-cat" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all">
          ${_expenseCategories.map(c => `<option value="${c.name}" ${e.category === c.name ? 'selected' : ''}>${c.emoji} ${c.name}</option>`).join('')}
        </select></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Amount (Rs.) *</label>
          <input id="edit-exp-amount" type="number" min="0" value="${e.amount}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
          <input id="edit-exp-date" type="date" value="${e.date}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      </div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Note (optional)</label>
        <textarea id="edit-exp-note" rows="2" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all resize-none">${e.note || ''}</textarea></div>
      <button onclick="updateExpense(${e.id})" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md">Update Expense</button>
    </div>
  `);
}

async function updateExpense(id) {
  const payload = {
    title: $c('edit-exp-title').value.trim(),
    category: $c('edit-exp-cat').value,
    amount: parseFloat($c('edit-exp-amount').value),
    date: $c('edit-exp-date').value,
    note: $c('edit-exp-note').value.trim()
  };
  if (!payload.title || !payload.amount) return toast('Title and amount required', 'error');
  const r = await api('/api/expenses/' + id, 'PUT', payload);
  if (r.error) return toast(r.error, 'error');
  closeModal(); toast('Expense updated!'); renderExpenses();
}

// ─── Users (Admin) ────────────────────────────────────────────────────
async function renderUsers() {
  const users = await api('/api/users');
  const isMaster = currentUser.role === 'superadmin';

  // ── Shop Admin: Card view (read + edit only, no create/delete) ──
  if (!isMaster) {
    const ROLE_COLORS = {
      admin: { bg: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
      pos_user: { bg: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
      manager: { bg: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    };
    const getColor = (role) => ROLE_COLORS[role] || { bg: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' };

    const cardsHtml = users.map(u => {
      const initials = (u.name || u.username).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const { bg, badge } = getColor(u.role);
      const statusOk = !u.status || u.status === 'active';
      return `
        <div class="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all bg-white dark:bg-gray-900 flex flex-col gap-4">
          <div class="flex flex-col items-center text-center gap-3">
            <div class="w-16 h-16 rounded-2xl ${bg} flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg relative">
              ${initials}
              <span class="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${statusOk ? 'bg-emerald-400' : 'bg-red-400'}"></span>
            </div>
            <div>
              <div class="font-bold text-gray-900 dark:text-white text-base">${u.name}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500">@${u.username}</div>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge}">${u.role.replace('_', ' ')}</span>
          </div>
          <div class="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <div class="text-xs text-gray-400">${u.email || '—'}</div>
            <button onclick="openEditUser(${u.id},'${(u.name || '').replace(/'/g, "\\'")}','${u.username}','${u.email || ''}','${u.phone || ''}','${u.role}', ${JSON.stringify(u.allowed_panels).replace(/"/g, '&quot;')}, ${u.shop_id}, '${u.status || 'active'}')"
              class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all" title="Edit User">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    $c('page-content').innerHTML = `
      <div class="flex items-end justify-between gap-4 mb-8">
        <div>
          <h3 class="text-2xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Your Team</h3>
          <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">${users.length} staff member${users.length !== 1 ? 's' : ''} in your shop</p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
        ${cardsHtml || `<div class="col-span-full py-24 text-center text-gray-400 italic">No staff members found.</div>`}
      </div>`;
    return;
  }

  // ── Superadmin: full table view ──
  $c('page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-slate-400 text-sm">${users.length} user(s)</p>
      <button onclick="openCreateUser()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">+ Create User</button>
    </div>
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-200 dark:border-slate-800 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Username</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${users.map(u => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
              <td class="px-5 py-4 font-medium text-slate-700 dark:text-slate-200">${u.name}</td>
              <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">${u.shop_name || '<span class="italic text-slate-400">System</span>'}</td>
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400">@${u.username}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-center justify-center min-w-[60px] ${u.role === 'superadmin' ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30' : u.role === 'admin' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}">
                  ${u.role.toUpperCase().replace('_', ' ')}
                </span>
              </td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-center justify-center min-w-[60px] ${u.status === 'active' || !u.status ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}">
                  ${(u.status || 'active').toUpperCase()}
                </span>
              </td>
              <td class="px-5 py-4 text-right space-x-1">
                <button onclick="openEditUser(${u.id},'${(u.name || '').replace(/'/g, "\\'")}','${u.username}','${u.email || ''}','${u.phone || ''}','${u.role}', ${JSON.stringify(u.allowed_panels).replace(/"/g, '&quot;')}, ${u.shop_id}, '${u.status || 'active'}')" class="px-2 py-1 text-xs rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-all">Edit</button>
                ${u.id !== currentUser.id ? `
                  <button onclick="deleteUser(${u.id})" class="px-2 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-rose-700 dark:text-rose-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all">Del</button>
                ` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function userFormHtml(u = {}) {
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="sm:col-span-2 lg:col-span-1">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Full Name *</label>
          <input id="uf-name" value="${u.name || ''}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Full name" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Username *</label>
          <input id="uf-username" value="${u.username || ''}" ${u.id ? 'readonly' : ''} class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all ${u.id ? 'opacity-50' : ''} shadow-sm" placeholder="username" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Password ${u.id ? '(Optional)' : '*'}</label>
          <input id="uf-password" type="password" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="••••••••" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Phone</label>
          <input id="uf-phone" value="${u.phone || ''}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="03xx-xxxxxxx" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Email</label>
          <input id="uf-email" value="${u.email || ''}" type="email" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="user@example.com" />
        </div>
        ${u.role === 'superadmin' ? '' : `
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Role</label>
          <select id="uf-role" onchange="toggleUserPanelPicker(this.value)" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="pos_user" ${u.role === 'pos_user' ? 'selected' : ''}>POS User</option>
            <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin/Shop Owner</option>
          </select>
        </div>
        `}
        <div class="${u.role === 'superadmin' ? 'sm:col-span-2 lg:col-span-1' : ''}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Status</label>
          <select id="uf-status" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="active" ${u.status === 'active' || !u.status ? 'selected' : ''}>Active</option>
            <option value="blocked" ${u.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          </select>
        </div>
        ${u.role === 'superadmin' ? `<input type="hidden" id="uf-role" value="superadmin" /><input type="hidden" id="uf-shop" value="" />` : `
        <div class="sm:col-span-2">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Assign Shop</label>
          <select id="uf-shop" ${currentUser.role !== 'superadmin' ? 'disabled' : ''} class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            ${currentUser.role === 'superadmin'
        ? shops.map(s => `<option value="${s.id}" ${u.shop_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')
        : `<option value="${currentUser.shop_id}" selected>${currentUser.shop_name || 'My Shop'}</option>`
      }
          </select>
        </div>
        `}
        ${u.role === 'superadmin' ? '' : `
        <div class="sm:col-span-2 lg:col-span-3" id="uf-panels-container" style="display: ${u.role === 'admin' ? 'none' : 'block'}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-3 font-bold uppercase tracking-wider">Allowed Panels (Inherited from Shop)</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3" id="panel-picker">
            ${AVAILABLE_PANELS.map(p => `
              <div class="panel-tile cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group ${u.allowed_panels?.includes(p.id) ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}"
                   onclick="this.dataset.selected = this.dataset.selected === 'true' ? 'false' : 'true'; this.classList.toggle('border-indigo-500'); this.classList.toggle('bg-indigo-50/50'); this.classList.toggle('dark:bg-indigo-900/20')"
                   data-id="${p.id}" data-selected="${u.allowed_panels?.includes(p.id)}">
                <div class="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                  <svg class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p.icon}"></path></svg>
                </div>
                <span class="text-[9px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-400 text-center">${p.label}</span>
              </div>
            `).join('')}
          </div>
        </div>
        `}
      </div>
    </div>
  `;
}
function toggleUserPanelPicker(role) {
  const container = document.getElementById('uf-panels-container');
  if (container) {
    container.style.display = role === 'admin' ? 'none' : 'block';
  }
}


// ─── Shop Management Helpers ──────────────────────────────────────────
function allPanels() {
  return [
    { id: 'core_pos', name: 'Core POS', icon: '🛒', panels: ['dashboard', 'brands', 'products', 'pos', 'sales-history'] },
    { id: 'expenses', name: 'Expenses', icon: '💸', panels: ['expenses'] },
    { id: 'analytics', name: 'Analytics', icon: '📈', panels: ['analytics'] },
    { id: 'subscriptions', name: 'Subscriptions', icon: '💳', panels: ['subscriptions'] }
  ];
}

function togglePanel(el) {
  const isSelected = el.dataset.selected === 'true';
  const next = !isSelected;
  el.dataset.selected = next;

  if (next) {
    el.classList.add('bg-indigo-600', 'border-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-600/20');
    el.classList.remove('bg-white', 'dark:bg-slate-800', 'border-slate-200', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-400');
  } else {
    el.classList.remove('bg-indigo-600', 'border-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-600/20');
    el.classList.add('bg-white', 'dark:bg-slate-800', 'border-slate-200', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-400');
  }
}


function openCreateUser(shopId = null) {
  openModal('Create User', userFormHtml({ shop_id: shopId }) + `<button onclick="saveUser()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Create User</button>`, 'max-w-2xl');
}

function openEditUser(id, name, username, email, phone, role, allowed_panels, shop_id, status) {
  openModal('Edit User', userFormHtml({ id, name, username, email, phone, role, allowed_panels, shop_id, status }) + `<button onclick="saveUser(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update User</button>`, 'max-w-2xl');
}

async function saveUser(id) {
  const payload = {
    name: $c('uf-name').value.trim(),
    username: $c('uf-username').value.trim(),
    password: $c('uf-password').value,
    phone: $c('uf-phone').value.trim(),
    email: $c('uf-email').value.trim(),
    role: $c('uf-role').value,
    status: $c('uf-status').value,
    shop_id: $c('uf-shop').value,
    allowed_panels: $c('uf-role').value === 'admin' ? [] : Array.from(document.querySelectorAll('.panel-tile[data-selected="true"]')).map(el => el.dataset.id)
  };
  if (!payload.name) return toast('Name required', 'error');
  if (!id && !payload.password) return toast('Password required for new user', 'error');
  const r = id ? await api(`/api/users/${id}`, 'PUT', payload) : await api('/api/users', 'POST', payload);
  if (r.error) return toast(r.error, 'error');
  closeModal(); toast('User saved!'); renderUsers();
}

async function deleteUser(id) {
  if (!confirm('Delete this user? All their data will be removed.')) return;
  const r = await api(`/api/users/${id}`, 'DELETE');
  if (r.error) return toast(r.error, 'error');
  toast('User deleted'); renderUsers();
}

async function openEditBrandPayments(brandId, month) {
  const payments = await api(`/api/brands/expense-payments?month=${month}`);
  const brandPayments = payments.filter(p => p.brand_id === brandId);

  if (brandPayments.length === 0) {
    return toast('No payments found for this brand in ' + month, 'info');
  }

  openModal('Edit Payments', `
    <div class="space-y-4">
      <p class="text-xs text-gray-500 lowercase italic">Editing payments for brand in ${month}.</p>
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        ${brandPayments.map(p => `
          <div class="py-3 flex items-center justify-between">
            <div>
              <div class="text-xs text-gray-400">${new Date(p.created_at).toLocaleDateString()}</div>
              <input id="edit-bep-amt-${p.id}" type="number" value="${p.amount}" class="w-32 mt-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold" />
            </div>
            <button onclick="doUpdateBrandPayment(${p.id})" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all">Update</button>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

async function doUpdateBrandPayment(paymentId) {
  const input = document.getElementById('edit-bep-amt-' + paymentId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast('Amount must be > 0', 'error');

  const r = await api(`/api/brands/expense-payments/${paymentId}`, 'PUT', { amount });
  if (r.error) return toast(r.error, 'error');

  toast('Payment updated!');
  closeModal();
  renderExpenses();
}

async function openExpensesHistory() {
  const allExpenses = await api('/api/expenses');

  // Group by month
  const monthsMap = {};
  allExpenses.forEach(e => {
    const m = e.date.slice(0, 7);
    if (!monthsMap[m]) monthsMap[m] = 0;
    monthsMap[m] += e.amount;
  });

  const sortedMonths = Object.keys(monthsMap).sort((a, b) => b.localeCompare(a));

  openModal('Expenses History', `
    <div class="space-y-4">
      <p class="text-sm text-slate-500 mb-2">View or download PDF reports for previous months.</p>
      <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        ${sortedMonths.map(m => `
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span class="font-bold text-slate-800 dark:text-slate-100 text-base">${new Date(m + '-01').toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
              </div>
              <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-semibold ml-4">Monthly Target Split: Rs. ${monthsMap[m].toLocaleString()}</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.open('/api/brands/pdf/monthly-report?month=${m}', '_blank')" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 transition-all border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900" title="View PDF">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${m}&download=true'" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 transition-all border border-transparent hover:border-amber-200 dark:hover:border-amber-900" title="Download PDF">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              </button>
              <div class="w-px h-6 bg-slate-100 dark:bg-slate-800 mx-1"></div>
              <button onclick="_expenseMonth='${m}'; _expensePage=1; closeModal(); renderExpenses();" class="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all active:scale-95 shadow-sm">
                Open Month
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `, 'max-w-3xl');
}

async function openViewExpenses(month) {
  const allExpenses = await api('/api/expenses');
  const filtered = allExpenses.filter(e => e.date.startsWith(month));

  openModal('Monthly Report: ' + month, `
    <div class="space-y-6">
      <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h4 class="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3 uppercase tracking-widest text-[#1e1e1e] dark:text-[#f3f4f6]">1. Operating Expenses</h4>
        ${filtered.length === 0 ? '<p class="text-xs text-gray-500 italic">No expenses found for this month.</p>' : `
        <div class="max-h-[60vh] overflow-y-auto">
          <table class="w-full text-xs text-left">
            <thead>
              <tr class="text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/80 sticky top-0 z-10">
                <th class="py-2 px-3 font-semibold">Title</th>
                <th class="py-2 px-3 font-semibold">Date</th>
                <th class="py-2 px-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              ${filtered.map(e => `
                <tr class="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <td class="py-2 px-3 text-gray-700 dark:text-gray-300">${e.title}</td>
                  <td class="py-2 px-3 text-gray-500">${e.date}</td>
                  <td class="py-2 px-3 text-right font-bold text-gray-800 dark:text-gray-200">Rs. ${e.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="bg-indigo-50 dark:bg-indigo-900/20 font-bold text-indigo-700 dark:text-indigo-400">
                <td colspan="2" class="py-2 px-3 text-right">Total Expenses:</td>
                <td class="py-2 px-3 text-right">Rs. ${filtered.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>`}
      </div>
    </div>
  `, 'max-w-4xl');
}

async function openBulkEditExpenses(month) {
  const allExpenses = await api('/api/expenses');
  const filtered = allExpenses.filter(e => e.date.startsWith(month));

  if (filtered.length === 0) return toast('No expenses found for ' + month, 'info');

  openModal('Bulk Edit: ' + month, `
    <div class="space-y-4">
      <p class="text-xs text-gray-500 italic lowercase">Editing all operating expenses for ${month}.</p>
      <div class="max-h-[60vh] overflow-y-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <th class="px-2 py-2">Title</th>
              <th class="px-2 py-2">Cat</th>
              <th class="px-2 py-2 text-right">Amount</th>
              <th class="px-2 py-2">Date</th>
            </tr>
          </thead>
          <tbody id="bulk-exp-tbody">
            ${filtered.map(e => `
              <tr class="border-b border-gray-50 dark:border-gray-900/50" data-id="${e.id}">
                <td class="py-2 px-1"><input class="title w-full bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-gray-800 dark:text-gray-200" value="${e.title}" /></td>
                <td class="py-2 px-1">
                  <select class="category bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-xs">
                    <option value="electricity" ${e.category === 'electricity' ? 'selected' : ''}>⚡</option>
                    <option value="fuel" ${e.category === 'fuel' ? 'selected' : ''}>⛽</option>
                    <option value="rent" ${e.category === 'rent' ? 'selected' : ''}>🏠</option>
                    <option value="salary" ${e.category === 'salary' ? 'selected' : ''}>🛠</option>
                    <option value="other" ${e.category === 'other' ? 'selected' : ''}>📦</option>
                  </select>
                </td>
                <td class="py-2 px-1"><input class="amount w-24 bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 font-bold text-right" type="number" value="${e.amount}" /></td>
                <td class="py-2 px-1"><input class="date w-28 bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-[10px]" type="date" value="${e.date}" /></td>
                <input type="hidden" class="note" value="${e.note || ''}" />
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <button onclick="doBulkUpdateExpenses()" class="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition-all active:scale-[0.98]">Save All Changes</button>
    </div>
  `, 'max-w-4xl');
}

async function doBulkUpdateExpenses() {
  const rows = document.querySelectorAll('#bulk-exp-tbody tr');
  const expenses = [];
  rows.forEach(row => {
    expenses.push({
      id: parseInt(row.dataset.id),
      title: row.querySelector('.title').value.trim(),
      category: row.querySelector('.category').value,
      amount: parseFloat(row.querySelector('.amount').value),
      date: row.querySelector('.date').value,
      note: row.querySelector('.note').value
    });
  });

  const r = await api('/api/expenses/bulk', 'PUT', { expenses });
  if (r.error) return toast(r.error, 'error');

  toast('Success! Month updated.');
  closeModal();
  renderExpenses();
}

// ─── Shop Management ─────────────────────────────────────────────
async function renderShops() {
  const res = await fetch('/api/shops');
  shops = await res.json();

  $c('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Shop Management</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Manage system-wide stores and shops</p>
        </div>
        <button onclick="openCreateShop()" class="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Add New Shop
        </button>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">ID</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop Name</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Allotted Panels</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
              ${shops.map(s => `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">#${s.id}</td>
                <td class="px-5 py-4 text-sm font-semibold text-slate-800 dark:text-white">${s.name}</td>
                <td class="px-5 py-4">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}">
                    ${s.status}
                  </span>
                </td>
                <td class="px-5 py-4 transition-all">
                  <div class="flex flex-wrap gap-1">
                    ${s.allowed_panels.map(p => `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tabular-nums">${p}</span>`).join('')}
                    ${s.allowed_panels.length === 0 ? '<span class="text-[9px] italic text-slate-400">No panels allotted</span>' : ''}
                  </div>
                </td>
                <td class="px-5 py-4 text-right space-x-2">
                  ${s.allowed_panels.includes('brands') ? `<button onclick="renderBrands(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-all font-medium">Manage Brands</button>` : ''}
                  <button onclick="openEditShop(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 transition-all font-medium">Edit</button>
                  <button onclick="deleteShop(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-rose-700 dark:text-rose-400 hover:bg-red-200 transition-all font-medium">Delete</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ─── Subscriptions ──────────────────────────────────────────────
async function renderSubscriptions() {
  const subs = await api('/api/subscriptions');
  $c('page-content').innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Subscription Management</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Track monthly payments and shop access</p>
        </div>
        <button onclick="openRecordPayment()" class="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Record Payment
        </button>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Month</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Validity</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Amount</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Paid At</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
              ${subs.map(s => {
    const typeLabel = { '1_month': '1 Month', '3_months': '3 Months', '6_months': '6 Months', '1_year': '1 Year', '2_years': '2 Years', 'lifetime': 'Lifetime' };
    return `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                <td class="px-5 py-4 text-sm font-semibold text-slate-800 dark:text-white">${s.shop_name}</td>
                <td class="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">${typeLabel[s.type] || s.type}</td>
                <td class="px-5 py-4 text-sm text-slate-500 dark:text-slate-400 tabular-nums">${s.month}</td>
                <td class="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">${s.start_date} to ${s.end_date}</td>
                <td class="px-5 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">Rs. ${s.amount.toLocaleString()}</td>
                <td class="px-5 py-4 text-right text-xs text-slate-400 tabular-nums">${new Date(s.paid_at).toLocaleString()}</td>
              </tr>`}).join('')}
              ${subs.length === 0 ? '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400 italic font-medium">No payment records found</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function openRecordPayment() {
  const shops = await api('/api/shops');
  openModal('Record Subscription Payment', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Select Shop</label>
        <select id="pay-shop-id" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          ${shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Subscription Type</label>
        <select id="pay-type" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          <option value="1_month">1 Month</option>
          <option value="3_months">3 Months</option>
          <option value="6_months">6 Months</option>
          <option value="1_year">1 Year</option>
          <option value="2_years">2 Years</option>
          <option value="lifetime">Lifetime</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Starting Month</label>
          <input type="month" id="pay-month" value="${new Date().toISOString().slice(0, 7)}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Amount (Rs.)</label>
          <input type="number" id="pay-amount" value="5000" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Exact Start Date</label>
        <input type="date" id="pay-start-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
      </div>
      <button onclick="saveSubscriptionPayment()" class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all">Record Cash Payment & Activate Shop</button>
    </div>
  `);
}

async function saveSubscriptionPayment() {
  const payload = {
    shop_id: $c('pay-shop-id').value,
    amount: parseFloat($c('pay-amount').value),
    month: $c('pay-month').value,
    type: $c('pay-type').value,
    start_date: $c('pay-start-date').value
  };

  if (!payload.amount || !payload.month || !payload.start_date) return toast('Fill all fields', 'error');

  const r = await api('/api/subscriptions', 'POST', payload);
  if (r.error) return toast(r.error, 'error');

  toast('Payment recorded');
  closeModal();
  renderSubscriptions();
}


// ─── Hierarchy View ──────────────────────────────────────────────
// Global State for Hierarchy UI
let hierarchyData = { systemUsers: [], shops: [], users: [], brands: [] };
let hierarchySearchQuery = '';

async function renderHierarchy() {
  const result = await api('/api/admin/hierarchy-data');
  if (result.error) return toast(result.error, 'error');

  hierarchyData = result;
  renderHierarchyUI();
}

function renderHierarchyUI() {
  const q = hierarchySearchQuery.toLowerCase();

  // Filter logic
  const filteredShops = hierarchyData.shops.filter(s =>
    s.store_name.toLowerCase().includes(q) ||
    hierarchyData.users.some(u => u.shop_id === s.id && (u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))) ||
    hierarchyData.brands.some(b => b.shop_id === s.id && b.name.toLowerCase().includes(q))
  );

  let html = `
    <div class="space-y-8 animate-[fadeIn_0.3s_ease-out]">
      <!-- Header Area -->
      <div class="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h3 class="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Master Platform Hierarchy</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Multi-tenant view of all shops, assigned admins, staff, and parters.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative">
            <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input type="text" id="hierarchySearch" value="${hierarchySearchQuery}" placeholder="Search tenants, users, roles..." class="pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-64 transition-all shadow-sm">
          </div>
          <button onclick="openCreateShop()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-md flex items-center gap-2 justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            New Tenant
          </button>
        </div>
      </div>
  `;

  // System Core Node (Master Owner)
  html += renderHierarchyBlock('Platform Engine (Master Core)', hierarchyData.systemUsers, [], 'indigo', null, true);

  if (filteredShops.length === 0) {
    html += `<div class="p-10 text-center glass rounded-2xl"><p class="text-slate-500 dark:text-slate-400 italic">No tenants matched your search query "${hierarchySearchQuery}".</p></div>`;
  } else {
    // Render Shops as Parent Nodes
    filteredShops.forEach(s => {
      const shopUsers = hierarchyData.users.filter(u => u.shop_id === s.id);
      const shopBrands = hierarchyData.brands.filter(b => b.shop_id === s.id);
      html += renderHierarchyBlock(s.store_name, shopUsers, shopBrands, 'blue', s);
    });
  }

  html += '</div>';
  $c('page-content').innerHTML = html;

  // Re-bind search event listener after DOM replace
  const searchInput = document.getElementById('hierarchySearch');
  if (searchInput) {
    // Focus preserving trick
    const val = searchInput.value;
    searchInput.value = '';
    searchInput.value = val;
    searchInput.focus();

    searchInput.addEventListener('input', (e) => {
      hierarchySearchQuery = e.target.value;
      // Debounce slightly to prevent jarring UI jumps
      clearTimeout(window.hierarchySearchTimeout);
      window.hierarchySearchTimeout = setTimeout(renderHierarchyUI, 200);
    });
  }
}

function renderHierarchyBlock(name, users, brands = [], color, shop = null, isGlobal = false) {
  const colorMap = {
    indigo: { text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', iconBg: 'bg-indigo-100 dark:bg-indigo-900/40' },
    blue: { text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', iconBg: 'bg-blue-100 dark:bg-blue-900/40' }
  };
  const c = colorMap[color] || colorMap.blue;

  // KPIs
  const userCount = users.length;
  const brandCount = brands.length;
  const productCount = shop ? shop.product_count : 0;
  const plan = shop && shop.subscription_plan ? shop.subscription_plan.replace('_', ' ') : (isGlobal ? 'SYSTEM' : 'NONE');

  // Collapse state identifier
  const collapseId = `collapse - node - ${shop ? shop.id : 'global'} `;

  // Role rendering helper
  const renderUserCard = (u) => {
    let roleColor = 'text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    let roleIcon = '👤';
    if (u.role === 'superadmin') { roleColor = 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'; roleIcon = '🌟'; }
    if (u.role === 'admin') { roleColor = 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800'; roleIcon = '🧑‍💼'; }
    if (u.role === 'user') { roleColor = 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'; roleIcon = '👷'; }

    return `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all group bg-white dark:bg-slate-900/50 relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${u.role === 'admin' ? 'from-emerald-400 to-emerald-300' : u.role === 'superadmin' ? 'from-blue-500 to-indigo-500' : 'from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800'} opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${roleColor}">
            ${roleIcon}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${u.name}</div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[9px] uppercase font-black tracking-widest ${roleColor} px-1.5 py-0.5 rounded-md leading-none">${u.role.replace('_', ' ')}</span>
              ${u.email ? `<span class="text-[10px] text-slate-400 font-medium truncate">${u.username}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 ml-2 opacity-10 lg:opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Edit button -->
          <button onclick="openEditUser(${u.id},'${(u.name || '').replace(/'/g, "\\'")}', '${u.username}', '${u.email || ''}', '${u.phone || ''}', '${u.role}', ${JSON.stringify(u.allowed_panels || []).replace(/"/g, '&quot;')}, ${u.shop_id || 'null'}, '${u.status || 'active'}')" 
            class="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 flex items-center justify-center transition-transform hover:scale-110 shadow-sm" title="Edit Profile">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          ${u.role === 'superadmin' ? '' : `
          <!-- Suspend button -->
          <button onclick="toggleUserStatus(${u.id}, '${u.status || 'active'}')" class="w-7 h-7 rounded-lg flex items-center justify-center border ${u.status === 'active' || !u.status ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600'} transition-all hover:scale-110 shadow-sm" title="${u.status === 'active' || !u.status ? 'Suspend User' : 'Reactivate User'}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${u.status === 'active' || !u.status ? 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' : 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z'}"/></svg>
          </button>
          `}
        </div>
      </div>
      `;
  };

  const renderPartnerCard = (b) => {
    return `
      <div class="flex items-center justify-between p-3 rounded-xl border border-purple-100 dark:border-purple-900/30 hover:border-purple-300 dark:hover:border-purple-500/50 transition-all group bg-purple-50/30 dark:bg-purple-900/10">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm bg-purple-100 border border-purple-200 text-purple-600 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-400">
            🤝
          </div>
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">${b.name}</div>
            <div class="text-[9px] uppercase font-black tracking-widest text-purple-600 dark:text-purple-400 mt-0.5 border border-purple-200 dark:border-purple-800/50 px-1 inline-block rounded">Partner Brand</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 ml-2 opacity-10 lg:opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- View button -->
          <button onclick="managedShopId=${b.shop_id}; renderBrands(${b.shop_id})" class="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400 flex items-center justify-center transition-transform hover:scale-110 shadow-sm" title="View Partner Details">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
          </button>
        </div>
      </div>
      `;
  };

  return `
      <details class="group glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all mb-4" ${isGlobal || hierarchySearchQuery !== '' ? 'open' : ''}>
      <summary class="px-6 py-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer list-none flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        
        <!-- Parent Node Identity -->
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl shadow-inner flex items-center justify-center font-bold text-lg border ${c.border} ${c.iconBg} ${c.text}">
            ${isGlobal ? '⚙️' : (name || 'S').substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-black text-lg text-slate-900 dark:text-white tracking-tight">${name}</h4>
              ${isGlobal ? '' : `<span class="w-2 h-2 rounded-full ${shop.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}"></span>`}
            </div>
            
            <!-- Quick KPI Pills -->
            <div class="flex flex-wrap items-center gap-2 mt-2">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${userCount} Personnel
              </span>
              ${!isGlobal ? `
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${brandCount} Partners
              </span>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${productCount} Products
              </span>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${c.text} ${c.bg} px-2 py-0.5 rounded-md">
                Tier: ${plan}
              </span>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Inline Actions -->
        <div class="flex items-center gap-2">
          ${isGlobal ? '' : (shop && shop.allowed_panels) ? `
            ${shop.allowed_panels.includes('brands') ? `
              <button onclick="event.preventDefault(); event.stopPropagation(); managedShopId=${shop.id}; openAddBrand()" class="p-2 text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30 rounded-xl transition-all border border-transparent hover:border-purple-200 dark:hover:border-purple-800 flex items-center justify-center group/btn" title="Add Partner">
                <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              </button>
            ` : ''}
            <button onclick="event.preventDefault(); event.stopPropagation(); openCreateUser(${shop.id})" class="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-xl transition-all border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 flex items-center justify-center group/btn" title="Add User">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
            </button>
            <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button onclick="event.preventDefault(); event.stopPropagation(); openEditShop(${shop.id})" class="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center group/btn" title="Edit Store Settings">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
            <button onclick="event.preventDefault(); event.stopPropagation(); toggleShopStatus(${shop.id}, '${shop.status}')" class="p-2 rounded-xl transition-all border border-transparent flex items-center justify-center group/btn ${shop.status === 'active' ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:border-rose-200 dark:hover:border-rose-800' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-200 dark:hover:border-emerald-800'}" title="${shop.status === 'active' ? 'Suspend Store' : 'Reactivate Store'}">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${shop.status === 'active' ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'}"></path></svg>
            </button>
          ` : ''}
          <div class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 group-open:rotate-180 transition-transform bg-white dark:bg-slate-800 ml-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </summary>
      
      <!--Expanded Body(Children Nodes)-- >
      <div class="p-6 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800">

        ${users.length === 0 && brands.length === 0 ? `
          <div class="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400">No personnel or partners attached to this node.</p>
          </div>
        ` : ''}

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          <!-- Users Section -->
          ${users.length ? `
          <div class="${users.length > 3 ? 'md:col-span-2 xl:col-span-2' : ''}">
            <h5 class="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Assigned Personnel
            </h5>
            <div class="grid grid-cols-1 ${users.length > 1 ? 'sm:grid-cols-2' : ''} gap-3">
              ${users.map(u => renderUserCard(u)).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Brands (Partners) Section -->
          ${brands.length ? `
          <div>
            <h5 class="text-xs font-bold text-purple-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              Partner Networks
            </h5>
            <div class="grid grid-cols-1 gap-3">
              ${brands.map(b => renderPartnerCard(b)).join('')}
            </div>
          </div>
          ` : ''}

        </div>
      </div>
    </details>
      `;
}

async function toggleShopStatus(id, current) {
  const next = current === 'active' ? 'blocked' : 'active';
  const r = await api(`/api/shops/${id}`, 'PATCH', { status: next });
  if (r.error) return toast(r.error, 'error');
  toast(`Shop ${next === 'active' ? 'Activated' : 'Blocked'} `);
  renderHierarchy();
}

async function toggleUserStatus(id, current) {
  const next = current === 'active' ? 'blocked' : 'active';
  const user = (await api('/api/users')).find(u => u.id === id);
  if (!user) return toast('User not found', 'error');

  const payload = { ...user, status: next };
  delete payload.id;

  const r = await api(`/api/users/${id}`, 'PUT', payload);
  if (r.error) return toast(r.error, 'error');
  toast(`User ${next === 'active' ? 'Activated' : 'Blocked'} `);
  renderHierarchy();
}

function openCreateShop() {
  openModal('Create New Shop', shopFormHtml() + `<button onclick="saveShop()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Create Shop</button>`);
}

function openEditShop(id) {
  // We need to fetch shops again or use a global if available
  api('/api/shops').then(shops => {
    const shop = shops.find(s => s.id === id);
    if (!shop) return;
    openModal('Edit Shop', shopFormHtml(shop) + `<button onclick="saveShop(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Shop</button>`);
  });
}

function shopFormHtml(shop = null) {
  const shopPanels = shop && shop.allowed_panels ? (Array.isArray(shop.allowed_panels) ? shop.allowed_panels : JSON.parse(shop.allowed_panels)) : [];

  return `
      <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Shop Name</label>
        <input id="shop-name" type="text" value="${shop ? shop.name : ''}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Launch Panels (Master Control)</label>
        <div class="grid grid-cols-2 gap-2">
          ${allPanels().map(p => {
    const isSelected = p.panels.every(panelId => shopPanels.includes(panelId));
    return `
            <div data-panels='${JSON.stringify(p.panels)}' data-selected="${isSelected}" onclick="togglePanel(this)" class="panel-tile cursor-pointer p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300'}">
              <span class="text-[20px]">${p.icon}</span>
              <span class="text-[10px] font-bold uppercase tracking-tighter text-center">${p.name}</span>
            </div>
            `;
  }).join('')}
        </div>
      </div>
      ${!shop ? `
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <label class="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Initial Shop Owner Account</label>
        <div class="grid grid-cols-2 gap-3">
          <input id="shop-admin-username" type="text" placeholder="Admin Username" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          <input id="shop-admin-password" type="password" placeholder="Admin Password" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
      </div>` : ''
    }
    </div>
      `;
}

async function saveShop(id) {
  const selectedTiles = Array.from(document.querySelectorAll('.panel-tile[data-selected="true"]'));
  const allowed_panels = [];
  selectedTiles.forEach(el => {
    const panels = JSON.parse(el.dataset.panels || '[]');
    allowed_panels.push(...panels);
  });

  const payload = {
    name: $c('shop-name').value.trim(),
    allowed_panels: [...new Set(allowed_panels)]
  };
  if (!payload.name) return toast('Name required', 'error');

  if (!id) {
    const adminUsername = $c('shop-admin-username').value.trim();
    const adminPassword = $c('shop-admin-password').value.trim();
    if (!adminUsername || !adminPassword) return toast('Admin credentials required', 'error');
    payload.adminUsername = adminUsername;
    payload.adminPassword = adminPassword;
  }

  const method = id ? 'PATCH' : 'POST';
  const url = id ? `/api/shops/${id}` : '/api/shops';

  const r = await api(url, method, payload);
  if (r.error) return toast(r.error, 'error');

  toast(id ? 'Shop updated' : 'Shop created & admin added');
  closeModal();
  renderHierarchy();
}

async function deleteShop(id) {
  if (id === 1) return toast('Cannot delete main shop', 'warning');
  if (!confirm('Delete shop and all its data? This cannot be undone.')) return;
  await api(`/api/shops/${id}`, 'DELETE');
  toast('Shop deleted'); renderHierarchy();
}
// ─── Close modal on backdrop click (prevent if static) ───────────────────
$c('modal').addEventListener('click', e => {
  if (e.target === $c('modal')) {
    if ($c('modal').dataset.static === "true") return;
    closeModal();
  }
});

// ─── Support Hub (Shop Owner & Shared) ──────────────────────────────────
async function renderSupportHub() {
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="flex justify-center p-12 text-slate-400">Loading support dashboard...</div>';

  try {
    const tickets = await api('/api/support/tickets');

    let html = `
      <div class="mb-6 flex justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-1">Support Hub</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">Track and manage your requests and bugs.</p>
        </div>
        ${currentUser.role !== 'superadmin' ? `
          <button onclick="openCreateSupportTicket()" class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm shadow-indigo-200 dark:shadow-none">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Create Request
          </button>
        ` : ''}
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket ID</th>
                ${currentUser.role === 'superadmin' ? `<th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shop</th>` : ''}
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type & Priority</th>
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th class="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
    `;

    if (tickets.length === 0) {
      html += `
        <tr>
          <td colspan="${currentUser.role === 'superadmin' ? '7' : '6'}" class="p-8 text-center text-slate-500 dark:text-slate-400">
            No support requests found.
          </td>
        </tr>
      `;
    } else {
      tickets.forEach(t => {
        const statusColors = {
          'open': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
          'in_progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          'resolved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
          'closed': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
        };
        const priorityColors = {
          'low': 'text-slate-500',
          'medium': 'text-amber-500',
          'high': 'text-rose-500 font-semibold'
        };
        const badgeClass = statusColors[t.status] || statusColors['open'];
        const prioClass = priorityColors[t.priority] || priorityColors['medium'];

        html += `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer" onclick="openTicketDetail(${t.id})">
            <td class="p-4 text-sm font-medium text-slate-900 dark:text-slate-200">#${t.id}</td>
            ${currentUser.role === 'superadmin' ? `<td class="p-4 text-sm text-slate-600 dark:text-slate-300">${t.shop_name}</td>` : ''}
            <td class="p-4">
              <div class="text-sm font-medium text-slate-900 dark:text-white capitalize">${t.subject}</div>
              <div class="text-xs text-slate-500 truncate max-w-xs mt-0.5">${t.description}</div>
            </td>
            <td class="p-4">
              <div class="text-sm text-slate-700 dark:text-slate-300 capitalize">${t.type}</div>
              <div class="text-xs ${prioClass} capitalize mt-0.5">${t.priority} Priority</div>
            </td>
            <td class="p-4">
              <span class="px-2.5 py-1 text-xs rounded-full font-medium capitalize ${badgeClass}">
                ${t.status.replace('_', ' ')}
              </span>
            </td>
            <td class="p-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
              ${new Date(t.created_at).toLocaleDateString()}
            </td>
            <td class="p-4 text-right">
              <button class="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="View Details" onclick="event.stopPropagation(); openTicketDetail(${t.id})">
                 <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
              </button>
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
    content.innerHTML = html;
  } catch (e) {
    console.error('Render Support Hub error:', e);
    content.innerHTML = `<div class="p-6 text-red-500 bg-red-50 rounded-xl">Error loading tickets: ${e.message}</div>`;
  }
}

function openCreateSupportTicket() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-slide-up">
      <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
        <h3 class="text-lg font-bold text-slate-800 dark:text-white">Create Support Request</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <form id="create-ticket-form" class="p-6" onsubmit="submitSupportTicket(event, this)">
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Request Type</label>
            <select name="type" required class="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
              <option value="help">General Help / Support</option>
              <option value="bug">Report a Bug</option>
              <option value="feature">Feature Request</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
            <select name="priority" required class="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
              <option value="low">Low - Nice to have</option>
              <option value="medium" selected>Medium - Needs attention</option>
              <option value="high">High - Urgent / Blocking</option>
            </select>
          </div>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject</label>
          <input type="text" name="subject" required placeholder="Brief summary of the issue" class="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <textarea name="description" required rows="4" placeholder="Provide as much detail as possible..." class="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"></textarea>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Attachment (Optional)</label>
          <input type="file" name="attachment" accept="image/*,.pdf,.doc,.docx" class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-400">
          <p class="text-xs text-slate-400 mt-1">Accepts images, PDFs, or Word docs (Max 10MB).</p>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onclick="this.closest('.fixed').remove()" class="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            Submit Request
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitSupportTicket(e, form) {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

  try {
    const formData = new FormData(form);

    // Use standard fetch directly because our global api() wrapper sets headers
    // But FormData handles multipart/form-data boundary automatically. 
    // Do not set Content-Type header when using FormData.
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('pos_token')}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create ticket');

    toast('Support ticket submitted successfully!', 'success');
    form.closest('.fixed').remove();
    renderSupportHub();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function openTicketDetail(id) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-900 w-full max-w-xl h-full shadow-2xl animate-slide-left flex flex-col">
      <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
        <h3 class="text-lg font-bold text-slate-800 dark:text-white" id="ticket-detail-title">Loading Ticket #${id}...</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-6" id="ticket-detail-content">
        <div class="flex justify-center text-slate-400 my-10"><svg class="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
      </div>
      
      <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900" id="ticket-detail-reply-box" style="display: none;">
        <form onsubmit="submitTicketComment(event, this, ${id})" class="relative">
          <textarea name="comment" required rows="2" placeholder="Write a reply..." class="w-full border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm pr-12"></textarea>
          <button type="submit" class="absolute right-2 bottom-3 p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-full transition-colors">
            <svg class="w-5 h-5 -rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
          </button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const data = await api(`/api/support/tickets/${id}`);
    const { ticket, comments } = data;

    document.getElementById('ticket-detail-title').textContent = `Ticket #${ticket.id}`;

    const statusColors = {
      'open': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
      'in_progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      'resolved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'closed': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
    };

    // Original Post
    let threadHtml = `
      <div class="mb-8">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900 dark:text-white mb-1">${ticket.subject}</h1>
            <div class="flex gap-2 items-center text-xs">
              <span class="px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[ticket.status] || statusColors['open']}">${ticket.status.replace('_', ' ')}</span>
              <span class="text-slate-500 dark:text-slate-400 font-medium capitalize">${ticket.type} • ${ticket.priority} Priority</span>
            </div>
          </div>
          ${currentUser.role === 'superadmin' ? `
            <select onchange="updateTicketStatus(${ticket.id}, this.value)" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
              <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
          ` : ''}
        </div>
        
        <div class="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/10 rounded-2xl p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              ${ticket.author_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="text-sm font-semibold text-slate-900 dark:text-white">${ticket.author_name}</div>
              <div class="text-xs text-slate-500">${new Date(ticket.created_at).toLocaleString()}</div>
            </div>
          </div>
          <div class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">${ticket.description}</div>
          
          ${ticket.attachment_url ? `
            <div class="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-500/10">
              <a href="${ticket.attachment_url}" target="_blank" class="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-500/20 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                View Attachment
              </a>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="relative">
        <div class="absolute inset-y-0 left-4 w-px bg-slate-200 dark:bg-slate-800"></div>
        <div class="space-y-6" id="ticket-comments-list">
    `;

    // Comments
    comments.forEach(c => {
      const isSuper = c.author_role === 'superadmin';
      threadHtml += `
        <div class="relative pl-10">
          <div class="absolute left-0 w-8 h-8 rounded-full border-4 border-white dark:border-slate-900 ${isSuper ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'} flex items-center justify-center font-bold text-xs" style="left: 0;">
             ${c.author_name.charAt(0).toUpperCase()}
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 sm:rounded-2xl rounded-xl p-4 shadow-sm">
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                ${c.author_name}
                ${isSuper ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-100 dark:border-rose-800 uppercase tracking-wider">Support Team</span>' : ''}
              </div>
              <div class="text-xs text-slate-500">${new Date(c.created_at).toLocaleString()}</div>
            </div>
            <div class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">${c.comment}</div>
          </div>
        </div>
      `;
    });

    threadHtml += `</div></div>`;
    document.getElementById('ticket-detail-content').innerHTML = threadHtml;

    if (ticket.status !== 'closed') {
      document.getElementById('ticket-detail-reply-box').style.display = 'block';
    } else {
      document.getElementById('ticket-detail-reply-box').outerHTML = `
        <div class="p-4 text-center text-sm font-medium text-slate-500 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
           This ticket is closed. No further replies can be added.
        </div>
      `;
    }

  } catch (err) {
    document.getElementById('ticket-detail-content').innerHTML = `<div class="p-4 text-red-500">Failed to load ticket details: ${err.message}</div>`;
  }
}

async function submitTicketComment(e, form, ticketId) {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  const textarea = form.querySelector('textarea');
  const commentText = textarea.value;
  btn.disabled = true;

  try {
    await api(`/api/support/tickets/${ticketId}/comments`, 'POST', { comment: commentText });

    // Create new comment element optimistically or re-fetch
    const list = document.getElementById('ticket-comments-list');
    const isSuper = currentUser.role === 'superadmin';
    const newCommentHtml = `
      <div class="relative pl-10 animate-fade-in">
        <div class="absolute left-0 w-8 h-8 rounded-full border-4 border-white dark:border-slate-900 ${isSuper ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'} flex items-center justify-center font-bold text-xs" style="left: 0;">
           ${currentUser.name.charAt(0).toUpperCase()}
        </div>
        <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/30 sm:rounded-2xl rounded-xl p-4 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              ${currentUser.name}
              ${isSuper ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-100 dark:border-rose-800 uppercase tracking-wider">Support Team</span>' : ''}
            </div>
            <div class="text-xs text-indigo-500/70">Just now</div>
          </div>
          <div class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">${commentText}</div>
        </div>
      </div>
    `;
    list.insertAdjacentHTML('beforeend', newCommentHtml);

    textarea.value = '';
    const contentBox = document.getElementById('ticket-detail-content');
    contentBox.scrollTop = contentBox.scrollHeight;

    // Refresh background list softly
    renderSupportHub();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function updateTicketStatus(ticketId, status) {
  try {
    await api(`/api/support/tickets/${ticketId}/status`, 'PATCH', { status });
    toast('Ticket status updated');
    renderSupportHub();
  } catch (err) {
    alert(err.message);
  }
}

// ─── Start ───────────────────────────────────────────────────────────
init();

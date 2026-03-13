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
let shops = [];
let managedShopId = null; // Master Admin managing a specific shop
const AVAILABLE_PANELS = [
  { id: 'dashboard', name: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'brands', name: 'Brands', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
  { id: 'products', name: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'pos', name: 'POS / Checkout', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { id: 'sales-history', name: 'Sales History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'expenses', name: 'Expenses', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' }
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
        } else if (currentUser.allowed_panels && currentUser.allowed_panels.includes(p.id)) {
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
    if (!parent && (!currentUser.allowed_panels || !currentUser.allowed_panels.includes(page))) return false;
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
    hierarchy: 'Master Platform Hierarchy'
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
    hierarchy: renderHierarchy
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

// ─── Helpers ─────────────────────────────────────────────────────────
const $c = document.getElementById.bind(document);

function api(url, method = 'GET', body) {
  return fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());
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

function openModal(title, bodyHtml) {
  $c('modal-title').textContent = title;
  $c('modal-body').innerHTML = bodyHtml;
  $c('modal').classList.remove('hidden');
}
function closeModal() { $c('modal').classList.add('hidden'); }

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
async function renderDashboard() {
  const data = await api('/api/analytics');
  if (data.isGlobal) return renderGlobalDashboard(data);

  $c('page-content').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      ${statCard('Total Revenue', 'Rs. ' + Number(data.totalRevenue).toLocaleString(), `${data.totalSales} transactions`, 'blue')}
      ${statCard('Total Expenses', 'Rs. ' + Number(data.totalExpenses).toLocaleString(), 'All categories', 'rose')}
      ${statCard('Profit from Sales', 'Rs. ' + Number(data.netProfit).toLocaleString(), 'Revenue − Cost of Goods', 'emerald')}
      ${statCard('Products', data.totalProducts, 'in catalog', 'amber')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300">
        <h3 class="font-bold text-gray-700 dark:text-gray-200 mb-5 flex items-center gap-2">
          <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          Top Products
        </h3>
        ${data.topProducts.length ? `<div class="space-y-3">${data.topProducts.map((p, i) => `
          <div class="flex items-center justify-between py-1">
            <div class="flex items-center gap-3">
              <span class="w-5 h-5 text-center text-xs font-bold text-gray-400 dark:text-gray-600">${i + 1}</span>
              <div class="text-sm text-gray-700 dark:text-gray-300 font-medium">${p.name}</div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-semibold">${p.qty_sold} sold</span>
              <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">Rs. ${Number(p.revenue).toLocaleString()}</span>
            </div>
          </div>`).join('')}</div>` : '<p class="text-gray-400 text-sm italic">No sales yet.</p>'}
      </div>
      <div class="glass rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300">
        <h3 class="font-bold text-gray-700 dark:text-gray-200 mb-5 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          Recent Sales
        </h3>
        ${data.recentSales.length ? `<div class="space-y-1">${data.recentSales.map(s => `
          <div class="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <div class="text-xs text-gray-500 dark:text-gray-400">${new Date(s.created_at).toLocaleString()}</div>
            <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono">Rs. ${Number(s.total).toLocaleString()}</div>
          </div>`).join('')}</div>` : '<p class="text-gray-400 text-sm italic">No sales yet.</p>'}
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
                <button onclick="deleteProduct(${p.id})" class="px-2 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all border border-red-200 dark:border-transparent">Del</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500">No products. Add brands first, then products.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  window._productBrands = brands;
}

function productFormHtml(p = {}, brands = []) {
  const brandOptions = brands.map(b => `<option value="${b.id}" ${p.brand_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('');
  return `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">SKU *</label>
          <input id="pf-sku" value="${p.sku || ''}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Unique code" /></div>
        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">Category *</label>
          <input id="pf-category" value="${p.category || ''}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Electronics" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Product Name *</label>
          <input id="pf-name" value="${p.name || ''}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Product name" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Brand *</label>
          <select id="pf-brand" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all"><option value="">Select brand</option>${brandOptions}</select></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Description</label>
          <input id="pf-desc" value="${p.description || ''}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Optional description" /></div>
        <div><label class="block text-xs text-slate-400 mb-1">Cost Price</label>
          <input id="pf-buy" type="number" value="${p.buying_price || 0}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        <div><label class="block text-xs text-slate-400 mb-1">Initial Stock</label>
          <input id="pf-stock" type="number" value="${p.stock || 0}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Minimum Stock Level</label>
          <input id="pf-min-stock" type="number" value="${p.min_stock_level || 0}" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Alert threshold" /></div>
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

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await api(`/api/products/${id}`, 'DELETE');
  toast('Product deleted'); renderProducts();
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
          Cart
        </h3>
        <div id="cart-items" class="flex-1 space-y-2 overflow-y-auto min-h-20"></div>
        <div class="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4 space-y-4">
          <div class="grid grid-cols-2 gap-4 text-base">
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Discount (Rs)</label>
             <input id="pos-discount" type="number" min="0" value="0" oninput="calculateCartTotal()" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base font-medium shadow-sm" /></div>
             
             <div><label class="block text-sm text-slate-500 dark:text-slate-400 mb-1.5">Tax (%)</label>
             <input id="pos-tax" type="number" min="0" value="0" oninput="calculateCartTotal()" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base font-medium shadow-sm" /></div>
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
             <input id="pos-received" type="number" min="0" value="0" oninput="calculateRemaining()" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base font-medium shadow-sm" /></div>
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
      class="glass rounded-xl p-4 text-left border border-slate-200 dark:border-slate-800 transition-all hover:border-indigo-500 dark:hover:border-indigo-600/40 hover:bg-slate-50 dark:hover:bg-indigo-900/10 ${p.stock === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer shadow-sm'}">
      <div class="font-medium text-slate-800 dark:text-slate-200 text-sm truncate uppercase tracking-tight">${p.name}</div>
      <div class="text-[10px] text-slate-500 truncate">${p.brand_name || ''}</div>
      <div class="mt-2 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase tracking-wide cursor-pointer hover:underline">Select Price</div>
      <div class="text-[10px] ${p.stock > 10 ? 'text-slate-400 dark:text-slate-500' : p.stock > 0 ? 'text-yellow-600 dark:text-yellow-500' : 'text-rose-600 dark:text-rose-500'} mt-0.5">${p.stock} in stock</div>
    </button>`).join('') || '<p class="text-slate-500 col-span-3">No products found.</p>';
}

function filterPOSProducts() {
  const q = $c('pos-search').value.toLowerCase();
  renderPOSProducts(allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.brand_name || '').toLowerCase().includes(q)));
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(c => c.product_id === productId);
  if (existing) {
    if (existing.quantity >= product.stock) return toast('Max stock reached', 'error');
    existing.quantity++;
    renderCart();
  } else {
    // Note: in a real UX, a custom modal is better, but prompt is simple and effective here.
    const priceStr = prompt(`Enter selling price for "${product.name}" (Cost: Rs. ${product.buying_price}):`, product.buying_price || 0);
    if (priceStr === null) return; // cancelled
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return toast('Invalid selling price', 'error');

    cart.push({ product_id: productId, quantity: 1, selling_price: price, product });
    renderCart();
  }
}

function updateCartQty(productId, qty) {
  const product = allProducts.find(p => p.id === productId);
  if (qty > product.stock) return toast('Exceeds stock', 'error');
  if (qty <= 0) { cart = cart.filter(c => c.product_id !== productId); }
  else { cart.find(c => c.product_id === productId).quantity = qty; }
  renderCart();
}

function renderCart() {
  const cartEl = $c('cart-items');
  if (!cart.length) {
    cartEl.innerHTML = '<p class="text-slate-600 text-sm text-center py-4">Cart is empty</p>';
    calculateCartTotal();
    return;
  }
  cartEl.innerHTML = cart.map(item => `
    <div class="flex items-center gap-2 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div class="flex-1 min-w-0"><div class="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">${item.product.name}</div>
        <div class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Rs. ${(item.selling_price * item.quantity).toFixed(0)}</div></div>
      <div class="flex items-center gap-1">
        <button onclick="updateCartQty(${item.product_id}, ${item.quantity - 1})" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-white text-xs transition-all border border-slate-200 dark:border-transparent">−</button>
        <span class="text-sm text-slate-700 dark:text-slate-300 w-6 text-center font-medium">${item.quantity}</span>
        <button onclick="updateCartQty(${item.product_id}, ${item.quantity + 1})" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-white text-xs transition-all border border-slate-200 dark:border-transparent">+</button>
      </div>
    </div>`).join('');
  calculateCartTotal();
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
    </div>`);
}

async function printBill(saleId) {
  const data = await api(`/api/sales/${saleId}/bill`);
  const { sale, items, seller } = data;

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
    body{font-family:Arial,sans-serif;max-width:320px;margin:20px auto;color:#000;padding:0 10px;} h1{font-size:20px;text-align:center;} h2{font-size:14px;text-align:center;color:#555;font-weight:normal;margin-top:4px;}
    .divider{border:none;border-top:1px dashed #999;margin:12px 0;}
    table{width:100%;border-collapse:collapse;font-size:13px;}th{text-align:left;font-size:11px;color:#666;padding:4px 0;}
    td{padding:4px 0;border-bottom:1px solid #f0f0f0;} .right{text-align:right;} .total{font-size:16px;font-weight:bold;} .footer{text-align:center;font-size:11px;color:#999;margin-top:16px;}
  </style></head><body>
  <h1>🛒 Sales Receipt</h1>
  <h2>${seller ? seller.name : 'POS System'}</h2>
  <hr class="divider" />
  <p style="font-size:12px;color:#666;line-height:1.4;">
    <strong>Bill #:</strong> ${sale.id}<br>
    <strong>Date:</strong> ${new Date(sale.created_at).toLocaleString()}<br>
    <strong>Customer:</strong> ${sale.customer_name || 'Walk-in'}<br>
    ${sale.customer_phone ? `<strong>Phone:</strong> ${sale.customer_phone}` : ''}
  </p>
  <hr class="divider" />
  <table><thead><tr><th>Item</th><th>Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
  <tbody>${items.map(i => `<tr><td>${i.product_name}<br><small style="color:#888">${i.brand_name || ''}</small></td><td>${i.quantity}</td><td class="right">Rs.${i.price_at_sale}</td><td class="right">Rs.${(i.quantity * i.price_at_sale).toFixed(2)}</td></tr>`).join('')}</tbody></table>
  <hr class="divider" />
  <div class="right" style="font-size:12px; margin-bottom:4px;">Subtotal: Rs. ${subtotal.toFixed(2)}</div>
  ${discount > 0 ? `<div class="right" style="font-size:12px; margin-bottom:4px; color:#d97706;">Discount: -Rs. ${discount.toFixed(2)}</div>` : ''}
  ${taxPct > 0 ? `<div class="right" style="font-size:12px; margin-bottom:4px;">Tax (${taxPct}%): Rs. ${taxAmt.toFixed(2)}</div>` : ''}
  <div class="total right" style="margin-top:8px;">Grand Total: Rs. ${grandTotal.toFixed(2)}</div>
  <hr class="divider" />
  <div style="font-size:11px; color:#555; line-height: 1.6;">
    <div><strong>Method:</strong> ${method}</div>
    <div><strong>Received:</strong> Rs. ${received.toFixed(2)}</div>
    ${remaining > 0 ? `<div style="color:#d97706;"><strong>Due:</strong> Rs. ${remaining.toFixed(2)}</div>` : ''}
    ${remaining < 0 ? `<div style="color:#10b981;"><strong>Change:</strong> Rs. ${Math.abs(remaining).toFixed(2)}</div>` : ''}
  </div>
  <hr class="divider" />
  <div class="footer">Thank you for your purchase!</div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// ─── Sales History ─────────────────────────────────────────────────────────
// ─── Sales History ─────────────────────────────────────────────────────────

let _allSalesCache = [];
let _salesPendingFilter = false;

async function renderSalesHistory(onlyPendingDues = false) {
  _allSalesCache = await api('/api/sales');
  updatePendingDuesBadge(_allSalesCache);
  _salesPendingFilter = onlyPendingDues;

  const listTitle = onlyPendingDues ? 'pending due(s)' : 'paid slip(s)';

  $c('page-content').innerHTML = `
    <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
      <div class="flex items-center gap-3">
        <p class="text-slate-500 dark:text-slate-400 text-sm"><span id="sales-count" class="font-bold">0</span> ${listTitle}</p>
        ${onlyPendingDues ? `<button onclick="navigate('sales-history')" class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full font-medium border border-indigo-100 dark:border-transparent">Clear Filter</button>` : ''}
      </div>
      <div class="flex-1 md:max-w-md w-full">
        <input id="sales-search" oninput="_renderSalesTable()" placeholder="Search by Bill ID, Name, or Phone..."
          class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all text-sm shadow-sm" />
      </div>
    </div>
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
        <thead class="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-700"><tr>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Grand Total</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Received</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody id="sales-table-body" class="divide-y divide-slate-800">
        </tbody></table>
      </div>
    </div>`;

  _renderSalesTable();
}

function _renderSalesTable() {
  const query = ($c('sales-search').value || '').toLowerCase().trim();

  let displayList = _salesPendingFilter
    ? _allSalesCache.filter(s => (s.total - s.amount_received) > 0.01)
    : _allSalesCache.filter(s => (s.total - s.amount_received) <= 0.01);

  if (query) {
    displayList = displayList.filter(s =>
      s.id.toString() === query ||
      (s.customer_name && s.customer_name.toLowerCase().includes(query)) ||
      (s.customer_phone && s.customer_phone.toLowerCase().includes(query))
    );
  }

  $c('sales-count').textContent = displayList.length;

  $c('sales-table-body').innerHTML = displayList.length ? displayList.map(s => {
    const due = s.total - s.amount_received;
    const isPending = due > 0.01;
    const statusHtml = isPending
      ? `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">Pending Rs. ${due.toFixed(2)}</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Paid</span>`;

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
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
        <td class="px-5 py-4 text-slate-700 dark:text-slate-200 font-medium">Rs. ${parseFloat(s.total).toFixed(0)}</td>
        <td class="px-5 py-4 text-emerald-600 dark:text-emerald-400 font-medium">Rs. ${parseFloat(s.amount_received).toFixed(0)}</td>
        <td class="px-5 py-4">${statusHtml}</td>
        <td class="px-5 py-4 text-right">
          <div class="flex items-center justify-end gap-2">
            ${isPending ? `<button onclick="markSalePaid(${s.id}, ${s.total}, ${s.amount_received})" class="p-1.5 rounded bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors" title="Edit / Collect Dues"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>` : ''}
            <button onclick="printBill(${s.id})" class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 transition-colors" title="Print Bill">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('') : `<tr><td colspan="6" class="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm border-t border-slate-100 dark:border-slate-800 italic">No sales found.</td></tr>`;
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
  const [allExpenses, sharesRes] = await Promise.all([
    api('/api/expenses'),
    api('/api/brands/expense-shares')
  ]);

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
                <option value="electricity">⚡ Electricity</option>
                <option value="fuel">⛽ Fuel</option>
                <option value="rent">🏠 Rent</option>
                <option value="salary">🛠 Salary</option>
                <option value="other">📦 Other</option>
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

function catBadge(c) { return { electricity: 'bg-yellow-900/40 text-yellow-300', fuel: 'bg-orange-900/40 text-orange-300', rent: 'bg-blue-900/40 text-blue-300', salary: 'bg-purple-900/40 text-purple-300', other: 'bg-slate-700 text-slate-300' }[c] || 'bg-slate-700 text-slate-300'; }
function catEmoji(c) { return { electricity: '⚡', fuel: '⛽', rent: '🏠', salary: '👷', other: '📦' }[c] || '📦'; }

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
          <option value="electricity" ${e.category === 'electricity' ? 'selected' : ''}>⚡ Electricity</option>
          <option value="fuel" ${e.category === 'fuel' ? 'selected' : ''}>⛽ Fuel</option>
          <option value="rent" ${e.category === 'rent' ? 'selected' : ''}>🏠 Rent</option>
          <option value="salary" ${e.category === 'salary' ? 'selected' : ''}>🛠 Salary</option>
          <option value="other" ${e.category === 'other' ? 'selected' : ''}>📦 Other</option>
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
  const isShopAdmin = currentUser.role === 'admin' || currentUser.role === 'manager';

  $c('page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6" >
      <p class="text-slate-400 text-sm">${users.length} user(s)</p>
      <button onclick="openCreateUser()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">+ Create User</button>
    </div >
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-200 dark:border-slate-800 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</th>
          ${isMaster ? '<th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop</th>' : ''}
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Username</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${users.map(u => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
              <td class="px-5 py-4 font-medium text-slate-700 dark:text-slate-200">${u.name}</td>
              ${isMaster ? `<td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">${u.shop_name || '<span class="italic text-slate-400">System</span>'}</td>` : ''}
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400">@${u.username}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-center justify-center min-w-[60px] ${u.role === 'superadmin' ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30' :
      u.role === 'admin' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' :
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }">
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
                ${u.id !== currentUser.id && (isMaster || u.role !== 'admin' && u.role !== 'superadmin') ? `
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
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
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
        <div class="col-span-1">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Role</label>
          <select id="uf-role" onchange="toggleUserPanelPicker(this.value)" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="pos_user" ${u.role === 'pos_user' ? 'selected' : ''}>POS User</option>
            <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin/Shop Owner</option>
          </select>

        </div>
        `}
        <div class="col-span-1">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Status</label>
          <select id="uf-status" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="active" ${u.status === 'active' || !u.status ? 'selected' : ''}>Active</option>
            <option value="blocked" ${u.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          </select>
        </div>
        ${u.role === 'superadmin' ? `<input type="hidden" id="uf-role" value="superadmin" /><input type="hidden" id="uf-shop" value="" />` : `
        <div class="col-span-2">
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
        <div class="col-span-2" id="uf-panels-container" style="display: ${u.role === 'admin' ? 'none' : 'block'}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-3 font-bold uppercase tracking-wider">Allowed Panels (Inherited from Shop)</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3" id="panel-picker">
            ${AVAILABLE_PANELS.map(p => `

              <div class="panel-tile cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group ${u.allowed_panels?.includes(p.id) ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}"
                   onclick="this.dataset.selected = this.dataset.selected === 'true' ? 'false' : 'true'; this.classList.toggle('border-indigo-500'); this.classList.toggle('bg-indigo-50/50'); this.classList.toggle('dark:bg-indigo-900/20')"
                   data-id="${p.id}" data-selected="${u.allowed_panels?.includes(p.id)}">
                <div class="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                  <svg class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p.icon}"></path></svg>
                </div>
                <span class="text-[10px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-400">${p.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
        `}
      </div>
    </div>`;
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
  openModal('Create User', userFormHtml({ shop_id: shopId }) + `<button onclick="saveUser()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Create User</button>`);
  if (shopId) {
    const shopSelect = $c('uf-shop');
    if (shopSelect) shopSelect.value = shopId;
  }
}

function openEditUser(id, name, username, email, phone, role, allowed_panels, shop_id, status) {
  openModal('Edit User', userFormHtml({ id, name, username, email, phone, role, allowed_panels, shop_id, status }) + `<button onclick="saveUser(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update User</button>`);
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
async function renderHierarchy() {
  const [shops, users] = await Promise.all([api('/api/shops'), api('/api/users')]);
  const usersByShop = {};
  users.forEach(u => {
    const sid = u.shop_id || 'system';
    if (!usersByShop[sid]) usersByShop[sid] = [];
    usersByShop[sid].push(u);
  });

  let html = `
    <div class="space-y-8">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-1">Platform Hierarchy</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Multi-tenant view of all shops and their assigned personnel</p>
        </div>
        <button onclick="openCreateShop()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-md shadow-indigo-600/20">
          + Launch New Shop
        </button>
      </div>
  `;

  const systemUsers = usersByShop['system'] || [];
  html += renderHierarchyBlock('Platform Engine (Master Owner)', systemUsers, 'indigo', null, true);

  shops.forEach(s => {
    const shopUsers = usersByShop[s.id] || [];
    html += renderHierarchyBlock(s.name, shopUsers, 'blue', s);
  });

  html += '</div>';
  $c('page-content').innerHTML = html;
}

function renderHierarchyBlock(name, users, color, shop = null, isGlobal = false) {
  const colorMap = {
    indigo: { text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500' },
    blue: { text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500' }
  };
  const c = colorMap[color] || colorMap.blue;

  return `
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <div class="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h4 class="font-black text-xs uppercase tracking-[0.2em] ${c.text}">${name}</h4>
        <div class="flex items-center gap-3">
          ${isGlobal ? '' : (shop && shop.allowed_panels) ? `
            ${shop.allowed_panels.includes('brands') ? `
              <button onclick="renderBrands(${shop.id})" class="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors uppercase tracking-widest">Manage Brands</button>
              <div class="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
              <button onclick="managedShopId=${shop.id}; openAddBrand()" class="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors uppercase tracking-widest">+ Brand</button>
              <div class="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
            ` : ''}
            <button onclick="openCreateUser(${shop.id})" class="text-[10px] font-bold text-indigo-600 hover:text-indigo-500 transition-colors uppercase tracking-widest">+ User</button>
            <div class="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
            <button onclick="openEditShop(${shop.id})" class="text-[10px] font-bold text-slate-500 hover:text-indigo-500 transition-colors uppercase tracking-widest">Edit Shop</button>

            <button onclick="toggleShopStatus(${shop.id}, '${shop.status}')" class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all ${shop.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}">
              ${shop.status}
            </button>
          ` : ''}
        </div>


      </div>
      <div class="p-4">
        ${users.length ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${users.map(u => `
              <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:${c.border} transition-all group bg-white dark:bg-slate-900">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all capitalize">
                    ${(u.name || 'U')[0]}
                  </div>
                  <div class="min-w-0">
                    <div class="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">${u.name}</div>
                    <div class="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-tighter">${u.role.replace('_', ' ')}</div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-2">
                  <button onclick="openEditUser(${u.id},'${(u.name || '').replace(/'/g, "\\'")}','${u.username}','${u.email || ''}','${u.phone || ''}','${u.role}', ${JSON.stringify(u.allowed_panels).replace(/"/g, '&quot;')}, ${u.shop_id || 'null'}, '${u.status || 'active'}')" 
                    class="w-5 h-5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center transition-all hover:scale-110 shadow-sm" title="Edit Metadata">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                  </button>
                  ${u.role === 'superadmin' ? '' : `
                  <button onclick="toggleUserStatus(${u.id}, '${u.status || 'active'}')" class="w-5 h-5 rounded-md flex items-center justify-center border ${u.status === 'active' || !u.status ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'} transition-all hover:scale-110 shadow-sm" title="Toggle Status">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${u.status === 'active' || !u.status ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}"/></svg>
                  </button>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p class="text-xs text-slate-400 italic py-2 px-2">No users assigned to this shop.</p>'}
      </div>
    </div>
  `;
}

async function toggleShopStatus(id, current) {
  const next = current === 'active' ? 'blocked' : 'active';
  const r = await api(`/api/shops/${id}`, 'PATCH', { status: next });
  if (r.error) return toast(r.error, 'error');
  toast(`Shop ${next === 'active' ? 'Activated' : 'Blocked'}`);
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
  toast(`User ${next === 'active' ? 'Activated' : 'Blocked'}`);
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
      </div>` : ''}
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
// ─── Close modal on backdrop click ───────────────────────────────────
$c('modal').addEventListener('click', e => { if (e.target === $c('modal')) closeModal(); });

// ─── Start ───────────────────────────────────────────────────────────
init();

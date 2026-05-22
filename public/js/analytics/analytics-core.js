// ─── Analytics Core Manager ──────────────────────────────────────────────────
let activeAnalyticsTab = "overview";
let analyticsPeriod = "7days";
let analyticsCustomFrom = "";
let analyticsCustomTo = "";
let analyticsData = null;

const analyticsLinks = [
  { id: "overview", label: "Overview", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`, activeBg: "bg-blue-50 dark:bg-blue-500/10", activeText: "text-blue-700 dark:text-blue-400", activeBorder: "border-blue-600 dark:border-blue-500" },
  { id: "sales", label: "Sales Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`, activeBg: "bg-indigo-50 dark:bg-indigo-500/10", activeText: "text-indigo-700 dark:text-indigo-400", activeBorder: "border-indigo-600 dark:border-indigo-500" },
  { id: "products", label: "Product Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`, activeBg: "bg-amber-50 dark:bg-amber-500/10", activeText: "text-amber-700 dark:text-amber-400", activeBorder: "border-amber-500 dark:border-amber-400" },
  { id: "customers", label: "Customer Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`, activeBg: "bg-pink-50 dark:bg-pink-500/10", activeText: "text-pink-700 dark:text-pink-400", activeBorder: "border-pink-500 dark:border-pink-400" },
  { id: "inventory", label: "Inventory Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>`, activeBg: "bg-emerald-50 dark:bg-emerald-500/10", activeText: "text-emerald-700 dark:text-emerald-400", activeBorder: "border-emerald-500 dark:border-emerald-400" },
  { id: "profit", label: "Profit Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`, activeBg: "bg-teal-50 dark:bg-teal-500/10", activeText: "text-teal-700 dark:text-teal-400", activeBorder: "border-teal-500 dark:border-teal-400" },
  { id: "staff", label: "Staff Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/></svg>`, activeBg: "bg-violet-50 dark:bg-violet-500/10", activeText: "text-violet-700 dark:text-violet-400", activeBorder: "border-violet-500 dark:border-violet-400" },
  { id: "channels", label: "Channel Analytics", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>`, activeBg: "bg-sky-50 dark:bg-sky-500/10", activeText: "text-sky-700 dark:text-sky-400", activeBorder: "border-sky-500 dark:border-sky-400" },
  { id: "reports", label: "Reports", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`, activeBg: "bg-fuchsia-50 dark:bg-fuchsia-500/10", activeText: "text-fuchsia-700 dark:text-fuchsia-400", activeBorder: "border-fuchsia-500 dark:border-fuchsia-400" },
  { id: "ai", label: "Digital AI Analyst", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg>`, activeBg: "bg-violet-50 dark:bg-violet-500/10", activeText: "text-violet-700 dark:text-violet-400", activeBorder: "border-violet-600 dark:border-violet-500" },
  { id: "custom_reports", label: "Custom Reports", icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`, activeBg: "bg-slate-100 dark:bg-slate-800", activeText: "text-slate-800 dark:text-white", activeBorder: "border-slate-800 dark:border-slate-400" }
];

function toggleAnalyticsSidebar() {
  const drawer = document.getElementById("analytics-sidebar-drawer");
  const overlay = document.getElementById("analytics-sidebar-overlay");
  
  if (drawer.classList.contains("-translate-x-full")) {
    drawer.classList.remove("-translate-x-full");
    overlay.classList.remove("opacity-0", "pointer-events-none");
    overlay.classList.add("opacity-100");
  } else {
    drawer.classList.add("-translate-x-full");
    overlay.classList.add("opacity-0", "pointer-events-none");
    overlay.classList.remove("opacity-100");
  }
}

function getLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}

async function renderAnalytics() {
  const content = document.getElementById("page-content");
  
  // Renders the highly premium visual page framework with a TOP BAR navigation
  content.innerHTML = `
    <!-- Analytics Sidebar Overlay & Drawer -->
    <div id="analytics-sidebar-overlay" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] opacity-0 pointer-events-none transition-opacity duration-300" onclick="toggleAnalyticsSidebar()"></div>
    <div id="analytics-sidebar-drawer" class="fixed top-0 left-0 h-full w-full sm:w-80 bg-white dark:bg-slate-900 shadow-2xl z-[110] -translate-x-full transition-transform duration-300 flex flex-col border-r border-slate-100 dark:border-slate-800">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <div>
          <span class="text-[9px] uppercase font-black tracking-widest text-slate-400">Navigation</span>
          <h4 class="text-base font-black text-slate-800 dark:text-white tracking-tight">Metrics Suite</h4>
        </div>
        <button onclick="toggleAnalyticsSidebar()" class="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <nav id="analytics-sidebar-nav" class="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        ${analyticsLinks.map(tab => renderSidebarLink(tab)).join('')}
      </nav>
      
      <!-- Upgrade Pill in Sidebar footer -->
      <div class="p-6 border-t border-slate-100 dark:border-slate-800">
        <div onclick="toast('Advanced AI Insights coming soon!', 'info')" class="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-900/20 border border-indigo-100/50 dark:border-indigo-800/30 rounded-2xl cursor-pointer hover:shadow-lg transition-all group">
          <svg class="w-6 h-6 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
          <span class="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest text-center">Unlock AI Insights</span>
          <span class="text-[10px] text-indigo-500 dark:text-indigo-400 text-center mt-1">Upgrade to Premium</span>
        </div>
      </div>
    </div>

    <div class="flex flex-col min-h-[calc(100vh-6rem)] gap-6 animate-[fadeIn_0.3s_ease-out]">
      
      <!-- Top Bar Analytics Controller -->
      <div class="flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
        
        <!-- Top Row: Hamburger, Branding, Toolbar Filters -->
        <div class="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <!-- Branding & Hamburger -->
          <div class="flex items-center gap-4">
            <button onclick="toggleAnalyticsSidebar()" class="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 shadow-sm border border-slate-200 dark:border-slate-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
            </button>
            <div>
              <span class="text-[9px] uppercase font-black tracking-widest text-slate-400 hidden sm:block">Analytics Engine</span>
              <h4 class="text-base font-black text-slate-800 dark:text-white mt-0.5 tracking-tight flex items-center gap-1.5">
                <svg class="w-5 h-5 text-blue-600 hidden sm:inline" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg> Metrics Suite
              </h4>
            </div>
          </div>

          <!-- Filters & Action Buttons -->
          <div class="flex flex-wrap items-center gap-3">
            <!-- Custom Date Selector Inputs -->
            <div id="analytics-custom-dates" class="${analyticsPeriod === 'custom' ? 'flex' : 'hidden'} items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <input type="date" id="custom-from" value="${analyticsCustomFrom}" onchange="updateAnalyticsCustomDates()" class="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer">
              <span class="text-slate-400 text-xs">to</span>
              <input type="date" id="custom-to" value="${analyticsCustomTo}" onchange="applyAnalyticsCustomDates()" class="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer">
            </div>

            <!-- Main Filter Picker -->
            <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period:</span>
              <select id="analytics-period-select" onchange="handleAnalyticsPeriodChange()" class="bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 outline-none cursor-pointer">
                <option value="all" ${analyticsPeriod === 'all' ? 'selected' : ''}>All Time</option>
                <option value="today" ${analyticsPeriod === 'today' ? 'selected' : ''}>Today</option>
                <option value="7days" ${analyticsPeriod === '7days' ? 'selected' : ''}>Last 7 Days</option>
                <option value="30days" ${analyticsPeriod === '30days' ? 'selected' : ''}>Last 30 Days</option>
                <option value="12months" ${analyticsPeriod === '12months' ? 'selected' : ''}>Last 12 Months</option>
                <option value="custom" ${analyticsPeriod === 'custom' ? 'selected' : ''}>Custom Range</option>
              </select>
            </div>

            <!-- Export PDF/CSV Button -->
            <button onclick="exportAnalyticsReport()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 transition-all flex items-center gap-1.5 active:scale-[0.98]">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Export Report
            </button>
          </div>
        </div>
      </div>

      <!-- Main Full-Width Viewport -->
      <main class="w-full flex flex-col gap-6 min-w-0">
        <!-- Tab Content Header -->
        <div class="px-1">
          <h3 class="text-lg font-black text-slate-800 dark:text-white tracking-tight" id="analytics-tab-title">Overview</h3>
          <p class="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5" id="analytics-tab-subtitle">Track and analyze your business performance</p>
        </div>

        <!-- Dynamic Content Viewport -->
        <div id="analytics-viewport" class="w-full flex-1">
          <!-- Handled by active tab loading -->
        </div>
      </main>
    </div>
  `;

  // Pre-load data and render active tab
  await loadAnalyticsData();
}

function renderSidebarLink(tab) {
  const isActive = activeAnalyticsTab === tab.id;
  
  if (isActive) {
    return `
      <button onclick="switchAnalyticsTab('${tab.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${tab.activeBg} ${tab.activeBorder} text-left transition-all duration-200 shadow-sm relative overflow-hidden group">
        <div class="absolute left-0 top-0 bottom-0 w-1 ${tab.activeBg.replace('bg-', 'bg-').replace('50', '600').replace('500/10', '500')}"></div>
        <span class="${tab.activeText}">${tab.icon}</span>
        <span class="text-sm font-black ${tab.activeText} tracking-tight">${tab.label}</span>
      </button>
    `;
  } else {
    return `
      <button onclick="switchAnalyticsTab('${tab.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all duration-200 group">
        <span class="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">${tab.icon}</span>
        <span class="text-sm font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 tracking-tight transition-colors">${tab.label}</span>
      </button>
    `;
  }
}

async function loadAnalyticsData() {
  const viewport = document.getElementById("analytics-viewport");
  if (!viewport) return;

  viewport.innerHTML = `
    <div class="flex flex-col items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 gap-4">
      <div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-slate-800 dark:border-t-slate-200 rounded-full animate-spin"></div>
      <span class="text-sm font-bold text-slate-500">Aggregating transactional data in under 1 second...</span>
    </div>
  `;

  try {
    let url = `/api/analytics/dashboard-data?period=${analyticsPeriod}&t=${Date.now()}`;
    if (analyticsPeriod === 'custom') {
      url += `&from=${analyticsCustomFrom}&to=${analyticsCustomTo}`;
    }
    
    analyticsData = await api(url);
    renderActiveAnalyticsTab();
  } catch (err) {
    console.error("Failed to load aggregated analytics:", err);
    viewport.innerHTML = `
      <div class="p-6 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/60 font-medium text-sm flex flex-col gap-2">
        <span class="font-bold">❌ Error Computing Analytics</span>
        <span>${err.message}</span>
        <button onclick="loadAnalyticsData()" class="mt-2 w-fit px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md">Retry Query</button>
      </div>
    `;
  }
}

function renderActiveAnalyticsTab() {
  const viewport = document.getElementById("analytics-viewport");
  if (!viewport || !analyticsData) return;

  // Dynamic heading titles/subtitles mapping
  const headers = {
    overview: { title: "Overview", subtitle: "Track and analyze your business performance" },
    sales: { title: "Sales Analytics", subtitle: "Granular statistics for net sales, revenue contributions, and volumes" },
    products: { title: "Product Analytics", subtitle: "Top selling items, bundle product performance, and category summaries" },
    customers: { title: "Customer Analytics", subtitle: "Track customer lifetime value, active balances, and ledger summaries" },
    inventory: { title: "Inventory Analytics", subtitle: "Monitor stock asset valuation, alert tiers, and low stock metrics" },
    profit: { title: "Profit Analytics", subtitle: "Evaluate Gross Profit, Cost of Goods Sold (COGS), and net margins" },
    staff: { title: "Staff Analytics", subtitle: "Top order counts and sales volume contributions by cashier/waiter" },
    channels: { title: "Channel Analytics", subtitle: "Analyze revenue streams from In-Store POS, online apps, and delivery" },
    reports: { title: "Reports", subtitle: "Download ready-made monthly performance summaries" },
    ai: { title: "AI Expert Analyst", subtitle: "Automated business intelligence powered by real-time data analysis" },
    custom_reports: { title: "Custom Reports", subtitle: "Define customizable filters and export transactional ledgers" }
  };

  const header = headers[activeAnalyticsTab] || headers.overview;
  document.getElementById("analytics-tab-title").innerText = header.title;
  document.getElementById("analytics-tab-subtitle").innerText = header.subtitle;

  // Call the appropriate modular tab renderer
  if (activeAnalyticsTab === "overview") {
    renderOverviewTab(analyticsData);
  } else {
    // Renders the individual specific tab view
    renderSpecificSubTab(activeAnalyticsTab, analyticsData);
  }
}

function switchAnalyticsTab(tabId) {
  activeAnalyticsTab = tabId;
  
  // Hard rebuild of sidebar navigation highlights
  const navContainer = document.getElementById("analytics-sidebar-nav");
  if (navContainer) {
    navContainer.innerHTML = analyticsLinks.map(tab => renderSidebarLink(tab)).join('');
  }

  // Close the sidebar if it's open (handles mobile selection)
  const drawer = document.getElementById("analytics-sidebar-drawer");
  if (drawer && !drawer.classList.contains("-translate-x-full")) {
    toggleAnalyticsSidebar();
  }

  renderActiveAnalyticsTab();
}

function handleAnalyticsPeriodChange() {
  const val = document.getElementById("analytics-period-select").value;
  analyticsPeriod = val;
  
  const customDatesBox = document.getElementById("analytics-custom-dates");
  if (val === 'custom') {
    customDatesBox.classList.remove("hidden");
    customDatesBox.classList.add("flex");
    if (!analyticsCustomFrom || !analyticsCustomTo) {
      const d = new Date();
      analyticsCustomTo = getLocalDateStr(d);
      d.setDate(d.getDate() - 29); // 30 days inclusive
      analyticsCustomFrom = getLocalDateStr(d);
      
      document.getElementById("custom-from").value = analyticsCustomFrom;
      document.getElementById("custom-to").value = analyticsCustomTo;
    }
  } else {
    customDatesBox.classList.remove("flex");
    customDatesBox.classList.add("hidden");
  }
  
  loadAnalyticsData();
}

function updateAnalyticsCustomDates() {
  const fromEl = document.getElementById('custom-from');
  const toEl = document.getElementById('custom-to');
  const fromVal = fromEl.value;
  
  if (fromVal) {
    const fromDate = new Date(fromVal);
    const maxDate = new Date(fromDate);
    maxDate.setDate(fromDate.getDate() + 29); // 30 days max inclusive
    
    toEl.min = fromVal;
    toEl.max = getLocalDateStr(maxDate);
    
    // Correct toEl if out of bounds
    if (toEl.value) {
       const toDate = new Date(toEl.value);
       if (toDate > maxDate) toEl.value = getLocalDateStr(maxDate);
       if (toDate < fromDate) toEl.value = fromVal;
    } else {
       toEl.value = getLocalDateStr(maxDate);
    }
  }
  applyAnalyticsCustomDates();
}

function applyAnalyticsCustomDates() {
  const fromVal = document.getElementById('custom-from').value;
  const toVal = document.getElementById('custom-to').value;
  if (fromVal && toVal) {
    analyticsCustomFrom = fromVal;
    analyticsCustomTo = toVal;
    analyticsPeriod = 'custom';
    loadAnalyticsData();
  }
}

function exportAnalyticsReport() {
  // Leverage base print stylesheet triggers
  window.print();
}

// Theme toggle shared logic
function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    if (charts.growth) initCharts(); // Re-render charts to match theme
}

const COMMAND_CENTER_TABS = new Set(['overview', 'activity', 'health', 'ledger']);

function getCommandCenterTabFromHash() {
    const tab = window.location.hash.replace('#', '').trim();
    return COMMAND_CENTER_TABS.has(tab) ? tab : 'overview';
}

// Tab Switching Logic
function switchTab(tabId, options = {}) {
    const targetTab = COMMAND_CENTER_TABS.has(tabId) ? tabId : 'overview';
    const targetView = document.getElementById(`view-${targetTab}`);
    if (!targetView) return;

    // 1. Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('block');
        el.classList.add('hidden');
    });

    // 2. Remove active state from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // 3. Show selected view
    targetView.classList.remove('hidden');
    targetView.classList.add('block');

    // 4. Set active state on clicked tab button
    const activeBtn = document.querySelector(`button[onclick="switchTab('${targetTab}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    if (options.syncHash !== false) {
        const nextUrl = targetTab === 'overview'
            ? window.location.pathname
            : `${window.location.pathname}#${targetTab}`;
        history.replaceState(null, '', nextUrl);
    }
}

const PLATFORM_MODULES = new Set(['dashboard', 'hierarchy', 'subscriptions', 'notifications', 'settings', 'users', 'logs']);

function openPlatformModule(page) {
    if (!PLATFORM_MODULES.has(page)) {
        toast('That platform area is not available.', 'error');
        return;
    }
    sessionStorage.setItem('lobby_selected', 'true');
    localStorage.setItem('pos_page', page);
    window.location.href = `/dashboard?platform_page=${encodeURIComponent(page)}`;
}

// Modal logic
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    const base = 'fixed top-5 right-5 z-[200] px-5 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all transform flex items-center gap-2';
    el.className = `${base} ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
        window.location.href = '/';
        throw new Error('Session expired');
    }

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
        return data;
    } else {
        const text = await res.text();
        if (!res.ok) throw new Error(`Server Error (${res.status})`);
        return text;
    }
}

// Global State
let globalStats = {};
let globalStores = [];
let globalTotalStores = 0;
let globalStoreLimit = 25;
let globalStoreOffset = 0;
let globalStoreSearch = '';
let globalActivity = [];
let globalHealth = {};

let globalLedger = [];

let charts = {
    growth: null,
    density: null
};

// Colors based on theme
const getChartColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        text: isDark ? '#9ca3af' : '#475569',
        grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        indigo: isDark ? '#818cf8' : '#6366f1',
        indigoFill: isDark ? 'rgba(129, 140, 248, 0.2)' : 'rgba(99, 102, 241, 0.2)',
        emerald: isDark ? '#34d399' : '#10b981',
        emeraldFill: isDark ? 'rgba(52, 211, 153, 0.2)' : 'rgba(16, 185, 129, 0.2)',
        amber: isDark ? '#fbbf24' : '#f59e0b',
        rose: isDark ? '#fb7185' : '#f43f5e',
        lavender: isDark ? '#a78bfa' : '#a78bfa',
        lavenderFill: isDark ? 'rgba(167, 139, 250, 0.18)' : 'rgba(167, 139, 250, 0.22)',
        yellow: isDark ? '#fde68a' : '#fde68a',
        yellowFill: isDark ? 'rgba(253, 230, 138, 0.15)' : 'rgba(253, 230, 138, 0.38)'
    };
};

async function init() {
    try {
        const me = await api('/api/auth/me');
        if (me.user?.role !== 'superadmin') {
            window.location.href = '/dashboard';
            return;
        }
        switchTab(getCommandCenterTabFromHash(), { syncHash: false });

        // Parallel Data Fetching
        await Promise.all([
            fetchStats(),
            fetchStores(),
            fetchActivity(),
            fetchHealth(),
            fetchLedger()
        ]);



    } catch (e) {
        console.error('Initialization Failed:', e);
        // Do not redirect blindly, show a clear error state
        const content = document.getElementById('view-overview');
        if (content) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center p-20 text-center">
                    <div class="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-6">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <h2 class="text-2xl font-black text-slate-900 dark:text-white mb-2">Platform Access Interrupted</h2>
                    <p class="text-slate-500 dark:text-slate-400 max-w-md mb-8">${e.message || 'An unexpected error occurred while connecting to the platform services.'}</p>
                    <div class="flex gap-4">
                        <button onclick="window.location.reload()" class="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20">Try Reconnecting</button>
                        <a href="/admin/store-monitoring" class="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Return to Command Center</a>
                    </div>
                </div>
            `;
        } else {
            // Fallback if the DOM isn't ready
            toast("Access Error: " + e.message, 'error');
            setTimeout(() => window.location.href = '/dashboard', 3000);
        }
    }
}

window.addEventListener('hashchange', () => {
    switchTab(getCommandCenterTabFromHash(), { syncHash: false });
});

async function fetchStats() {
    const res = await api('/api/admin/store-stats');
    if (res.error) return toast(res.error, 'error');
    globalStats = res;
    renderStatsPanel();
    initCharts();
    renderOverviewAuxiliary();
}

async function fetchStores() {
    const res = await api(`/api/admin/stores?limit=${globalStoreLimit}&offset=${globalStoreOffset}&search=${encodeURIComponent(globalStoreSearch)}`);
    if (res.error) return toast(res.error, 'error');
    globalStores = res.stores;
    globalTotalStores = res.total;
    renderStoreTable();
    renderOverviewAuxiliary();
}

function changePage(delta) {
    const newOffset = globalStoreOffset + (delta * globalStoreLimit);
    if (newOffset >= 0 && newOffset < globalTotalStores) {
        globalStoreOffset = newOffset;
        fetchStores();
    }
}

async function fetchActivity() {
    const res = await api('/api/admin/activity');
    if (res.error) return; // Silent fail handled gracefully in UI
    globalActivity = res;
    renderActivityLog();
}

async function fetchHealth() {
    const res = await api('/api/admin/system-health');
    if (res.error) return;
    globalHealth = res;
    renderSystemHealth();
}



function money(value) {
    return 'Rs. ' + Math.round(Number(value || 0)).toLocaleString();
}

function percent(value, total) {
    const totalNumber = Number(total || 0);
    if (!totalNumber) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(value || 0) / totalNumber) * 100)));
}

function renderStatsPanel() {
    const s = globalStats;
    const panel = document.getElementById('stats-panel');
    panel.innerHTML = `
        <div class="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-amber-200/40 dark:bg-amber-300/10"></div>
        <div class="relative z-10">
            <div class="text-sm font-black text-slate-950 dark:text-white">Platform Revenue</div>
            <div class="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">Current performance</div>
        </div>
        <div class="relative z-10 h-[190px] mt-5">
            <div class="metric-orb absolute left-1 top-0 w-32 h-32 bg-violet-100 dark:bg-violet-500/20 text-slate-900 dark:text-white">
                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Subscriptions</span>
                <strong class="text-lg font-black mt-1">${money(s.subRevenueTotal)}</strong>
            </div>
            <div class="metric-orb absolute right-0 top-5 w-28 h-28 bg-amber-100 dark:bg-amber-500/20 text-slate-900 dark:text-white">
                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Setup</span>
                <strong class="text-base font-black mt-1">${money(s.setupFeesTotal)}</strong>
            </div>
            <div class="metric-orb absolute left-16 bottom-0 w-28 h-28 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-100 dark:border-slate-800">
                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Profit</span>
                <strong class="text-base font-black mt-1">${money(s.platformRevenue)}</strong>
            </div>
        </div>
    `;
}

function paymentCategoryLabel(category) {
    return {
        subscription: 'Subscriptions',
        setup: 'Setup Fees',
        advance: 'Advances',
        repair: 'Repairs',
        other: 'Other'
    }[category] || category || 'Other';
}

function categoryBarColor(category) {
    return {
        subscription: 'bg-violet-300',
        setup: 'bg-amber-200',
        advance: 'bg-emerald-200',
        repair: 'bg-rose-200',
        other: 'bg-slate-300'
    }[category] || 'bg-slate-300';
}

function renderOverviewAuxiliary() {
    const categoryEl = document.getElementById('category-bars');
    const statusEl = document.getElementById('status-bars');
    const ledgerEl = document.getElementById('ledger-mini');
    const tenantMini = document.getElementById('tenant-status-mini');

    if (categoryEl) {
        const totals = globalLedger.reduce((acc, log) => {
            const key = log.category || 'other';
            acc[key] = (acc[key] || 0) + Number(log.amount || 0);
            return acc;
        }, {});
        const allTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
        const categories = ['subscription', 'setup', 'advance', 'repair', 'other'];
        categoryEl.innerHTML = categories.map((category) => {
            const value = totals[category] || 0;
            const pct = percent(value, allTotal);
            return `
                <div>
                    <div class="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                        <span>${paymentCategoryLabel(category)}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="h-7 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div class="h-full rounded-full ${categoryBarColor(category)}" style="width:${Math.max(pct, value ? 8 : 0)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (statusEl) {
        const s = globalStats;
        const revenueTotal = Number(s.platformRevenue || 0);
        const rows = [
            { label: 'Subscriptions', value: Number(s.subRevenueTotal || 0), total: revenueTotal, color: 'bg-violet-300', meta: money(s.subRevenueTotal) },
            { label: 'MRR', value: Number(s.mrr || 0), total: revenueTotal || Number(s.mrr || 0), color: 'bg-amber-200', meta: money(s.mrr) },
            { label: 'Active Tenants', value: Number(s.activeStores || 0), total: Number(s.totalStores || 0), color: 'bg-emerald-200', meta: `${s.activeStores || 0}/${s.totalStores || 0}` },
            { label: 'Products', value: Number(s.totalProducts || 0), total: Math.max(Number(s.totalProducts || 0), 1), color: 'bg-sky-200', meta: Number(s.totalProducts || 0).toLocaleString() },
        ];
        statusEl.innerHTML = rows.map((row) => {
            const pct = percent(row.value, row.total);
            return `
                <div>
                    <div class="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                        <span>${row.label}</span>
                        <span>${row.meta}</span>
                    </div>
                    <div class="h-8 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div class="h-full rounded-full ${row.color}" style="width:${Math.max(pct, row.value ? 8 : 0)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (ledgerEl) {
        const rows = globalLedger.slice(0, 4);
        if (!rows.length) {
            ledgerEl.innerHTML = '<div class="py-8 text-center text-sm text-slate-400 italic">No payments recorded.</div>';
        } else {
            ledgerEl.innerHTML = rows.map((log) => `
                <div class="flex items-center justify-between gap-4 p-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800">
                    <div class="min-w-0">
                        <div class="text-sm font-black text-slate-900 dark:text-white truncate">${log.shop_name || 'Platform'}</div>
                        <div class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${paymentCategoryLabel(log.category)} • ${log.payment_method || 'Cash'}</div>
                    </div>
                    <div class="text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">${money(log.amount)}</div>
                </div>
            `).join('');
        }
    }

    if (tenantMini) {
        tenantMini.innerHTML = `
            <div class="rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-3">
                <div class="text-[10px] uppercase tracking-widest font-black text-slate-400">Active</div>
                <div class="text-lg font-black text-emerald-600 dark:text-emerald-300">${globalStats.activeStores || 0}</div>
            </div>
            <div class="rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-3">
                <div class="text-[10px] uppercase tracking-widest font-black text-slate-400">Suspended</div>
                <div class="text-lg font-black text-rose-600 dark:text-rose-300">${globalStats.suspendedStores || 0}</div>
            </div>
        `;
    }
}

function initCharts() {
    const colors = getChartColors();
    Chart.defaults.color = colors.text;
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Destory existing to redraw correctly on theme switch
    if (charts.growth) charts.growth.destroy();
    if (charts.density) charts.density.destroy();

    // 1. Growth Chart (Line)
    const growthCtx = document.getElementById('growthChart').getContext('2d');
    const growthData = globalStats.growth || [];

    // Fill in gaps visually for empty months if needed, assuming the query groups by YYYY-MM
    const labels = growthData.map(g => g.month);
    const dataPoints = growthData.map(g => g.count);

    charts.growth = new Chart(growthCtx, {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [
                {
                    label: 'New Shops',
                    data: dataPoints.length ? dataPoints : [0],
                    borderColor: colors.lavender,
                    backgroundColor: colors.lavenderFill,
                    borderWidth: 2,
                    pointBackgroundColor: colors.indigo,
                    pointRadius: 3,
                    fill: true,
                    tension: 0.42,
                    yAxisID: 'y'
                },
                {
                    label: 'Revenue (Rs.)',
                    data: growthData.map(g => g.revenue),
                    borderColor: colors.amber,
                    backgroundColor: colors.yellowFill,
                    borderWidth: 2,
                    pointBackgroundColor: colors.amber,
                    pointRadius: 3,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    titleFont: { size: 14 },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.datasetIndex === 1) label += 'Rs. ' + context.parsed.y.toLocaleString();
                            else label += context.parsed.y;
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear', display: true, position: 'left',
                    beginAtZero: true,
                    grid: { color: colors.grid, drawBorder: false },
                    ticks: { font: { size: 10, weight: 'bold' }, precision: 0 }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    ticks: { font: { size: 10, weight: 'bold' }, callback: value => 'Rs.' + (value >= 1000 ? value/1000 + 'k' : value) }
                },
                x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 10, weight: 'bold' } } }
            }
        }
    });

    // 2. Tenant Status Chart (Doughnut)
    const densityCtx = document.getElementById('userDensityChart').getContext('2d');
    let dLabels = ['Active', 'Suspended'];
    let dData = [Number(globalStats.activeStores || 0), Number(globalStats.suspendedStores || 0)];
    let bgColors = [colors.lavender, colors.yellow];

    if (!dData.some(Boolean)) {
        dLabels = ['No shops'];
        dData = [1];
        bgColors = [colors.grid];
    }

    charts.density = new Chart(densityCtx, {
        type: 'doughnut',
        data: {
            labels: dLabels,
            datasets: [{
                data: dData,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, padding: 16, font: { size: 11, weight: 'bold' } } },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)' }
            }
        }
    });
}


function renderStoreTable() {
    const tbody = document.getElementById('store-table-body');
    if (!tbody) return;

    if (!globalStores.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No shops found.</td></tr>`;
        return;
    }

    tbody.innerHTML = globalStores.map(store => {
        const isActive = store.status === 'active';
        const dateStr = new Date(store.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        return `
        <tr class="hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors group">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                        ${store.store_name.substring(0, 2)}
                    </div>
                    <div>
                        <div class="font-bold text-gray-900 dark:text-white">${store.store_name}</div>
                        <div class="text-[11px] text-gray-500 font-medium">${store.owner_name || 'No Admin'} <span class="text-gray-400">(${store.owner_email || '—'})</span></div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isActive ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100/50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}">
                    <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse"></span>
                    ${store.status}
                </span>
                <div class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-semibold">${store.subscription_plan ? store.subscription_plan.replace('_', ' ') : 'NO PLAN'}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-xs font-medium text-gray-700 dark:text-gray-300">
                    <span class="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">${store.product_count || 0}</span> products
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                     <span class="font-mono">${store.user_count || 0}</span> staff members
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-600 dark:text-gray-400 font-mono text-[11px]">${dateStr}</div>
                <div class="text-[10px] text-gray-400 mt-0.5 font-mono">ID: #${store.id}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="promptResetPassword(${store.id}, '${store.store_name.replace(/'/g, "\\'")}')" class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Force Reset Password">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                    </button>
                    <button onclick="promptStatusChange(${store.id}, '${store.store_name.replace(/'/g, "\\'")}', '${store.status}')" class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border transition-all ${isActive ? 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40' : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}">
                        ${isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    // Add Pagination Controls
    const totalPages = Math.ceil(globalTotalStores / globalStoreLimit);
    const currentPage = Math.floor(globalStoreOffset / globalStoreLimit) + 1;

    const paginationHtml = `
        <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div class="text-xs text-gray-500 font-medium">
                Showing ${globalStoreOffset + 1} to ${Math.min(globalStoreOffset + globalStoreLimit, globalTotalStores)} of ${globalTotalStores} stores
            </div>
            <div class="flex items-center gap-1">
                <button onclick="changePage(-1)" ${globalStoreOffset === 0 ? 'disabled' : ''} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <div class="px-4 text-xs font-bold text-gray-900 dark:text-white">Page ${currentPage} of ${totalPages}</div>
                <button onclick="changePage(1)" ${globalStoreOffset + globalStoreLimit >= globalTotalStores ? 'disabled' : ''} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>
        </div>
    `;

    // Check if pagination box already exists, if so update it, otherwise append
    let pBox = document.getElementById('store-pagination');
    if (!pBox) {
        pBox = document.createElement('div');
        pBox.id = 'store-pagination';
        document.getElementById('view-stores-table-container')?.appendChild(pBox);
    }
    pBox.innerHTML = paginationHtml;
}

function promptStatusChange(id, name, currentStatus) {
    const isActivating = currentStatus === 'blocked';
    const actionTxt = isActivating ? 'Reactivate' : 'Suspend';
    const colorBtn = isActivating ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500';

    openModal(`${actionTxt} Tenant`, `
        <div class="space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to <strong>${actionTxt.toLowerCase()}</strong> the store <strong>${name}</strong>?
            </p>
            ${!isActivating ? '<p class="text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-100 dark:border-rose-900/30">Suspended stores cannot log in or perform any POS transactions until reactivated.</p>' : ''}

            <div class="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                <button onclick="executeStatusChange(${id}, '${isActivating ? 'active' : 'blocked'}')" class="px-5 py-2 text-sm font-bold text-white rounded-xl ${colorBtn} transition-all shadow-md">Confirm ${actionTxt}</button>
            </div>
        </div>
    `);
}

async function executeStatusChange(id, newStatus) {
    const r = await api(`/api/admin/store/${id}/status`, 'PATCH', { status: newStatus });
    if (r.error) {
        toast(r.error, 'error');
    } else {
        toast(`Store successfully ${newStatus === 'active' ? 'reactivated' : 'suspended'}.`);
        closeModal();
        await fetchActivity(); // Activity generates a log
        await fetchStores(); // Refresh store list
    }
}

// ==========================================
// RENDERING NEW TABS
// ==========================================

function renderActivityLog() {
    const feed = document.getElementById('logs-feed');
    if (!globalActivity.length) {
        feed.innerHTML = `<p class="text-gray-500 text-sm italic">No system activity logged yet.</p>`;
        return;
    }

    feed.innerHTML = globalActivity.map(log => {
        const time = new Date(log.created_at).toLocaleString();
        return `
            <div class="flex gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                     <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <span class="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 rounded font-mono text-xs uppercase mr-2 border border-indigo-100 dark:border-indigo-800">
                            ${log.action}
                        </span>
                        ${log.store_name ? `[${log.store_name}]` : ''}
                     </p>
                     <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${log.details}</p>
                     <p class="text-xs text-gray-400 font-mono mt-2">${time}</p>
                </div>
            </div>
        `;
    }).join('');
}

function renderSystemHealth() {
    const container = document.getElementById('health-cards-container');
    const h = globalHealth;

    if (!h.uptimeHours) {
        container.innerHTML = `<p class="col-span-full">Telemetry data unavailable.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="glass p-6 rounded-2xl border ${h.cpuUsage > 80 ? 'border-rose-500' : 'border-emerald-500/50'}">
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Server CPU Load</div>
            <div class="text-3xl font-black ${h.cpuUsage > 80 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}">
                ${h.cpuUsage}%
                <span class="text-sm font-normal text-gray-500">utilization</span>
            </div>
        </div>
        <div class="glass p-6 rounded-2xl border ${h.memoryUsage > 85 ? 'border-amber-500' : 'border-emerald-500/50'}">
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Memory Allocation</div>
            <div class="text-3xl font-black ${h.memoryUsage > 85 ? 'text-amber-500' : 'text-gray-900 dark:text-white'}">
                ${h.memoryUsage}%
                <span class="text-sm font-normal text-gray-500">active</span>
            </div>
        </div>
        <div class="glass p-6 rounded-2xl">
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Instance Uptime</div>
            <div class="text-3xl font-black text-gray-900 dark:text-white">
                ${h.uptimeHours}
                <span class="text-sm font-normal text-gray-500">hours</span>
            </div>
        </div>
        <div class="glass p-6 rounded-2xl">
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Active Connections</div>
            <div class="text-3xl font-black text-gray-900 dark:text-white">
                ${h.activeConnections}
                <span class="text-sm font-normal text-gray-500">sockets</span>
            </div>
        </div>
    `;
}



function promptResetPassword(storeId, storeName) {
    openModal('Force Password Reset', `
        <div class="space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to forcibly reset the admin password for <strong>${storeName}</strong>?
            </p>
            <p class="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30">
                This will instantly log out the current store admin and generate a strong, temporary numeric/alphanumeric password they must use to log back in.
            </p>
            <div class="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                <button onclick="executeResetPassword(${storeId})" class="px-5 py-2 text-sm font-bold text-white rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md">Reset Password</button>
            </div>
        </div>
    `);
}

async function executeResetPassword(storeId) {
    const r = await api(`/api/admin/store/${storeId}/reset-password`, 'PATCH');
    if (r.error) {
        toast(r.error, 'error');
    } else {
        await fetchActivity(); // Log it
        openModal('Password Reset Successful', `
            <div class="space-y-4 text-center">
                <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">The new temporary password for <strong>${r.username}</strong> is:</p>
                <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl font-mono text-2xl font-black text-gray-900 dark:text-white tracking-widest select-all block border border-gray-200 dark:border-gray-700">
                    ${r.newPassword}
                </div>
                <p class="text-xs text-gray-500">Please communicate this securely to the store owner.</p>
                <div class="pt-4">
                    <button onclick="closeModal()" class="w-full px-5 py-3 text-sm font-bold text-white rounded-xl bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 transition-all shadow-md">Done</button>
                </div>
            </div>
        `);
    }
}

// Init on load
document.addEventListener('DOMContentLoaded', init);

// ─── Payment Ledger ───────────────────────────────────────────────
async function fetchLedger() {
    try {
        const r = await api('/api/admin/financial-logs');
        if (r.ok) {
            globalLedger = r.logs;
            renderLedger();
            renderOverviewAuxiliary();
        }
    } catch (e) {
        console.error('Ledger error:', e);
    }
}

function exportStoresCsv() {
    const headers = ['Store', 'Owner', 'Email', 'Status', 'Plan', 'Products', 'Users', 'Joined'];
    const rows = globalStores.map((store) => [
        store.store_name || '',
        store.owner_name || '',
        store.owner_email || '',
        store.status || '',
        store.subscription_plan || '',
        store.product_count || 0,
        store.user_count || 0,
        store.created_at || ''
    ]);
    const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shops-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function renderLedger() {
    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    if (!globalLedger.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500 italic">No platform payments found. Add or edit payments from Dashboard &gt; Platform Payments.</td></tr>';
        return;
    }

    tbody.innerHTML = globalLedger.map(log => {
        const date = new Date(log.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let catColor = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
        if (log.category === 'subscription') catColor = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        if (log.category === 'setup') catColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
        if (log.category === 'repair') catColor = 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
        if (log.category === 'advance') catColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <td class="px-6 py-4 text-xs font-mono text-gray-500">${date}</td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-gray-900 dark:text-white">${log.shop_name || 'N/A'}</div>
                    <div class="text-[10px] text-gray-400">ID: #${log.shop_id || 'Global'}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${catColor}">${log.category}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title="${log.description}">${log.description || '—'}</td>
                <td class="px-6 py-4">
                    <div class="text-xs font-medium text-gray-500">${log.payment_method || 'Cash'}</div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="text-sm font-black text-gray-900 dark:text-white">Rs. ${parseFloat(log.amount).toLocaleString()}</div>
                </td>
            </tr>
        `;
    }).join('');
}

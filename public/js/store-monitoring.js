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
    initCharts(); // Re-render charts to match theme
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

function api(url, method = 'GET', body) {
    return fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json());
}

// Global State
let globalStats = {};
let globalStores = [];
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
        rose: isDark ? '#fb7185' : '#f43f5e'
    };
};

async function init() {
    // Check if user is superadmin (implicitly handled via API, but we redirect if unauthorized)
    try {
        const me = await api('/api/auth/me');
        if (me.user?.role !== 'superadmin') {
            window.location.href = '/dashboard';
            return;
        }

        await fetchStats();
        await fetchStores();

        // Bind search
        document.getElementById('store-search').addEventListener('input', (e) => {
            renderStoreTable(e.target.value);
        });

    } catch (e) {
        console.error(e);
        window.location.href = '/dashboard';
    }
}

async function fetchStats() {
    const res = await api('/api/admin/store-stats');
    if (res.error) return toast(res.error, 'error');
    globalStats = res;
    renderStatsPanel();
    initCharts();
}

async function fetchStores() {
    const res = await api('/api/admin/stores');
    if (res.error) return toast(res.error, 'error');
    globalStores = res;
    renderStoreTable();
}

function statCard(label, value, sub, colorClass) {
    return `<div class="glass rounded-2xl p-5 border-l-4 ${colorClass}">
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">${label}</div>
        <div class="text-3xl font-bold text-slate-900 dark:text-white leading-none">${value}</div>
        ${sub ? `<div class="text-[10px] text-slate-400 mt-2 tracking-wide">${sub}</div>` : ''}
    </div>`;
}

function renderStatsPanel() {
    const s = globalStats;
    const panel = document.getElementById('stats-panel');
    panel.innerHTML = `
        ${statCard('Total Tenants', s.totalStores, 'On Platform', 'border-l-indigo-500')}
        ${statCard('Active Tenants', s.activeStores, 'Currently Operations', 'border-l-emerald-500')}
        ${statCard('Suspended', s.suspendedStores, 'Require Action', 'border-l-rose-500')}
        ${statCard('Total Staff Base', s.totalUsers, 'Sum of all users', 'border-l-amber-500')}
        ${statCard('Products Cataloged', s.totalProducts, 'Items managed globally', 'border-l-blue-500')}
    `;
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
            datasets: [{
                label: 'New Stores Enrolled',
                data: dataPoints.length ? dataPoints : [0],
                borderColor: colors.indigo,
                backgroundColor: colors.indigoFill,
                borderWidth: 2,
                pointBackgroundColor: colors.indigo,
                pointBorderColor: '#fff',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13 }, bodyFont: { size: 13, weight: 'bold' }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: colors.grid, drawBorder: false }, ticks: { precision: 0 } },
                x: { grid: { display: false, drawBorder: false } }
            }
        }
    });

    // 2. User Density Chart (Doughnut)
    const densityCtx = document.getElementById('userDensityChart').getContext('2d');
    const topStores = globalStats.topStoresByUsers || [];

    let dLabels = topStores.map(t => t.name);
    let dData = topStores.map(t => t.user_count);
    let bgColors = [colors.indigo, colors.emerald, colors.amber, colors.rose, '#3b82f6'];

    if (!dData.length) {
        dLabels = ['No users yet'];
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
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, padding: 20 } },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)' }
            }
        }
    });
}


function renderStoreTable(searchQuery = '') {
    const tbody = document.getElementById('store-table-body');
    const q = searchQuery.toLowerCase();

    const filtered = globalStores.filter(s =>
        s.store_name.toLowerCase().includes(q) ||
        (s.owner_name && s.owner_name.toLowerCase().includes(q)) ||
        (s.owner_email && s.owner_email.toLowerCase().includes(q))
    );

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No tenants matched your search.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(store => {
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
                        <div class="text-xs text-gray-500 font-medium">${store.owner_name || 'No Admin'} <span class="text-gray-400">(${store.owner_email || '—'})</span></div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isActive ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100/50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}">
                    <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
                    ${store.status}
                </span>
                <div class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-semibold">${store.subscription_plan ? store.subscription_plan.replace('_', ' ') : 'NO PLAN'}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span class="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">${store.product_count}</span> products
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                     <span class="font-mono">${store.user_count}</span> staff members
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-600 dark:text-gray-400">${dateStr}</div>
                <div class="text-[10px] text-gray-400 mt-0.5">ID: #${store.id}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="promptStatusChange(${store.id}, '${store.store_name.replace(/'/g, "\\'")}', '${store.status}')" class="px-3 py-1.5 text-xs font-semibold rounded-lg border focus:ring-2 focus:outline-none transition-all ${isActive ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/20 focus:ring-amber-500/20' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 focus:ring-emerald-500/20'}">
                    ${isActive ? 'Suspend Store' : 'Reactivate'}
                </button>
            </td>
        </tr>
        `;
    }).join('');
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
        await fetchStats(); // Refresh stats for charts
        await fetchStores(); // Refresh store list
    }
}

// Init on load
document.addEventListener('DOMContentLoaded', init);

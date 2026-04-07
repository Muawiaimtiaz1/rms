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

// Tab Switching Logic
function switchTab(tabId) {
    // 1. Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('block');
        el.classList.add('hidden');
    });

    // 2. Remove active state from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400');
        btn.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
    });

    // 3. Show selected view
    document.getElementById(`view-${tabId}`).classList.remove('hidden');
    document.getElementById(`view-${tabId}`).classList.add('block');

    // 4. Set active state on clicked tab button
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) {
        activeBtn.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        activeBtn.classList.add('active', 'border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400');
    }
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
let globalActivity = [];
let globalHealth = {};
// globalTickets removed since we fetch them directly in renderSupportTickets

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
    try {
        const me = await api('/api/auth/me');
        if (me.user?.role !== 'superadmin') {
            window.location.href = '/dashboard';
            return;
        }

        // Parallel Data Fetching
        await Promise.all([
            fetchStats(),
            fetchStores(),
            fetchActivity(),
            fetchHealth()
        ]);

        // Support tickets now fetched independently in renderSupportTickets()
        renderSupportTickets();

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

async function fetchTickets() {
    const res = await api('/api/admin/support-tickets');
    if (res.error) return;
    globalTickets = res;
    renderSupportTickets();
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
                    <span class="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">${store.product_count}</span> products
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                     <span class="font-mono">${store.user_count}</span> staff members
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-600 dark:text-gray-400 font-mono text-[11px]">${dateStr}</div>
                <div class="text-[10px] text-gray-400 mt-0.5 font-mono">ID: #${store.id}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <!-- Reset Password Action -->
                    <button onclick="promptResetPassword(${store.id}, '${store.store_name.replace(/'/g, "\\'")}')" class="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Force Reset Password">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                    </button>
                    <!-- Update Plan Action -->
                    <button onclick="promptUpdatePlan(${store.id}, '${store.store_name.replace(/'/g, "\\'")}')" class="p-1.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" title="Update Subscription Plan">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                    </button>
                    <!-- Suspend/Reactivate Action -->
                    <button onclick="promptStatusChange(${store.id}, '${store.store_name.replace(/'/g, "\\'")}', '${store.status}')" class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border transition-all ${isActive ? 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40' : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}">
                        ${isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                </div>
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

async function renderSupportTickets() {
    const tbody = document.getElementById('tickets-table-body');
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500"><svg class="inline animate-spin h-5 w-5 text-indigo-500 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Fetching tickets...</td></tr>`;

    try {
        const tickets = await api('/api/support/tickets');

        if (!tickets || !tickets.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No active support tickets found.</td></tr>`;
            return;
        }

        tbody.innerHTML = tickets.map(t => {
            const time = new Date(t.created_at).toLocaleDateString();

            const statusColors = {
                'open': 'bg-rose-100/50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800',
                'in_progress': 'bg-amber-100/50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800',
                'resolved': 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800',
                'closed': 'bg-gray-100/50 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700'
            };
            const priorityColors = {
                'low': 'text-gray-500',
                'medium': 'text-amber-500',
                'high': 'text-rose-500 font-bold'
            };

            const sClass = statusColors[t.status] || statusColors['open'];
            const pClass = priorityColors[t.priority] || priorityColors['medium'];

            return `
            <tr class="hover:bg-indigo-50/30 dark:hover:bg-gray-800/30 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer" onclick="openAdminTicketDetail(${t.id})">
                <td class="px-6 py-4 font-mono text-xs text-gray-500 whitespace-nowrap">#TKT-${t.id}</td>
                <td class="px-6 py-4 font-bold text-gray-900 dark:text-white capitalize">${t.shop_name}</td>
                <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">${t.subject}</div>
                    <div class="text-xs text-gray-500 truncate mt-0.5 line-clamp-1 max-w-[200px]">${t.description}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="block uppercase text-[10px] tracking-wider font-bold text-indigo-600 dark:text-indigo-400">${t.type}</span>
                    <span class="block capitalize text-xs mt-0.5 ${pClass}">${t.priority} Priority</span>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${sClass}">${t.status.replace('_', ' ')}</span>
                </td>
                <td class="px-6 py-4 text-xs font-mono text-gray-500 whitespace-nowrap">${time}</td>
                <td class="px-6 py-4 pl-0 text-right">
                    <button class="p-2 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="View Details" onclick="event.stopPropagation(); openAdminTicketDetail(${t.id})">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500">Failed to load tickets: ${err.message}</td></tr>`;
    }
}

async function openAdminTicketDetail(id) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex justify-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div class="bg-white dark:bg-gray-900 w-full max-w-xl h-full shadow-2xl animate-fade-in flex flex-col border-l border-gray-200 dark:border-gray-800">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
        <div>
          <h3 class="text-lg font-bold text-gray-900 dark:text-white" id="admin-ticket-title">Loading Ticket...</h3>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors bg-white dark:bg-gray-800 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50/30 dark:bg-gray-900" id="admin-ticket-content">
        <div class="flex justify-center text-gray-400 my-10"><svg class="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
      </div>
      
      <div class="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900" id="admin-ticket-reply-box" style="display: none;">
        <form onsubmit="submitAdminTicketComment(event, this, ${id})" class="relative">
          <textarea name="comment" required rows="2" placeholder="Write a reply to the store owner..." class="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm pr-12"></textarea>
          <button type="submit" class="absolute right-2 bottom-3 p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-xl transition-colors">
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

        document.getElementById('admin-ticket-title').innerHTML = `Ticket #${ticket.id} <span class="text-xs font-normal text-gray-500 ml-2">from ${ticket.shop_name}</span>`;

        const statusColors = {
            'open': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
            'in_progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            'resolved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            'closed': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
        };

        let threadHtml = `
      <div class="mb-8">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">${ticket.subject}</h1>
            <div class="flex gap-2 items-center text-xs">
              <span class="px-2 py-0.5 rounded uppercase font-bold tracking-wider ${statusColors[ticket.status] || statusColors['open']}">${ticket.status.replace('_', ' ')}</span>
              <span class="text-gray-500 dark:text-gray-400 font-medium capitalize">${ticket.type} • ${ticket.priority} Priority</span>
            </div>
          </div>
          <div class="text-right">
              <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Update Status</label>
              <select onchange="updateAdminTicketStatus(${ticket.id}, this.value)" class="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
          </div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-700 pb-3">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                ${ticket.author_name.charAt(0).toUpperCase()}
                </div>
                <div>
                <div class="text-sm font-semibold text-gray-900 dark:text-white">${ticket.author_name}</div>
                <div class="text-xs text-gray-500">${ticket.shop_name}</div>
                </div>
            </div>
             <div class="text-xs text-gray-500">${new Date(ticket.created_at).toLocaleString()}</div>
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">${ticket.description}</div>
          

        </div>
      </div>
      
      <div class="relative">
        <div class="absolute inset-y-0 left-4 w-px bg-gray-200 dark:bg-gray-800"></div>
        <div class="space-y-6" id="admin-ticket-comments-list">
    `;

        comments.forEach(c => {
            const isSuper = c.author_role === 'superadmin';
            threadHtml += `
        <div class="relative pl-10">
          <div class="absolute left-0 w-8 h-8 rounded-full border-4 border-gray-50 dark:border-gray-900 ${isSuper ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'} flex items-center justify-center font-bold text-xs" style="left: 0;">
             ${c.author_name.charAt(0).toUpperCase()}
          </div>
          <div class="bg-white dark:bg-gray-800 border ${isSuper ? 'border-rose-100 dark:border-rose-900/50 shadow-sm' : 'border-gray-100 dark:border-gray-700 shadow-sm'} sm:rounded-2xl rounded-xl p-4">
            <div class="flex items-center justify-between mb-2 pb-2 border-b border-gray-50 dark:border-gray-700/50">
              <div class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                ${c.author_name}
                ${isSuper ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 uppercase tracking-wider">You (Master Admin)</span>' : ''}
              </div>
              <div class="text-xs text-gray-500">${new Date(c.created_at).toLocaleString()}</div>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${c.comment}</div>
          </div>
        </div>
      `;
        });

        threadHtml += `</div></div>`;
        document.getElementById('admin-ticket-content').innerHTML = threadHtml;

        if (ticket.status !== 'closed') {
            document.getElementById('admin-ticket-reply-box').style.display = 'block';
        } else {
            document.getElementById('admin-ticket-reply-box').outerHTML = `
        <div class="p-4 text-center text-sm font-medium text-gray-500 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800">
           This ticket is closed. Re-open it to continue replying.
        </div>
      `;
        }

    } catch (err) {
        document.getElementById('admin-ticket-content').innerHTML = `<div class="p-4 text-rose-500">Failed to load ticket details: ${err.message}</div>`;
    }
}

async function submitAdminTicketComment(e, form, ticketId) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector('textarea');
    const commentText = textarea.value;
    btn.disabled = true;

    try {
        await api(`/api/support/tickets/${ticketId}/comments`, 'POST', { comment: commentText });

        // Create new comment element optimistically
        const list = document.getElementById('admin-ticket-comments-list');
        const newCommentHtml = `
      <div class="relative pl-10 animate-fade-in">
        <div class="absolute left-0 w-8 h-8 rounded-full border-4 border-gray-50 dark:border-gray-900 bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400 flex items-center justify-center font-bold text-xs" style="left: 0;">
           Y
        </div>
        <div class="bg-rose-50/30 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/50 sm:rounded-2xl rounded-xl p-4 shadow-sm">
          <div class="flex items-center justify-between mb-2 pb-2 border-b border-rose-50 dark:border-rose-900/20">
            <div class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              You
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 uppercase tracking-wider">Master Admin</span>
            </div>
            <div class="text-xs text-rose-500/70">Just now</div>
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${commentText}</div>
        </div>
      </div>
    `;
        list.insertAdjacentHTML('beforeend', newCommentHtml);

        textarea.value = '';
        const contentBox = document.getElementById('admin-ticket-content');
        contentBox.scrollTop = contentBox.scrollHeight;

    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function updateAdminTicketStatus(ticketId, status) {
    try {
        const res = await api(`/api/support/tickets/${ticketId}/status`, 'PATCH', { status });
        if (res.error) throw new Error(res.error);

        toast('Ticket status updated successfully', 'success');
        renderSupportTickets();

        // Toggle reply box based on status
        const replyBox = document.getElementById('admin-ticket-reply-box');
        if (status === 'closed') {
            if (replyBox) {
                replyBox.innerHTML = '<div class="p-4 text-center text-sm font-medium text-gray-500 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800">This ticket is closed. Re-open it to continue replying.</div>';
            }
        } else {
            // Re-open forces a reload to bring the form back if it was replaced by text
            setTimeout(() => {
                document.querySelector('.fixed').remove();
                openAdminTicketDetail(ticketId);
            }, 500);
        }

    } catch (err) {
        toast(err.message, 'error');
    }
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

function promptUpdatePlan(storeId, storeName) {
    openModal('Update Subscription Plan', `
        <div class="space-y-5">
            <p class="text-sm text-gray-600 dark:text-gray-400">
                Manage the subscription tier and negotiated pricing for <strong>${storeName}</strong>.
            </p>
            
            <div class="space-y-3">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Select Plan Tier</label>
                    <select id="plan-select" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3">
                        <option value="1_month">Monthly Standard (1 Month)</option>
                        <option value="3_months">Quarterly Pro (3 Months)</option>
                        <option value="1_year">Annual Enterprise (1 Year)</option>
                    </select>
                </div>
                
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Custom Price (Rs.)</label>
                    <input type="number" id="plan-price" placeholder="e.g. 5000" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3">
                    <p class="text-[10px] text-gray-500 mt-1">Leave as default or enter a negotiated custom price for this specific tenant.</p>
                </div>
            </div>

            <div class="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                <button onclick="closeModal()" class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                <button onclick="executeUpdatePlan(${storeId})" class="px-5 py-2 text-sm font-bold text-white rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md">Apply Plan Changes</button>
            </div>
        </div>
    `);
}

async function executeUpdatePlan(storeId) {
    const plan = document.getElementById('plan-select').value;
    const priceStr = document.getElementById('plan-price').value;
    const price = parseFloat(priceStr);

    if (!price || isNaN(price)) {
        return toast('Please enter a valid numeric price.', 'error');
    }

    const r = await api(`/api/admin/store/${storeId}/plan`, 'PATCH', { plan, price });
    if (r.error) {
        toast(r.error, 'error');
    } else {
        toast('Subscription plan updated successfully.');
        closeModal();
        await fetchActivity();
        await fetchStores(); // Refresh table
    }
}

// Init on load
document.addEventListener('DOMContentLoaded', init);

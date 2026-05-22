// ─── Analytics Sub-Tabs Renderers ────────────────────────────────────────────

function renderSpecificSubTab(tabId, data) {
  const viewport = document.getElementById("analytics-viewport");
  if (!viewport) return;

  const k = data.kpi;
  const s = data.summary;

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  const formatNum = (val) => new Intl.NumberFormat('en-IN').format(val);

  let tabHtml = "";

  if (tabId === "sales") {
    // ─── SALES ANALYTICS DEEP DIVE ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Total Net Revenue</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(k.totalSales)}</h4>
            <span class="text-[10px] font-bold text-emerald-500 block mt-1">Adjusted after returns & refunds</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Total Orders volume</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.totalOrders)}</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Average: ${formatNum(k.totalOrders > 0 ? (k.totalOrders / 30) : 0)} orders/day</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Average Cart Total</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(k.avgOrderValue)}</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Per unique transaction</span>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Payment Methods Allocation</h5>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            ${data.paymentBreakdown.map((p, idx) => `
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                <div>
                  <span class="text-[10px] font-black uppercase text-slate-400">${p.label || 'Other'}</span>
                  <h6 class="text-base font-black text-slate-800 dark:text-white mt-1">${formatCurrency(p.sales)}</h6>
                </div>
                <span class="text-lg">${idx === 0 ? '💵' : idx === 1 ? '📱' : '💳'}</span>
              </div>
            `).join('')}
            ${data.paymentBreakdown.length === 0 ? `<p class="text-slate-400 text-xs italic">No transactions recorded.</p>` : ''}
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "products") {
    // ─── PRODUCT ANALYTICS ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Top Volume Performers</h5>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead>
                <tr class="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="py-3 pl-2">Product Name</th>
                  <th class="py-3 text-right">Units Sold</th>
                  <th class="py-3 text-right">Revenue Contributed</th>
                  <th class="py-3 text-right">Available Stock</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 dark:divide-slate-800/40">
                ${data.topProducts.map(p => `
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all font-semibold">
                    <td class="py-3 pl-2 flex items-center gap-3">
                      <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-[10px] text-slate-500">
                        ${p.image_path ? `<img src="${p.image_path}" class="w-full h-full object-cover">` : p.name.substring(0,2).toUpperCase()}
                      </div>
                      <span class="text-slate-800 dark:text-slate-200 font-bold">${p.name}</span>
                    </td>
                    <td class="py-3 text-right text-slate-900 dark:text-white font-black">${formatNum(p.quantity_sold)} units</td>
                    <td class="py-3 text-right text-blue-600 dark:text-blue-400 font-extrabold">${formatCurrency(p.sales)}</td>
                    <td class="py-3 text-right">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${p.stock <= 5 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'}">${p.stock || 0} left</span>
                    </td>
                  </tr>
                `).join('')}
                ${data.topProducts.length === 0 ? `<tr><td colspan="4" class="py-6 text-center text-slate-400 italic">No products recorded.</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "customers") {
    // ─── CUSTOMER ANALYTICS ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <span class="text-3xl">👥</span>
            <div>
              <span class="text-[10px] font-black uppercase text-slate-400">Total Registered Customers</span>
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.totalCustomers)}</h4>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <span class="text-3xl">✨</span>
            <div>
              <span class="text-[10px] font-black uppercase text-slate-400">Active Shoppers (This Period)</span>
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.activeCustomers)}</h4>
            </div>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "inventory") {
    // ─── INVENTORY ANALYTICS ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Total Asset Stock Valuation</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(s.stockValue)}</h4>
            <span class="text-[10px] font-bold text-slate-400 block mt-1">Based on standard buying costs</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-black uppercase text-slate-400">Active Inventory Valuation Category Count</span>
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${data.categoryBreakdown.length} active</h4>
            </div>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "profit") {
    // ─── PROFIT ANALYTICS ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Adjusted Gross Profit</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(s.grossProfit)}</h4>
            <span class="text-[10px] font-bold text-emerald-500 block mt-1">Revenue minus total buying cost (COGS)</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Net Profit Margin</span>
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${s.profitMargin.toFixed(2)}%</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Percentage of retainable gross yield</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            <span class="text-[10px] font-black uppercase text-slate-400">Refund Deficit Deducted</span>
            <h4 class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">${formatCurrency(s.totalRefunds)}</h4>
            <span class="text-[10px] font-bold text-rose-500 block mt-1">Over ${s.totalReturns} total return invoices</span>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "staff") {
    // ─── STAFF PERFORMANCE LEADERBOARD ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Cashier & Server Contribution</h5>
          <p class="text-slate-400 text-xs italic text-center py-6">Order processing logs are active. Individual server breakdowns will appear here on customer checkout.</p>
        </div>
      </div>
    `;

  } else if (tabId === "channels") {
    // ─── CHANNELS BREAKDOWN ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Revenue Stream Breakdown</h5>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${data.channelBreakdown.map((c, idx) => {
              let lbl = c.label || "dine_in";
              if (lbl === 'dine_in') lbl = "Dine In";
              else if (lbl === 'takeaway') lbl = "Takeaway";
              else if (lbl === 'delivery') lbl = "Delivery";
              else if (lbl === 'pos' || lbl === 'retail') lbl = "In-Store POS";
              
              return `
                <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                  <div>
                    <span class="text-[10px] font-black uppercase text-slate-400">${lbl}</span>
                    <h6 class="text-lg font-black text-slate-800 dark:text-white mt-1">${formatCurrency(c.sales)}</h6>
                  </div>
                  <span class="text-2xl">${idx === 0 ? '🛍️' : idx === 1 ? '🍽️' : '🛵'}</span>
                </div>
              `;
            }).join('')}
            ${data.channelBreakdown.length === 0 ? `<p class="text-slate-400 text-xs italic">No channel summaries recorded.</p>` : ''}
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "ai") {
    // ─── AI EXPERT ANALYST ───
    viewport.innerHTML = `
      <div class="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl gap-4">
        <div class="w-10 h-10 border-4 border-violet-200 dark:border-violet-800 border-t-violet-600 rounded-full animate-spin"></div>
        <span class="text-sm font-bold text-slate-500">AI Analyst is scanning your records for insights...</span>
      </div>
    `;

    api(`/api/ai/insights?period=${analyticsPeriod}`).then(aiData => {
      viewport.innerHTML = `
        <div class="space-y-6 animate-[fadeIn_0.3s_ease-out]">
          <!-- AI Verdict Banner -->
          <div class="p-6 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-600/20 flex flex-col md:flex-row justify-between items-center gap-6 border border-white/10 relative overflow-hidden">
             <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
             <div>
                <div class="flex items-center gap-2 mb-1">
                   <span class="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
                   <span class="text-[10px] font-black uppercase tracking-widest text-indigo-100">AI Data Verdict</span>
                </div>
                <h3 class="text-2xl font-black tracking-tight">${aiData.summary.verdict}</h3>
                <p class="text-xs text-indigo-100/80 mt-1">AI Confidence: ${aiData.summary.aiConfidence} based on ${analyticsPeriod} performance data.</p>
             </div>
             <div class="flex gap-4">
                <div class="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-center">
                   <span class="text-[9px] uppercase font-black block text-indigo-200">Margin</span>
                   <span class="text-lg font-black">${aiData.rawMetrics.margin}</span>
                </div>
                <div class="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-center">
                   <span class="text-[9px] uppercase font-black block text-indigo-200">Growth</span>
                   <span class="text-lg font-black">${aiData.rawMetrics.growth}</span>
                </div>
             </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Insights List -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
                <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-6 flex items-center gap-2">
                   <svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg> 
                   Automated Insights
                </h5>
                <div class="space-y-4">
                   ${aiData.insights.map(ins => `
                      <div class="p-4 rounded-2xl border ${ins.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400' : ins.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400'}">
                         <h6 class="text-sm font-black">${ins.title}</h6>
                         <p class="text-xs mt-1 font-medium opacity-90">${ins.message}</p>
                      </div>
                   `).join('')}
                   ${aiData.insights.length === 0 ? `<p class="text-slate-400 text-xs italic py-4">No critical anomalies detected.</p>` : ''}
                </div>
            </div>

            <!-- Recommendations -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
                <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-6 flex items-center gap-2">
                   <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                   AI Recommendations
                </h5>
                <div class="space-y-6">
                   ${aiData.recommendations.map(rec => `
                      <div class="flex gap-4 group">
                         <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/40 group-hover:scale-110 transition-transform">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                         </div>
                         <div>
                            <h6 class="text-sm font-black text-slate-800 dark:text-white capitalize">${rec.action}</h6>
                            <p class="text-[11px] text-slate-400 font-bold mt-0.5">${rec.reason}</p>
                            <p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">${rec.suggestion}</p>
                         </div>
                      </div>
                   `).join('')}
                </div>
            </div>
          </div>
        </div>
      `;
    }).catch(err => {
      viewport.innerHTML = `<div class="p-6 text-rose-500 text-sm font-bold">Failed to load AI Insights: ${err.message}</div>`;
    });

  } else if (tabId === "reports" || tabId === "custom_reports") {
    // ─── GENERAL TRANSACTION LEDGER DATA TABLE ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="flex items-center justify-between mb-6">
            <h5 class="text-xs font-black uppercase text-slate-400 tracking-wider">Transactional Ledger Statement</h5>
            <button onclick="window.print()" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all shadow-sm">
              Print Statement
            </button>
          </div>
          
          <div class="p-8 text-center bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col items-center justify-center gap-2">
            <span class="text-2xl">📄</span>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Transaction ledger compiled.</span>
            <p class="text-xs text-slate-400 max-w-sm">Detailed invoice registries can be printed dynamically. Use the Export Report button in the header toolbar to trigger a full report download.</p>
          </div>
        </div>
      </div>
    `;
  }

  viewport.innerHTML = tabHtml;
}

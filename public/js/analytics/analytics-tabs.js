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

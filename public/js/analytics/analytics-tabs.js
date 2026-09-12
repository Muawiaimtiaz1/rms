// ─── Analytics Sub-Tabs Renderers ────────────────────────────────────────────

function renderSpecificSubTab(tabId, data) {
  const viewport = document.getElementById("analytics-viewport");
  if (!viewport) return;

  const k = data.kpi;
  const s = data.summary;

  const formatCurrency = (val) => formatShopCurrency(val);
  const formatNum = (val) => new Intl.NumberFormat('en-IN').format(val);
  const renderMetricLabel = (label, info) => `
    <div class="text-[10px] font-black uppercase text-slate-400">
      ${analyticsLabelWithInfo(label, info)}
    </div>
  `;

  let tabHtml = "";

  if (tabId === "sales") {
    // ─── SALES ANALYTICS DEEP DIVE ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Total Net Revenue", "Completed sales only. Revenue = bill subtotal - discount + tax - refunds. Includes both received and pending money.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(k.totalSales)}</h4>
            <span class="text-[10px] font-bold text-emerald-500 block mt-1">Adjusted after returns & refunds</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Total Orders volume", "Count of completed orders in the selected period. Pending, preparing, and ready orders are excluded.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.totalOrders)}</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Average: ${formatNum(k.totalOrders > 0 ? (k.totalOrders / 30) : 0)} orders/day</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Average Cart Total", "Average completed bill total before subtracting refunds. Bill total = bill subtotal - discount + tax.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(k.avgOrderValue)}</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Per unique transaction</span>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="mb-4">
            ${analyticsPanelTitle("Payment Methods Allocation", "Net completed-order revenue grouped by payment method. Revenue = bill subtotal - discount + tax - refunds, grouped by the original sale payment method.")}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            ${data.paymentBreakdown.map((p, idx) => `
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                <div>
                  ${renderMetricLabel(p.label || 'Other', "This payment bucket is net revenue for completed orders using this payment method, after refunds are subtracted.")}
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
          <div class="mb-4">
            ${analyticsPanelTitle("Top Volume Performers", "Products ranked by sold quantity after returned quantities are deducted. Product revenue is allocated from bill subtotal - discount + tax, then product refunds are subtracted.")}
          </div>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <span class="text-3xl">👥</span>
            <div>
              ${renderMetricLabel("Total Registered Customers", "All customer records currently saved for the shop, regardless of whether they purchased in the selected period.")}
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.totalCustomers)}</h4>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <span class="text-3xl">✨</span>
            <div>
              ${renderMetricLabel("Active Shoppers (This Period)", "Distinct linked customer records plus completed walk-in/unlinked orders in the selected period.")}
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.activeCustomers)}</h4>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <span class="text-3xl">🚶</span>
            <div>
              ${renderMetricLabel("Walk-in Shoppers (This Period)", "Completed sales in the selected period that were not linked to a saved customer account. Each unlinked completed sale is counted as one walk-in shopper.")}
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatNum(k.walkInCustomers || 0)}</h4>
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
            ${renderMetricLabel("Total Asset Stock Valuation", "Current active product stock multiplied by product buying price. This is live inventory value, not limited to the selected sales period.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${formatCurrency(s.stockValue)}</h4>
            <span class="text-[10px] font-bold text-slate-400 block mt-1">Based on standard buying costs</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <div>
              ${renderMetricLabel("Active Inventory Valuation Category Count", "Number of categories currently represented in the selected period's category revenue breakdown.")}
              <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${data.categoryBreakdown.length} active</h4>
            </div>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "profit") {
    // ─── PROFIT ANALYTICS ───
    const brandRows = Array.isArray(data.brandPerformance) ? data.brandPerformance.filter(row => row.partner_type === 'product_based') : [];
    const partnerShares = Array.isArray(data.partnerProfitShares) ? data.partnerProfitShares : [];
    const commissionPartners = Array.isArray(data.commissionPartnerBalances) ? data.commissionPartnerBalances : [];
    const profitDataComplete = data.costDataQuality?.complete !== false;
    const shopProfitValue = Number(data.shopProfit ?? data.partnerProfitPool ?? s.shopProfit ?? s.grossProfit ?? 0);
    const shopProfitMargin = Number(s.shopProfitMargin ?? (Number(data.totalRevenue || 0) > 0 ? (shopProfitValue / Number(data.totalRevenue || 0)) * 100 : 0));
    const selectedPartnerAudit = data.selectedPartnerAudit || null;
    const selectedPartnerType = selectedPartnerAudit?.partner_type === "product_based" ? "product_based" : "share_based";
    const selectedPartnerAuditHtml = selectedPartnerAudit
      ? `
        <div class="mb-4 p-4 rounded-2xl bg-teal-50/80 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Selected Partner Audit</div>
              <div class="text-sm font-black text-slate-900 dark:text-white mt-0.5">${selectedPartnerAudit.brand_name}</div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-right">
              <div>
                <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">Type</div>
                <div class="text-xs font-black text-slate-800 dark:text-slate-100">${selectedPartnerType === "product_based" ? "Product Based" : "Share Based"}</div>
              </div>
              <div>
                <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">${selectedPartnerType === "product_based" ? "Product Profit" : "Share Pool"}</div>
                <div class="text-xs font-black text-slate-800 dark:text-slate-100">${formatCurrency(Number(selectedPartnerAudit.profit_pool || 0))}</div>
              </div>
              <div>
                <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">Partner Share</div>
                <div class="text-xs font-black ${Number(selectedPartnerAudit.profit_share || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}">${formatCurrency(Number(selectedPartnerAudit.profit_share || 0))}</div>
              </div>
              <div>
                <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">${selectedPartnerType === "product_based" ? "Product Orders" : "Business Orders"}</div>
                <div class="text-xs font-black text-slate-800 dark:text-slate-100">${formatNum(Number(selectedPartnerType === "product_based" ? (selectedPartnerAudit.product_brand_orders || 0) : (selectedPartnerAudit.business_orders || 0)))}</div>
              </div>
            </div>
          </div>
        </div>`
      : "";
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Shop Profit", "Shop Profit = revenue - COGS - damage/loss. Partner shares add up to this amount.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${profitDataComplete ? formatCurrency(shopProfitValue) : 'N/A'}</h4>
            <span class="text-[10px] font-bold text-emerald-500 block mt-1">Sum of configured partner shares</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Shop Profit Margin", "Shop profit divided by net revenue for the selected period.")}
            <h4 class="text-2xl font-black text-slate-800 dark:text-white mt-1">${shopProfitMargin.toFixed(2)}%</h4>
            <span class="text-[10px] font-bold text-slate-500 block mt-1">Percentage of retainable gross yield</span>
          </div>
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm">
            ${renderMetricLabel("Refund Deficit Deducted", "Total refund amount from return invoices created in the selected period. This is deducted from revenue.")}
            <h4 class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">${formatCurrency(s.totalRefunds)}</h4>
            <span class="text-[10px] font-bold text-rose-500 block mt-1">Over ${s.totalReturns} total return invoices</span>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="mb-4 flex items-center justify-between gap-3">
            ${analyticsPanelTitle("Whole Business Partner Split", "Business profit, including net commission earned from third-party sales, is split by ownership percentage.")}
            <div class="flex items-center gap-2"><span class="text-[10px] font-black uppercase tracking-widest text-slate-400">${profitDataComplete ? `${formatCurrency(Number(data.totalPartnerProfit ?? shopProfitValue))} allocated for selected period` : 'Profit unavailable - incomplete historical cost'}</span><button onclick="downloadPartnerReportPdf()" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase">Download Partner PDF</button></div>
          </div>
          ${selectedPartnerAuditHtml}
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead>
                <tr class="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="py-3 pl-2">Partner</th>
                  <th class="py-3">Type</th>
                  <th class="py-3 text-right">Ownership</th>
                  <th class="py-3 text-right">Profit Basis</th>
                  <th class="py-3 text-right">Partner Profit</th>
                  <th class="py-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 dark:divide-slate-800/40">
                ${partnerShares.map((share) => {
                  const amount = Number(share.profit_share || 0);
                  const tone = amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                  const type = share.partner_type === "product_based" ? "product_based" : "share_based";
                  return `
                    <tr class="${share.is_selected ? "bg-teal-50/70 dark:bg-teal-950/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"} transition-all font-semibold">
                      <td class="py-3 pl-2 font-black text-slate-800 dark:text-white">
                        ${share.brand_name}
                        ${share.is_selected ? `<span class="ml-2 align-middle text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Selected</span>` : ""}
                      </td>
                      <td class="py-3 text-slate-700 dark:text-slate-300 font-bold">${type === "product_based" ? "Product Based" : "Share Based"}</td>
                      <td class="py-3 text-right text-slate-700 dark:text-slate-300 font-bold">${type === "product_based" ? "Products" : `${Number(share.ownership_percent || 0).toFixed(2).replace(/\.00$/, "")}%`}</td>
                      <td class="py-3 text-right text-slate-700 dark:text-slate-300 font-bold">${profitDataComplete ? formatCurrency(Number(share.profit_pool || 0)) : 'N/A'}</td>
                      <td class="py-3 text-right ${tone} font-extrabold">${profitDataComplete ? formatCurrency(amount) : 'N/A'}</td>
                      <td class="py-3 text-right"><button onclick="downloadBusinessPartnerReportPdf(${share.brand_id})" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase">PDF</button></td>
                    </tr>
                  `;
                }).join('')}
                ${partnerShares.length === 0 ? `<tr><td colspan="6" class="py-6 text-center text-slate-400 italic">No partner split configured.</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="mb-4">
            ${analyticsPanelTitle("Commission Partner Settlements", "Third-party product proceeds are kept separate. Only the shop commission enters whole-business profit.")}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead>
                <tr class="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="py-3 pl-2">Commission Partner</th>
                  <th class="py-3 text-right">Net Product Sales</th>
                  <th class="py-3 text-right">Shop Commission</th>
                  <th class="py-3 text-right">Partner Cost</th>
                  <th class="py-3 text-right">Partner Payable</th>
                  <th class="py-3 text-right">Partner Profit</th>
                  <th class="py-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 dark:divide-slate-800/40">
                ${commissionPartners.map((partner) => {
                  return `
                    <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all font-semibold">
                      <td class="py-3 pl-2 font-black text-slate-800 dark:text-white">${partner.partner_name}</td>
                      <td class="py-3 text-right text-blue-600 dark:text-blue-400 font-extrabold">${formatCurrency(Number(partner.net_sales || 0))}</td>
                      <td class="py-3 text-right text-emerald-600 dark:text-emerald-400 font-extrabold">${formatCurrency(Number(partner.shop_commission || 0))}</td>
                      <td class="py-3 text-right text-slate-700 dark:text-slate-300 font-bold">${partner.maintain_cost_price ? formatCurrency(Number(partner.partner_cogs || 0)) : 'Not maintained'}</td>
                      <td class="py-3 text-right text-slate-900 dark:text-white font-black">${formatCurrency(Number(partner.partner_payable || 0))}</td>
                      <td class="py-3 text-right text-blue-600 dark:text-blue-400 font-black">${partner.maintain_cost_price ? formatCurrency(Number(partner.partner_profit || 0)) : 'Not calculated'}</td>
                      <td class="py-3 text-right"><button onclick="downloadCommissionPartnerReportPdf(${partner.partner_id})" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black uppercase">PDF</button></td>
                    </tr>
                  `;
                }).join('')}
                ${commissionPartners.length === 0 ? `<tr><td colspan="7" class="py-6 text-center text-slate-400 italic">No commission-partner sales in this period.</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "staff") {
    // ─── STAFF PERFORMANCE LEADERBOARD ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="mb-4">
            ${analyticsPanelTitle("Sales by Payment Receiver", "Money actually received, attributed to the staff member who collected or confirmed the payment.")}
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            ${(data.staffPerformance || []).map((row, index) => `
              <div class="py-4 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black">${index + 1}</span>
                  <div><div class="text-sm font-black text-slate-800 dark:text-white">${row.name || row.username || 'Unknown'}</div><div class="text-[10px] font-bold text-slate-400">${formatNum(row.orders || 0)} payments</div></div>
                </div>
                <div class="text-sm font-black text-emerald-600 dark:text-emerald-400">${formatCurrency(row.received_sales || 0)}</div>
              </div>`).join('')}
            ${(data.staffPerformance || []).length === 0 ? `<p class="text-slate-400 text-xs italic text-center py-6">No received payments in this period.</p>` : ''}
          </div>
        </div>
      </div>
    `;

  } else if (tabId === "channels") {
    // ─── CHANNELS BREAKDOWN ───
    tabHtml = `
      <div class="space-y-6 animate-[fadeIn_0.2s_ease-out]">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
          <div class="mb-4">
            ${analyticsPanelTitle("Revenue Stream Breakdown", "Net completed-order revenue by order type or channel. Revenue = bill subtotal - discount + tax - refunds.")}
          </div>
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
                    ${renderMetricLabel(lbl, "This channel bucket includes completed orders of this type. Revenue = bill subtotal - discount + tax - refunds.")}
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
                   ${analyticsInfoIcon("AI-generated observations based on the same selected-period analytics data, including revenue, orders, margins, refunds, and inventory signals where available.")}
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
                   ${analyticsInfoIcon("Suggested actions generated from the selected-period metrics and anomaly checks. These are advisory and do not change sales or inventory records.")}
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
          <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            ${analyticsPanelTitle("Business Reports", "Database-aggregated, shop-scoped reports based on completed orders in the selected period.")}
            <div class="flex flex-wrap gap-2">
              <select id="report-channel" onchange="loadBusinessReports()" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"><option value="">All channels</option><option value="dine_in">In shop</option><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option></select>
              <select id="report-payment" onchange="loadBusinessReports()" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"><option value="">All payments</option><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option></select>
              <select id="report-export-type" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"><option value="complete">Complete report</option><option value="sales">Sales by day</option><option value="products">Products</option><option value="expenses">Expenses</option><option value="profit_loss">Profit & loss</option><option value="partners">Partners</option><option value="channels">Channels</option><option value="payments">Payments</option></select>
              <button onclick="exportBusinessReportCsv(document.getElementById('report-export-type').value)" class="px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl">Download CSV</button>
              <button onclick="downloadBusinessReportPdf()" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl">Download PDF</button>
            <button onclick="window.print()" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all shadow-sm">
              Print Statement
            </button>
            </div>
          </div>
          
          <div id="business-reports-content" class="p-8 text-center bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col items-center justify-center gap-2">
            <span class="text-2xl">📄</span>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Transaction ledger compiled.</span>
            <p class="text-xs text-slate-400 max-w-sm">Detailed invoice registries can be printed dynamically. Use the Export Report button in the header toolbar to trigger a full report download.</p>
          </div>
        </div>
      </div>
    `;
  }

  viewport.innerHTML = tabHtml;
  if (tabId === "reports" || tabId === "custom_reports") loadBusinessReports();
}

let businessReportsData = null;
function reportMoney(value) {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: businessReportsData?.currencyCode || getShopCurrencyCode(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
}
function reportLabel(value) { return ({ dine_in: 'In shop', takeaway: 'Takeaway', delivery: 'Delivery', cash: 'Cash', card: 'Card', online: 'Online' })[value] || value || 'Other'; }
function reportTable(title, headers, body) { return `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm overflow-x-auto"><h5 class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">${title}</h5><table class="w-full text-xs"><thead><tr class="border-b-2 border-slate-200 dark:border-slate-700">${headers.map((h,i)=>`<th class="py-2 px-2 ${i?'text-right':''}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`; }

async function loadBusinessReports() {
  const target = document.getElementById('business-reports-content'); if (!target) return;
  const params = new URLSearchParams({ period: analyticsPeriod });
  if (analyticsPeriod === 'custom') { params.set('from', analyticsCustomFrom); params.set('to', analyticsCustomTo); }
  const channel = document.getElementById('report-channel')?.value, payment = document.getElementById('report-payment')?.value;
  if (channel) params.set('channel', channel); if (payment) params.set('payment_method', payment);
  target.innerHTML = 'Loading database reports...';
  try { businessReportsData = await api(`/api/analytics/reports?${params}`); renderBusinessReports(businessReportsData); }
  catch (err) { target.innerHTML = `<div class="text-rose-600 font-bold">Unable to load or display reports: ${analyticsEscapeInfo(err.message)}</div>`; }
}

function renderBusinessReports(data) {
  const target = document.getElementById('business-reports-content'); if (!target) return; const k = data.kpis || {};
  const card = (label,value,note,tone='blue') => `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm text-left"><div class="text-[10px] uppercase tracking-widest font-black text-slate-400">${label}</div><div class="text-xl font-black text-${tone}-600 dark:text-${tone}-400 mt-1">${value}</div><div class="text-[10px] text-slate-400 mt-1">${note}</div></div>`;
  const rows = (list, cols, empty) => list?.length ? list.map(r => `<tr class="border-b border-slate-100 dark:border-slate-800">${cols.map(c=>`<td class="py-3 px-2 ${c.right?'text-right':''}">${c.render(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="p-6 text-center text-slate-400">${empty}</td></tr>`;
  target.className = 'space-y-5';
  target.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">${card('Net Revenue',reportMoney(k.netRevenue),'Sales less refunds')}${card('Orders',Number(k.orders||0).toLocaleString(),`${Number(k.unitsSold||0).toLocaleString()} units`,'indigo')}${card('Average Order',reportMoney(k.averageOrderValue),'Net revenue / orders','sky')}${card('COGS',reportMoney(k.cogs),'Net product cost','amber')}${card('Gross Profit',reportMoney(k.grossProfit),`${Number(k.grossMargin||0).toFixed(1)}% margin`,'emerald')}${card('Expenses',reportMoney(k.operatingExpenses),k.isSegmented?'Shop-wide; not allocated to segment':'Operating costs','rose')}${card('Damage / Loss',reportMoney(k.damageLoss),'Damaged returns','orange')}${k.isSegmented?card('Segment Contribution',reportMoney(k.segmentContribution),'Before unallocated shop expenses',Number(k.segmentContribution||0)>=0?'teal':'rose'):card('Net Profit',reportMoney(k.netProfit),`${Number(k.netMargin||0).toFixed(1)}% margin`,Number(k.netProfit||0)>=0?'teal':'rose')}${card('Refunds',reportMoney(k.refunds),'Returned sales','pink')}${card('Outstanding',reportMoney(k.outstanding),`${reportMoney(k.received)} received`,'violet')}</div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">${reportTable('Sales by Channel',['Channel','Orders','Revenue'],rows(data.channels,[{render:r=>reportLabel(r.label)},{right:true,render:r=>Number(r.orders||0).toLocaleString()},{right:true,render:r=>reportMoney(r.revenue)}],'No channel sales'))}${reportTable('Sales by Payment Method',['Method','Orders','Revenue','Received'],rows(data.payments,[{render:r=>reportLabel(r.label)},{right:true,render:r=>Number(r.orders||0).toLocaleString()},{right:true,render:r=>reportMoney(r.revenue)},{right:true,render:r=>reportMoney(r.received)}],'No payment data'))}${reportTable('Expenses by Category',['Category','Entries','Amount'],rows(data.expenses,[{render:r=>analyticsEscapeInfo(r.category||'Other')},{right:true,render:r=>Number(r.count||0).toLocaleString()},{right:true,render:r=>reportMoney(r.amount)}],'No expenses'))}${reportTable('Daily Sales',['Date','Orders','Revenue'],rows(data.daily,[{render:r=>analyticsEscapeInfo(r.date)},{right:true,render:r=>Number(r.orders||0).toLocaleString()},{right:true,render:r=>reportMoney(r.revenue)}],'No sales'))}</div>
  ${reportTable('Product Sales, Cost and Profit',['Product','Category','Units','Sales','Cost','Profit'],rows(data.products,[{render:r=>analyticsEscapeInfo(r.name)},{render:r=>analyticsEscapeInfo(r.category)},{right:true,render:r=>Number(r.units||0).toLocaleString()},{right:true,render:r=>reportMoney(r.sales)},{right:true,render:r=>reportMoney(r.cost)},{right:true,render:r=>`<span class="font-black ${Number(r.profit)>=0?'text-emerald-600':'text-rose-600'}">${reportMoney(r.profit)}</span>`}],'No products sold'))}<p class="text-[10px] text-slate-400">Period: ${analyticsEscapeInfo(data.bounds?.start)} to ${analyticsEscapeInfo(data.bounds?.end)}. Completed orders only; refunds and returned COGS are netted.</p>`;
}

function exportBusinessReportCsv(type = 'complete') {
  if (!businessReportsData) return toast('Load the report first','error');
  const d=businessReportsData,k=d.kpis||{}, sections={
    sales:[['Date','Orders','Net Revenue','Refunds'],...(d.daily||[]).map(r=>[r.date,r.orders,r.revenue,r.refunds])],
    products:[['Product','Category','Units Sold','Returned Units','Net Sales','Net Cost','Profit'],...(d.products||[]).map(r=>[r.name,r.category,r.units,r.returnedUnits,r.sales,r.cost,r.profit])],
    expenses:[['Expense Category','Entries','Amount'],...(d.expenses||[]).map(r=>[r.category,r.count,r.amount])],
    profit_loss:[['Metric','Amount'],['Gross Revenue',k.grossRevenue],['Refunds',k.refunds],['Net Revenue',k.netRevenue],['COGS',k.cogs],['Gross Profit',k.grossProfit],['Damage / Loss',k.damageLoss],['Operating Expenses',k.operatingExpenses],[k.isSegmented?'Segment Contribution':'Net Profit',k.isSegmented?k.segmentContribution:k.netProfit]],
    partners:[['Partner','Type','Revenue','COGS','Profit Pool','Profit Share'],...((analyticsData&&analyticsData.partnerProfitShares)||[]).map(r=>[r.name,r.partner_type,r.net_revenue||r.product_revenue||'',r.net_cogs||'',r.profit_pool,r.profit_share])],
    channels:[['Channel','Orders','Net Revenue','Refunds'],...(d.channels||[]).map(r=>[reportLabel(r.label),r.orders,r.revenue,r.refunds])],
    payments:[['Payment Method','Orders','Net Revenue','Refunds','Received'],...(d.payments||[]).map(r=>[reportLabel(r.label),r.orders,r.revenue,r.refunds,r.received])]
  };
  const lines=type==='complete'?Object.entries(sections).flatMap(([name,rows])=>[[name.toUpperCase()],...rows,[]]):(sections[type]||sections.products);
  const safeCsvValue = value => { const text=String(value??''); return /^[=+\-@]/.test(text) ? `'${text}` : text; };
  const csv=lines.map(row=>row.map(v=>`"${safeCsvValue(v).replace(/"/g,'""')}"`).join(',')).join('\n'); const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); link.download=`${type}-report-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function downloadBusinessReportPdf() {
  const params = new URLSearchParams({ period: analyticsPeriod, type: document.getElementById('report-export-type')?.value || 'complete' });
  if (analyticsPeriod === 'custom') { params.set('from', analyticsCustomFrom); params.set('to', analyticsCustomTo); }
  const channel=document.getElementById('report-channel')?.value, payment=document.getElementById('report-payment')?.value;
  if(channel) params.set('channel',channel); if(payment) params.set('payment_method',payment);
  window.location.href=`/api/analytics/reports.pdf?${params}`;
}

function downloadPartnerReportPdf() {
  const params = new URLSearchParams({ period: analyticsPeriod, type: 'partners' });
  if (analyticsPeriod === 'custom') { params.set('from', analyticsCustomFrom); params.set('to', analyticsCustomTo); }
  window.location.href = `/api/analytics/reports.pdf?${params}`;
}

function downloadCommissionPartnerReportPdf(partnerId) {
  const params = new URLSearchParams({ period: analyticsPeriod, type: 'commission_partner', partner_id: String(partnerId) });
  if (analyticsPeriod === 'custom') { params.set('from', analyticsCustomFrom); params.set('to', analyticsCustomTo); }
  window.location.href = `/api/analytics/reports.pdf?${params}`;
}

function downloadBusinessPartnerReportPdf(partnerId) {
  const params = new URLSearchParams({ period: analyticsPeriod, type: 'business_partner', partner_id: String(partnerId) });
  if (analyticsPeriod === 'custom') { params.set('from', analyticsCustomFrom); params.set('to', analyticsCustomTo); }
  window.location.href = `/api/analytics/reports.pdf?${params}`;
}

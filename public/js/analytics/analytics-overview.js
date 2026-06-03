// ─── Analytics Overview Panel Renderer ────────────────────────────────────────

function renderOverviewTab(data) {
  const viewport = document.getElementById("analytics-viewport");
  if (!viewport) return;

  const k = data.kpi;
  const s = data.summary;

  // Formatting helpers
  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
  const formatNum = (val) => new Intl.NumberFormat('en-IN').format(val);

  // Period label text matching
  const compLabel = analyticsPeriod === 'today' ? 'vs yesterday'
    : analyticsPeriod === '7days' ? 'vs last week'
      : analyticsPeriod === '30days' ? 'vs last month'
        : analyticsPeriod === '12months' ? 'vs last year'
          : 'vs target';

  // ─── 1. CHART BEHAVIOR CLIENT-SIDE AGGREGATIONS ───
  let barPoints = [];

  if (analyticsPeriod === 'today') {
    // Show exactly 6 bars of 4-hour intervals
    const intervals = [
      "12am - 4am", "4am - 8am", "8am - 12pm",
      "12pm - 4pm", "4pm - 8pm", "8pm - 12am"
    ];
    barPoints = intervals.map((lbl, idx) => ({ label: lbl, sales: 0, orders: 0 }));

    // Group hour-by-hour trendSeries rows from backend (labels "00", "01", ..., "23")
    if (data.trendSeries) {
      data.trendSeries.forEach(bp => {
        const hour = parseInt(bp.label, 10);
        if (!isNaN(hour)) {
          const blockIdx = Math.min(Math.max(Math.floor(hour / 4), 0), 5);
          barPoints[blockIdx].sales += bp.sales;
          barPoints[blockIdx].orders += bp.orders;
        }
      });
    }
  } else if (analyticsPeriod === '7days') {
    // Show exactly 7 daily bars ending today
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${r}`);
    }

    barPoints = list.map(dt => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === dt) : null;
      const d = new Date(dt);
      const displayLbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else if (analyticsPeriod === '30days') {
    // Show exactly 30 daily bars ending today
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${r}`);
    }

    barPoints = list.map(dt => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === dt) : null;
      const d = new Date(dt);
      const displayLbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else if (analyticsPeriod === '12months') {
    // Show exactly 12 monthly bars ending current month
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push(`${y}-${m}`);
    }

    barPoints = list.map(mth => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === mth) : null;
      const [yVal, mVal] = mth.split('-');
      const d = new Date(parseInt(yVal, 10), parseInt(mVal, 10) - 1, 1);
      const displayLbl = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else {
    // Fallback for custom period
    barPoints = data.trendSeries.map(bp => {
      let lbl = bp.label;
      if (lbl.includes('-')) {
        const d = new Date(lbl);
        lbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return { label: lbl, sales: bp.sales, orders: bp.orders };
    });
  }

  // ─── 2. ANALYTICS SUMMARY INSIGHT COMPUTATIONS ───
  let peakTimeframeLabel = "None";
  let peakTimeframeRevenue = 0;
  if (analyticsPeriod !== 'today' && barPoints && barPoints.length > 0) {
    barPoints.forEach(bp => {
      if (bp.sales > peakTimeframeRevenue) {
        peakTimeframeRevenue = bp.sales;
        peakTimeframeLabel = bp.label;
      }
    });
  }

  let bestSellingProduct = "None";
  let bestSellingProductRevenue = 0;
  if (data.topProducts && data.topProducts.length > 0) {
    bestSellingProduct = data.topProducts[0].name;
    bestSellingProductRevenue = data.topProducts[0].sales;
  }

  // Format dynamic growth percentage texts
  const g = data.growth || { sales: 0, orders: 0, customers: 0, invoices: 0 };
  const walkInCustomerCount = Number(k.walkInCustomers || 0);
  const walkInCustomerLabel = `${formatNum(walkInCustomerCount)} walk-in${walkInCustomerCount === 1 ? "" : "s"}`;
  const formatGrowth = (val) => {
    const absVal = Math.abs(val).toFixed(1);
    const arrow = val >= 0 ? "↗" : "↘";
    const color = val >= 0 ? "text-emerald-400" : "text-rose-400";
    return `<span class="${color} font-black text-[11px] block mt-1 tracking-tight">${arrow} ${absVal}% ${compLabel}</span>`;
  };

  const periodTitle = analyticsPeriod === 'today' ? "Today's Insight Summary"
    : analyticsPeriod === '7days' ? "Weekly Summary Insight"
      : analyticsPeriod === '30days' ? "Monthly Summary Insight"
        : analyticsPeriod === '12months' ? "Yearly Summary Insight"
          : "Period Summary Insight";

  const showPeakTimeframe = analyticsPeriod !== 'today';
  const renderInsightMetricCard = (label, body, info) => `
    <div class="bg-slate-950/40 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-800 dark:border-slate-800/60 flex flex-col justify-between min-w-[130px]">
      <div class="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500">
        ${analyticsLabelWithInfo(label, info, "dark")}
      </div>
      ${body}
    </div>
  `;

  const insightSummaryHtml = `
    <!-- Period Insight Summary Banner -->
    <div class="bg-slate-900 dark:bg-black rounded-3xl p-6 text-white shadow-md flex flex-col lg:flex-row justify-between items-center gap-6 border border-slate-800 dark:border-slate-900 relative overflow-visible select-none">
      <!-- Glow background bubbles -->
      <div class="absolute -left-10 -bottom-10 w-40 h-40 bg-slate-800/20 rounded-full blur-2xl"></div>
      <div class="absolute -right-10 -top-10 w-40 h-40 bg-slate-800/10 rounded-full blur-2xl"></div>
 
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${showPeakTimeframe ? '7' : '6'} gap-4 w-full lg:w-auto shrink-0 z-10">
        ${renderInsightMetricCard("Total Period Sales", `
          <h5 class="text-base font-black mt-1.5">${formatCurrency(k.totalSales)}</h5>
          ${formatGrowth(g.sales)}
        `, "Net completed-sales revenue for the selected period. Revenue = bill subtotal - discount + tax - refunds. Includes both received and pending money.")}
 
        ${renderInsightMetricCard("Total Orders", `
          <h5 class="text-base font-black mt-1.5">${formatNum(k.totalOrders)}</h5>
          ${formatGrowth(g.orders)}
        `, "Count of completed orders in the selected period. Pending, preparing, and ready orders are not counted.")}
 
        ${renderInsightMetricCard("Total Customers", `
          <h5 class="text-base font-black mt-1.5">${formatNum(k.activeCustomers)}</h5>
          <span class="text-[10px] text-slate-400 font-bold block mt-0.5">${walkInCustomerLabel}</span>
          ${formatGrowth(g.customers)}
        `, "Distinct linked customer records plus completed walk-in/unlinked orders in the selected period. Walk-in orders are counted as walk-in customers because they do not have customer accounts.")}
 
        ${renderInsightMetricCard("Total Invoices", `
          <h5 class="text-base font-black mt-1.5">${formatNum(k.totalInvoices)}</h5>
          ${formatGrowth(g.invoices)}
        `, "Completed invoice count for the selected period. This currently matches Total Orders.")}
 
        ${showPeakTimeframe ? `
          ${renderInsightMetricCard(analyticsPeriod === '12months' ? 'Highest Month' : 'Highest Day', `
            <h5 class="text-xs font-black mt-1.5 truncate" title="${peakTimeframeLabel}">${peakTimeframeLabel}</h5>
            <span class="text-[11px] text-emerald-400 font-bold block mt-0.5">${formatCurrency(peakTimeframeRevenue)}</span>
          `, "The highest revenue point in the trend series. It uses completed sale totals including tax; refunds are not netted inside individual trend points.")}
        ` : ''}
 
        ${renderInsightMetricCard("Best-Selling Item", `
          <h5 class="text-xs font-black mt-1.5 truncate" title="${bestSellingProduct}">${bestSellingProduct}</h5>
        `, "The top product in the selected period by sold quantity after returned quantities are deducted.")}
 
        ${renderInsightMetricCard("Item Revenue", `
          <h5 class="text-base font-black mt-1.5">${formatCurrency(bestSellingProductRevenue)}</h5>
        `, "Revenue contribution of the best-selling product. Product revenue is allocated from bill subtotal - discount + tax, then product refunds are subtracted.")}
      </div>
    </div>
  `;

  viewport.innerHTML = `
    <!-- ITEM 1: Insight Summary Banner - Highest Importance -->
    <div class="mb-6 animate-[fadeIn_0.3s_ease-out]">
      ${insightSummaryHtml}
    </div>

    <!-- ALWAYS ON TOP: Sales Overview & Sales Trend -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 animate-[fadeIn_0.3s_ease-out]">
      
      <!-- ITEM 2: Sales Overview Bar Chart - High Importance -->
      <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
        <div class="flex items-center justify-between mb-4">
          <div>
            ${analyticsPanelTitle("Sales Overview", "Completed orders grouped by the selected timeframe. Each bar sums bill subtotal - discount + tax. Refunds are not netted per bar.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Order volumes over the active timeframe</span>
          </div>
          <span class="px-3 py-1 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold rounded-lg text-slate-500 border border-slate-100 dark:border-slate-800 uppercase tracking-widest">Bar Chart</span>
        </div>
        <div id="chart-sales-overview" class="h-64 mt-2">
          <!-- Rendered by SVG bar charts engine -->
        </div>
      </div>

      <!-- ITEM 3: Sales Trend Spline - High Importance -->
      <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
        <div class="flex items-center justify-between mb-4">
          <div>
            ${analyticsPanelTitle("Sales Trend", "Smoothed trend of completed sale totals over the selected timeframe. Uses bill subtotal - discount + tax. Refunds are not netted per trend point.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Smoothed bezier trend curve</span>
          </div>
          <div class="flex flex-col items-end">
            <span class="text-xs font-black text-slate-800 dark:text-white">${formatCurrency(k.totalSales)}</span>
            <span class="text-[9px] font-bold text-emerald-500">↗ 15.4% last period</span>
          </div>
        </div>
        <div id="chart-sales-trend" class="h-64 mt-2">
          <!-- Rendered by SVG Line charts engine -->
        </div>
      </div>

    </div>

    <!-- SECOND ROW: Activity Heatmap (1/2) & Pie Charts (1/2) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 animate-[fadeIn_0.3s_ease-out]">
      <!-- LEFT COLUMN: Activity Heatmap Card -->
      <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm h-fit">
        <div class="mb-4 flex items-center justify-between">
          <div>
            ${analyticsPanelTitle("Activity Heatmap", "Completed orders grouped into 4-hour blocks. Cell intensity uses bill subtotal - discount + tax. Refunds are not netted per block.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Granular 4-hour transaction density over active timeframe</span>
          </div>
          <span class="px-3 py-1 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold rounded-lg text-slate-500 border border-slate-100 dark:border-slate-800 uppercase tracking-widest">Transaction Density</span>
        </div>
        <div id="chart-activity-heatmap" class="mt-4 w-full">
          <!-- Rendered by native heatmap engine -->
        </div>
      </div>

      <!-- RIGHT COLUMN: 3 Pie Charts Stacked -->
      <div class="w-full flex flex-col gap-6">
        <!-- ITEM 7: Sales by Category Donut -->
        <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
          <div>
            ${analyticsPanelTitle("Sales by Category", "Net category revenue from completed orders. Allocates bill subtotal - discount + tax by item share, subtracts category refunds, and groups manual items as General.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Category allocations</span>
          </div>
          <div id="chart-category-breakdown" class="h-44 mt-4 flex items-center justify-center">
            <!-- Rendered by SVG donut engine -->
          </div>
        </div>

        <!-- ITEM 8: Sales by Channel Donut -->
        <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
          <div>
            ${analyticsPanelTitle("Sales by Channel", "Net completed-order revenue by order type. Revenue = bill subtotal - discount + tax - refunds.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Store outlets vs POS</span>
          </div>
          <div id="chart-channel-breakdown" class="h-44 mt-4 flex items-center justify-center">
            <!-- Rendered by SVG donut engine -->
          </div>
        </div>

        <!-- ITEM 9: Sales by Payment Method Donut -->
        <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
          <div>
            ${analyticsPanelTitle("Sales by Payment Method", "Net completed-order revenue by payment method. Revenue = bill subtotal - discount + tax - refunds, grouped by the original sale payment method.")}
            <span class="text-[11px] font-medium text-slate-400 block mt-0.5">Revenues by registers</span>
          </div>
          <div id="chart-payment-breakdown" class="h-44 mt-4 flex items-center justify-center">
            <!-- Rendered by SVG donut engine -->
          </div>
        </div>
      </div>
    </div>

    <!-- THIRD ROW: Top Selling Products -->
    <div class="mb-6 animate-[fadeIn_0.3s_ease-out]">
      <div class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-between h-fit">
        <div>
          ${analyticsPanelTitle("Top Selling Products", "Ranked by sold quantity after returned quantities. Product revenue is allocated from bill subtotal - discount + tax, then product refunds are subtracted.")}
          <span class="text-[11px] font-medium text-slate-400 block mt-0.5">High velocity items</span>
        </div>
        
        <div class="space-y-3 mt-4 flex-1 flex flex-col justify-center">
          ${renderTopSellingProductsList(data.topProducts)}
        </div>
      </div>
    </div>

    <!-- FOURTH ROW: Quick Metrics Summary (Full Width, 3x2 Grid) -->
    <div class="mb-12 animate-[fadeIn_0.3s_ease-out]">
      <div class="w-full bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-3xl flex flex-col justify-between h-fit shadow-sm">
        <div class="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <h5 class="text-xs font-black uppercase text-blue-500 dark:text-blue-400 tracking-widest">Quick Metrics Summary</h5>
              ${analyticsInfoIcon("Selected-period accounting metrics. Revenue-related metrics are based on completed sales and current return records; inventory value uses current product stock.")}
            </div>
            <h3 class="text-xl font-extrabold text-slate-800 dark:text-white mt-1">Key Accounting Breakdowns</h3>
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mt-0.5">Comprehensive real-time financial performance and ledger indicators</span>
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0 0a5.002 5.002 0 01-5-5m10 0a5.002 5.002 0 01-5 5m-5-5a5.002 5.002 0 015-5m5 5a5.002 5.002 0 01-5-5"/></svg>
            <span class="text-[11px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Live Accounting Feed</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
          ${renderSummaryCard("Total Discounts", formatCurrency(s.totalDiscounts), `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`, `↗ 5.3% ${compLabel}`, "blue", "Promotional incentives and order price reductions", "Sum of sale-level discounts on completed orders in the selected period. Returns do not change this discount total.")}
          ${renderSummaryCard("Total Returns", formatNum(s.totalReturns), `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`, `↗ 3.1% ${compLabel}`, "rose", "Items returned to inventory from completed orders", "Count of return invoices created in the selected period. One return invoice can contain multiple returned items.")}
          ${renderSummaryCard("Refunds", formatCurrency(s.totalRefunds), `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`, `↗ 2.4% ${compLabel}`, "amber", "Direct financial reimbursements processed", "Total refund amount from return invoices created in the selected period. This is subtracted from net revenue.")}
          ${renderSummaryCard("Gross Profit", formatCurrency(s.grossProfit), `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`, `↗ 11.3% ${compLabel}`, "emerald", "Total revenue minus cost of goods sold (COGS)", "Gross Profit = revenue - COGS. Revenue = bill subtotal - discount + tax - refunds.")}
          ${renderSummaryCard("Profit Margin", `${s.profitMargin.toFixed(1)}%`, `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`, `↗ 9.8% ${compLabel}`, "indigo", "Overall profitability ratio as percentage of sales", "Gross profit divided by net revenue for the selected period.")}
          ${renderSummaryCard("Stock Value", formatCurrency(s.stockValue), `<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`, `↗ 6.7% ${compLabel}`, "sky", "Current asset valuation of all active inventory", "Current active product stock multiplied by product buying price. This is a live inventory valuation, not limited to the selected sales period.")}
        </div>
      </div>
    </div>
  `;

  // ─── SVG BINDING INTEGRATIONS ───
  renderBarChart("chart-sales-overview", barPoints);
  renderOverviewHeatmap("chart-activity-heatmap", data);

  const paymentSlices = data.paymentBreakdown.map(pb => ({
    label: pb.label || "Cash",
    sales: pb.sales
  }));
  renderDonutChart("chart-payment-breakdown", paymentSlices, k.totalSales);

  renderLineChart("chart-sales-trend", barPoints);

  const categorySlices = data.categoryBreakdown.map(cb => ({
    label: cb.label || "General",
    sales: cb.sales
  }));
  renderDonutChart("chart-category-breakdown", categorySlices, k.totalSales);

  const channelSlices = data.channelBreakdown.map(cb => {
    let lbl = cb.label || "dine_in";
    if (lbl === 'dine_in') lbl = "Dine In";
    else if (lbl === 'takeaway') lbl = "Takeaway";
    else if (lbl === 'delivery') lbl = "Delivery";
    else if (lbl === 'pos' || lbl === 'retail') lbl = "In-Store POS";
    return { label: lbl, sales: cb.sales };
  });
  renderDonutChart("chart-channel-breakdown", channelSlices, k.totalSales);
}

/**
 * Custom responsive Heatmap Charting Engine
 */
function renderOverviewHeatmap(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const parseLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00`);
  const datesList = [];
  const startD = parseLocalDate(data.bounds.start.split(' ')[0]);
  const endD = parseLocalDate(data.bounds.end.split(' ')[0]);
  const diffTime = Math.abs(endD - startD);
  let numDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (numDays > 30) numDays = 30; // cap at 30 days

  const startDObj = new Date(endD);
  startDObj.setDate(startDObj.getDate() - (numDays - 1));

  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDObj);
    d.setDate(d.getDate() + i);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    datesList.push(`${y}-${m}-${r}`);
  }

  const heatmapData = {};
  datesList.forEach(d => {
    heatmapData[d] = Array(6).fill(null).map(() => ({ count: 0, sales: 0 }));
  });

  if (data.heatmapRaw) {
    data.heatmapRaw.forEach(r => {
      if (heatmapData[r.dt]) {
        const blockIdx = Math.min(Math.max(Math.floor(Number(r.block_idx) || 0), 0), 5);
        heatmapData[r.dt][blockIdx].count = r.orders;
        heatmapData[r.dt][blockIdx].sales = r.sales;
      }
    });
  }

  let maxVolume = 1;
  datesList.forEach(d => {
    heatmapData[d].forEach(b => {
      if (b.sales > maxVolume) maxVolume = b.sales;
    });
  });

  const blockLabels = [
    "Night Shift",
    "Early Shift",
    "Morning Shift",
    "Afternoon Shift",
    "Evening Shift",
    "Late Shift"
  ];

  const blockRanges = [
    "12am - 4am",
    "4am - 8am",
    "8am - 12pm",
    "12pm - 4pm",
    "4pm - 8pm",
    "8pm - 12am"
  ];

  const formatDateParts = (dateStr) => {
    const date = parseLocalDate(dateStr);
    return {
      short: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      day: date.toLocaleDateString(undefined, { weekday: 'short' }),
      full: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })
    };
  };

  const heatmapCellSize = 42;
  const heatmapCellGap = 8;
  const heatmapLabelWidth = 128;
  const heatmapMinWidth = heatmapLabelWidth + 16 + (datesList.length * heatmapCellSize) + (Math.max(datesList.length - 1, 0) * heatmapCellGap);
  const dateColumnsStyle = `grid-template-columns: repeat(${datesList.length}, ${heatmapCellSize}px); gap: ${heatmapCellGap}px;`;
  const headerHtml = `
    <div class="flex items-end gap-2 md:gap-4 mb-2" style="min-width: ${heatmapMinWidth}px;">
      <div class="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right pb-1" style="width: ${heatmapLabelWidth}px;">Shift</div>
      <div class="grid shrink-0" style="${dateColumnsStyle}">
        ${datesList.map(dateStr => {
          const parts = formatDateParts(dateStr);
          return `
            <div class="text-center leading-tight">
              <div class="text-[9px] md:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase truncate">${parts.day}</div>
              <div class="text-[9px] md:text-[10px] font-bold text-slate-400 truncate">${parts.short}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const rowsHtml = blockLabels.map((shiftLabel, idx) => {
    const cellsHtml = datesList.map(dateStr => {
      const block = heatmapData[dateStr][idx];
      const dateParts = formatDateParts(dateStr);
      const intensity = block.sales / maxVolume;
      let bgClass = "bg-slate-50 dark:bg-slate-900/50 border-slate-200/40 dark:border-slate-800/40";
      if (intensity > 0) bgClass = "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300";
      if (intensity > 0.25) bgClass = "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200";
      if (intensity > 0.5) bgClass = "bg-emerald-300 dark:bg-emerald-700/50 border-emerald-400 dark:border-emerald-600/80 text-white";
      if (intensity > 0.75) bgClass = "bg-emerald-500 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-500 text-white";

      const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(block.sales);

      const cellTooltip = `
        <div class="flex flex-col gap-1 text-left min-w-[150px]">
          <span class="text-[9px] uppercase font-black text-slate-400 border-b border-slate-700 pb-1 mb-1">${shiftLabel} · ${blockRanges[idx]}</span>
          <span class="text-[10px] text-slate-300 font-bold block">${dateParts.full}</span>
          <span class="text-xs text-white font-extrabold mt-1">Revenue: ${formattedSales}</span>
          <span class="text-[10px] text-emerald-400 font-bold">${block.count} Orders</span>
        </div>
      `;

      return `
        <div title="${dateParts.full} · ${shiftLabel} · ${formattedSales} · ${block.count} orders" class="rounded-md lg:rounded-lg ${bgClass} border transition-all duration-300 flex items-center justify-center relative group/cell cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-emerald-500 hover:scale-105 z-10 hover:z-[9999]" style="width: ${heatmapCellSize}px; height: ${heatmapCellSize}px;">
          <!-- Tooltip Popup -->
          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-slate-950 text-white rounded-xl p-3 opacity-0 group-hover/cell:opacity-100 transition-all duration-200 pointer-events-none shadow-2xl z-[99999] whitespace-nowrap scale-90 group-hover/cell:scale-100 ease-out border border-slate-800">
            ${cellTooltip}
            <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-950 border-r border-b border-slate-800 rotate-45"></div>
          </div>
          
          <span class="text-[9px] md:text-xs leading-none font-black opacity-0 group-hover/cell:opacity-100 transition-opacity">${block.count}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="flex items-center gap-2 md:gap-4" style="min-width: ${heatmapMinWidth}px;">
        <div class="shrink-0 text-right" style="width: ${heatmapLabelWidth}px;">
          <div class="text-[10px] md:text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-tight">${shiftLabel}</div>
          <div class="text-[9px] text-slate-400 font-bold">${blockRanges[idx]}</div>
        </div>
        <div class="grid shrink-0" style="${dateColumnsStyle}">
          ${cellsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="w-full overflow-x-auto pb-2">
      <div class="flex flex-col gap-2 w-full select-none">
        ${headerHtml}
        <div class="flex flex-col gap-2">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;
}

function renderSummaryCard(title, val, svgIcon, trendLabel, colorScheme, desc, info = desc) {
  let bgGlow = "";
  let iconBg = "";
  let iconText = "";
  let borderHover = "";
  let trendClass = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20";

  if (colorScheme === 'blue') {
    iconBg = "bg-blue-50 dark:bg-blue-500/10";
    iconText = "text-blue-600 dark:text-blue-400";
    borderHover = "hover:border-blue-400 dark:hover:border-blue-500";
    bgGlow = "from-blue-500/5 dark:from-blue-500/10";
  } else if (colorScheme === 'rose') {
    iconBg = "bg-rose-50 dark:bg-rose-500/10";
    iconText = "text-rose-600 dark:text-rose-400";
    borderHover = "hover:border-rose-400 dark:hover:border-rose-500";
    bgGlow = "from-rose-500/5 dark:from-rose-500/10";
    trendClass = "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-500/20";
  } else if (colorScheme === 'amber') {
    iconBg = "bg-amber-50 dark:bg-amber-500/10";
    iconText = "text-amber-600 dark:text-amber-400";
    borderHover = "hover:border-amber-400 dark:hover:border-amber-500";
    bgGlow = "from-amber-500/5 dark:from-amber-500/10";
    trendClass = "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20";
  } else if (colorScheme === 'emerald') {
    iconBg = "bg-emerald-50 dark:bg-emerald-500/10";
    iconText = "text-emerald-600 dark:text-emerald-400";
    borderHover = "hover:border-emerald-400 dark:hover:border-emerald-500";
    bgGlow = "from-emerald-500/5 dark:from-emerald-500/10";
  } else if (colorScheme === 'sky') {
    iconBg = "bg-sky-50 dark:bg-sky-500/10";
    iconText = "text-sky-600 dark:text-sky-400";
    borderHover = "hover:border-sky-400 dark:hover:border-sky-500";
    bgGlow = "from-sky-500/5 dark:from-sky-500/10";
  } else {
    iconBg = "bg-indigo-50 dark:bg-indigo-500/10";
    iconText = "text-indigo-600 dark:text-indigo-400";
    borderHover = "hover:border-indigo-400 dark:hover:border-indigo-500";
    bgGlow = "from-indigo-500/5 dark:from-indigo-500/10";
  }

  const adjustedIcon = svgIcon.replace('w-4 h-4', 'w-6 h-6');

  return `
    <div class="group relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out overflow-visible flex flex-col justify-between min-h-[170px] ${borderHover} select-none">
      <!-- Subtle background gradient mesh on hover -->
      <div class="absolute inset-0 bg-gradient-to-br ${bgGlow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

      <!-- Top Row: Icon & Trend Pill -->
      <div class="flex items-center justify-between gap-4 z-10">
        <div class="w-14 h-14 rounded-2xl ${iconBg} ${iconText} flex items-center justify-center shadow-inner border border-current/10 transition-transform group-hover:scale-110 duration-300 ease-out shrink-0">
          ${adjustedIcon}
        </div>
        <div class="px-3 py-1.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 border ${trendClass} shadow-2xs shrink-0">
          ${trendLabel}
        </div>
      </div>

      <!-- Bottom Row: Title, Value & Description -->
      <div class="mt-6 z-10 flex flex-col">
        <div class="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
          ${analyticsLabelWithInfo(title, info)}
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <h5 class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight truncate">${val}</h5>
        </div>
        <span class="text-[11px] font-medium text-slate-400 dark:text-slate-500 block mt-1.5 border-t border-slate-100 dark:border-slate-800/60 pt-1.5">${desc}</span>
      </div>

      <!-- Bottom accent border line -->
      <div class="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-20 transition-opacity duration-300 ${iconText}"></div>
    </div>
  `;
}



function renderTopSellingProductsList(products) {
  if (!products || products.length === 0) {
    return `<p class="text-slate-400 text-xs italic text-center py-6">No products sold in this period.</p>`;
  }

  return products.map((p, idx) => {
    const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.sales);

    return `
      <div class="flex items-center justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800/10 last:border-b-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-center font-black text-[10px] text-slate-500">
            ${p.image_path ? `<img src="${p.image_path}" class="w-full h-full object-cover">` : p.name.substring(0, 2).toUpperCase()}
          </div>
          <div class="min-w-0">
            <span class="font-bold text-slate-800 dark:text-slate-200 block truncate">${p.name}</span>
            <span class="text-[9px] text-slate-400 font-semibold block mt-0.5">${p.quantity_sold} Sold | Stock: ${p.stock || 0}</span>
          </div>
        </div>
        <span class="font-black text-slate-900 dark:text-white shrink-0">${formattedSales}</span>
      </div>
    `;
  }).join('');
}

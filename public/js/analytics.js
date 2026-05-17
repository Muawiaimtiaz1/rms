let analyticsFilterType = "today"; // today, 7days, 30days, 12months, custom
let analyticsCustomFrom = "";
let analyticsCustomTo = "";

function getLocalDateString(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseUTCDate(dateString) {
    let dStrVal = dateString;
    if (!dStrVal.endsWith('Z')) {
        dStrVal = dStrVal.replace(' ', 'T') + 'Z';
    }
    return new Date(dStrVal);
}

async function renderAnalytics() {
  const content = document.getElementById("page-content");
  
  content.innerHTML = `
    <div class="flex items-center justify-center h-40">
       <span class="text-slate-400">Loading Analytics...</span>
    </div>
  `;

  try {
    const sales = await fetch("/api/sales").then((r) => r.json());
    
    const now = new Date();
    let barChartBlocks = [];
    let heatmapDatesList = [];

    // 1. Process Filter Logic for Bar Chart & Heatmap Range
    if (analyticsFilterType === 'today') {
        const todayStr = getLocalDateString(now);
        heatmapDatesList.push(todayStr);

        for (let i = 0; i < 24; i += 3) {
            let labelStart = i % 12 === 0 ? 12 : i % 12;
            let amPmStart = i < 12 ? 'am' : 'pm';
            let endHour = i + 3;
            let labelEnd = endHour % 12 === 0 ? 12 : endHour % 12;
            let amPmEnd = endHour < 12 || endHour === 24 ? 'am' : 'pm';
            let label = `${labelStart}${amPmStart} - ${labelEnd}${amPmEnd}`;
            
            barChartBlocks.push({
                label: label,
                count: 0,
                sales: 0,
                rangeStr: `${new Date(todayStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} (${label})`,
                dateStr: todayStr,
                startHour: i,
                endHour: i + 3,
                type: 'hour'
            });
        }

        sales.forEach(s => {
            const dObj = parseUTCDate(s.created_at);
            const dStr = getLocalDateString(dObj);
            if (dStr === todayStr) {
                const h = dObj.getHours();
                const blockIndex = Math.floor(h / 3);
                if (barChartBlocks[blockIndex]) {
                    barChartBlocks[blockIndex].count++;
                    barChartBlocks[blockIndex].sales += s.total;
                }
            }
        });

    } else if (analyticsFilterType === '7days' || analyticsFilterType === '30days' || analyticsFilterType === 'custom') {
        let numDays, startDObj;
        
        if (analyticsFilterType === 'custom') {
            const startD = new Date(analyticsCustomFrom);
            const endD = new Date(analyticsCustomTo);
            const diffTime = Math.abs(endD - startD);
            numDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
            if (numDays > 30) numDays = 30; // Max 30 days enforcement
            startDObj = new Date(analyticsCustomFrom);
        } else {
            numDays = analyticsFilterType === '7days' ? 7 : 30;
            startDObj = new Date();
            startDObj.setDate(startDObj.getDate() - (numDays - 1));
        }
        
        for (let i = 0; i < numDays; i++) {
            const d = new Date(startDObj);
            d.setDate(d.getDate() + i);
            const dStr = getLocalDateString(d);
            
            heatmapDatesList.unshift(dStr); // Newest first for heatmap
            
            const shortDay = d.toLocaleDateString('en-US', { weekday: 'short' });
            const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            barChartBlocks.push({
                label: numDays <= 7 ? shortDay : shortDate,
                count: 0,
                sales: 0,
                rangeStr: d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                dateStr: dStr,
                type: 'day'
            });
        }

        sales.forEach(s => {
            const dObj = parseUTCDate(s.created_at);
            const dStr = getLocalDateString(dObj);
            const block = barChartBlocks.find(b => b.dateStr === dStr);
            if (block) {
                block.count++;
                block.sales += s.total;
            }
        });

    } else if (analyticsFilterType === '12months') {
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setDate(1); // Set to 1st to avoid month skipping issues
            d.setMonth(now.getMonth() - i);
            const yStr = d.getFullYear();
            const mStr = String(d.getMonth() + 1).padStart(2, '0');
            const monthKey = `${yStr}-${mStr}`;
            
            barChartBlocks.push({
                label: d.toLocaleDateString('en-US', { month: 'short' }),
                count: 0,
                sales: 0,
                rangeStr: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                monthKey: monthKey,
                type: 'month'
            });
        }

        sales.forEach(s => {
            const dObj = parseUTCDate(s.created_at);
            const yStr = dObj.getFullYear();
            const mStr = String(dObj.getMonth() + 1).padStart(2, '0');
            const monthKey = `${yStr}-${mStr}`;
            
            const block = barChartBlocks.find(b => b.monthKey === monthKey);
            if (block) {
                block.count++;
                block.sales += s.total;
            }
        });

        // For heatmap, limit to last 30 days so the DOM doesn't freeze with 365 rows
        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            heatmapDatesList.push(getLocalDateString(d));
        }
    }

    // 2. Compute Heatmap Data
    const heatmapData = {};
    heatmapDatesList.forEach(d => {
        heatmapData[d] = Array(8).fill(null).map(() => ({ count: 0, sales: 0 }));
    });

    sales.forEach(s => {
        const dObj = parseUTCDate(s.created_at);
        const dStr = getLocalDateString(dObj);
        if (heatmapData[dStr]) {
            const h = dObj.getHours();
            const blockIndex = Math.floor(h / 3);
            heatmapData[dStr][blockIndex].count++;
            heatmapData[dStr][blockIndex].sales += s.total;
        }
    });

    // 3. Render Bar Chart
    const maxBarCount = Math.max(...barChartBlocks.map(b => b.count), 1);
    
    // Calculate Summary Stats
    const totalSales = barChartBlocks.reduce((sum, b) => sum + b.sales, 0);
    const highestBlock = barChartBlocks.reduce((max, b) => b.sales > max.sales ? b : max, barChartBlocks[0] || { sales: 0, label: 'N/A', rangeStr: '' });
    
    let highestLabelType = "Interval";
    let highestSalesName = highestBlock.label;
    
    if (highestBlock.sales > 0) {
        if (analyticsFilterType === 'today') {
            highestLabelType = "Interval";
            highestSalesName = highestBlock.label; // e.g., 12pm - 3pm
        } else if (analyticsFilterType === '7days') {
            highestLabelType = "Day";
            highestSalesName = highestBlock.rangeStr.split(',')[0]; // e.g., Friday
        } else if (analyticsFilterType === '30days' || analyticsFilterType === 'custom') {
            highestLabelType = "Day";
            highestSalesName = highestBlock.rangeStr.split(',')[1]?.trim() || highestBlock.label; // e.g., May 14
        } else if (analyticsFilterType === '12months') {
            highestLabelType = "Month";
            highestSalesName = highestBlock.rangeStr.split(' ')[0]; // e.g., December
        }
    } else {
        highestSalesName = "No Sales";
        highestLabelType = "Period";
    }
    
    // Adjust max width of bars based on how many bars we have
    const barWidthClass = barChartBlocks.length > 15 ? 'max-w-[1rem]' : 'max-w-[3rem]';

    let barChartHtml = barChartBlocks.map((b, idx) => {
        const heightPercentage = (b.count / maxBarCount) * 100;
        
        // Tooltip Content
        const tooltip = `
            <div class="flex flex-col gap-1 text-left min-w-[160px]">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-600 pb-2 mb-2">${b.rangeStr}</div>
                <div class="flex justify-between text-sm font-medium mb-1">
                    <span class="text-slate-300">Orders:</span>
                    <span class="font-bold text-white">${b.count}</span>
                </div>
                <div class="flex justify-between text-sm font-medium">
                    <span class="text-slate-300">Sales:</span>
                    <span class="font-bold text-emerald-400">Rs. ${b.sales.toLocaleString()}</span>
                </div>
            </div>
        `;

        let tooltipPosClass = "left-1/2 -translate-x-1/2";
        if (barChartBlocks.length > 1) {
            if (idx === 0) {
                tooltipPosClass = "left-0 translate-x-0";
            } else if (idx === barChartBlocks.length - 1) {
                tooltipPosClass = "right-0 translate-x-0";
            }
        }

        return `
          <div class="flex flex-col items-center justify-end h-56 w-full group/barWrapper relative cursor-pointer hover:z-50">
             
             <!-- Bar -->
             <div class="w-full ${barWidthClass} bg-indigo-500 dark:bg-indigo-400 rounded-t-md transition-all duration-500 ease-out group-hover/barWrapper:bg-indigo-600 group-hover/barWrapper:brightness-110 group-hover/barWrapper:scale-x-110 origin-bottom relative shadow-sm flex items-center justify-center" style="height: ${heightPercentage}%">
                 
                 <!-- Tooltip (Vertically centered inside the bar) -->
                 <div class="absolute top-1/2 ${tooltipPosClass} -translate-y-1/2 bg-slate-800 text-white text-xs rounded-lg p-4 opacity-0 group-hover/barWrapper:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-50 whitespace-nowrap hidden sm:block ease-out scale-x-90 group-hover/barWrapper:scale-x-100">
                     ${tooltip}
                 </div>

                 <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none rounded-t-md"></div>
                 <span class="absolute -top-7 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 dark:text-slate-300 opacity-0 group-hover/barWrapper:opacity-100 transition-all duration-300 pointer-events-none scale-x-90 group-hover/barWrapper:scale-x-100">${b.count}</span>
             </div>
             
             <!-- Label -->
             <span class="text-xs mt-4 text-slate-600 dark:text-slate-400 font-semibold whitespace-nowrap text-center transition-colors duration-300 group-hover/barWrapper:text-indigo-600 dark:group-hover/barWrapper:text-indigo-400">${b.label}</span>
          </div>
        `;
    }).join('');

    // 4. Render Heatmap
    let maxHeatmapCount = 1;
    for (let d of heatmapDatesList) {
        for (let blockData of heatmapData[d]) {
            if (blockData.count > maxHeatmapCount) maxHeatmapCount = blockData.count;
        }
    }

    // Heatmap 3-hour blocks labels
    const heatmapBlockLabels = [];
    for (let i = 0; i < 24; i += 3) {
        let labelStart = i % 12 === 0 ? 12 : i % 12;
        let amPmStart = i < 12 ? 'am' : 'pm';
        let endHour = i + 3;
        let labelEnd = endHour % 12 === 0 ? 12 : endHour % 12;
        let amPmEnd = endHour < 12 || endHour === 24 ? 'am' : 'pm';
        heatmapBlockLabels.push(`${labelStart}${amPmStart} - ${labelEnd}${amPmEnd}`);
    }

    let heatmapRowsHtml = heatmapDatesList.map(dateStr => {
        const blocksHtml = heatmapData[dateStr].map((blockData, idx) => {
            const count = blockData.count;
            const salesAmt = blockData.sales;
            const intensity = count / maxHeatmapCount;
            let bgClass = "bg-slate-50 dark:bg-slate-800/50"; 
            if (intensity > 0) bgClass = "bg-emerald-200 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-800";
            if (intensity > 0.3) bgClass = "bg-emerald-400 dark:bg-emerald-700/60 border-emerald-500 dark:border-emerald-600";
            if (intensity > 0.6) bgClass = "bg-emerald-500 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-500";
            if (intensity > 0.8) bgClass = "bg-emerald-700 dark:bg-emerald-500 border-emerald-800 dark:border-emerald-400";
            
            const cellTooltip = `
                <div class="flex flex-col gap-1 text-left min-w-[160px]">
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-600 pb-2 mb-2">${heatmapBlockLabels[idx]}</div>
                    <div class="flex justify-between text-sm font-medium mb-1">
                        <span class="text-slate-300">Orders:</span>
                        <span class="font-bold text-white">${count}</span>
                    </div>
                    <div class="flex justify-between text-sm font-medium">
                        <span class="text-slate-300">Sales:</span>
                        <span class="font-bold text-emerald-400">Rs. ${salesAmt.toLocaleString()}</span>
                    </div>
                </div>
            `;

            return `
               <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${bgClass} transition-all duration-300 border border-slate-200 dark:border-slate-700 shadow-sm relative cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-emerald-500 hover:scale-110 hover:brightness-110 hover:z-20 group/cell flex items-center justify-center">
                  
                  <!-- Cell Tooltip -->
                  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs rounded-lg p-4 opacity-0 group-hover/cell:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-30 whitespace-nowrap hidden sm:block scale-90 group-hover/cell:scale-100">
                      ${cellTooltip}
                  </div>

                  <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity font-bold text-slate-800 dark:text-white text-xs drop-shadow-md z-10 pointer-events-none">
                      ${count}
                  </div>
               </div>
            `;
        }).join('');

        return `
            <div class="flex items-center gap-4">
                <div class="w-28 text-sm font-bold text-slate-600 dark:text-slate-400 text-right shrink-0">
                    ${new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div class="flex gap-2">
                    ${blocksHtml}
                </div>
            </div>
        `;
    }).join('');

    const heatmapHeaderHtml = `
        <div class="flex items-center gap-4 mb-2">
            <div class="w-28 shrink-0"></div>
            <div class="flex gap-2">
                ${heatmapBlockLabels.map(label => `<div class="w-10 sm:w-12 text-[10px] sm:text-xs font-bold text-slate-400 text-center uppercase tracking-tighter truncate" title="${label}">${label.replace(' - ', '-')}</div>`).join('')}
            </div>
        </div>
    `;

    content.innerHTML = `
      <div class="space-y-6 pb-20 animate-[fadeIn_0.3s_ease-out]">
         <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h3 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Analytics & Reports</h3>
                <p class="text-base font-medium text-slate-500 dark:text-slate-400 mt-1">Dynamic Store Performance Metrics</p>
            </div>
            
            <!-- Custom Date Range Pickers -->
            <div id="analytics-custom-dates" class="${analyticsFilterType === 'custom' ? 'flex' : 'hidden'} items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                <div class="flex flex-col">
                    <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">From</label>
                    <input type="date" id="custom-from" value="${analyticsCustomFrom}" onchange="updateCustomDates()" class="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px]">
                </div>
                <div class="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                <div class="flex flex-col">
                    <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">To (Max 30d)</label>
                    <input type="date" id="custom-to" value="${analyticsCustomTo}" onchange="applyCustomDates()" class="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px]">
                </div>
            </div>

            <!-- Dynamic Filter Dropdown -->
            <div class="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div class="flex flex-col">
                    <label class="text-[9px] font-bold text-slate-400 uppercase ml-2">Time Range</label>
                    <select id="analytics-filter-select" onchange="applyAnalyticsDropdown()" class="bg-transparent text-sm font-bold text-indigo-600 dark:text-indigo-400 outline-none px-2 py-1 cursor-pointer">
                        <option value="today" ${analyticsFilterType === 'today' ? 'selected' : ''}>Today</option>
                        <option value="7days" ${analyticsFilterType === '7days' ? 'selected' : ''}>Last 7 Days</option>
                        <option value="30days" ${analyticsFilterType === '30days' ? 'selected' : ''}>Last 30 Days</option>
                        <option value="12months" ${analyticsFilterType === '12months' ? 'selected' : ''}>Last 12 Months</option>
                        <option value="custom" ${analyticsFilterType === 'custom' ? 'selected' : ''}>Custom Range</option>
                    </select>
                </div>
            </div>
         </div>

         <div class="grid grid-cols-1 gap-6">
             <!-- Summary Statistics -->
             <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50">
                     <span class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Sales Amount</span>
                     <span class="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400">Rs. ${totalSales.toLocaleString()}</span>
                 </div>
                 <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50">
                     <span class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Highest Sales ${highestLabelType}</span>
                     <div class="flex items-end justify-between mt-1">
                         <span class="text-3xl font-extrabold text-slate-800 dark:text-white truncate pr-2">${highestSalesName}</span>
                         <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">Rs. ${highestBlock.sales.toLocaleString()}</span>
                     </div>
                 </div>
             </div>

             <!-- Dynamic Bar Chart -->
             <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                 <div class="flex items-center justify-between mb-8">
                     <h4 class="text-base font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Order Volume Trends</h4>
                     <span class="text-sm font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">${barChartBlocks.length} Intervals</span>
                 </div>
                 
                 <div class="flex items-end justify-between gap-4 h-72 pb-12 px-6 border-b border-slate-100 dark:border-slate-800 mt-4" style="min-width: ${Math.max(barChartBlocks.length * 60, 800)}px;">
                    ${barChartHtml}
                 </div>
             </div>

             <!-- Heatmap (Kept for granular time-of-day insights) -->
             <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                 <div class="mb-6 flex justify-between items-center">
                     <div>
                         <h4 class="text-base font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Activity Heatmap</h4>
                         <p class="text-sm font-medium text-slate-500 mt-1">Granular time-of-day order density ${analyticsFilterType === '12months' ? '(Last 30 Days)' : ''}</p>
                     </div>
                 </div>
                 
                 <div class="flex flex-col gap-2 min-w-max">
                    ${heatmapHeaderHtml}
                    ${heatmapRowsHtml}
                 </div>
             </div>
         </div>
      </div>
    `;
  } catch (err) {
      console.error("Error rendering analytics:", err);
      content.innerHTML = `
        <div class="p-6 bg-red-50 text-red-600 rounded-xl">
            Failed to load analytics: ${err.message}
        </div>
      `;
  }
}

function applyAnalyticsDropdown() {
    const val = document.getElementById("analytics-filter-select").value;
    analyticsFilterType = val;
    
    if (val === 'custom') {
        if (!analyticsCustomFrom || !analyticsCustomTo) {
             const d = new Date();
             analyticsCustomTo = getLocalDateString(d);
             d.setDate(d.getDate() - 29); // Default 30 days inclusive
             analyticsCustomFrom = getLocalDateString(d);
        }
    }
    renderAnalytics();
}

function updateCustomDates() {
    const fromEl = document.getElementById('custom-from');
    const toEl = document.getElementById('custom-to');
    const fromVal = fromEl.value;
    
    if (fromVal) {
        const fromDate = new Date(fromVal);
        const maxDate = new Date(fromDate);
        maxDate.setDate(fromDate.getDate() + 29); // 30 days max inclusive
        
        toEl.min = fromVal;
        toEl.max = getLocalDateString(maxDate);
        
        // Correct toEl if out of bounds
        if (toEl.value) {
           const toDate = new Date(toEl.value);
           if (toDate > maxDate) toEl.value = getLocalDateString(maxDate);
           if (toDate < fromDate) toEl.value = fromVal;
        } else {
           toEl.value = getLocalDateString(maxDate);
        }
    }
    applyCustomDates();
}

function applyCustomDates() {
    const fromVal = document.getElementById('custom-from').value;
    const toVal = document.getElementById('custom-to').value;
    if (fromVal && toVal) {
        analyticsCustomFrom = fromVal;
        analyticsCustomTo = toVal;
        analyticsFilterType = 'custom';
        renderAnalytics();
    }
}

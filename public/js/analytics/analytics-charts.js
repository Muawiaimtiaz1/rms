// ─── Modern Pure SVG Charting Engine ─────────────────────────────────────────

/**
 * Renders a gorgeous responsive SVG Bar Chart
 */
function renderBarChart(containerId, dataPoints) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!dataPoints || dataPoints.length === 0) {
    container.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400 text-xs italic">No sales transactions found in this period.</div>`;
    return;
  }

  // Dimensions
  const width = container.clientWidth || 500;
  const height = container.clientHeight || 200;
  const paddingX = 40;
  const paddingY = 30;

  const maxVal = Math.max(...dataPoints.map(d => d.sales), 1);
  const minVal = 0;

  const barCount = dataPoints.length;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Coordinate mapper for dynamic spacing
  const getX = (index) => paddingX + (index / barCount) * chartWidth;
  const barWidth = Math.max((chartWidth / barCount) * 0.7, 3); // 70% of available slot width

  const barsHtml = dataPoints.map((dp, idx) => {
    const x = getX(idx) + (chartWidth / barCount - barWidth) / 2;
    const barHeight = (dp.sales / maxVal) * chartHeight;
    const y = height - paddingY - barHeight;

    const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(dp.sales);  

    const tooltip = `
      <div class="flex flex-col gap-0.5 z-[9999]">
        <span class="text-[10px] uppercase font-black text-slate-400 tracking-wider border-b border-slate-700/60 pb-1 mb-1 block">${dp.label}</span>
        <span class="text-sm text-indigo-400 font-extrabold block">${formattedSales}</span>
        <span class="text-xs text-slate-300 font-black block mt-0.5">${dp.orders} Total Orders</span>
      </div>
    `;

    return `
      <g class="group/bar cursor-pointer select-none">
        <!-- Rounded vector bar rect -->
        <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="${Math.min(barWidth / 2, 4)}" ry="${Math.min(barWidth / 2, 4)}" fill="#3b82f6" fill-opacity="0.85" class="hover:fill-opacity-100 hover:fill-[#2563eb] transition-all duration-300"/>
        
        <!-- Large hover helper zone for easy cursor interaction -->
        <rect x="${getX(idx)}" y="${paddingY}" width="${chartWidth / barCount}" height="${chartHeight}" fill="transparent"/>
        
        <!-- Hover Tooltip Popup Overlay -->
        <foreignObject x="${Math.max(Math.min(x + barWidth / 2 - 80, width - 170), 10)}" y="${Math.max(y - 85, 5)}" width="160" height="75" class="opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-all duration-200 overflow-visible z-[9999]">
          <div class="bg-slate-950 text-white rounded-xl p-3 text-left shadow-2xl border border-slate-800 z-[9999]">
            ${tooltip}
          </div>
        </foreignObject>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg class="w-full h-full overflow-visible" viewBox="0 0 ${width} ${height}">
      <!-- Horizontal rules -->
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${paddingX}" y1="${height - paddingY - chartHeight / 2}" x2="${width - paddingX}" y2="${height - paddingY - chartHeight / 2}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${paddingX}" y1="${height - paddingY - chartHeight}" x2="${width - paddingX}" y2="${height - paddingY - chartHeight}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>

      <!-- Bars -->
      ${barsHtml}

      <!-- Grid Axis Labels -->
      ${dataPoints.map((dp, i) => {
        // Drop labels if there are too many for the axis resolution (e.g. 30 days) to prevent overlapping text
        if (barCount > 10 && i % Math.ceil(barCount / 6) !== 0) return '';
        
        const x = getX(i) + (chartWidth / barCount) / 2;
        const displayLabel = dp.label.replace(':00', '');

        return `
          <text x="${x}" y="${height - paddingY + 18}" text-anchor="middle" fill="#94a3b8" class="text-[11px] md:text-xs font-black uppercase select-none tracking-tight">${displayLabel}</text>
        `;
      }).join('')}
    </svg>
  `;
}

/**
 * Renders a gorgeous smooth Spline Line Chart with Gradient Fill
 */
function renderLineChart(containerId, dataPoints) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!dataPoints || dataPoints.length === 0) {
    container.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400 text-xs italic">No data available.</div>`;
    return;
  }

  // Dimensions
  const width = container.clientWidth || 500;
  const height = container.clientHeight || 200;
  const paddingX = 40;
  const paddingY = 20;

  const maxVal = Math.max(...dataPoints.map(d => d.sales), 1);
  const minVal = 0;

  // Coordinate mapper
  const getX = (index) => paddingX + (index / (dataPoints.length - 1)) * (width - paddingX * 2);
  const getY = (value) => height - paddingY - ((value - minVal) / (maxVal - minVal)) * (height - paddingY * 2);

  // Generate control points for a smooth bezier spline path
  let pathD = "";
  let areaD = `M ${getX(0)} ${height - paddingY}`;

  dataPoints.forEach((dp, i) => {
    const x = getX(i);
    const y = getY(dp.sales);
    
    if (i === 0) {
      pathD = `M ${x} ${y}`;
      areaD += ` L ${x} ${y}`;
    } else {
      // Smooth Bezier Curve Control points
      const prevX = getX(i - 1);
      const prevY = getY(dataPoints[i - 1].sales);
      const cpX1 = prevX + (x - prevX) / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + (x - prevX) / 2;
      const cpY2 = y;
      
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
      areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
    }
  });

  areaD += ` L ${getX(dataPoints.length - 1)} ${height - paddingY} Z`;

  // Draw SVG element
  container.innerHTML = `
    <svg class="w-full h-full overflow-visible" viewBox="0 0 ${width} ${height}">
      <defs>
        <!-- Fade Area Gradient -->
        <linearGradient id="area-grad-${containerId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      
      <!-- Horizontal gridlines -->
      <line x1="${paddingX}" y1="${getY(0)}" x2="${width - paddingX}" y2="${getY(0)}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${paddingX}" y1="${getY(maxVal / 2)}" x2="${width - paddingX}" y2="${getY(maxVal / 2)}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${paddingX}" y1="${getY(maxVal)}" x2="${width - paddingX}" y2="${getY(maxVal)}" stroke="#e2e8f0" class="dark:stroke-slate-800" stroke-width="1" stroke-dasharray="4"/>

      <!-- Fill Area -->
      <path d="${areaD}" fill="url(#area-grad-${containerId})" class="animate-[fadeIn_0.5s_ease-out]"/>

      <!-- Stroke Path -->
      <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" class="animate-[draw_1s_ease-out]"/>

      <!-- Interactive Circles for hover tooltips -->
      ${dataPoints.map((dp, i) => {
        const x = getX(i);
        const y = getY(dp.sales);
        const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(dp.sales);  
        
        return `
          <g class="group/dot cursor-pointer select-none">
            <!-- Invisible Hit Area to guarantee easy hover -->
            <circle cx="${x}" cy="${y}" r="20" fill="transparent" stroke="none" />
            
            <!-- Interactive Visual Dots (Hidden by default) -->
            <circle cx="${x}" cy="${y}" r="8" fill="#3b82f6" fill-opacity="0" stroke="none" class="group-hover/dot:fill-opacity-30 transition-all duration-300"/>
            <circle cx="${x}" cy="${y}" r="4" fill="#ffffff" stroke="#3b82f6" stroke-width="2.5" class="opacity-0 group-hover/dot:opacity-100 transition-all duration-300 origin-center group-hover/dot:scale-125" style="transform-box: fill-box;"/>
            
            <!-- Tooltip -->
            <foreignObject x="${x - 70}" y="${y - 65}" width="140" height="55" class="opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-all duration-200 overflow-visible z-50">
              <div class="bg-slate-950 text-white rounded-xl p-2 text-center text-[10px] font-bold shadow-xl border border-slate-800">
                <span class="block text-[8px] text-slate-400 uppercase tracking-widest leading-none mb-1">${dp.label}</span>
                <span class="text-blue-400">${formattedSales}</span>
              </div>
            </foreignObject>
          </g>
        `;
      }).join('')}
    </svg>
  `;
}

/**
 * Renders a gorgeous modern circular Donut Chart
 */
function renderDonutChart(containerId, slices, totalValue) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!slices || slices.length === 0 || totalValue === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-slate-400 text-xs italic gap-2">
        <div class="w-16 h-16 rounded-full border-4 border-slate-200 dark:border-slate-800 border-dashed animate-spin"></div>
        <span>No sales breakdown.</span>
      </div>
    `;
    return;
  }

  // Pre-selected harmonized color palette (Blue, Purple, Emerald, Rose, Slate, Slate Dark)
  const colors = [
    "#3b82f6", // Blue
    "#8b5cf6", // Purple
    "#10b981", // Emerald
    "#f43f5e", // Rose
    "#64748b", // Slate
    "#1e293b"  // Slate Dark
  ];

  let accumulatedPercent = 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius; // ~326.72
 
  let htmlTooltips = [];

  const donutSlicesHtml = slices.map((s, idx) => {
    const pct = s.sales / totalValue;
    const strokeDash = pct * circumference;
    const strokeOffset = circumference - (pct * circumference);
    const strokeRotation = (accumulatedPercent * 360) - 90; // Rotation offsets start top (-90deg)
    
    // Tooltip line connector geometry (Significantly longer)
    const midAngle = (accumulatedPercent * 360) + (pct * 360 / 2) - 90;
    const rad = midAngle * (Math.PI / 180);
    const lineX1 = 80 + ((radius + 8) * Math.cos(rad)); // Start slightly outside the slice
    const lineY1 = 80 + ((radius + 8) * Math.sin(rad));
    const lineX2 = 80 + ((radius + 75) * Math.cos(rad)); // Extend far out (75px)
    const lineY2 = 80 + ((radius + 75) * Math.sin(rad));

    accumulatedPercent += pct;
    const color = colors[idx % colors.length];
 
    const formattedSales = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(s.sales);  
    const displayPct = (pct * 100).toFixed(1);

    // Build the accompanying HTML tooltip to prevent SVG clipping
    const isRightSide = lineX2 > 80;
    const tooltipTransform = isRightSide ? 'translate(4px, -50%)' : 'translate(calc(-100% - 4px), -50%)';
    
    htmlTooltips.push(`
      <div id="tooltip-${containerId}-${idx}" class="absolute z-[99999] opacity-0 pointer-events-none transition-all duration-300 ease-out" style="left: ${lineX2}px; top: ${lineY2}px; transform: ${tooltipTransform} scale(0.95);">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl p-3.5 min-w-[160px]" style="border-left: 4px solid ${color}">
          <div class="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 truncate">${s.label}</div>
          <div class="text-base font-black text-slate-800 dark:text-white leading-tight">${formattedSales}</div>
          <div class="flex items-center gap-2 mt-1.5">
             <span class="text-[11px] font-bold text-slate-500">${displayPct}% Share</span>
             ${s.orders !== undefined ? `<span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-md">${s.orders} Orders</span>` : ''}
          </div>
        </div>
      </div>
    `);

    // SVG Slice and Animated Line
    return `
      <g class="group cursor-pointer" 
         onmouseenter="const t = document.getElementById('tooltip-${containerId}-${idx}'); t.classList.remove('opacity-0'); t.classList.add('opacity-100'); t.style.transform = '${tooltipTransform} scale(1)';" 
         onmouseleave="const t = document.getElementById('tooltip-${containerId}-${idx}'); t.classList.add('opacity-0'); t.classList.remove('opacity-100'); t.style.transform = '${tooltipTransform} scale(0.95)';">
        <circle cx="80" cy="80" r="${radius}"
                fill="transparent"
                stroke="${color}"
                stroke-width="22"
                stroke-dasharray="${strokeDash} ${strokeOffset}"
                transform="rotate(${strokeRotation} 80 80)"
                stroke-linecap="butt"
                class="transition-all duration-300">
        </circle>
        
        <!-- Animated Connector Line -->
        <line x1="${lineX1}" y1="${lineY1}" x2="${lineX2}" y2="${lineY2}" 
              stroke="${color}" stroke-width="2.5" stroke-linecap="round"
              stroke-dasharray="80" stroke-dashoffset="80"
              class="transition-all duration-500 delay-[50ms] opacity-0 group-hover:opacity-100 group-hover:[stroke-dashoffset:0]" />
      </g>
    `;
  }).join('');
 
  // Format central inner sum
  const formattedTotal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalValue);

  // Generate responsive legend
  const legendHtml = slices.map((s, idx) => {
    const color = colors[idx % colors.length];

    return `
      <div class="flex items-center gap-2 text-xs py-1 border-b border-slate-50 dark:border-slate-800/40 last:border-0">
        <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${color}"></span>
        <span class="font-bold text-slate-600 dark:text-slate-400 capitalize truncate">${s.label}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col md:flex-row items-center justify-center gap-6 w-full h-full">
      <!-- SVG Circular Donut -->
      <div class="relative w-40 h-40 shrink-0">
        <svg class="w-full h-full overflow-visible" viewBox="0 0 160 160">
          ${donutSlicesHtml}
        </svg>
        
        <!-- Glass Center badge -->
        <div class="absolute inset-[40px] bg-white dark:bg-slate-950 rounded-full flex flex-col items-center justify-center shadow-inner border border-slate-100 dark:border-slate-900 select-none">
          <span class="text-[8px] uppercase font-black text-slate-400 tracking-wider">Total</span>
          <span class="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-0.5">${formattedTotal}</span>
        </div>

        <!-- HTML Tooltips Container -->
        ${htmlTooltips.join('')}
      </div>
      
      <!-- Legends block -->
      <div class="flex-1 w-full max-h-40 overflow-y-auto pr-1">
        ${legendHtml}
      </div>
    </div>
  `;
}

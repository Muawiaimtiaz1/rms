const express = require('express');
const analyticsService = require('../services/AnalyticsService');
const brandService = require('../services/BrandService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const db = require('../db/knex');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Dashboard and Analytics request the same expensive PostgreSQL aggregation.
// Reuse completed results briefly and coalesce identical requests already in flight.
const dashboardCache = new Map();
const DASHBOARD_CACHE_TTL_MS = 15_000;

async function getDashboardDataCached(shopId, period, from, to, brandId) {
    const key = [shopId || 'global', period || 'all', from || '', to || '', brandId || ''].join('|');
    const now = Date.now();
    const existing = dashboardCache.get(key);
    if (existing && (existing.promise || existing.expiresAt > now)) {
      return existing.promise || existing.data;
    }

    const promise = analyticsService.getDashboardData(shopId, period, from, to, brandId);
    dashboardCache.set(key, { promise, expiresAt: now + DASHBOARD_CACHE_TTL_MS });
    try {
      const data = await promise;
      dashboardCache.set(key, { data, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });
      if (dashboardCache.size > 100) {
        for (const [cacheKey, value] of dashboardCache) {
          if (!value.promise && value.expiresAt <= Date.now()) dashboardCache.delete(cacheKey);
        }
      }
      return data;
    } catch (error) {
      dashboardCache.delete(key);
      throw error;
    }
}

function reportPdfMoney(value, currency) {
    if (value === null || value === undefined) return 'N/A';
    return `${currency || 'PKR'} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function writePdfTable(doc, title, headers, rows) {
    const left = 40, tableWidth = 515, bottom = 770;
    const layouts = {
      2: [0.58, 0.42], 3: [0.48, 0.18, 0.34], 4: [0.34, 0.16, 0.25, 0.25],
      5: [0.27, 0.15, 0.18, 0.2, 0.2],
      7: [0.25, 0.16, 0.08, 0.09, 0.14, 0.14, 0.14]
    };
    const ratios = layouts[headers.length] || headers.map(() => 1 / headers.length);
    const widths = ratios.map(r => r * tableWidth);
    const numeric = headers.map(h => /orders|units|returned|entries|amount|revenue|refunds|received|sales|cost|profit|share|pool/i.test(h));

    const drawHeader = () => {
      let x = left; const y = doc.y; const height = 23;
      doc.save().rect(left, y, tableWidth, height).fill('#0f172a').restore();
      headers.forEach((header, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text(String(header).toUpperCase(), x + 5, y + 7, { width: widths[i] - 10, align: numeric[i] ? 'right' : 'left', lineBreak: false });
        x += widths[i];
      });
      doc.y = y + height;
    };
    const startSection = () => {
      if (doc.y > 690) doc.addPage();
      const headingY = doc.y + 12;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827').text(title, left, headingY, { width: tableWidth, align: 'left' });
      doc.y = headingY + 22;
      drawHeader();
    };
    startSection();
    if (!rows.length) rows = [['No records found', ...headers.slice(1).map(() => '')]];
    rows.forEach((row, rowIndex) => {
      const values = headers.map((_, i) => String(row[i] ?? ''));
      doc.font('Helvetica').fontSize(7.5);
      const rowHeight = Math.max(21, ...values.map((value, i) => doc.heightOfString(value, { width: widths[i] - 10, lineGap: 1 }) + 10));
      if (doc.y + rowHeight > bottom) { doc.addPage(); doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155').text(`${title} - continued`, left, 40, { width: tableWidth, align: 'left' }); doc.y = 58; drawHeader(); }
      const y = doc.y;
      if (rowIndex % 2 === 1) doc.save().rect(left, y, tableWidth, rowHeight).fill('#f8fafc').restore();
      let x = left;
      values.forEach((value, i) => {
        doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b').text(value, x + 5, y + 5, { width: widths[i] - 10, height: rowHeight - 8, align: numeric[i] ? 'right' : 'left', ellipsis: true, lineGap: 1 });
        doc.save().moveTo(x, y).lineTo(x, y + rowHeight).strokeColor('#e2e8f0').lineWidth(0.4).stroke().restore();
        x += widths[i];
      });
      doc.save().rect(left, y, tableWidth, rowHeight).strokeColor('#e2e8f0').lineWidth(0.4).stroke().restore();
      doc.y = y + rowHeight;
    });
}

async function getPdfLogoSource(shop) {
    try {
      if (shop?.logo_data && /^data:image\/(png|jpe?g|webp);base64,/i.test(shop.logo_data)) {
        const source = Buffer.from(shop.logo_data.split(',')[1], 'base64');
        return /^data:image\/webp/i.test(shop.logo_data) ? await sharp(source).png().toBuffer() : source;
      }
      if (shop?.logo_path) {
        const relative = String(shop.logo_path).replace(/^[/\\]+/, '');
        const absolute = path.resolve(__dirname, '..', 'public', relative);
        const publicRoot = path.resolve(__dirname, '..', 'public');
        if (absolute.startsWith(publicRoot + path.sep) && fs.existsSync(absolute)) return absolute;
      }
    } catch (error) {
      console.warn('Report logo could not be loaded:', error.message);
    }
    return null;
}

async function drawPdfReportHeader(doc, shop, type, data) {
    const top = 36, logo = await getPdfLogoSource(shop);
    if (logo) {
      try { doc.image(logo, 40, top, { fit: [70, 52], align: 'center', valign: 'center' }); }
      catch (error) { console.warn('Report logo could not be rendered:', error.message); }
    }
    const textLeft = logo ? 125 : 40;
    doc.font('Helvetica-Bold').fontSize(21).fillColor('#0f172a').text(shop?.receipt_header_text || shop?.name || 'Business Report', textLeft, top, { width: 430 - (textLeft - 40) });
    if (shop?.receipt_extended_name) doc.font('Helvetica').fontSize(9).fillColor('#475569').text(shop.receipt_extended_name, textLeft, doc.y + 2);
    const contact = [shop?.receipt_phone, shop?.receipt_address].filter(Boolean).join('  |  ');
    if (contact) doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(contact, textLeft, doc.y + 3, { width: 430 - (textLeft - 40) });
    doc.y = Math.max(doc.y + 12, top + 62);
    doc.save().moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#0f172a').lineWidth(1.5).stroke().restore();
    doc.y += 10;
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#1e293b').text(type.replace(/_/g, ' ').toUpperCase());
    const filterParts = [`Period: ${data.bounds.start.slice(0,10)} to ${data.bounds.end.slice(0,10)}`];
    if (data.filters?.channel !== 'all') filterParts.push(`Channel: ${data.filters.channel}`);
    if (data.filters?.payment_method !== 'all') filterParts.push(`Payment: ${data.filters.payment_method}`);
    filterParts.push(`Currency: ${data.currencyCode || 'PKR'}`);
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(filterParts.join('  |  '));
}

// GET /api/analytics/dashboard-data
router.get('/dashboard-data', requireAuth, async (req, res) => {
    const user = req.session.user;
    const shopId = user.shop_id;
    const targetShopId = user.role === 'superadmin' ? (req.query.shop_id ? parseInt(req.query.shop_id, 10) : null) : shopId;
    
    if (!targetShopId && user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const data = await getDashboardDataCached(targetShopId, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

// Database-aggregated operational and financial reports with server-side filters.
router.get('/reports', requireAuth, async (req, res) => {
    const user = req.session.user;
    const targetShopId = user.role === 'superadmin' && req.query.shop_id
      ? parseInt(req.query.shop_id, 10)
      : user.shop_id;
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const data = await analyticsService.getReportsData(targetShopId, req.query);
    res.json(data);
});

router.get('/reports.pdf', requireAuth, async (req, res) => {
    const user = req.session.user;
    const targetShopId = user.role === 'superadmin' && req.query.shop_id ? parseInt(req.query.shop_id, 10) : user.shop_id;
    if (!targetShopId) return res.status(400).json({ error: 'Shop ID required' });
    const type = ['complete','sales','products','expenses','profit_loss','partners','business_partner','commission_partner','channels','payments'].includes(req.query.type) ? req.query.type : 'complete';
    const data = await analyticsService.getReportsData(targetShopId, req.query);
    const shop = await db('shops').where({ id: targetShopId }).select('name','logo_path','logo_data','receipt_header_text','receipt_extended_name','receipt_phone','receipt_address').first();
    const currency = data.currencyCode || 'PKR';
    let reportSubject = null;
    if (type === 'commission_partner') reportSubject = await db('third_party_persons').where({ id: req.query.partner_id, shop_id: targetShopId }).first();
    if (type === 'business_partner') reportSubject = await db('brands').where({ id: req.query.partner_id, shop_id: targetShopId }).first();
    if (['commission_partner', 'business_partner'].includes(type) && !reportSubject) {
      return res.status(404).json({ error: 'Partner not found in this shop' });
    }
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const safeSubject = String(reportSubject?.name || type).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    const filename = `${safeSubject || type}-statement-${data.bounds.start.slice(0,10)}-to-${data.bounds.end.slice(0,10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    await drawPdfReportHeader(doc, shop, type, data);
    const k = data.kpis;
    if (!['commission_partner', 'business_partner', 'partners'].includes(type) && !k.isCostDataComplete) {
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(9).fillColor('#92400e').text(`DATA QUALITY WARNING: Profit is unavailable because only ${Number(k.costCoveragePct || 0).toFixed(1)}% of sold item rows contain historical buying cost.`);
    }
    if (type === 'complete' || type === 'profit_loss') writePdfTable(doc, 'Profit and Loss', ['Metric','Amount'], [
      ['Gross revenue',reportPdfMoney(k.grossRevenue,currency)],['Refunds',reportPdfMoney(k.refunds,currency)],['Net revenue',reportPdfMoney(k.netRevenue,currency)],['COGS',reportPdfMoney(k.cogs,currency)],['Gross profit',reportPdfMoney(k.grossProfit,currency)],['Damage / loss',reportPdfMoney(k.damageLoss,currency)],['Operating expenses',reportPdfMoney(k.operatingExpenses,currency)],[k.isSegmented?'Segment contribution':'Net profit',reportPdfMoney(k.isSegmented?k.segmentContribution:k.netProfit,currency)]
    ]);
    if (type === 'complete' || type === 'sales') writePdfTable(doc, 'Daily Sales', ['Date','Orders','Net revenue','Refunds'], data.daily.map(r=>[r.date,r.orders,reportPdfMoney(r.revenue,currency),reportPdfMoney(r.refunds,currency)]));
    if (type === 'complete' || type === 'products') writePdfTable(doc, 'Products', ['Product','Category','Units','Returned','Sales','Cost','Profit'], data.products.map(r=>[r.name,r.category,r.units,r.returnedUnits,reportPdfMoney(r.sales,currency),reportPdfMoney(r.cost,currency),reportPdfMoney(r.profit,currency)]));
    if (type === 'complete' || type === 'expenses') writePdfTable(doc, 'Expenses', ['Category','Entries','Amount'], data.expenses.map(r=>[r.category,r.count,reportPdfMoney(r.amount,currency)]));
    if (type === 'complete' || type === 'channels') writePdfTable(doc, 'Sales by Channel', ['Channel','Orders','Net revenue','Refunds'], data.channels.map(r=>[r.label,r.orders,reportPdfMoney(r.revenue,currency),reportPdfMoney(r.refunds,currency)]));
    if (type === 'complete' || type === 'payments') writePdfTable(doc, 'Sales by Payment Method', ['Method','Orders','Net revenue','Received'], data.payments.map(r=>[r.label,r.orders,reportPdfMoney(r.revenue,currency),reportPdfMoney(r.received,currency)]));
    if (type === 'complete' || type === 'partners') {
      const dashboard = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to);
      const profitAvailable = dashboard.costDataQuality?.complete !== false;
      writePdfTable(doc, 'Whole Business Partner Split - Selected Period', ['Partner','Type','Ownership','Profit basis','Partner share'], (dashboard.partnerProfitShares || []).map(r=>[
        r.brand_name,
        r.partner_type === 'product_based' ? 'Product based' : 'Share based',
        r.partner_type === 'product_based' ? 'Assigned products' : `${Number(r.ownership_percent || 0).toFixed(2).replace(/\.00$/, '')}%`,
        profitAvailable ? reportPdfMoney(r.profit_pool,currency) : 'N/A',
        profitAvailable ? reportPdfMoney(r.profit_share,currency) : 'N/A'
      ]));
      doc.moveDown(0.6).font('Helvetica').fontSize(8.5).fillColor('#475569').text(
        profitAvailable
          ? `Allocation statement: ${reportPdfMoney(dashboard.totalPartnerProfit,currency)} is allocated across ${(dashboard.partnerProfitShares || []).length} business partner(s). This profit includes ${reportPdfMoney(dashboard.commissionIncome,currency)} net commission earned from third-party product sales.`
          : 'Partner profit allocation is unavailable because historical buying-cost coverage is incomplete for this period.',
        40, doc.y, { width: 515, align: 'left' }
      );
      writePdfTable(doc, 'Commission Income Included in Business Profit', ['Metric','Amount'], [
        ['Net shop commission', reportPdfMoney(dashboard.commissionIncome,currency)],
        ['Distributable shop profit', reportPdfMoney(dashboard.shopProfit,currency)]
      ]);
      const allocations = await brandService.getAllocationSettings(targetShopId);
      const inventoryAllocation = await brandService.getInventoryShares(targetShopId);
      const expenseMap = new Map(allocations.expense.shares.map(row => [Number(row.brand_id), row]));
      const inventoryMap = new Map(inventoryAllocation.shares.map(row => [Number(row.brand_id), row]));
      writePdfTable(doc, 'Independent Funding Allocations', ['Partner','Expense %','Inventory %','Inventory amount'], (dashboard.partnerProfitShares || []).map(row => {
        const expense = expenseMap.get(Number(row.brand_id)); const inventory = inventoryMap.get(Number(row.brand_id));
        return [row.brand_name, `${Number(expense?.percentage || 0).toFixed(2)}%`, `${Number(inventory?.percentage || 0).toFixed(2)}%`, reportPdfMoney(inventory?.inventory_share,currency)];
      }));
    }
    if (type === 'business_partner') {
      const partnerId = Number.parseInt(req.query.partner_id, 10);
      const partner = Number.isFinite(partnerId) ? await db('brands').where({ id: partnerId, shop_id: targetShopId }).first() : null;
      if (!partner) doc.font('Helvetica-Bold').fillColor('#b91c1c').text('Business partner not found.');
      else {
        const dashboard = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to);
        const allocation = (dashboard.partnerProfitShares || []).find(row => Number(row.brand_id) === partnerId) || {};
        const funding = await brandService.getAllocationSettings(targetShopId);
        const inventory = await brandService.getInventoryShares(targetShopId);
        const expense = funding.expense.shares.find(row => Number(row.brand_id) === partnerId) || {};
        const inventoryShare = inventory.shares.find(row => Number(row.brand_id) === partnerId) || {};
        const expenseAmount = Number(data.kpis.operatingExpenses || 0) * Number(expense.percentage || 0) / 100;
        const commissionContribution = Number(dashboard.commissionIncome || 0) * Number(allocation.ownership_percent || 0) / 100;
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(`BUSINESS PARTNER STATEMENT: ${partner.name}`);
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text('Profit ownership and independently configured funding responsibilities');
        writePdfTable(doc, 'Profit Allocation', ['Metric','Amount'], [
          ['Business ownership', `${Number(allocation.ownership_percent || 0).toFixed(2)}%`],
          ['Shop profit allocation basis', reportPdfMoney(allocation.profit_pool,currency)],
          ['Partner profit share', reportPdfMoney(allocation.profit_share,currency)],
          ['Included share of shop commission income', reportPdfMoney(commissionContribution,currency)]
        ]);
        writePdfTable(doc, 'Funding Responsibilities', ['Metric','Percentage','Amount'], [
          [`Operating expenses (${funding.expense.mode})`, `${Number(expense.percentage || 0).toFixed(2)}%`, reportPdfMoney(expenseAmount,currency)],
          [`Current shop inventory (${inventory.allocationMode})`, `${Number(inventoryShare.percentage || 0).toFixed(2)}%`, reportPdfMoney(inventoryShare.inventory_share,currency)]
        ]);
        doc.moveDown(0.7).font('Helvetica').fontSize(8).fillColor('#64748b').text('Accounting note: inventory amount is the partner allocation of current shop-owned inventory valuation. Commission-partner inventory is excluded. Expense funding is shown separately from the displayed shop-profit allocation.');
      }
    }
    if (type === 'commission_partner') {
      const partnerId = Number.parseInt(req.query.partner_id, 10);
      const partner = Number.isFinite(partnerId) ? await db('third_party_persons').where({ id: partnerId, shop_id: targetShopId }).first() : null;
      if (!partner) { doc.font('Helvetica-Bold').fillColor('#b91c1c').text('Commission partner not found.'); }
      else {
        const dashboard = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to);
        const balance = (dashboard.commissionPartnerBalances || []).find(row => Number(row.partner_id) === partnerId) || {
          net_sales: 0, shop_commission: 0, partner_payable: 0, partner_cogs: 0, partner_profit: 0
        };
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(`PARTNER STATEMENT: ${partner.name}`);
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text([partner.phone, partner.notes].filter(Boolean).join('  |  ') || 'Commission-based product partner');
        writePdfTable(doc, 'Statement Summary', ['Metric','Amount'], [
          ['Default shop commission rate', `${Number(partner.default_commission_percentage || 0).toFixed(2).replace(/\.00$/, '')}%`],
          ['Partner cost tracking', partner.maintain_cost_price ? 'Enabled' : 'Disabled'],
          ['Net product sales', reportPdfMoney(balance.net_sales,currency)],
          ['Shop commission deducted', reportPdfMoney(balance.shop_commission,currency)],
          ['Amount payable to partner', reportPdfMoney(balance.partner_payable,currency)],
          ['Partner product cost', partner.maintain_cost_price ? reportPdfMoney(balance.partner_cogs,currency) : 'Not maintained'],
          ['Partner profit after cost', partner.maintain_cost_price ? reportPdfMoney(balance.partner_profit,currency) : 'Not calculated']
        ]);
        const salesRows = await db('sale_items as si')
          .join('sales as s', 'si.sale_id', 's.id').leftJoin('products as p', 'si.product_id', 'p.id')
          .where({ 's.shop_id': targetShopId, 's.order_status': 'completed', 'si.third_party_person_id': partnerId })
          .whereBetween('s.created_at', [dashboard.bounds.start, dashboard.bounds.end])
          .select('s.created_at','s.id as sale_id','s.discount as sale_discount','p.name as product_name','si.quantity','si.price_at_sale','si.buying_price_at_sale','si.commission_percentage_at_sale')
          .select(db.raw('(SELECT COALESCE(SUM(x.quantity * x.price_at_sale), 0) FROM sale_items x WHERE x.sale_id = s.id) as sale_subtotal'));
        writePdfTable(doc, 'Products Sold', ['Date','Product','Units','Sales','Cost','Commission','Partner amount'], salesRows.map(row => {
          const grossLine = Number(row.quantity) * Number(row.price_at_sale);
          const sales = Number(row.sale_subtotal) > 0 ? grossLine * (Number(row.sale_subtotal) - Number(row.sale_discount || 0)) / Number(row.sale_subtotal) : grossLine;
          const commission = sales * Number(row.commission_percentage_at_sale) / 100;
          return [String(row.created_at).slice(0,10), row.product_name || `Sale #${row.sale_id}`, row.quantity,
            reportPdfMoney(sales,currency), partner.maintain_cost_price ? reportPdfMoney(Number(row.quantity) * Number(row.buying_price_at_sale),currency) : 'Not maintained',
            reportPdfMoney(commission,currency), reportPdfMoney(sales - commission,currency)];
        }));
        const returnRows = await db('return_items as ri')
          .join('returns as r', 'ri.return_id', 'r.id').join('sale_items as si', 'ri.sale_item_id', 'si.id')
          .leftJoin('products as p', 'ri.product_id', 'p.id')
          .where({ 'r.shop_id': targetShopId, 'si.third_party_person_id': partnerId })
          .whereBetween('r.created_at', [dashboard.bounds.start, dashboard.bounds.end])
          .select('r.created_at','p.name as product_name','ri.quantity','ri.refund_price','si.commission_percentage_at_sale');
        writePdfTable(doc, 'Returns and Reversals', ['Date','Product','Units','Refunds','Commission reversal'], returnRows.map(row => {
          const refund = Number(row.quantity) * Number(row.refund_price);
          return [String(row.created_at).slice(0,10), row.product_name || 'Product', row.quantity,
            reportPdfMoney(refund,currency), reportPdfMoney(refund * Number(row.commission_percentage_at_sale) / 100,currency)];
        }));
        doc.moveDown(0.7).font('Helvetica').fontSize(8).fillColor('#64748b').text('Statement note: commission is calculated on net merchandise selling value after discount and before tax. Returns are recognized on their return date and may relate to sales from an earlier period. Amount payable is calculated and does not by itself confirm that payment has been made.');
      }
    }
    const pages = doc.bufferedPageRange();
    for (let i=0;i<pages.count;i++) {
      doc.switchToPage(i);
      const previousBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.save().moveTo(40, 806).lineTo(555, 806).strokeColor('#e2e8f0').lineWidth(0.5).stroke().restore();
      doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8').text(`Generated ${new Date().toLocaleString()}  |  Page ${i+1} of ${pages.count}`,40,812,{align:'right',width:515,lineBreak:false});
      doc.page.margins.bottom = previousBottomMargin;
    }
    doc.end();
});

// GET /api/analytics - Global Overview (Superadmin)
router.get('/', requireAuth, async (req, res) => {
    if (req.session.user.role === 'superadmin') {
        const stats = await analyticsService.getGlobalStats();
        return res.json({ isGlobal: true, ...stats });
    }

    // Legacy support for shop-specific analytics via the new service
    const data = await getDashboardDataCached(req.session.user.shop_id, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

module.exports = router;

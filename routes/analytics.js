const express = require('express');
const analyticsService = require('../services/AnalyticsService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const db = require('../db/knex');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

function reportPdfMoney(value, currency) {
    if (value === null || value === undefined) return 'N/A';
    return `${currency || 'PKR'} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function writePdfTable(doc, title, headers, rows) {
    const left = 40, tableWidth = 515, bottom = 770;
    const layouts = {
      2: [0.58, 0.42], 3: [0.48, 0.18, 0.34], 4: [0.34, 0.16, 0.25, 0.25],
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
      doc.moveDown(0.7).fontSize(13).font('Helvetica-Bold').fillColor('#111827').text(title);
      doc.moveDown(0.35); drawHeader();
    };
    startSection();
    if (!rows.length) rows = [['No records found', ...headers.slice(1).map(() => '')]];
    rows.forEach((row, rowIndex) => {
      const values = headers.map((_, i) => String(row[i] ?? ''));
      doc.font('Helvetica').fontSize(7.5);
      const rowHeight = Math.max(21, ...values.map((value, i) => doc.heightOfString(value, { width: widths[i] - 10, lineGap: 1 }) + 10));
      if (doc.y + rowHeight > bottom) { doc.addPage(); doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155').text(`${title} - continued`); doc.moveDown(0.3); drawHeader(); }
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

function getPdfLogoSource(shop) {
    try {
      if (shop?.logo_data && /^data:image\/(png|jpe?g);base64,/i.test(shop.logo_data)) {
        return Buffer.from(shop.logo_data.split(',')[1], 'base64');
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

function drawPdfReportHeader(doc, shop, type, data) {
    const top = 36, logo = getPdfLogoSource(shop);
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

    const data = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to, req.query.brand_id);
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
    const type = ['complete','sales','products','expenses','profit_loss','partners','channels','payments'].includes(req.query.type) ? req.query.type : 'complete';
    const data = await analyticsService.getReportsData(targetShopId, req.query);
    const shop = await db('shops').where({ id: targetShopId }).select('name','logo_path','logo_data','receipt_header_text','receipt_extended_name','receipt_phone','receipt_address').first();
    const currency = data.currencyCode || 'PKR';
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const filename = `${type}-report-${new Date().toISOString().slice(0,10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    drawPdfReportHeader(doc, shop, type, data);
    const k = data.kpis;
    if (!k.isCostDataComplete) {
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
      writePdfTable(doc, 'Partner Report', ['Partner','Type','Profit pool','Profit share'], (dashboard.partnerProfitShares || []).map(r=>[r.name,r.partner_type,reportPdfMoney(r.profit_pool,currency),reportPdfMoney(r.profit_share,currency)]));
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
    const data = await analyticsService.getDashboardData(req.session.user.shop_id, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

module.exports = router;

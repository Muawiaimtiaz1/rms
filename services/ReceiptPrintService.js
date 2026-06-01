function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assetUrl(value, baseUrl = "") {
  if (!value) return "";
  const str = String(value);
  if (/^https?:\/\//i.test(str) || str.startsWith("data:")) return str;
  if (!baseUrl) return str;
  return new URL(str.startsWith("/") ? str : `/${str}`, baseUrl).toString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function formatMoney(value) {
  return Number(value || 0).toFixed(0);
}

function formatOrderType(type) {
  if (type === "dine_in") return "Dine-in";
  if (type === "takeaway") return "Takeaway";
  return "Delivery";
}

function cssFontFamily(value) {
  const fallback = "'Courier New', Courier, monospace";
  if (!value) return fallback;
  const str = String(value);
  return /^[a-zA-Z0-9\s'",-]+$/.test(str) ? str : fallback;
}

function renderShopHeader(shop, baseUrl) {
  const headerFontSize = shop?.header_font_size || 18;
  const headerFontWeight = shop?.header_font_weight || "bold";
  const headerSpacing = shop?.header_spacing || 10;
  const contactFontSize = shop?.contact_font_size || 10;
  const contactAlign = shop?.contact_align || "center";
  const contactPadding = shop?.contact_padding || 10;
  const dividerStyle = shop?.divider_style || "dashed";
  const dividerWidth = shop?.divider_width || 1;
  const dividerCss = dividerStyle === "none" ? "none" : `${dividerWidth}px ${dividerStyle} #111827`;
  const useLogo = shop?.use_logo_on_receipt && shop?.logo_path;
  const useText = shop?.use_text_on_receipt !== false;
  const headerText = shop?.receipt_header_text || shop?.name || "STORE";

  let html = "";
  if (useLogo) {
    html += `<div style="margin-bottom: ${headerSpacing}px;"><img src="${assetUrl(shop.logo_path, baseUrl)}" style="max-width: 60mm; max-height: 22mm; margin: 0 auto; display: block;" alt="${escapeHtml(headerText)}"></div>`;
  }

  if (useText) {
    html += `<h1 style="font-size: ${headerFontSize}px; font-weight: ${escapeHtml(headerFontWeight)}; margin: 0; text-transform: uppercase; text-align: center;">${escapeHtml(headerText)}</h1>`;
  }

  if (shop?.receipt_extended_name) {
    const extFontSize = shop.extended_name_font_size || 10;
    const extFontWeight = shop.extended_name_font_weight || "normal";
    const extSpacing = shop.extended_name_spacing || 2;
    html += `<div style="font-size: ${extFontSize}px; font-weight: ${escapeHtml(extFontWeight)}; margin-top: ${extSpacing}px; text-align: center;">${escapeHtml(shop.receipt_extended_name)}</div>`;
  }

  if (shop?.receipt_phone || shop?.receipt_address) {
    html += `<div style="font-size: ${contactFontSize}px; margin-top: 5px; text-align: ${escapeHtml(contactAlign)}; border-bottom: ${dividerCss}; padding-bottom: ${contactPadding}px;">`;
    if (shop.receipt_phone) html += `<div>${escapeHtml(shop.receipt_phone)}</div>`;
    if (shop.receipt_address) html += `<div>${escapeHtml(shop.receipt_address)}</div>`;
    html += "</div>";
  }

  return html;
}

function renderFooter(shop, baseUrl, isUnpaid) {
  const footerFontSize = Number(shop?.footer_font_size || 9);
  const footerFontStyle = shop?.footer_font_style || "normal";
  const footerMargin = shop?.footer_margin || 10;
  const sectionGap = shop?.section_gap || 10;
  const dividerStyle = shop?.divider_style || "dashed";
  const dividerWidth = shop?.divider_width || 1;
  const dividerCss = dividerStyle === "none" ? "none" : `${dividerWidth}px ${dividerStyle} #111827`;
  const images = Array.isArray(shop?.receipt_images) ? shop.receipt_images : [];

  let html = "";
  if (images.length > 0) {
    html += `<div style="margin-top: ${sectionGap}px; border-top: ${dividerCss}; padding-top: ${sectionGap}px;">`;
    images.forEach((img) => {
      html += `<img src="${assetUrl(img.path, baseUrl)}" style="max-width: 70mm; max-height: 25mm; margin: 3px auto; display: block;" alt="${escapeHtml(img.description || "")}">`;
      if (img.description) html += `<div style="font-size: ${footerFontSize}px; text-align: center; margin-top: 2px;">${escapeHtml(img.description)}</div>`;
    });
    html += "</div>";
  }

  html += `<div class="footer text-center">`;
  if (shop?.receipt_policies) {
    html += `<div style="font-size: ${footerFontSize}px; font-style: ${escapeHtml(footerFontStyle)}; margin: ${footerMargin}px 0; white-space: pre-wrap;">${escapeHtml(shop.receipt_policies)}</div>`;
  }

  html += `<div style="font-size: ${footerFontSize + 1}px; margin-top: ${footerMargin}px;">${isUnpaid ? "Payment pending. Please keep this bill for counter settlement." : "Thank you for your purchase!"}</div>`;
  if (shop?.name && !(shop?.use_logo_on_receipt && shop?.logo_path)) {
    html += `<div style="font-size: ${footerFontSize + 1}px;">${escapeHtml(shop.name)}</div>`;
  }
  html += `<div style="font-size: ${footerFontSize}px; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 5px; font-weight: bold;">Software by DEVFORGE - 03226155209</div>`;
  html += "</div>";
  return html;
}

function itemName(item) {
  return item.product_name || item.custom_name || item.name || "Item";
}

function renderCustomerReceipt(details, options) {
  const { sale, items, seller, shop } = details;
  const isUnpaid = options.format === "unpaid";
  const title = isUnpaid ? "Unpaid Bill" : "Customer Bill";
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price_at_sale || 0), 0);
  const grandTotal = Number(sale.total || 0);
  const discount = Number(sale.discount || 0);
  const taxPct = Number(sale.tax_percentage || 0);
  const taxAmt = (subtotal - discount) * (taxPct / 100);
  const received = isUnpaid ? 0 : Number(sale.amount_received || 0);
  const remaining = isUnpaid ? grandTotal : grandTotal - received;
  const methodMap = { cash: "Cash", card: "Card", online: "Online Transfer" };
  const method = methodMap[sale.payment_method] || String(sale.payment_method || "Cash").toUpperCase();

  return `
    <div class="receipt">
      <div class="text-center">
        ${renderShopHeader(shop, options.baseUrl)}
        <div class="bold">${title}</div>
      </div>

      <hr class="divider" />

      <div style="font-size: 10px;">
        <strong>Bill #:</strong> ${escapeHtml(sale.id)}<br>
        <strong>Date:</strong> ${escapeHtml(new Date(sale.created_at).toLocaleString())}<br>
        <strong>Staff:</strong> ${escapeHtml(seller ? seller.name : "Staff")}<br>
        <strong>Customer:</strong> ${escapeHtml(sale.customer_name || "Walk-in")}<br>
        ${sale.customer_phone ? `<strong>Phone:</strong> ${escapeHtml(sale.customer_phone)}<br>` : ""}
        <strong>Type:</strong> ${escapeHtml(formatOrderType(sale.order_type))}<br>
        <strong>Payment:</strong> ${escapeHtml(method)}<br>
      </div>

      <hr class="divider" />

      <table>
        <thead>
          <tr>
            <th style="width: 50%;">Item</th>
            <th class="text-center">Qty</th>
            <th class="text-right">Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(itemName(item))}</td>
              <td class="text-center">${escapeHtml(item.quantity)}</td>
              <td class="text-right">${formatMoney(item.price_at_sale)}</td>
              <td class="text-right">${formatMoney(Number(item.quantity || 0) * Number(item.price_at_sale || 0))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <hr class="divider" />

      <div class="text-right">
        <div>Subtotal: Rs. ${formatMoney(subtotal)}</div>
        ${discount > 0 ? `<div>Discount: -Rs. ${formatMoney(discount)}</div>` : ""}
        ${taxPct > 0 ? `<div>Tax (${escapeHtml(taxPct)}%): Rs. ${formatMoney(taxAmt)}</div>` : ""}
        <div class="bold total-row" style="margin-top: 4px;">GRAND TOTAL: Rs. ${formatMoney(grandTotal)}</div>
      </div>

      <hr class="divider" />

      <div style="font-size: 10px;">
        ${isUnpaid ? `
          <div style="text-align: center; border: 1px dashed #111827; padding: 5px; margin-top: 5px; font-weight: bold;">
            *** UNPAID BILL ***<br>
            Total: Rs. ${formatMoney(grandTotal)}<br>
            Balance Due: Rs. ${formatMoney(remaining)}
          </div>
        ` : `
          <div><strong>Method:</strong> ${escapeHtml(method)}</div>
          <div><strong>Received:</strong> Rs. ${formatMoney(received)}</div>
          ${remaining > 0 ? `<div class="bold"><strong>Due:</strong> Rs. ${formatMoney(remaining)}</div>` : ""}
          ${remaining < 0 ? `<div class="bold"><strong>Change:</strong> Rs. ${formatMoney(Math.abs(remaining))}</div>` : ""}
        `}
      </div>

      <hr class="divider" />
      ${renderFooter(shop, options.baseUrl, isUnpaid)}
    </div>
  `;
}

function renderItemDetails(item) {
  const details = [];
  const variants = parseJson(item.variants_json, item.variants || []);
  const addons = parseJson(item.addons_json, item.addons || []);
  if (Array.isArray(variants) && variants.length) {
    details.push(variants.map((v) => v.name || v.value || v).join(", "));
  } else if (variants && typeof variants === "object") {
    details.push(Object.values(variants).join(", "));
  }
  if (Array.isArray(addons) && addons.length) {
    details.push(`Addons: ${addons.map((a) => a.name || a).join(", ")}`);
  }
  return details.filter(Boolean).join(" | ");
}

function renderKitchenReceipt(details) {
  const { sale, items } = details;
  return `
    <div class="receipt kitchen-receipt">
      <div class="text-center">
        <h1 class="bold">KITCHEN ORDER</h1>
        <h2 class="bold" style="font-size: 24px; margin: 8px 0;">#${escapeHtml(sale.id)}</h2>
      </div>

      <div class="order-info">
        <div class="bold" style="font-size: 14px;">${escapeHtml(formatOrderType(sale.order_type).toUpperCase())}</div>
        ${sale.table_id ? `<div class="bold" style="font-size: 16px;">TABLE: ${escapeHtml(sale.table_number || "N/A")}</div>` : ""}
        ${sale.token_number ? `<div class="bold" style="font-size: 16px;">TOKEN: ${escapeHtml(sale.token_number)}</div>` : ""}
        <div style="margin-top: 3px;">Time: ${escapeHtml(new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 20%;" class="text-center">Qty</th>
            <th>Item Description</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const detailsText = renderItemDetails(item);
            return `
              <tr>
                <td class="qty text-center">x${escapeHtml(item.quantity)}</td>
                <td>
                  <div class="item-name">${escapeHtml(itemName(item))}</div>
                  ${detailsText ? `<div class="item-details">${escapeHtml(detailsText)}</div>` : ""}
                  ${item.special_instructions ? `<div class="special-note">NOTE: ${escapeHtml(item.special_instructions)}</div>` : ""}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      ${sale.special_instructions ? `
        <div style="margin-top: 10px; padding: 8px; border: 1px solid #000;">
          <div class="bold" style="font-size: 10px; text-transform: uppercase;">Order Note:</div>
          <div style="font-size: 12px;">${escapeHtml(sale.special_instructions)}</div>
        </div>
      ` : ""}

      <div class="footer">
        Generated at ${escapeHtml(new Date().toLocaleTimeString())}
      </div>
    </div>
  `;
}

function renderSaleReceiptPage(details, options = {}) {
  const format = ["kitchen", "customer", "unpaid"].includes(options.format) ? options.format : "customer";
  const autoPrint = options.autoPrint !== false;
  const shop = details.shop || {};
  const body = format === "kitchen"
    ? renderKitchenReceipt(details, options)
    : renderCustomerReceipt(details, { ...options, format });
  const title = format === "kitchen"
    ? `Kitchen Order #${details.sale.id}`
    : `${format === "unpaid" ? "Unpaid Bill" : "Customer Bill"} #${details.sale.id}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @font-face {
      font-family: 'bit array-a2';
      src: url('${assetUrl("/fonts/be69564cba72b68a4f28d2f3d3139513.eot", options.baseUrl)}');
      src: url('${assetUrl("/fonts/be69564cba72b68a4f28d2f3d3139513.woff2", options.baseUrl)}') format('woff2'),
           url('${assetUrl("/fonts/be69564cba72b68a4f28d2f3d3139513.woff", options.baseUrl)}') format('woff'),
           url('${assetUrl("/fonts/be69564cba72b68a4f28d2f3d3139513.ttf", options.baseUrl)}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @page { 
        margin: 0; 
        size: 74mm 297mm; /* 74mm matches the physical printable area of most 80mm thermal rolls */
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      width: 74mm;
      min-height: 100vh;
    }
    .receipt {
      font-family: ${cssFontFamily(shop?.receipt_font_family)};
      width: 74mm;
      margin: 0;
      padding: 0 10mm 0 3mm; /* 10mm padding on right, 3mm on left */
      color: #000; /* Pure black is much crisper on thermal printers than off-black #111827 */
      font-size: 12px; /* Slightly larger base font size to counteract any shrinking */
      font-weight: 500;
      line-height: 1.25;
      background: #fff;
      box-sizing: border-box;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    .kitchen-receipt {
      font-family: 'Courier New', Courier, monospace;
      padding: 0 10mm 0 3mm; /* 10mm padding on right, 3mm on left */
      color: #000;
      width: 74mm;
      margin: 0;
      box-sizing: border-box;
    }
    @media print {
      .receipt, .kitchen-receipt { margin: 0; width: 100%; }
      html, body { margin: 0 !important; }
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 700; }
    h1 { font-size: 16px; margin: 0 0 2px 0; text-transform: uppercase; font-weight: 800; }
    h2 { font-size: 14px; margin: 2px 0; font-weight: 700; }
    .divider { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding: 2px 0; font-weight: 700; }
    td { padding: 2px 0; vertical-align: top; color: #000; }
    .total-row { font-size: 14px; font-weight: 800; }
    .footer { font-size: 10px; margin-top: 6px; }
    .kitchen-receipt h1 { font-size: 18px; border-bottom: 2px solid #000; padding-bottom: 5px; }
    .kitchen-receipt .order-info { font-size: 12px; margin: 10px 0; border-bottom: 1px solid #000; padding-bottom: 10px; }
    .kitchen-receipt table { margin: 10px 0; }
    .kitchen-receipt th { font-size: 12px; border-bottom: 2px solid #000; padding: 5px 0; }
    .kitchen-receipt td { padding: 4px 0; border-bottom: 1px solid #eee; }
    .kitchen-receipt .item-name { font-size: 14px; font-weight: bold; }
    .kitchen-receipt .item-details { font-size: 10px; color: #333; margin-top: 2px; }
    .kitchen-receipt .special-note { font-size: 12px; color: #000; border: 1px solid #000; padding: 2px; display: inline-block; margin-top: 4px; font-weight: bold; }
    .kitchen-receipt .qty { font-size: 18px; font-weight: 900; }
    .kitchen-receipt .footer { font-size: 10px; margin-top: 15px; text-align: center; border-top: 1px dashed #000; padding-top: 10px; }
  </style>
</head>
<body>
  ${body}
  <script>
    (function() {
      function waitForImages() {
        var images = Array.from(document.images || []);
        return Promise.all(images.map(function(img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function(resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }));
      }

      function ready() {
        window.receiptReady = true;
        ${autoPrint ? "setTimeout(function() { window.focus(); window.print(); }, 200);" : ""}
      }

      Promise.all([
        document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
        waitForImages()
      ]).then(ready).catch(ready);
    })();
  </script>
</body>
</html>`;
}

module.exports = {
  renderSaleReceiptPage,
};

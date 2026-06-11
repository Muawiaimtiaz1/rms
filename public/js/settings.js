// --- settings.js ---
// ─── Receipt Settings ─────────────────────────────────────────────────

async function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try webp first, then jpeg
        try {
            resolve(canvas.toDataURL("image/webp", quality));
        } catch(e) {
            resolve(canvas.toDataURL("image/jpeg", quality));
        }
      };
      img.onerror = (err) => reject(new Error("Failed to load image for compression"));
    };
    reader.onerror = (err) => reject(new Error("Failed to read file for compression"));
  });
}

let _receiptSettings = null;

async function fetchReceiptSettings() {
  try {
    const res = await fetch("/api/shop-settings");
    if (!res.ok) throw new Error("Failed to fetch settings");
    _receiptSettings = await res.json();
    return _receiptSettings;
  } catch (e) {
    console.error("Receipt settings fetch error:", e);
    return null;
  }
}

function renderReceiptPreview() {
  const settings = _receiptSettings || {};
  const headerText = document.getElementById("receipt-header-text")?.value || settings.receipt_header_text || settings.name || "YOUR SHOP";
  const extendedName = document.getElementById("receipt-extended-name")?.value || settings.receipt_extended_name || "";
  const phone = document.getElementById("receipt-phone")?.value || settings.receipt_phone || "";
  const address = document.getElementById("receipt-address")?.value || settings.receipt_address || "";
  const policies = document.getElementById("receipt-policies")?.value || settings.receipt_policies || "";
  // Get logo/text flags from checkboxes
  const useLogo = document.getElementById("use-logo-on-receipt")?.checked ?? (settings.use_logo_on_receipt !== false);
  const useText = document.getElementById("use-text-on-receipt")?.checked ?? (settings.use_text_on_receipt !== false);

  // Use temporary logo URL if available (from file preview), otherwise use saved logo
  const savedLogoUrl = settings.logo_url || settings.logo_data || "";
  const hasSavedLogo = !!(settings.logo_path || settings.logo_data);
  const logoUrl = _tempLogoUrl || savedLogoUrl;
  const hasLogo = _tempLogoUrl || hasSavedLogo;
  const images = settings.receipt_images || [];

  // Get typography settings from form or saved settings
  const receiptFontFamily = document.getElementById("receipt-font-family")?.value || settings.receipt_font_family || "'Courier New', Courier, monospace";
  const headerFontSize = document.getElementById("header-font-size")?.value || settings.header_font_size || 18;
  const headerFontWeight = document.getElementById("header-font-weight")?.value || settings.header_font_weight || "bold";
  const headerSpacing = document.getElementById("header-spacing")?.value || settings.header_spacing || 10;

  const extendedNameFontSize = document.getElementById("extended-name-font-size")?.value || settings.extended_name_font_size || 10;
  const extendedNameFontWeight = document.getElementById("extended-name-font-weight")?.value || settings.extended_name_font_weight || "normal";
  const extendedNameSpacing = document.getElementById("extended-name-spacing")?.value || settings.extended_name_spacing || 2;

  const contactFontSize = document.getElementById("contact-font-size")?.value || settings.contact_font_size || 10;
  const contactAlign = document.getElementById("contact-align")?.value || settings.contact_align || "center";
  const contactPadding = document.getElementById("contact-padding")?.value || settings.contact_padding || 10;
  const footerFontSize = document.getElementById("footer-font-size")?.value || settings.footer_font_size || 9;
  const footerFontStyle = document.getElementById("footer-font-style")?.value || settings.footer_font_style || "normal";
  const footerMargin = document.getElementById("footer-margin")?.value || settings.footer_margin || 10;
  const dividerStyle = document.getElementById("divider-style")?.value || settings.divider_style || "dashed";
  const dividerWidth = document.getElementById("divider-width")?.value || settings.divider_width || 1;
  const sectionGap = document.getElementById("section-gap")?.value || settings.section_gap || 10;

  const dividerCss = dividerStyle === "none" ? "none" : `${dividerWidth}px ${dividerStyle} #000`;

  // Build header
  let headerHtml = "";
  if (useLogo && hasLogo) {
    headerHtml += `<div style="margin-bottom: ${headerSpacing}px;"><img src="${logoUrl}" style="max-width: 60mm; max-height: 22mm; margin: 0 auto; display: block;" alt="${headerText}"></div>`;
  }

  if (useText) {
    headerHtml += `<h1 style="font-size: ${headerFontSize}px; font-weight: ${headerFontWeight}; margin: 0; text-transform: uppercase; text-align: center;">${headerText}</h1>`;
  }

  // Tagline/Extended info (shown if either is selected or both)
  if (extendedName) {
    headerHtml += `<div style="font-size: ${extendedNameFontSize}px; font-weight: ${extendedNameFontWeight}; margin-top: ${extendedNameSpacing}px; text-align: center; text-transform: none; margin-bottom: ${headerSpacing}px;">${extendedName}</div>`;
  }

  // Build contact
  let contactHtml = "";
  if (phone || address) {
    contactHtml = `<div style="font-size: ${contactFontSize}px; margin-top: 5px; text-align: ${contactAlign}; border-bottom: ${dividerCss}; padding-bottom: ${contactPadding}px;">`;
    if (phone) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${phone}</div>`;
    if (address) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${address}</div>`;
    contactHtml += `</div>`;
  }

  // Build promo images
  let promoHtml = "";
  if (images.length > 0) {
    promoHtml = `<div style="margin-top: ${sectionGap}px; border-top: ${dividerCss}; padding-top: ${sectionGap}px;">`;
    images.forEach((img) => {
      promoHtml += `<img src="${img.path}" style="max-width: 70mm; max-height: 25mm; margin: 5px auto; display: block;" alt="${img.description || ""}">`;
      if (img.description) {
        promoHtml += `<div style="font-size: ${footerFontSize}px; text-align: center; margin-top: 2px;">${img.description}</div>`;
      }
    });
    promoHtml += `</div>`;
  }

  // Build footer
  let footerHtml = "";
  if (policies) {
    footerHtml += `<div style="font-size: ${footerFontSize}px; font-style: ${footerFontStyle}; margin: ${footerMargin}px 0; text-align: center; white-space: pre-wrap; border-top: ${dividerCss}; padding-top: ${footerMargin}px;">${policies.replace(/\n/g, "<br>")}</div>`;
  }
  footerHtml += `<div style="font-size: ${parseInt(footerFontSize) + 1}px; text-align: center; margin-top: ${footerMargin}px;">Thank you for your purchase!</div>`;

  return `
    <div style="font-family: ${receiptFontFamily}; width: 80mm; padding: 5mm; background: #fff; color: #000; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 20px rgba(0,0,0,0.15); margin: 0 auto;">
      <div style="text-align: center; margin-bottom: ${sectionGap}px;">
        ${headerHtml}
        <div style="font-weight: bold; font-size: 14px; margin-top: 5px;">Sales Receipt</div>
        ${contactHtml}
      </div>
      
      <div style="font-size: 11px; margin: ${sectionGap}px 0;">
        <strong>Bill #:</strong> 1001<br>
        <strong>Date:</strong> ${new Date().toLocaleString()}<br>
        <strong>Seller:</strong> Staff<br>
        <strong>Customer:</strong> Walk-in<br>
      </div>

      <div style="border-top: ${dividerCss}; border-bottom: ${dividerCss}; padding: ${sectionGap}px 0; margin: ${sectionGap}px 0;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px; font-size: 10px; font-weight: bold;">
          <span style="flex: 2;">Item</span>
          <span style="flex: 1; text-align: center;">Qty</span>
          <span style="flex: 1; text-align: right;">Price</span>
          <span style="flex: 1; text-align: right;">Total</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span style="flex: 2;">Sample Product</span>
          <span style="flex: 1; text-align: center;">2</span>
          <span style="flex: 1; text-align: right;">500</span>
          <span style="flex: 1; text-align: right;">1000</span>
        </div>
      </div>

      <div style="text-align: right;">
        <div>Subtotal: Rs. 1000</div>
        <div style="font-weight: bold; font-size: 15px; margin-top: 5px;">GRAND TOTAL: Rs. 1000</div>
      </div>

      <div style="font-size: 11px; margin-top: ${sectionGap}px; border-top: ${dividerCss}; padding-top: ${sectionGap}px;">
        <div><strong>Method:</strong> Cash</div>
        <div><strong>Received:</strong> Rs. 1000</div>
        <div style="font-weight: bold;"><strong>Change:</strong> Rs. 0</div>
      </div>

      ${promoHtml}
      ${footerHtml}
    </div>
  `;
}

function updateReceiptPreview() {
  const previewContainer = document.getElementById("receipt-preview-content");
  if (previewContainer) {
    previewContainer.innerHTML = renderReceiptPreview();
  }
}

// Store temporary logo URL for preview
let _tempLogoUrl = null;

function previewLogoFile(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      _tempLogoUrl = e.target.result;
      // Show preview in the upload area
      const previewContainer = document.getElementById("logo-preview-container");
      const previewImg = document.getElementById("logo-preview-img");
      const removeBtn = document.getElementById("remove-logo-btn");
      if (previewContainer && previewImg) {
        previewContainer.classList.remove("hidden");
        previewImg.src = _tempLogoUrl;
        previewImg.classList.remove("hidden");
      }
      if (removeBtn) {
        removeBtn.classList.remove("hidden");
      }
      // Update receipt preview with temporary logo
      updateReceiptPreview();
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function renderReceiptSettings() {
  const settings = _receiptSettings || {};
  const hasLogo = !!(settings.logo_path || settings.logo_data);
  const logoUrl = settings.logo_url || settings.logo_data || "";
  const images = settings.receipt_images || [];

  // Delay preview update until after render
  setTimeout(() => {
    updateReceiptPreview();
    renderPresetLists();
  }, 0);

  return `
    <div class="w-full animate-in fade-in slide-in-from-right-4 duration-500">
      <header class="mb-10">
        <span class="px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3 block w-fit">Receipt Customization</span>
        <h3 class="text-4xl font-black text-slate-950 dark:text-white uppercase tracking-tighter">Bill Receipt</h3>
        <p class="text-sm text-slate-500 lowercase italic mt-2">Personalize your customer receipts with your logo, contact details, and promotional content.</p>
      </header>

      <div class="flex flex-col xl:flex-row gap-8">
        <!-- Settings Form -->
        <div class="flex-1">
          <form id="receipt-settings-form" onsubmit="event.preventDefault(); saveReceiptSettings();" class="space-y-8">
        <!-- Logo Section -->
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
          <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Shop Logo / Header
          </h4>
          
          <div class="flex flex-col md:flex-row gap-6 items-start">
            <div class="flex-1 w-full">
              <div class="flex items-center gap-6 mb-6 pb-4 border-b border-slate-200/50 dark:border-slate-800/50">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="relative">
                    <input type="checkbox" id="use-text-on-receipt" ${settings.use_text_on_receipt !== false ? "checked" : ""} 
                           onchange="updateHeaderVisibility(); updateReceiptPreview();" class="peer sr-only">
                    <div class="w-10 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:bg-indigo-600 transition-all"></div>
                    <div class="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all shadow-sm"></div>
                  </div>
                  <span class="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 transition-colors">Show Text Header</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="relative">
                    <input type="checkbox" id="use-logo-on-receipt" ${settings.use_logo_on_receipt ? "checked" : ""} 
                           onchange="updateHeaderVisibility(); updateReceiptPreview();" class="peer sr-only">
                    <div class="w-10 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:bg-indigo-600 transition-all"></div>
                    <div class="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all shadow-sm"></div>
                  </div>
                  <span class="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 transition-colors">Show Logo Image</span>
                </label>
              </div>
              
              <div id="text-header-input" class="${settings.use_text_on_receipt === false ? "hidden" : "space-y-4 mb-6"}">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Shop Name on Receipt</label>
                  <input type="text" id="receipt-header-text" value="${settings.receipt_header_text || settings.name || ""}" 
                         placeholder="Your Shop Name" oninput="updateReceiptPreview()"
                         class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Extended Name / Tagline</label>
                  <input type="text" id="receipt-extended-name" value="${settings.receipt_extended_name || ""}" 
                         placeholder="e.g. Fine Dining or Wholesale & Retail" oninput="updateReceiptPreview()"
                         class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
                </div>
              </div>
              
              <div id="logo-upload-input" class="${!settings.use_logo_on_receipt ? "hidden" : ""}">
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Logo Image</label>
                <div class="flex flex-col gap-4">
                  <div id="logo-preview-container" class="${hasLogo ? "" : "hidden"}">
                    ${hasLogo ? `<img id="logo-preview-img" src="${logoUrl}" class="w-24 h-24 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white">` : `<img id="logo-preview-img" class="w-24 h-24 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white hidden">`}
                  </div>
                  <div class="flex-1">
                    <input type="file" id="logo-file" accept="image/*" onchange="previewLogoFile(this)" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-300">
                    <button type="button" id="remove-logo-btn" onclick="deleteLogo()" class="mt-2 text-xs text-rose-500 hover:text-rose-600 font-medium ${hasLogo ? "" : "hidden"}">Remove Logo</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Contact Details -->
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
          <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Contact Details
          </h4>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
              <input type="text" id="receipt-phone" value="${settings.receipt_phone || ""}" 
                     placeholder="+92 300 1234567" oninput="updateReceiptPreview()"
                     class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Address</label>
              <input type="text" id="receipt-address" value="${settings.receipt_address || ""}" 
                     placeholder="123 Main Street, City" oninput="updateReceiptPreview()"
                     class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
            </div>
          </div>
        </div>

        <!-- Promotional Images -->
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
          <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Additional Images (QR Code / Promotions)
          </h4>
          
          <div class="mb-6">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Upload Image</label>
            <div class="flex gap-4">
              <input type="file" id="receipt-image-file" accept="image/*" class="flex-1 block text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-300">
              <input type="text" id="receipt-image-desc" placeholder="Description (e.g., QR Code for payment)" 
                     class="flex-1 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
              <button type="button" onclick="addReceiptImage()" class="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all">Add</button>
            </div>
          </div>
          
          <div id="receipt-images-list" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${images.map(img => `
              <div class="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
                <img src="${img.path}" class="w-full h-24 object-contain">
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button type="button" onclick="deleteReceiptImage('${img.id}')" class="text-white text-xs font-bold bg-rose-500 hover:bg-rose-600 px-3 py-1 rounded-lg">Remove</button>
                </div>
                <p class="text-[10px] text-center text-slate-500 p-2 truncate">${img.description || ""}</p>
              </div>
            `).join("")}
          </div>
          ${images.length === 0 ? `<p class="text-sm text-slate-400 italic">No additional images added yet.</p>` : ""}
        </div>

        <!-- Shop Policies -->
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
          <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Shop Policies / Footer Text
          </h4>
          <textarea id="receipt-policies" rows="4" placeholder="Enter your shop policies, return policy, thank you message, etc. This will appear at the bottom of every receipt." oninput="updateReceiptPreview()"
                    class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all resize-none">${settings.receipt_policies || ""}</textarea>
        </div>

        <!-- Typography & Spacing -->
        <div class="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-[2rem] p-8 border border-indigo-200 dark:border-indigo-800">
          <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
            <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
            Typography & Spacing
          </h4>
          
          <div class="space-y-6">
            <!-- Global Font -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Global Receipt Font</h5>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Printer Font Family</label>
                <select id="receipt-font-family" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                  <option value="'Courier New', Courier, monospace" ${!settings.receipt_font_family || settings.receipt_font_family === "'Courier New', Courier, monospace" ? "selected" : ""}>Courier New (Classic POS)</option>
                  <option value="'bit array-a2', 'Courier New', monospace" ${settings.receipt_font_family === "'bit array-a2', 'Courier New', monospace" ? "selected" : ""}>Bit Array A2 / Dot Matrix</option>
                  <option value="monospace" ${settings.receipt_font_family === "monospace" ? "selected" : ""}>System Monospace</option>
                  <option value="Arial, sans-serif" ${settings.receipt_font_family === "Arial, sans-serif" ? "selected" : ""}>Arial (Thermal Clear)</option>
                  <option value="'Inter', sans-serif" ${settings.receipt_font_family === "'Inter', sans-serif" ? "selected" : ""}>Inter (Modern Smooth)</option>
                  <option value="'Roboto Mono', monospace" ${settings.receipt_font_family === "'Roboto Mono', monospace" ? "selected" : ""}>Roboto Mono</option>
                </select>
              </div>
            </div>

            <!-- Header Text Styling -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Header (Shop Name)</h5>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Font Size</label>
                  <input type="number" id="header-font-size" value="${settings.header_font_size || 18}" min="10" max="32" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Weight</label>
                  <select id="header-font-weight" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="normal" ${settings.header_font_weight === "normal" ? "selected" : ""}>Normal</option>
                    <option value="bold" ${!settings.header_font_weight || settings.header_font_weight === "bold" ? "selected" : ""}>Bold</option>
                    <option value="800" ${settings.header_font_weight === "800" ? "selected" : ""}>Extra Bold</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Spacing</label>
                  <input type="number" id="header-spacing" value="${settings.header_spacing || 10}" min="0" max="30" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
              </div>
            </div>

            <!-- Extended Name Styling -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Extended Name / Tagline</h5>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Font Size</label>
                  <input type="number" id="extended-name-font-size" value="${settings.extended_name_font_size || 10}" min="8" max="24" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Weight</label>
                  <select id="extended-name-font-weight" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="normal" ${!settings.extended_name_font_weight || settings.extended_name_font_weight === "normal" ? "selected" : ""}>Normal</option>
                    <option value="bold" ${settings.extended_name_font_weight === "bold" ? "selected" : ""}>Bold</option>
                    <option value="800" ${settings.extended_name_font_weight === "800" ? "selected" : ""}>Extra Bold</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Spacing</label>
                  <input type="number" id="extended-name-spacing" value="${settings.extended_name_spacing || 2}" min="0" max="20" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
              </div>
            </div>

            <!-- Contact Details Styling -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Contact Details (Phone/Address)</h5>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Font Size (px)</label>
                  <input type="number" id="contact-font-size" value="${settings.contact_font_size || 10}" min="8" max="16" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Align</label>
                  <select id="contact-align" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="left" ${settings.contact_align === "left" ? "selected" : ""}>Left</option>
                    <option value="center" ${!settings.contact_align || settings.contact_align === "center" ? "selected" : ""}>Center</option>
                    <option value="right" ${settings.contact_align === "right" ? "selected" : ""}>Right</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Padding (px)</label>
                  <input type="number" id="contact-padding" value="${settings.contact_padding || 10}" min="0" max="20" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
              </div>
            </div>

            <!-- Policies/Footer Styling -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Footer / Policies</h5>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Font Size (px)</label>
                  <input type="number" id="footer-font-size" value="${settings.footer_font_size || 9}" min="7" max="14" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Style</label>
                  <select id="footer-font-style" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="normal" ${!settings.footer_font_style || settings.footer_font_style === "normal" ? "selected" : ""}>Normal</option>
                    <option value="italic" ${settings.footer_font_style === "italic" ? "selected" : ""}>Italic</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Top Margin (px)</label>
                  <input type="number" id="footer-margin" value="${settings.footer_margin || 10}" min="0" max="30" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
              </div>
            </div>

            <!-- Section Dividers -->
            <div class="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Section Spacing</h5>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Line Style</label>
                  <select id="divider-style" onchange="updateReceiptPreview()" class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="dashed" ${!settings.divider_style || settings.divider_style === "dashed" ? "selected" : ""}>Dashed</option>
                    <option value="solid" ${settings.divider_style === "solid" ? "selected" : ""}>Solid</option>
                    <option value="dotted" ${settings.divider_style === "dotted" ? "selected" : ""}>Dotted</option>
                    <option value="none" ${settings.divider_style === "none" ? "selected" : ""}>None</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Line Width (px)</label>
                  <input type="number" id="divider-width" value="${settings.divider_width || 1}" min="0" max="3" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Gap (px)</label>
                  <input type="number" id="section-gap" value="${settings.section_gap || 10}" min="0" max="25" oninput="updateReceiptPreview()"
                         class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Taxes & Discounts Presets -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Discount Presets -->
          <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
            <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
              <svg class="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
              Discount Presets
            </h4>
            
            <div class="space-y-4 mb-6">
              <input id="preset-disc-name" type="text" placeholder="Preset Name (e.g. Eid Discount)" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
              <div class="flex gap-2">
                <select id="preset-disc-type" class="w-1/3 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                  <option value="percentage">Percentage (%)</option>
                  <option value="amount">Fixed Amount</option>
                </select>
                <input id="preset-disc-val" type="number" step="0.01" placeholder="Value" class="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                <button type="button" onclick="saveDiscountPreset()" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all">Add</button>
              </div>
            </div>

            <div id="discount-presets-list" class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <!-- Presets rendered here -->
            </div>
          </div>

          <!-- Tax Presets -->
          <div class="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800">
            <h4 class="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
              <svg class="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
              Tax Presets
            </h4>
            
            <div class="space-y-4 mb-6">
              <input id="preset-tax-name" type="text" placeholder="Tax Name (e.g. Card Tax)" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
              <div class="flex gap-2">
                <input id="preset-tax-pct" type="number" step="0.01" placeholder="Percent (%)" class="w-1/2 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                <select id="preset-tax-method" class="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                  <option value="">All Methods</option>
                  <option value="cash">Linked: Cash</option>
                  <option value="card">Linked: Card</option>
                  <option value="online">Linked: Online</option>
                </select>
                <button type="button" onclick="saveTaxPreset()" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all">Add</button>
              </div>
            </div>

            <div id="tax-presets-list" class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <!-- Presets rendered here -->
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex justify-end pt-4">
          <button type="submit" class="px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Save Receipt Settings
          </button>
        </div>
      </form>
        </div>

        <!-- Receipt Preview Panel -->
        <div class="xl:w-[420px] shrink-0">
          <div class="sticky top-24 bg-slate-100 dark:bg-slate-800/50 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700">
            <h4 class="text-sm font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Live Preview
            </h4>
            <div id="receipt-preview-content" class="overflow-auto max-h-[800px] rounded-xl bg-slate-200 dark:bg-slate-900 p-3">
              <!-- Preview rendered here -->
            </div>
            <p class="text-[10px] text-slate-400 mt-3 text-center">Preview updates as you type</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateHeaderVisibility() {
  const showText = document.getElementById("use-text-on-receipt")?.checked;
  const showLogo = document.getElementById("use-logo-on-receipt")?.checked;
  const textInput = document.getElementById("text-header-input");
  const logoInput = document.getElementById("logo-upload-input");

  if (textInput) {
    if (showText) textInput.classList.remove("hidden");
    else textInput.classList.add("hidden");
  }

  if (logoInput) {
    if (showLogo) logoInput.classList.remove("hidden");
    else logoInput.classList.add("hidden");
  }
}

// Keep old function for compatibility if called elsewhere but point to new logic
function toggleLogoType(type) {
  updateHeaderVisibility();
}

async function saveReceiptSettings() {
  try {
    const formData = new FormData();
    formData.append("use_logo_on_receipt", document.getElementById("use-logo-on-receipt")?.checked ? "true" : "false");
    formData.append("use_text_on_receipt", document.getElementById("use-text-on-receipt")?.checked ? "true" : "false");

    // Text fields
    const headerText = document.getElementById("receipt-header-text")?.value || "";
    const extendedName = document.getElementById("receipt-extended-name")?.value || "";
    const phone = document.getElementById("receipt-phone")?.value || "";
    const address = document.getElementById("receipt-address")?.value || "";
    const policies = document.getElementById("receipt-policies")?.value || "";

    formData.append("receipt_header_text", headerText);
    formData.append("receipt_extended_name", extendedName);
    formData.append("receipt_phone", phone);
    formData.append("receipt_address", address);
    formData.append("receipt_policies", policies);

    // Typography settings
    formData.append("receipt_font_family", document.getElementById("receipt-font-family")?.value || "'Courier New', Courier, monospace");
    formData.append("header_font_size", document.getElementById("header-font-size")?.value || "18");
    formData.append("header_font_weight", document.getElementById("header-font-weight")?.value || "bold");
    formData.append("header_spacing", document.getElementById("header-spacing")?.value || "10");
    formData.append("extended_name_font_size", document.getElementById("extended-name-font-size")?.value || "10");
    formData.append("extended_name_font_weight", document.getElementById("extended-name-font-weight")?.value || "normal");
    formData.append("extended_name_spacing", document.getElementById("extended-name-spacing")?.value || "2");
    formData.append("contact_font_size", document.getElementById("contact-font-size")?.value || "10");
    formData.append("contact_align", document.getElementById("contact-align")?.value || "center");
    formData.append("contact_padding", document.getElementById("contact-padding")?.value || "10");
    formData.append("footer_font_size", document.getElementById("footer-font-size")?.value || "9");
    formData.append("footer_font_style", document.getElementById("footer-font-style")?.value || "normal");
    formData.append("footer_margin", document.getElementById("footer-margin")?.value || "10");
    formData.append("divider_style", document.getElementById("divider-style")?.value || "dashed");
    formData.append("divider_width", document.getElementById("divider-width")?.value || "1");
    formData.append("section_gap", document.getElementById("section-gap")?.value || "10");

    // Logo file
    const logoFile = document.getElementById("logo-file")?.files[0];
    if (logoFile) {
      const compressedData = await compressImage(logoFile, 400, 400, 0.7);
      formData.append("logo_data", compressedData);
    }

    const res = await fetch("/api/shop-settings", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      toast(data.error, "error");
      return;
    }

    toast("Receipt settings saved successfully!");
    _tempLogoUrl = null; // Clear temporary logo after save
    await fetchReceiptSettings();
    renderSettings("receipt");
  } catch (e) {
    console.error("Save receipt settings error:", e);
    toast("Failed to save settings", "error");
  }
}

async function deleteLogo() {
  if (!confirm("Remove logo and use text header instead?")) return;

  // Clear temporary logo preview
  _tempLogoUrl = null;
  document.getElementById("logo-file").value = "";

  // Check if there's a saved logo to delete
  if (!_receiptSettings?.logo_path && !_receiptSettings?.logo_data) {
    // No saved logo, just clear the preview
    const previewContainer = document.getElementById("logo-preview-container");
    const previewImg = document.getElementById("logo-preview-img");
    const removeBtn = document.getElementById("remove-logo-btn");
    if (previewContainer) previewContainer.classList.add("hidden");
    if (previewImg) previewImg.classList.add("hidden");
    if (removeBtn) removeBtn.classList.add("hidden");
    updateReceiptPreview();
    return;
  }

  try {
    const res = await fetch("/api/shop-settings/logo", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete logo");

    toast("Logo removed");
    await fetchReceiptSettings();
    renderSettings("receipt");
  } catch (e) {
    toast("Failed to remove logo", "error");
  }
}

async function addReceiptImage() {
  const fileInput = document.getElementById("receipt-image-file");
  const descInput = document.getElementById("receipt-image-desc");

  if (!fileInput.files[0]) {
    toast("Please select an image", "error");
    return;
  }

  try {
    const formData = new FormData();
    const compressedData = await compressImage(fileInput.files[0], 400, 400, 0.7);
    formData.append("logo_data", compressedData);
    formData.append("description", descInput.value || "");

    const res = await fetch("/api/shop-settings/images", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      toast(data.error, "error");
      return;
    }

    toast("Image added successfully!");
    fileInput.value = "";
    descInput.value = "";
    await fetchReceiptSettings();
    renderSettings("receipt");
  } catch (e) {
    console.error("Add image error:", e);
    toast("Failed to add image", "error");
  }
}

async function deleteReceiptImage(imageId) {
  if (!confirm("Remove this image from receipts?")) return;

  try {
    const res = await fetch(`/api/shop-settings/images/${imageId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete image");

    toast("Image removed");
    await fetchReceiptSettings();
    renderSettings("receipt");
  } catch (e) {
    toast("Failed to remove image", "error");
  }
}

// ... existing logic ...

function updateLowStockBadge(productsArray) {
  const lowItems = productsArray.filter((p) => {
    const isRecipe = p.ingredients && p.ingredients.length > 0;
    return !isRecipe && p.stock <= p.min_stock_level;
  });
  const countSpan = $c("low-stock-count");
  if (countSpan) {
    if (lowItems.length > 0) {
      countSpan.textContent = lowItems.length;
      countSpan.classList.remove("hidden");
    } else {
      countSpan.classList.add("hidden");
    }
  }
}

function updatePendingDuesBadge(salesArray) {
  const pendingSales = salesArray.filter(
    (s) => s.total - s.amount_received > 0,
  );
  const countSpan = $c("pending-dues-count");
  if (countSpan) {
    if (pendingSales.length > 0) {
      countSpan.textContent = pendingSales.length;
      countSpan.classList.remove("hidden");
    } else {
      countSpan.classList.add("hidden");
    }
  }
}



function openModal(title, bodyHtml, sizeClass = "max-w-lg", isStatic = false) {
  const modal = document.getElementById("modal");
  const closeBtn = modal.querySelector('button[onclick="closeModal()"]');

  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-box").className =
    `glass rounded-2xl w-full shadow-xl transition-all overflow-y-auto max-h-[85vh] custom-scrollbar ${sizeClass}`;

  if (isStatic) {
    if (closeBtn) closeBtn.classList.add("hidden");
    modal.dataset.static = "true";
  } else {
    if (closeBtn) closeBtn.classList.remove("hidden");
    delete modal.dataset.static;
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  $c("modal").classList.add("hidden");
}

// Click outside to close modal (if not static)
document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this && this.dataset.static !== "true") {
    closeModal();
  }
});

function escapeCardInfo(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statInfoIcon(info) {
  if (!info) return "";
  const safeInfo = escapeCardInfo(info);

  return `
    <span class="relative inline-flex group/info shrink-0">
      <button type="button" aria-label="${safeInfo}" class="w-5 h-5 rounded-full border border-slate-300/60 dark:border-slate-700 bg-white/70 dark:bg-slate-950/50 text-current opacity-70 hover:opacity-100 hover:bg-white dark:hover:bg-slate-900 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-slate-400/30">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 17v-6m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </button>
      <span role="tooltip" class="pointer-events-none absolute right-0 top-7 z-[80] w-64 rounded-xl bg-slate-950 text-white text-[11px] font-semibold leading-relaxed shadow-2xl border border-slate-800 px-3 py-2 opacity-0 translate-y-1 group-hover/info:opacity-100 group-hover/info:translate-y-0 group-focus-within/info:opacity-100 group-focus-within/info:translate-y-0 transition-all duration-150 normal-case tracking-normal">
        ${safeInfo}
      </span>
    </span>
  `;
}

function statCard(label, value, sub, color = "blue", info = "") {
  const themes = {
    blue: {
      light: "bg-blue-50 border-blue-200",
      dark: "dark:bg-blue-950/30 dark:border-blue-800",
      label: "text-blue-700 dark:text-blue-300",
      val: "text-blue-900 dark:text-white",
    },
    emerald: {
      light: "bg-emerald-50 border-emerald-200",
      dark: "dark:bg-emerald-950/30 dark:border-emerald-800",
      label: "text-emerald-700 dark:text-emerald-300",
      val: "text-emerald-900 dark:text-white",
    },
    rose: {
      light: "bg-rose-50 border-rose-200",
      dark: "dark:bg-rose-950/30 dark:border-rose-800",
      label: "text-rose-700 dark:text-rose-300",
      val: "text-rose-900 dark:text-white",
    },
    amber: {
      light: "bg-amber-50 border-amber-200",
      dark: "dark:bg-amber-950/30 dark:border-amber-800",
      label: "text-amber-700 dark:text-amber-300",
      val: "text-amber-900 dark:text-white",
    },
    purple: {
      light: "bg-purple-50 border-purple-200",
      dark: "dark:bg-purple-950/30 dark:border-purple-800",
      label: "text-purple-700 dark:text-purple-300",
      val: "text-purple-900 dark:text-white",
    },
  };
  const t = themes[color] || themes.blue;
  return `<div class="rounded-2xl p-6 border ${t.light} ${t.dark} shadow-sm transition-all duration-300">
    <div class="flex items-start justify-between gap-2 mb-2 ${t.label}">
      <div class="text-xs font-semibold uppercase tracking-wider">${label}</div>
      ${statInfoIcon(info)}
    </div>
    <div class="text-3xl font-bold ${t.val} mb-1 leading-tight">${value}</div>
    ${sub ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${sub}</div>` : ""}
  </div>`;
}


// ─── Users (Admin) ────────────────────────────────────────────────────
async function renderUsers() {
  const users = await api("/api/users");
  const isMaster = currentUser.role === "superadmin";

  // ── Shop Admin: Card view (read + edit only, no create/delete) ──
  if (!isMaster) {
    const ROLE_COLORS = {
      admin: {
        bg: "bg-gradient-to-br from-indigo-600 to-violet-700",
        badge: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      },
      pos_user: {
        bg: "bg-gradient-to-br from-emerald-500 to-teal-600",
        badge: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      },
      manager: {
        bg: "bg-gradient-to-br from-amber-500 to-orange-600",
        badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
      },
    };
    const getColor = (role) =>
      ROLE_COLORS[role] || {
        bg: "bg-gradient-to-br from-slate-400 to-slate-600",
        badge: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
      };

    const cardsHtml = users
      .map((u) => {
        const initials = (u.name || u.username)
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        const { bg, badge } = getColor(u.role);
        const isActive = !u.status || u.status === "active";
        return `
        <div onclick='openUserAccess(${JSON.stringify(u).replace(/'/g, "&apos;")})' class="group relative bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center text-center gap-6 hover:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.12)] hover:-translate-y-2 transition-all duration-700 cursor-pointer overflow-hidden">
          
          <!-- Background Decor -->
          <div class="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-700"></div>
          
          <div class="relative">
             <div class="w-24 h-24 rounded-[2.5rem] ${bg} p-0.5 shadow-2xl relative overflow-hidden">
                <div class="w-full h-full rounded-[2.4rem] flex items-center justify-center text-white text-4xl font-black bg-white/10 backdrop-blur-sm border border-white/20">
                  ${initials}
                </div>
             </div>
             <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl ${isActive ? 'bg-emerald-500' : 'bg-rose-500'} border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-lg">
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isActive ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}"/></svg>
             </div>
          </div>

          <div class="relative z-10">
            <h4 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight line-clamp-1">${u.name}</h4>
            <p class="text-xs font-bold text-slate-400 tracking-[0.2em] uppercase mt-1">@${u.username}</p>
          </div>

          <div class="px-5 py-2 rounded-2xl ${badge} text-[9px] font-black uppercase tracking-[0.25em] shadow-sm relative z-10 transition-transform group-hover:scale-110">
            ${u.role.replace("_", " ")}
          </div>

          <div class="mt-2 w-full pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <span class="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-2">
              Manage Access
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </span>
          </div>
          
          <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-white/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 pointer-events-none transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></div>
        </div>`;
      })
      .join("");

    $c("page-content").innerHTML = `
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-3">
             <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
             Team Management
          </span>
          <h3 class="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Staff Directory</h3>
          <p class="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Manage ${users.length} verified operators in your shop</p>
        </div>
        ${isMaster ? `
        <button onclick="openCreateUser()" class="h-14 px-8 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-3">
          <div class="w-6 h-6 rounded-lg bg-white/20 dark:bg-slate-900/10 flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          </div>
          Add New Member
        </button>
        ` : ''}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-32">
        ${cardsHtml || `<div class="col-span-full py-24 text-center text-gray-400 italic">No staff members found.</div>`}
      </div>`;
    return;
  }

  // ── Superadmin: full table view ──
  const shopsRes = await api("/api/shops");
  shops = Array.isArray(shopsRes) ? shopsRes : [];

  $c("page-content").innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-slate-400 text-sm">${users.length} user(s)</p>
      <button onclick="openCreateUser()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">+ Create User</button>
    </div>
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-200 dark:border-slate-800 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Username</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Access</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
          <th class="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${users
      .map(
        (u) => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
              <td class="px-5 py-4 font-medium text-slate-700 dark:text-slate-200">${u.name}</td>
              <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">${u.shop_name || '<span class="italic text-slate-400">System</span>'}</td>
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400">@${u.username}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-center justify-center min-w-[60px] ${u.role === "superadmin" ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30" : u.role === "admin" ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}">
                  ${u.role.toUpperCase().replace("_", " ")}
                </span>
              </td>
              <td class="px-5 py-4">
                <div class="flex flex-wrap gap-1 max-w-[200px]">
                  ${(u.allowed_panels || []).map(pid => `<span class="bg-slate-100 dark:bg-slate-800 text-[8px] font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">${pid}</span>`).join('') || '<span class="text-[8px] text-slate-400">Default</span>'}
                </div>
              </td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-center justify-center min-w-[60px] ${u.status === "active" || !u.status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}">
                  ${(u.status || "active").toUpperCase()}
                </span>
              </td>
              <td class="px-5 py-4 text-right space-x-1">
                <button onclick="openEditUser(${u.id},'${(u.name || "").replace(/'/g, "\\'")}','${u.username}','${u.email || ""}','${u.phone || ""}','${u.role}', ${JSON.stringify(u.allowed_panels).replace(/"/g, "&quot;")}, ${u.shop_id}, '${u.status || "active"}', ${!!u.can_manage_register})" class="px-2 py-1 text-xs rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-all">Edit</button>
                ${u.id !== currentUser.id
            ? `
                  <button onclick="deleteUser(${u.id})" class="px-2 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-rose-700 dark:text-rose-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all">Del</button>
                `
            : ""
          }
              </td>
            </tr>`,
      )
      .join("")}
        </tbody>
      </table>
    </div>`;
}

function userFormHtml(u = {}) {
  const isMaster = currentUser.role === "superadmin";

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="sm:col-span-2 lg:col-span-1">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Full Name *</label>
          <input id="uf-name" value="${u.name || ""}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Full name" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Username *</label>
          <input id="uf-username" value="${u.username || ""}" ${u.id && !isMaster ? "readonly" : ""} class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm ${u.id && !isMaster ? "opacity-50 cursor-not-allowed" : ""}" placeholder="username" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">New Password ${u.id ? "(Optional)" : "*"}</label>
          <input id="uf-password" type="password" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm font-bold" placeholder="••••••••" />
        </div>
        <div class="${!isMaster ? "hidden" : ""}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Phone</label>
          <input id="uf-phone" value="${u.phone || ""}" ${!isMaster ? "readonly" : ""} class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="03xx-xxxxxxx" />
        </div>
        <div class="${!isMaster ? "hidden" : ""}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Email</label>
          <input id="uf-email" value="${u.email || ""}" ${!isMaster ? "readonly" : ""} type="email" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="user@example.com" />
        </div>
        ${u.role === "superadmin" || !isMaster
      ? `<input type="hidden" id="uf-role" value="${u.role || "pos_user"}" />`
      : `
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Role</label>
          <select id="uf-role" onchange="toggleUserPanelPicker(this.value)" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="user" ${u.role === "user" ? "selected" : ""}>General Staff</option>
            <option value="pos_user" ${u.role === "pos_user" ? "selected" : ""}>POS Operator</option>
            <option value="waiter" ${u.role === "waiter" ? "selected" : ""}>Waiter / Server</option>
            <option value="rider" ${u.role === "rider" ? "selected" : ""}>Rider / Delivery</option>
            <option value="kitchen" ${u.role === "kitchen" ? "selected" : ""}>Kitchen Terminal</option>
            <option value="manager" ${u.role === "manager" ? "selected" : ""}>Manager</option>
            <option value="receptionist" ${u.role === "receptionist" ? "selected" : ""}>Receptionist</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin / Shop Owner</option>
          </select>
        </div>
        `
    }
        <div class="${u.role === "superadmin" || !isMaster ? "hidden" : ""}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Status</label>
          <select id="uf-status" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="active" ${u.status === "active" || !u.status ? "selected" : ""}>Active</option>
            <option value="blocked" ${u.status === "blocked" ? "selected" : ""}>Blocked</option>
          </select>
        </div>
        ${u.role === "superadmin" || !isMaster
      ? `<input type="hidden" id="uf-shop" value="${u.shop_id || ""}" /><input type="hidden" id="uf-status" value="${u.status || "active"}" />`
      : `
        <div class="sm:col-span-2">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Assign Shop</label>
          <select id="uf-shop" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            ${shops.map((s) => `<option value="${s.id}" ${u.shop_id === s.id ? "selected" : ""}>${s.name}</option>`).join("")}
          </select>
        </div>
        `
    }
    ${u.role === "superadmin" || !isMaster
      ? ""
      : `
        <div class="sm:col-span-2 lg:col-span-3" id="uf-panels-container" style="display: ${u.role === "admin" ? "none" : "block"}">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-3 font-bold uppercase tracking-wider">Allowed Panels (Inherited from Shop)</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3" id="panel-picker">
            ${AVAILABLE_PANELS.map(
        (p) => `
              <div class="user-panel-tile cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group ${u.allowed_panels?.includes(p.id) ? "border-indigo-50 border-indigo-500 dark:bg-indigo-900/20" : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"}"
                   onclick="this.dataset.selected = this.dataset.selected === 'true' ? 'false' : 'true'; this.classList.toggle('border-indigo-500'); this.classList.toggle('bg-indigo-50/50'); this.classList.toggle('dark:bg-indigo-900/20')"
                   data-id="${p.id}" data-selected="${u.allowed_panels?.includes(p.id)}">
                <div class="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                  <svg class="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p.icon}"></path></svg>
                </div>
                <span class="text-[9px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-400 text-center">${p.label}</span>
              </div>
            `,
      ).join("")}
          </div>
        </div>
        `
    }
        <div class="sm:col-span-2 lg:col-span-3 pt-6 border-t border-slate-100 dark:border-slate-800">
          <label class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              </div>
              <div>
                <p class="text-sm font-bold text-slate-800 dark:text-slate-100">Register Management</p>
                <p class="text-[10px] text-slate-500 font-medium tracking-tight">Allow this user to start shifts and manage cash drawer</p>
              </div>
            </div>
            <div class="relative">
              <input type="checkbox" id="uf-can-manage-register" ${u.can_manage_register ? "checked" : ""} class="peer sr-only">
              <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-indigo-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
            </div>
          </label>
        </div>
      </div>
    </div>
  `;
}
function toggleUserPanelPicker(role) {
  const container = document.getElementById("uf-panels-container");
  if (container) {
    container.style.display = role === "admin" ? "none" : "block";
  }
}

// ─── Shop Management Helpers ──────────────────────────────────────────
function allPanels() {
  return [
    { id: "dashboard", name: "Main Dashboard", icon: "📊", panels: ["dashboard"] },
    { id: "pos", name: "POS Terminal", icon: "🛒", panels: ["pos", "product-categories", "expense-categories"] },
    { id: "sales-history", name: "Sales History", icon: "📜", panels: ["sales-history", "pending-dues"] },
    { id: "products", name: "Products & Menu", icon: "📦", panels: ["products", "brands"] },
    { id: "customers", name: "Customer Ledger", icon: "👥", panels: ["customers"] },
    { id: "notifications", name: "Notifications", icon: "N", panels: ["notifications"] },
    { id: "analytics", name: "Analytics & Reports", icon: "📈", panels: ["analytics"] },
    { id: "logs", name: "Logs", icon: "🧾", panels: ["logs"] },
    { id: "raw-stock", name: "Raw Stock (Inv)", icon: "🥦", panels: ["raw-stock"] },
    { id: "waste-management", name: "Waste Management", icon: "🗑️", panels: ["waste-management"] },
    { id: "recipes", name: "Recipes & Formulas", icon: "🧪", panels: ["recipes"] },
    { id: "expenses", name: "Expense Tracker", icon: "💸", panels: ["expenses"] },
    { id: "tables", name: "Table Management", icon: "🪑", panels: ["tables"] },
    { id: "kds", name: "Kitchen Display", icon: "👨‍🍳", panels: ["kds"] },
    { id: "composite_products", name: "Combo Kits", icon: "🍱", panels: ["composite_products"] },
    { id: "subscriptions", name: "Subscriptions", icon: "💳", panels: ["subscriptions"] },
  ];
}

function togglePanel(el) {
  const isSelected = el.dataset.selected === "true";
  const next = !isSelected;
  el.dataset.selected = next;

  if (next) {
    el.classList.add(
      "bg-indigo-600",
      "border-indigo-600",
      "text-white",
      "shadow-lg",
      "shadow-indigo-600/20",
    );
    el.classList.remove(
      "bg-white",
      "dark:bg-slate-800",
      "border-slate-200",
      "dark:border-slate-700",
      "text-slate-600",
      "dark:text-slate-400",
    );
  } else {
    el.classList.remove(
      "bg-indigo-600",
      "border-indigo-600",
      "text-white",
      "shadow-lg",
      "shadow-indigo-600/20",
    );
    el.classList.add(
      "bg-white",
      "dark:bg-slate-800",
      "border-slate-200",
      "dark:border-slate-700",
      "text-slate-600",
      "dark:text-slate-400",
    );
  }
}

function openCreateUser(shopId = null, defaultRole = 'user') {
  openModal(
    "Create User",
    userFormHtml({ shop_id: shopId, role: defaultRole }) +
    `<button onclick="saveUser()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Create User</button>`,
    "max-w-2xl",
  );
}

function openEditUser(
  id,
  name,
  username,
  email,
  phone,
  role,
  allowed_panels,
  shop_id,
  status,
  can_manage_register
) {
  openModal(
    "Edit User",
    userFormHtml({
      id,
      name,
      username,
      email,
      phone,
      role,
      allowed_panels,
      shop_id,
      status,
      can_manage_register
    }) +
    `<button onclick="saveUser(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update User</button>`,
    "max-w-2xl",
  );
}

async function saveUser(id) {
  const payload = {
    name: $c("uf-name").value.trim(),
    username: $c("uf-username").value.trim(),
    password: $c("uf-password").value,
    phone: $c("uf-phone").value.trim(),
    email: $c("uf-email").value.trim(),
    role: $c("uf-role").value,
    status: $c("uf-status").value,
    shop_id: $c("uf-shop").value,
    can_manage_register: document.getElementById("uf-can-manage-register")?.checked || false,
    allowed_panels:
      $c("uf-role").value === "admin"
        ? []
        : Array.from(
            document.querySelectorAll('.user-panel-tile[data-selected="true"]'),
          ).map((el) => el.dataset.id),
  };
  if (!payload.name) return toast("Name required", "error");
  if (!id && !payload.password)
    return toast("Password required for new user", "error");
  const r = id
    ? await api(`/api/users/${id}`, "PUT", payload)
    : await api("/api/users", "POST", payload);
  if (r.error) return toast(r.error, "error");
  closeModal();
  toast("User saved!");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderUsers();
  }
}

async function deleteUser(id) {
  if (!confirm("Delete this user? All their data will be removed.")) return;
  const r = await api(`/api/users/${id}`, "DELETE");
  if (r.error) return toast(r.error, "error");
  toast("User deleted");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderUsers();
  }
}

async function openEditBrandPayments(brandId, month) {
  const payments = await api(`/api/brands/expense-payments?month=${month}`);
  const brandPayments = payments.filter((p) => p.brand_id === brandId);

  if (brandPayments.length === 0) {
    return toast("No payments found for this brand in " + month, "info");
  }

  openModal(
    "Edit Payments",
    `
    <div class="space-y-4">
      <p class="text-xs text-gray-500 lowercase italic">Editing payments for brand in ${month}.</p>
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        ${brandPayments
      .map(
        (p) => `
          <div class="py-3 flex items-center justify-between group">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] text-gray-400 font-mono">${new Date(p.created_at).toLocaleDateString()}</span>
                <span class="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase tracking-tighter">By ${p.admin_name || 'System'}</span>
              </div>
              <input id="edit-bep-amt-${p.id}" type="number" value="${p.amount}" class="w-32 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all" />
            </div>
            <button onclick="doUpdateBrandPayment(${p.id})" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95">Update</button>
          </div>
        `,
      )
      .join("")}
      </div>
    </div>
  `,
  );
}

async function doUpdateBrandPayment(paymentId) {
  const input = document.getElementById("edit-bep-amt-" + paymentId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");

  const r = await api(`/api/brands/expense-payments/${paymentId}`, "PUT", {
    amount,
  });
  if (r.error) return toast(r.error, "error");

  toast("Payment updated!");
  closeModal();
  renderExpenses();
}

async function openExpensesHistory() {
  const allExpenses = await api("/api/expenses");

  // Group by month
  const monthsMap = {};
  allExpenses.forEach((e) => {
    const m = e.date.slice(0, 7);
    if (!monthsMap[m]) monthsMap[m] = 0;
    monthsMap[m] += Number(e.amount);
  });

  const sortedMonths = Object.keys(monthsMap).sort((a, b) =>
    b.localeCompare(a),
  );

  openModal(
    "Expenses History",
    `
    <div class="space-y-4">
      <p class="text-sm text-slate-500 mb-2">View or download PDF reports for previous months.</p>
      <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        ${sortedMonths
      .map(
        (m) => `
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:shadow-md transition-all group">
            <div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span class="font-bold text-slate-800 dark:text-slate-100 text-base">${new Date(m + "-01").toLocaleDateString("default", { month: "long", year: "numeric" })}</span>
              </div>
              <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-semibold ml-4">Total Monthly Expenses: Rs. ${monthsMap[m].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.open('/api/brands/pdf/monthly-report?month=${m}', '_blank')" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 transition-all border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900" title="View PDF">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${m}&download=true'" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 transition-all border border-transparent hover:border-amber-200 dark:hover:border-amber-900" title="Download PDF">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              </button>
              <div class="w-px h-6 bg-slate-100 dark:bg-slate-800 mx-1"></div>
              <button onclick="_expenseMonth='${m}'; _expensePage=1; closeModal(); renderExpenses();" class="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all active:scale-95 shadow-sm">
                Open Month
              </button>
            </div>
          </div>
        `,
      )
      .join("")}
      </div>
    </div>
  `,
    "max-w-3xl",
  );
}

async function openViewExpenses(month) {
  const allExpenses = await api("/api/expenses");
  const filtered = allExpenses.filter((e) => e.date.startsWith(month));

  openModal(
    "Monthly Report: " + month,
    `
    <div class="space-y-6">
      <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h4 class="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3 uppercase tracking-widest text-[#1e1e1e] dark:text-[#f3f4f6]">1. Operating Expenses</h4>
        ${filtered.length === 0
      ? '<p class="text-xs text-gray-500 italic">No expenses found for this month.</p>'
      : `
        <div class="max-h-[60vh] overflow-y-auto">
          <table class="w-full text-xs text-left">
            <thead>
              <tr class="text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/80 sticky top-0 z-10">
                <th class="py-2 px-3 font-semibold">Title</th>
                <th class="py-2 px-3 font-semibold">Date</th>
                <th class="py-2 px-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              ${filtered
        .map(
          (e) => `
                <tr class="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <td class="py-2 px-3 text-gray-700 dark:text-gray-300">${e.title}</td>
                  <td class="py-2 px-3 text-gray-500">${e.date}</td>
                  <td class="py-2 px-3 text-right font-bold text-gray-800 dark:text-gray-200">Rs. ${e.amount.toLocaleString()}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
            <tfoot>
              <tr class="bg-indigo-50 dark:bg-indigo-900/20 font-bold text-indigo-700 dark:text-indigo-400">
                <td colspan="2" class="py-2 px-3 text-right">Total Expenses:</td>
                <td class="py-2 px-3 text-right">Rs. ${filtered.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
    }
      </div>
    </div>
  `,
    "max-w-4xl",
  );
}

async function openBulkEditExpenses(month) {
  const allExpenses = await api("/api/expenses");
  const filtered = allExpenses.filter((e) => e.date.startsWith(month));

  if (filtered.length === 0)
    return toast("No expenses found for " + month, "info");

  openModal(
    "Bulk Edit: " + month,
    `
    <div class="space-y-4">
      <p class="text-xs text-gray-500 italic lowercase">Editing all operating expenses for ${month}.</p>
      <div class="max-h-[60vh] overflow-y-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <th class="px-2 py-2">Title</th>
              <th class="px-2 py-2">Cat</th>
              <th class="px-2 py-2 text-right">Amount</th>
              <th class="px-2 py-2">Date</th>
            </tr>
          </thead>
          <tbody id="bulk-exp-tbody">
            ${filtered
      .map(
        (e) => `
              <tr class="border-b border-gray-50 dark:border-gray-900/50" data-id="${e.id}">
                <td class="py-2 px-1"><input class="title w-full bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-gray-800 dark:text-gray-200" value="${e.title}" /></td>
                <td class="py-2 px-1">
                  <select class="category bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-xs">
                    ${_expenseCategories.map((cat) => `<option value="${cat.name}" ${e.category === cat.name ? "selected" : ""}>${cat.emoji} ${cat.name}</option>`).join("")}
                  </select>
                </td>
                <td class="py-2 px-1"><input class="amount w-24 bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 font-bold text-right" type="number" value="${e.amount}" /></td>
                <td class="py-2 px-1"><input class="date w-28 bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded p-1 text-[10px]" type="date" value="${e.date}" /></td>
                <input type="hidden" class="note" value="${e.note || ""}" />
              </tr>
            `,
      )
      .join("")}
          </tbody>
        </table>
      </div>
      <button onclick="doBulkUpdateExpenses()" class="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition-all active:scale-[0.98]">Save All Changes</button>
    </div>
  `,
    "max-w-4xl",
  );
}

async function doBulkUpdateExpenses() {
  const rows = document.querySelectorAll("#bulk-exp-tbody tr");
  const expenses = [];
  rows.forEach((row) => {
    expenses.push({
      id: parseInt(row.dataset.id),
      title: row.querySelector(".title").value.trim(),
      category: row.querySelector(".category").value,
      amount: parseFloat(row.querySelector(".amount").value),
      date: row.querySelector(".date").value,
      note: row.querySelector(".note").value,
    });
  });

  const r = await api("/api/expenses/bulk", "PUT", { expenses });
  if (r.error) return toast(r.error, "error");

  toast("Success! Month updated.");
  closeModal();
  renderExpenses();
}

// ─── Shop Management ─────────────────────────────────────────────
async function renderShops() {
  const res = await fetch("/api/shops");
  shops = await res.json();

  $c("page-content").innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Shop Management</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Manage system-wide stores and shops</p>
        </div>
        <button onclick="openCreateShop()" class="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Add New Shop
        </button>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">ID</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Shop Name</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Allotted Panels</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
              ${shops
      .map(
        (s) => `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">#${s.id}</td>
                <td class="px-5 py-4 text-sm font-semibold text-slate-800 dark:text-white">${s.name}</td>
                <td class="px-5 py-4">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"}">
                    ${s.status}
                  </span>
                </td>
                <td class="px-5 py-4 transition-all">
                  <div class="flex flex-wrap gap-1">
                    ${s.allowed_panels.map((p) => `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tabular-nums">${p}</span>`).join("")}
                    ${s.allowed_panels.length === 0 ? '<span class="text-[9px] italic text-slate-400">No panels allotted</span>' : ""}
                  </div>
                </td>
                <td class="px-5 py-4 text-right space-x-2">
                  ${s.allowed_panels.includes("brands") ? `<button onclick="renderBrands(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-all font-medium">Manage Brands</button>` : ""}
                  <button onclick="openEditShop(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 transition-all font-medium">Edit</button>
                  <button onclick="deleteShop(${s.id})" class="px-3 py-1 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-rose-700 dark:text-rose-400 hover:bg-red-200 transition-all font-medium">Delete</button>
                </td>
              </tr>`,
      )
      .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ─── Subscriptions ──────────────────────────────────────────────
let _subscriptionShopsCache = [];
let _subscriptionLogsCache = [];
let _subscriptionSelectedShopId = null;

function subscriptionTypeLabel(type) {
  const typeLabel = {
    "1_month": "1 Month",
    "3_months": "3 Months",
    "6_months": "6 Months",
    "1_year": "1 Year",
    "2_years": "2 Years",
    lifetime: "Lifetime",
  };
  return typeLabel[type] || type || "-";
}

function subscriptionEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatSubscriptionDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).split("T")[0];
  return date.toLocaleDateString("en-GB");
}

function latestSubscriptionForShop(shopId) {
  const logs = _subscriptionLogsCache
    .filter((s) => Number(s.shop_id) === Number(shopId))
    .sort((a, b) => new Date(b.end_date || b.paid_at || 0) - new Date(a.end_date || a.paid_at || 0));
  return logs[0] || null;
}

async function loadSubscriptionData() {
  const [shopsData, subsData] = await Promise.all([
    api("/api/shops"),
    api("/api/subscriptions"),
  ]);
  _subscriptionShopsCache = Array.isArray(shopsData) ? shopsData : [];
  _subscriptionLogsCache = Array.isArray(subsData) ? subsData : [];
}

async function renderSubscriptions() {
  _subscriptionSelectedShopId = null;
  await loadSubscriptionData();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  $c("page-content").innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Subscription Management</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Select a shop to view all subscription payment logs</p>
        </div>
        <button onclick="openRecordPayment()" class="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Record Payment
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        ${_subscriptionShopsCache.map((shop) => {
          const shopId = Number(shop.id);
          if (!Number.isFinite(shopId)) return "";
          const shopName = subscriptionEscapeHtml(shop.name || `Shop #${shopId}`);
          const logs = _subscriptionLogsCache.filter((s) => Number(s.shop_id) === shopId);
          const latest = latestSubscriptionForShop(shopId);
          const totalPaid = logs.reduce((sum, s) => sum + Number(s.amount || 0), 0);
          const endDate = latest?.end_date ? new Date(latest.end_date) : null;
          const isValid = latest?.type === "lifetime" || (endDate && endDate >= today);
          const statusClass = isValid
            ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
            : "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20";
          const latestPlan = latest ? subscriptionEscapeHtml(subscriptionTypeLabel(latest.type)) : "No Payment";
          const validityText = latest
            ? `${formatSubscriptionDate(latest.start_date)} to ${formatSubscriptionDate(latest.end_date)}`
            : "No subscription record yet";

          return `
            <button onclick="renderSubscriptionShop(${shopId})" class="text-left p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500 transition-all shadow-sm hover:shadow-lg group">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="text-lg font-black text-slate-900 dark:text-white truncate">${shopName}</div>
                  <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Shop #${shopId}</div>
                </div>
                <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${statusClass}">
                  ${isValid ? "Active" : "Due"}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-3 mt-5">
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div class="text-[10px] uppercase font-black tracking-widest text-slate-400">Latest Plan</div>
                  <div class="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">${latestPlan}</div>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div class="text-[10px] uppercase font-black tracking-widest text-slate-400">Total Paid</div>
                  <div class="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1">Rs. ${totalPaid.toLocaleString()}</div>
                </div>
              </div>

              <div class="mt-4 flex items-center justify-between gap-3 text-xs">
                <span class="text-slate-500 dark:text-slate-400 font-medium">
                  ${subscriptionEscapeHtml(validityText)}
                </span>
                <span class="font-black text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
                  View Logs
                </span>
              </div>
            </button>
          `;
        }).join("")}
        ${_subscriptionShopsCache.length === 0 ? `
          <div class="col-span-full p-10 text-center rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
            No shops found
          </div>
        ` : ""}
      </div>
    </div>`;
}

async function renderSubscriptionShop(shopId) {
  const selectedShopId = Number(shopId);
  if (!Number.isFinite(selectedShopId)) return renderSubscriptions();

  _subscriptionSelectedShopId = selectedShopId;
  await loadSubscriptionData();

  const shop = _subscriptionShopsCache.find((s) => Number(s.id) === selectedShopId);
  if (!shop) return renderSubscriptions();

  const logs = _subscriptionLogsCache
    .filter((s) => Number(s.shop_id) === selectedShopId)
    .sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0));
  const totalPaid = logs.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const latest = latestSubscriptionForShop(selectedShopId);
  const safeShopName = subscriptionEscapeHtml(shop.name || `Shop #${selectedShopId}`);
  const latestValidity = latest
    ? `${formatSubscriptionDate(latest.start_date)} to ${formatSubscriptionDate(latest.end_date)}`
    : "No payment yet";

  $c("page-content").innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <button onclick="renderSubscriptions()" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all" title="Back">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <h3 class="text-xl font-black text-slate-900 dark:text-white">${safeShopName}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">Subscription payment logs and validity history</p>
          </div>
        </div>
        <button onclick="openRecordPayment(${selectedShopId})" class="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95">
          Record Payment
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Paid</div>
          <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">Rs. ${totalPaid.toLocaleString()}</div>
        </div>
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Payments</div>
          <div class="text-2xl font-black text-slate-900 dark:text-white mt-1">${logs.length}</div>
        </div>
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Latest Validity</div>
          <div class="text-sm font-black text-slate-900 dark:text-white mt-2">${subscriptionEscapeHtml(latestValidity)}</div>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Month</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Validity</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Amount</th>
                <th class="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Paid At</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${logs.map((s) => {
                const paidDate = new Date(s.paid_at);
                const paidAt = Number.isNaN(paidDate.getTime()) ? "-" : paidDate.toLocaleString();
                const validity = `${formatSubscriptionDate(s.start_date)} to ${formatSubscriptionDate(s.end_date)}`;
                return `
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-950/50 transition-colors">
                    <td class="px-5 py-4 text-sm font-bold text-slate-800 dark:text-white">${subscriptionEscapeHtml(subscriptionTypeLabel(s.type))}</td>
                    <td class="px-5 py-4 text-sm text-slate-500 dark:text-slate-400 tabular-nums">${subscriptionEscapeHtml(s.month || "-")}</td>
                    <td class="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">${subscriptionEscapeHtml(validity)}</td>
                    <td class="px-5 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">Rs. ${Number(s.amount || 0).toLocaleString()}</td>
                    <td class="px-5 py-4 text-right text-xs text-slate-400 tabular-nums">${subscriptionEscapeHtml(paidAt)}</td>
                  </tr>
                `;
              }).join("")}
              ${logs.length === 0 ? '<tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic font-medium">No payment records for this shop yet</td></tr>' : ""}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function openRecordPayment(selectedShopId = null) {
  const shops = _subscriptionShopsCache.length ? _subscriptionShopsCache : await api("/api/shops");
  openModal(
    "Record Subscription Payment",
    `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Select Shop</label>
        <select id="pay-shop-id" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          ${shops.map((s) => {
            const shopId = Number(s.id);
            if (!Number.isFinite(shopId)) return "";
            return `<option value="${shopId}" ${Number(selectedShopId) === shopId ? "selected" : ""}>${subscriptionEscapeHtml(s.name || `Shop #${shopId}`)}</option>`;
          }).join("")}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Subscription Type</label>
        <select id="pay-type" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          <option value="1_month">1 Month</option>
          <option value="3_months">3 Months</option>
          <option value="6_months">6 Months</option>
          <option value="1_year">1 Year</option>
          <option value="2_years">2 Years</option>
          <option value="lifetime">Lifetime</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Starting Month</label>
          <input type="month" id="pay-month" value="${new Date().toISOString().slice(0, 7)}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Amount (Rs.)</label>
          <input type="number" id="pay-amount" value="5000" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Exact Start Date</label>
        <input type="date" id="pay-start-date" value="${new Date().toISOString().split("T")[0]}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
      </div>
      <button onclick="saveSubscriptionPayment()" class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all">Record Cash Payment & Activate Shop</button>
    </div>
  `,
  );
}

async function saveSubscriptionPayment() {
  const payload = {
    shop_id: $c("pay-shop-id").value,
    amount: parseFloat($c("pay-amount").value),
    month: $c("pay-month").value,
    type: $c("pay-type").value,
    start_date: $c("pay-start-date").value,
  };

  if (!payload.amount || !payload.month || !payload.start_date)
    return toast("Fill all fields", "error");

  const r = await api("/api/subscriptions", "POST", payload);
  if (r.error) return toast(r.error, "error");

  toast("Payment recorded");
  closeModal();
  if (_subscriptionSelectedShopId) {
    renderSubscriptionShop(_subscriptionSelectedShopId);
  } else {
    renderSubscriptions();
  }
}

function toggleUserAccessMenu() {
  const sidebar = document.getElementById("user-access-sidebar");
  const backdrop = document.getElementById("user-access-backdrop");
  if (!sidebar || !backdrop) return;

  const isOpen = !sidebar.classList.contains("-translate-x-full");

  if (isOpen) {
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.add("opacity-0");
    setTimeout(() => backdrop.classList.add("hidden"), 300);
  } else {
    backdrop.classList.remove("hidden");
    requestAnimationFrame(() => {
      sidebar.classList.remove("-translate-x-full");
      backdrop.classList.remove("opacity-0");
    });
  }
}

function openUserAccess(user) {
  const nameEl = document.getElementById("ua-name");
  const usernameEl = document.getElementById("ua-username");
  const avatarEl = document.getElementById("ua-avatar");
  const listEl = document.getElementById("ua-panels-list");
  const editBtn = document.getElementById("ua-edit-btn");

  if (nameEl) nameEl.textContent = user.name;
  if (usernameEl) usernameEl.textContent = `@${user.username}`;
  if (avatarEl) {
    const initials = (user.name || user.username).split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
    // Set color based on role
    const colors = {
      admin: "bg-indigo-600",
      pos_user: "bg-emerald-500",
      manager: "bg-amber-500"
    };
    avatarEl.className = `w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl ${colors[user.role] || "bg-slate-500"}`;
  }

  if (listEl) {
    const panels = user.allowed_panels || [];
    if (panels.length === 0) {
      listEl.innerHTML = `<div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 text-xs text-slate-400 italic">No specific modules assigned. User has default baseline access.</div>`;
    } else {
      listEl.innerHTML = panels.map(pid => {
        const panel = AVAILABLE_PANELS.find(p => p.id === pid);
        if (!panel) return '';
        return `
          <div class="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
            <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-indigo-500">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none">${panel.icon}</svg>
            </div>
            <div>
              <div class="text-sm font-bold text-slate-700 dark:text-slate-200">${panel.label}</div>
              <div class="text-[10px] text-slate-400 font-medium">${panel.desc}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (editBtn) {
    const isMaster = currentUser.role === "superadmin";
    editBtn.innerHTML = isMaster ? `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
      Manage Permissions
    ` : `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
      Change Password
    `;
    editBtn.onclick = () => {
      toggleUserAccessMenu();
      openEditUser(user.id, user.name, user.username, user.email, user.phone, user.role, (user.allowed_panels || []), user.shop_id, user.status, !!user.can_manage_register);
    };
  }

  toggleUserAccessMenu();
}

// --- Preset Management Logic ---
let _discountPresets = [];
let _taxPresets = [];

async function fetchPresets() {
  try {
    [_discountPresets, _taxPresets] = await Promise.all([
      api("/api/shop-settings/discounts"),
      api("/api/shop-settings/taxes")
    ]);
  } catch (e) {
    console.error("Fetch presets error:", e);
  }
}

async function renderPresetLists() {
  await fetchPresets();
  const discList = document.getElementById("discount-presets-list");
  const taxList = document.getElementById("tax-presets-list");

  if (discList) {
    discList.innerHTML = _discountPresets.map(p => `
      <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <div>
          <p class="text-sm font-bold text-slate-800 dark:text-slate-200">${p.name}</p>
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${p.type === 'percentage' ? p.value + '%' : 'Rs. ' + p.value}</p>
        </div>
        <button onclick="deleteDiscountPreset(${p.id})" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    `).join("") || '<p class="text-xs text-slate-400 italic text-center py-4">No discount presets yet.</p>';
  }

  if (taxList) {
    taxList.innerHTML = _taxPresets.map(p => `
      <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <div>
          <p class="text-sm font-bold text-slate-800 dark:text-slate-200">${p.name}</p>
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${p.percentage}% ${p.linked_payment_method ? '(linked: ' + p.linked_payment_method + ')' : ''}</p>
        </div>
        <button onclick="deleteTaxPreset(${p.id})" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    `).join("") || '<p class="text-xs text-slate-400 italic text-center py-4">No tax presets yet.</p>';
  }
}

async function saveDiscountPreset() {
  const name = document.getElementById("preset-disc-name").value;
  const type = document.getElementById("preset-disc-type").value;
  const value = parseFloat(document.getElementById("preset-disc-val").value);

  if (!name || isNaN(value)) return toast("Please fill name and value", "error");

  try {
    await api("/api/shop-settings/discounts", "POST", { name, type, value });
    toast("Discount preset added");
    document.getElementById("preset-disc-name").value = "";
    document.getElementById("preset-disc-val").value = "";
    renderPresetLists();
  } catch (e) {
    toast("Failed to save preset", "error");
  }
}

async function deleteDiscountPreset(id) {
  if (!confirm("Are you sure?")) return;
  try {
    await api(`/api/shop-settings/discounts/${id}`, "DELETE");
    renderPresetLists();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

async function saveTaxPreset() {
  const name = document.getElementById("preset-tax-name").value;
  const percentage = parseFloat(document.getElementById("preset-tax-pct").value);
  const linked_payment_method = document.getElementById("preset-tax-method").value;

  if (!name || isNaN(percentage)) return toast("Please fill name and percentage", "error");

  try {
    await api("/api/shop-settings/taxes", "POST", { name, percentage, linked_payment_method });
    toast("Tax preset added");
    document.getElementById("preset-tax-name").value = "";
    document.getElementById("preset-tax-pct").value = "";
    renderPresetLists();
  } catch (e) {
    toast("Failed to save preset", "error");
  }
}

async function deleteTaxPreset(id) {
  if (!confirm("Are you sure?")) return;
  try {
    await api(`/api/shop-settings/taxes/${id}`, "DELETE");
    renderPresetLists();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

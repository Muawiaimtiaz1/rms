// ─── Hierarchy View ──────────────────────────────────────────────
// Global State for Hierarchy UI
let hierarchyData = { systemUsers: [], shops: [], users: [], brands: [] };
let hierarchySearchQuery = "";

async function renderHierarchy() {
  const result = await api("/api/admin/hierarchy-data");
  if (result.error) return toast(result.error, "error");

  hierarchyData = result;
  renderHierarchyUI();
}

function renderHierarchyUI() {
  const q = hierarchySearchQuery.toLowerCase();

  // Filter logic
  const filteredShops = hierarchyData.shops.filter(
    (s) =>
      s.store_name.toLowerCase().includes(q) ||
      hierarchyData.users.some(
        (u) =>
          u.shop_id === s.id &&
          (u.name.toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q)),
      ) ||
      hierarchyData.brands.some(
        (b) => b.shop_id === s.id && b.name.toLowerCase().includes(q),
      ),
  );

  let html = `
    <div class="space-y-8 animate-[fadeIn_0.3s_ease-out]">
      <!-- Header Area -->
      <div class="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h3 class="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Master Platform Hierarchy</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Multi-tenant view of all shops, assigned admins, staff, and parters.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative">
            <svg class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input type="text" id="hierarchySearch" value="${hierarchySearchQuery}" placeholder="Search tenants, users, roles..." class="pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-64 transition-all shadow-sm">
          </div>
          <button onclick="openCreateShop()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-md flex items-center gap-2 justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            New Tenant
          </button>
        </div>
      </div>
  `;

  // System Core Node (Master Owner)
  html += renderHierarchyBlock(
    "Platform Engine (Master Core)",
    hierarchyData.systemUsers,
    [],
    "indigo",
    null,
    true,
  );

  if (filteredShops.length === 0) {
    html += `<div class="p-10 text-center glass rounded-2xl"><p class="text-slate-500 dark:text-slate-400 italic">No tenants matched your search query "${hierarchySearchQuery}".</p></div>`;
  } else {
    // Render Shops as Parent Nodes
    filteredShops.forEach((s) => {
      const shopUsers = hierarchyData.users.filter((u) => u.shop_id === s.id);
      const shopBrands = hierarchyData.brands.filter((b) => b.shop_id === s.id);
      html += renderHierarchyBlock(
        s.store_name,
        shopUsers,
        shopBrands,
        "blue",
        s,
      );
    });
  }

  html += "</div>";
  $c("page-content").innerHTML = html;

  // Re-bind search event listener after DOM replace
  const searchInput = document.getElementById("hierarchySearch");
  if (searchInput) {
    // Focus preserving trick
    const val = searchInput.value;
    searchInput.value = "";
    searchInput.value = val;
    searchInput.focus();

    searchInput.addEventListener("input", (e) => {
      hierarchySearchQuery = e.target.value;
      // Debounce slightly to prevent jarring UI jumps
      clearTimeout(window.hierarchySearchTimeout);
      window.hierarchySearchTimeout = setTimeout(renderHierarchyUI, 200);
    });
  }
}

function renderHierarchyBlock(
  name,
  users,
  brands = [],
  color,
  shop = null,
  isGlobal = false,
) {
  const colorMap = {
    indigo: {
      text: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
      iconBg: "bg-indigo-100 dark:bg-indigo-900/40",
    },
    blue: {
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      iconBg: "bg-blue-100 dark:bg-blue-900/40",
    },
  };
  const c = colorMap[color] || colorMap.blue;

  // KPIs
  const userCount = users.length;
  const brandCount = brands.length;
  const productCount = shop ? shop.product_count : 0;
  const plan =
    shop && shop.subscription_plan
      ? shop.subscription_plan.replace("_", " ")
      : isGlobal
        ? "SYSTEM"
        : "NONE";

  // Collapse state identifier
  const collapseId = `collapse - node - ${shop ? shop.id : "global"} `;

  // Role rendering helper
  const renderUserCard = (u) => {
    let roleColor =
      "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800";
    let roleIcon = "👤";
    if (u.role === "superadmin") {
      roleColor =
        "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800";
      roleIcon = "🌟";
    }
    if (u.role === "admin") {
      roleColor =
        "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800";
      roleIcon = "🧑‍💼";
    }
    if (u.role === "user") {
      roleColor =
        "text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800 border border-slate-200 dark:border-slate-700";
      roleIcon = "👷";
    }

    return `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all group bg-white dark:bg-slate-900/50 relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${u.role === "admin" ? "from-emerald-400 to-emerald-300" : u.role === "superadmin" ? "from-blue-500 to-indigo-500" : "from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800"} opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${roleColor}">
            ${roleIcon}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${u.name}</div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[9px] uppercase font-black tracking-widest ${roleColor} px-1.5 py-0.5 rounded-md leading-none">${u.role.replace("_", " ")}</span>
              ${u.email ? `<span class="text-[10px] text-slate-400 font-medium truncate">${u.username}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 ml-2 opacity-10 lg:opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Edit button -->
          <button onclick="openEditUser(${u.id},'${(u.name || "").replace(/'/g, "\\'")}', '${u.username}', '${u.email || ""}', '${u.phone || ""}', '${u.role}', ${JSON.stringify(u.allowed_panels || []).replace(/"/g, "&quot;")}, ${u.shop_id || "null"}, '${u.status || "active"}')"
            class="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 flex items-center justify-center transition-transform hover:scale-110 shadow-sm" title="Edit Profile">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          ${u.role === "superadmin"
        ? ""
        : `
          <!-- Suspend button -->
          <button onclick="toggleUserStatus(${u.id}, '${u.status || "active"}')" class="w-7 h-7 rounded-lg flex items-center justify-center border ${u.status === "active" || !u.status ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600" : "bg-rose-50 border-rose-200 text-rose-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"} transition-all hover:scale-110 shadow-sm" title="${u.status === "active" || !u.status ? "Suspend User" : "Reactivate User"}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${u.status === "active" || !u.status ? "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" : "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"}"/></svg>
          </button>
          `
      }
        </div>
      </div>
      `;
  };

  const renderPartnerCard = (b) => {
    return `
      <div class="flex items-center justify-between p-3 rounded-xl border border-purple-100 dark:border-purple-900/30 hover:border-purple-300 dark:hover:border-purple-500/50 transition-all group bg-purple-50/30 dark:bg-purple-900/10">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm bg-purple-100 border border-purple-200 text-purple-600 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-400">
            🤝
          </div>
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">${b.name}</div>
            <div class="text-[9px] uppercase font-black tracking-widest text-purple-600 dark:text-purple-400 mt-0.5 border border-purple-200 dark:border-purple-800/50 px-1 inline-block rounded">Partner Brand</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 ml-2 opacity-10 lg:opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- View button -->
          <button onclick="managedShopId=${b.shop_id}; renderBrands(${b.shop_id})" class="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400 flex items-center justify-center transition-transform hover:scale-110 shadow-sm" title="View Partner Details">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
          </button>
        </div>
      </div>
      `;
  };

  return `
      <details class="group glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all mb-4" ${isGlobal || hierarchySearchQuery !== "" ? "open" : ""}>
      <summary class="px-6 py-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer list-none flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">

        <!-- Parent Node Identity -->
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl shadow-inner flex items-center justify-center font-bold text-lg border ${c.border} ${c.iconBg} ${c.text}">
            ${isGlobal ? "⚙️" : (name || "S").substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-black text-lg text-slate-900 dark:text-white tracking-tight">${name}</h4>
              ${isGlobal ? "" : `<span class="w-2 h-2 rounded-full ${shop.status === "active" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"}"></span>`}
            </div>

            <!-- Quick KPI Pills -->
            <div class="flex flex-wrap items-center gap-2 mt-2">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${userCount} Personnel
              </span>
              ${!isGlobal
      ? `
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${brandCount} Partners
              </span>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                ${productCount} Products
              </span>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${shop.shop_type === 'restaurant' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'} px-2 py-0.5 rounded-md">
                ${shop.shop_type === 'restaurant' ? '🍽️ Restaurant' : '🛍️ Retail'}
              </span>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${c.text} ${c.bg} px-2 py-0.5 rounded-md">
                Tier: ${plan}
              </span>
              `
      : ""
    }
            </div>
          </div>
        </div>

        <!-- Inline Actions -->
        <div class="flex items-center gap-2">
          ${isGlobal
      ? ""
      : shop && shop.allowed_panels
        ? `
            ${shop.allowed_panels.includes("brands")
          ? `
              <button onclick="event.preventDefault(); event.stopPropagation(); managedShopId=${shop.id}; openAddBrand()" class="p-2 text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30 rounded-xl transition-all border border-transparent hover:border-purple-200 dark:hover:border-purple-800 flex items-center justify-center group/btn" title="Add Partner">
                <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              </button>
            `
          : ""
        }
            <button onclick="event.preventDefault(); event.stopPropagation(); openCreateUser(${shop.id})" class="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-xl transition-all border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 flex items-center justify-center group/btn" title="Add User">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
            </button>
            <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button onclick="event.preventDefault(); event.stopPropagation(); openEditShop(${shop.id})" class="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-all flex items-center justify-center group/btn" title="Edit Store Settings">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
            <button onclick="event.preventDefault(); event.stopPropagation(); toggleShopStatus(${shop.id}, '${shop.status}')" class="p-2 rounded-xl transition-all border border-transparent flex items-center justify-center group/btn ${shop.status === "active" ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:border-rose-200 dark:hover:border-rose-800" : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-200 dark:hover:border-emerald-800"}" title="${shop.status === "active" ? "Suspend Store" : "Reactivate Store"}">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${shop.status === "active" ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"}"></path></svg>
            </button>
            <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button onclick="event.preventDefault(); event.stopPropagation(); deleteShop(${shop.id}, '${(name || "").replace(/'/g, "\\'")}')" class="p-2 rounded-xl transition-all border border-transparent flex items-center justify-center group/btn text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/50 hover:border-rose-300 dark:hover:border-rose-800" title="Delete Shop Permanently">
              <svg class="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          `
        : ""
    }
          <div class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 group-open:rotate-180 transition-transform bg-white dark:bg-slate-800 ml-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </summary>

      <!--Expanded Body(Children Nodes)-- >
      <div class="p-6 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800">

        ${users.length === 0 && brands.length === 0
      ? `
          <div class="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400">No personnel or partners attached to this node.</p>
          </div>
        `
      : ""
    }

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          <!-- Users Section -->
          ${users.length
      ? `
          <div class="${users.length > 3 ? "md:col-span-2 xl:col-span-2" : ""}">
            <h5 class="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Assigned Personnel
            </h5>
            <div class="grid grid-cols-1 ${users.length > 1 ? "sm:grid-cols-2" : ""} gap-3">
              ${users.map((u) => renderUserCard(u)).join("")}
            </div>
          </div>
          `
      : ""
    }

          <!-- Brands (Partners) Section -->
          ${brands.length
      ? `
          <div>
            <h5 class="text-xs font-bold text-purple-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              Partner Networks
            </h5>
            <div class="grid grid-cols-1 gap-3">
              ${brands.map((b) => renderPartnerCard(b)).join("")}
            </div>
          </div>
          `
      : ""
    }

        </div>
      </div>
    </details>
      `;
}

async function deleteShop(id, name) {
  if (!confirm(`CAUTION: You are about to PERMANENTLY DELETE "${name}".\n\nThis will remove all associated data, users, products, and sales permanently. This action cannot be undone.\n\nAre you sure you want to proceed?`)) return;

  const r = await api(`/api/shops/${id}`, "DELETE");
  if (r.error) return toast(r.error, "error");
  toast("Shop Deleted Successfully");
  renderHierarchy();
}

async function toggleShopStatus(id, current) {
  const next = current === "active" ? "blocked" : "active";
  const r = await api(`/api/admin/store/${id}/status`, "PATCH", { status: next });
  if (r.error) return toast(r.error, "error");
  toast(`Shop ${next === "active" ? "Activated" : "Blocked"} `);
  renderHierarchy();
}

async function toggleUserStatus(id, current) {
  const next = current === "active" ? "blocked" : "active";
  const user = (await api("/api/users")).find((u) => u.id === id);
  if (!user) return toast("User not found", "error");

  const payload = { ...user, status: next };
  delete payload.id;

  const r = await api(`/api/users/${id}`, "PUT", payload);
  if (r.error) return toast(r.error, "error");
  toast(`User ${next === "active" ? "Activated" : "Blocked"} `);
  renderHierarchy();
}

let _wizardStep = 1;
let _wizardData = {};

function openCreateShop() { openShopWizard(); }

function openShopWizard() {
  _wizardStep = 1;
  _wizardData = {
    type: null,
    name: "",
    adminUsername: "",
    adminPassword: "",
    services: { dine_in: true, takeaway: true, delivery: true },
    panels: [],
    employees: [],
    kitchens: []
  };
  renderWizard();
}

function setWizardType(t) {
  _wizardData.type = t;
  wizardNext();
}

function wizardNext() {
  if (_wizardStep === 2) {
    if (!_wizardData.name) return toast("Please enter a shop name", "warning");
    // Capture services if restaurant
    if (_wizardData.type === "restaurant") {
      const checks = document.querySelectorAll(".service-check");
      checks.forEach(c => {
        _wizardData.services[c.dataset.service] = c.checked;
      });
    }
  }
  if (_wizardStep === 3) {
    const selectedTiles = Array.from(document.querySelectorAll('.wiz-panel-tile[data-selected="true"]'));
    if (!selectedTiles.length) return toast("Select at least one module", "warning");
    const panels = [];
    selectedTiles.forEach(el => {
      const p = JSON.parse(el.dataset.panels || "[]");
      panels.push(...p);
    });
    _wizardData.panels = [...new Set(panels)];
  }
  if (_wizardStep === 4) {
    if (!_wizardData.adminUsername || !_wizardData.adminPassword) return toast("Admin credentials required", "warning");
  }

  // Skip Kitchen Setup if not a restaurant
  if (_wizardStep === 5 && _wizardData.type !== "restaurant") {
    _wizardStep = 7;
  } else {
    _wizardStep++;
  }

  renderWizard();
}

function wizardPrev() {
  if (_wizardStep === 7 && _wizardData.type !== "restaurant") {
    _wizardStep = 5;
  } else {
    _wizardStep--;
  }
  renderWizard();
}

async function submitWizard(btn) {
  const payload = {
    name: _wizardData.name,
    shop_type: _wizardData.type,
    allowed_panels: _wizardData.panels,
    adminUsername: _wizardData.adminUsername,
    adminPassword: _wizardData.adminPassword,
    employees: _wizardData.employees,
    kitchens: _wizardData.kitchens
  };

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Launching...";
  }

  try {
    const r = await api("/api/shops", "POST", payload);
    if (r.error) {
      toast(r.error, "error");
      btn.disabled = false;
      btn.textContent = "Launch Shop";
      return;
    }
    toast("Shop created successfully!");
    closeModal();
    renderHierarchy();
  } catch (e) {
    toast("Failed to launch shop", "error");
    btn.disabled = false;
  }
}

function renderWizard() {
  const titles = [
    "Choose Your Business Type",
    "Configure Your Shop",
    "Select Access Modules",
    "Admin Credentials",
    "Staff Management",
    "Kitchen Setup",
    "Summary & Launch"
  ];

  let content = "";

  if (_wizardStep === 1) {
    content = `
      <div class="grid grid-cols-2 gap-6 py-6">
        <div onclick="setWizardType('retail')" class="cursor-pointer group p-8 rounded-3xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all flex flex-col items-center gap-6 text-center">
          <div class="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-5xl group-hover:scale-110 transition-all shadow-sm">🛍️</div>
          <div>
            <h4 class="font-black text-slate-900 dark:text-white uppercase tracking-tight text-lg">Retail Shop</h4>
            <p class="text-xs text-slate-500 mt-2 font-medium">Electronics, Pharmacy, Garments, or General Store.</p>
          </div>
        </div>
        <div onclick="setWizardType('restaurant')" class="cursor-pointer group p-8 rounded-3xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all flex flex-col items-center gap-6 text-center">
           <div class="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-5xl group-hover:scale-110 transition-all shadow-sm">🍽️</div>
           <div>
            <h4 class="font-black text-slate-900 dark:text-white uppercase tracking-tight text-lg">Restaurant</h4>
            <p class="text-xs text-slate-500 mt-2 font-medium">Boutique Dining, Cafes, or Cloud Kitchens.</p>
          </div>
        </div>
      </div>
      <p class="text-center text-slate-400 text-[10px] uppercase font-black tracking-widest mt-4">Step 1: Core Business Identification</p>
    `;
  } else if (_wizardStep === 2) {
    if (_wizardData.type === "restaurant") {
      content = `
        <div class="space-y-6 py-4">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">Establishment Name</label>
            <input type="text" oninput="_wizardData.name=this.value" value="${_wizardData.name}" placeholder="e.g. Blue Lagoon Diner" class="w-full px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none font-bold text-lg transition-all">
          </div>
          <div class="space-y-3">
             <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">Service Modules</label>
             <div class="grid grid-cols-1 gap-3">
                <label class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-indigo-400 transition-all group">
                   <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-all">🪑</div>
                      <div>
                        <div class="font-bold text-sm text-slate-800 dark:text-slate-200">Dine-in</div>
                        <div class="text-[10px] text-slate-400 font-medium">Tables, Waiters, and Seating Management</div>
                      </div>
                   </div>
                   <input type="checkbox" checked class="service-check w-6 h-6 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" data-service="dine_in">
                </label>
                <label class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-indigo-400 transition-all group">
                   <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-all">🛍️</div>
                      <div>
                        <div class="font-bold text-sm text-slate-800 dark:text-slate-200">Takeaway</div>
                        <div class="text-[10px] text-slate-400 font-medium">Point of sale for walk-in collections</div>
                      </div>
                   </div>
                   <input type="checkbox" checked class="service-check w-6 h-6 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" data-service="takeaway">
                </label>
                <label class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-indigo-400 transition-all group">
                   <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-all">🚚</div>
                      <div>
                        <div class="font-bold text-sm text-slate-800 dark:text-slate-200">Delivery</div>
                        <div class="text-[10px] text-slate-400 font-medium">Customer addresses and Rider assignment</div>
                      </div>
                   </div>
                   <input type="checkbox" checked class="service-check w-6 h-6 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" data-service="delivery">
                </label>
             </div>
          </div>
        </div>
      `;
    } else {
      content = `
        <div class="space-y-6 py-4">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-2">Retail Shop Name</label>
            <input type="text" oninput="_wizardData.name=this.value" value="${_wizardData.name}" placeholder="e.g. Mega Mart" class="w-full px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none font-bold text-lg transition-all">
          </div>
          <div class="p-5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl flex gap-4 items-start">
             <div class="text-2xl mt-1">🧩</div>
             <div>
                <h5 class="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-1">Standard retail pack</h5>
                <p class="text-xs text-indigo-600/70 dark:text-indigo-400/70 leading-relaxed font-medium">
                   We'll pre-load your store with Inventory management, Multi-batch tracking, Customer CRM, and Expenses tracking as part of your retail kit.
                </p>
             </div>
          </div>
        </div>
      `;
    }
  } else if (_wizardStep === 3) {
    content = `
      <div class="space-y-6 py-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-3">Enabled Control Panels</label>
          <div class="grid grid-cols-2 gap-3">
            ${allPanels().map(p => {
      const isSelected = p.panels.every(pid => _wizardData.panels.includes(pid));
      return `
                <div data-panels='${JSON.stringify(p.panels)}' data-selected="${isSelected}" onclick="toggleWizPanel(this)" class="wiz-panel-tile cursor-pointer p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${isSelected ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 shadow-md' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-indigo-300'}">
                   <span class="text-3xl">${p.icon}</span>
                   <span class="text-[10px] font-black uppercase tracking-widest text-center">${p.name}</span>
                </div>
              `;
    }).join("")}
          </div>
        </div>
        <p class="text-xs text-slate-500 font-medium italic text-center px-4">Selected modules will be available in the tenant's dashboard immediately after activation.</p>
      </div>
    `;
  } else if (_wizardStep === 4) {
    content = `
      <div class="space-y-6 py-4">
        <div class="flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <div class="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/20">🛡️</div>
          <div>
             <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-tight text-sm">Security & Ownership</h4>
             <p class="text-xs text-slate-500 font-medium italic">Create the master account for this tenant.</p>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1">Master Username</label>
            <input type="text" oninput="_wizardData.adminUsername=this.value" value="${_wizardData.adminUsername}" placeholder="e.g. admin_beach" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-mono text-sm">
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1">Secure Password</label>
            <input type="password" oninput="_wizardData.adminPassword=this.value" value="${_wizardData.adminPassword}" placeholder="••••••••" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-sm">
          </div>
        </div>
      </div>
    `;
  } else if (_wizardStep === 5) {
    content = `
      <div class="space-y-6 py-4">
        <div class="flex items-center justify-between">
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Initial Staff Members</label>
           <button onclick="showWizAddEmployee()" class="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-500 transition-colors">+ Add Employee</button>
        </div>
        <div class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
           ${_wizardData.employees.length === 0 ? `
             <div class="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <p class="text-xs text-slate-400 font-medium italic">No additional staff added. You can add them later from the Staff panel.</p>
             </div>
           ` : _wizardData.employees.map((emp, idx) => `
             <div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between group">
                <div class="flex items-center gap-3">
                   <div class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs uppercase">${emp.role.substring(0, 2)}</div>
                   <div>
                      <div class="font-bold text-sm text-slate-900 dark:text-white">${emp.name} <span class="text-[10px] text-slate-400 ml-1">(@${emp.username})</span></div>
                      <div class="text-[10px] text-slate-500 font-medium uppercase tracking-widest">${emp.role} • ${emp.allowed_panels.length} Panels • ${emp.password ? '🔐 Has Login' : '🚫 No Login'}</div>
                   </div>
                </div>
                <button onclick="removeWizardEmployee(${idx})" class="p-2 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
             </div>
           `).join('')}
        </div>
      </div>
    `;
  } else if (_wizardStep === 6) {
    content = `
      <div class="space-y-6 py-4">
        <div class="flex items-center justify-between">
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Kitchen Terminals</label>
           <button onclick="showWizAddKitchen()" class="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-500 transition-colors">+ Add Kitchen</button>
        </div>
        <div class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
           ${_wizardData.kitchens.length === 0 ? `
             <div class="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <p class="text-xs text-slate-400 font-medium italic">No kitchen terminals added yet. Add at least one if you want separate kitchen logins.</p>
             </div>
           ` : _wizardData.kitchens.map((k, idx) => `
             <div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between group">
                <div class="flex items-center gap-3">
                   <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg">👨‍🍳</div>
                   <div>
                      <div class="font-bold text-sm text-slate-900 dark:text-white">${k.name} <span class="text-[10px] text-slate-400 ml-1">(@${k.username})</span></div>
                      <div class="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Kitchen Terminal • ${k.allowed_panels.length} Panels</div>
                   </div>
                </div>
                <button onclick="removeWizardKitchen(${idx})" class="p-2 text-rose-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
             </div>
           `).join('')}
        </div>
      </div>
    `;
  } else if (_wizardStep === 7) {
    content = `
      <div class="py-6 text-center space-y-6 animate-[scaleIn_0.4s_ease-out]">
        <div class="relative w-32 h-32 mx-auto">
           <div class="absolute inset-0 bg-indigo-600/20 rounded-full animate-ping"></div>
           <div class="relative w-32 h-32 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-full flex items-center justify-center text-5xl shadow-2xl shadow-indigo-600/40 border-4 border-white dark:border-slate-800">🚀</div>
        </div>
        <div>
          <h4 class="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Configuration Complete</h4>
          <p class="text-slate-500 text-sm mt-1 max-w-sm mx-auto font-medium">Ready to deploy a high-performance <strong class="text-indigo-600">${_wizardData.type}</strong> instance for <strong class="text-indigo-600">"${_wizardData.name}"</strong></p>
        </div>
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 max-w-xs mx-auto space-y-2">
           <div class="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Admin:</span>
              <span class="text-slate-700 dark:text-slate-200">@${_wizardData.adminUsername}</span>
           </div>
           <div class="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Staff:</span>
              <span class="text-indigo-600">${_wizardData.employees.length + 1} Total</span>
           </div>
           ${_wizardData.type === 'restaurant' ? `
           <div class="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Kitchens:</span>
              <span class="text-amber-600">${_wizardData.kitchens.length} Active</span>
           </div>
           ` : ''}
           <div class="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Modules:</span>
              <span class="text-emerald-600">${_wizardData.panels.length} Enabled</span>
           </div>
        </div>
      </div>
    `;
  }

  const footer = `
    <div class="flex justify-between items-center pt-8 border-t border-slate-100 dark:border-slate-800 mt-4">
      <button onclick="wizardPrev()" class="px-6 py-2.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold transition-all ${_wizardStep === 1 ? "opacity-0 pointer-events-none" : ""}">Back</button>
      <div class="hidden sm:flex gap-1.5">
        ${[1, 2, 3, 4, 5, 6, 7].map(i => `<div class="w-3 h-1.5 rounded-full transition-all duration-300 ${i === _wizardStep ? "bg-indigo-600 w-8" : (i < _wizardStep ? "bg-indigo-300" : "bg-slate-200 dark:bg-slate-800")}"></div>`).join("")}
      </div>
      ${_wizardStep === 7
      ? `<button onclick="submitWizard(this)" class="px-10 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95">Complete Launch</button>`
      : `<button onclick="wizardNext()" class="px-10 py-3 rounded-xl bg-slate-950 dark:bg-indigo-600 hover:scale-105 active:scale-95 text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg ${_wizardStep === 1 ? 'hidden' : ''}">Proceed Next</button>`
    }
    </div>
  `;

  openModal(titles[_wizardStep - 1], `
    <div class="flex flex-col min-h-[420px]">
      <div class="flex-1">${content}</div>
      ${footer}
    </div>
  `, "max-w-2xl");
}

function showWizAddEmployee() {
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300";
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
      <h3 class="text-2xl font-black text-slate-950 dark:text-white mb-6">Add Staff Member</h3>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
           <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
              <input id="wiz-emp-name" placeholder="John Doe" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
           </div>
           <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Role</label>
              <select id="wiz-emp-role" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold appearance-none transition-all">
                 <option value="user">General Staff</option>
                 <option value="rider">Rider / Delivery</option>
                 <option value="waiter">Waiter / Server</option>
                 <option value="manager">Manager</option>
                 <option value="receptionist">Receptionist</option>
              </select>
           </div>
        </div>
        <div>
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Username (For Login Reference)</label>
           <input id="wiz-emp-user" placeholder="john_d" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
        </div>
        
        <div class="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl">
           <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" id="wiz-emp-has-login" onchange="document.getElementById('wiz-emp-pass-box').classList.toggle('hidden', !this.checked)" class="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500">
              <span class="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Enable System Login</span>
           </label>
           <div id="wiz-emp-pass-box" class="mt-4 hidden">
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Login Password</label>
              <input id="wiz-emp-pass" type="password" placeholder="••••••••" class="w-full px-5 py-3 rounded-xl bg-white dark:bg-slate-900 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
           </div>
        </div>

        <div>
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Assigned Modules</label>
           <div class="grid grid-cols-3 gap-2">
              ${allPanels().filter(p => _wizardData.panels.includes(p.panels[0])).map(p => `
                <div onclick="toggleWizEmpPanel(this)" data-panels='${JSON.stringify(p.panels)}' data-selected="false" class="wiz-emp-panel-tile cursor-pointer p-2 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1 transition-all hover:border-indigo-300">
                   <span class="text-xl">${p.icon}</span>
                   <span class="text-[8px] font-black uppercase text-slate-500 dark:text-slate-400 text-center">${p.name}</span>
                </div>
              `).join('')}
           </div>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-200 transition-all">Cancel</button>
        <button onclick="addWizEmployee(this)" class="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all">Add Staff</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function toggleWizEmpPanel(el) {
  const isSelected = el.dataset.selected === "true";
  const next = !isSelected;
  el.dataset.selected = next;
  if (next) {
    el.classList.add('border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20');
    el.classList.remove('border-slate-100', 'dark:border-slate-800');
  } else {
    el.classList.remove('border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20');
    el.classList.add('border-slate-100', 'dark:border-slate-800');
  }
}

function addWizEmployee(btn) {
  const name = document.getElementById("wiz-emp-name").value.trim();
  const username = document.getElementById("wiz-emp-user").value.trim();
  const role = document.getElementById("wiz-emp-role").value;
  const hasLogin = document.getElementById("wiz-emp-has-login").checked;
  const password = document.getElementById("wiz-emp-pass").value;

  if (!name || !username) return toast("Name and Username required", "error");
  if (hasLogin && !password) return toast("Password required for login", "error");

  const selectedPanels = [];
  document.querySelectorAll(".wiz-emp-panel-tile[data-selected='true']").forEach(el => {
    selectedPanels.push(...JSON.parse(el.dataset.panels));
  });

  _wizardData.employees.push({
    name, username, role,
    password: hasLogin ? password : null,
    allowed_panels: [...new Set(selectedPanels)]
  });

  btn.closest(".fixed").remove();
  renderWizard();
}

function removeWizardEmployee(idx) {
  _wizardData.employees.splice(idx, 1);
  renderWizard();
}

function showWizAddKitchen() {
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300";
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
      <h3 class="text-2xl font-black text-slate-950 dark:text-white mb-6">Add Kitchen Terminal</h3>
      <div class="space-y-4">
        <div>
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Kitchen Name (e.g. Main Kitchen)</label>
           <input id="wiz-kit-name" placeholder="Main Kitchen" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
        </div>
        <div class="grid grid-cols-2 gap-4">
           <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Login Name</label>
              <input id="wiz-kit-user" placeholder="kitchen_1" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
           </div>
           <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Login Password</label>
              <input id="wiz-kit-pass" type="password" placeholder="••••••••" class="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:border-indigo-500 outline-none text-sm font-bold transition-all" />
           </div>
        </div>

        <div>
           <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Assigned Modules</label>
           <div class="grid grid-cols-3 gap-2">
              ${allPanels().filter(p => _wizardData.panels.includes(p.panels[0])).map(p => `
                <div onclick="toggleWizKitchenPanel(this)" data-panels='${JSON.stringify(p.panels)}' data-selected="${p.id === 'kds'}" class="wiz-kit-panel-tile cursor-pointer p-2 rounded-xl border ${p.id === 'kds' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800'} flex flex-col items-center justify-center gap-1 transition-all hover:border-indigo-300">
                   <span class="text-xl">${p.icon}</span>
                   <span class="text-[8px] font-black uppercase text-slate-500 dark:text-slate-400 text-center">${p.name}</span>
                </div>
              `).join('')}
           </div>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-200 transition-all">Cancel</button>
        <button onclick="addWizKitchen(this)" class="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all">Add Kitchen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function toggleWizKitchenPanel(el) {
  const isSelected = el.dataset.selected === "true";
  const next = !isSelected;
  el.dataset.selected = next;
  if (next) {
    el.classList.add('border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20');
    el.classList.remove('border-slate-100', 'dark:border-slate-800');
  } else {
    el.classList.remove('border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20');
    el.classList.add('border-slate-100', 'dark:border-slate-800');
  }
}

function addWizKitchen(btn) {
  const name = document.getElementById("wiz-kit-name").value.trim();
  const username = document.getElementById("wiz-kit-user").value.trim();
  const password = document.getElementById("wiz-kit-pass").value;

  if (!name || !username || !password) return toast("Name, Login Name and Password required", "error");

  const selectedPanels = [];
  document.querySelectorAll(".wiz-kit-panel-tile[data-selected='true']").forEach(el => {
    selectedPanels.push(...JSON.parse(el.dataset.panels));
  });

  _wizardData.kitchens.push({
    name, username, password,
    allowed_panels: [...new Set(selectedPanels)]
  });

  btn.closest(".fixed").remove();
  renderWizard();
}

function removeWizardKitchen(idx) {
  _wizardData.kitchens.splice(idx, 1);
  renderWizard();
}

function toggleWizPanel(el) {
  const isSelected = el.dataset.selected === "true";
  const next = !isSelected;
  el.dataset.selected = next;
  const activeClasses = ['border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'text-indigo-600', 'dark:text-indigo-300', 'shadow-md'];
  const inactiveClasses = ['border-slate-100', 'dark:border-slate-800', 'bg-white', 'dark:bg-slate-900', 'text-slate-500', 'dark:text-slate-400', 'hover:border-indigo-300'];

  if (next) {
    el.classList.add(...activeClasses);
    el.classList.remove(...inactiveClasses);
  } else {
    el.classList.remove(...activeClasses);
    el.classList.add(...inactiveClasses);
  }
}

function openCreateShop() {
  openShopWizard();
}

function openEditShop(id) {
  // We need to fetch shops again or use a global if available
  api("/api/shops").then((shops) => {
    const shop = shops.find((s) => s.id === id);
    if (!shop) return;
    openModal(
      "Edit Shop",
      shopFormHtml(shop) +
      `<button onclick="saveShop(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Shop</button>`,
    );
  });
}

function shopFormHtml(shop = null) {
  const shopPanels =
    shop && shop.allowed_panels
      ? Array.isArray(shop.allowed_panels)
        ? shop.allowed_panels
        : JSON.parse(shop.allowed_panels)
      : [];

  return `
      <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Shop Name</label>
        <input id="shop-name" type="text" value="${shop ? shop.name : ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Launch Panels (Master Control)</label>
        <div class="grid grid-cols-2 gap-2">
          ${allPanels()
      .map((p) => {
        const isSelected = p.panels.every((panelId) =>
          shopPanels.includes(panelId),
        );
        return `
            <div data-panels='${JSON.stringify(p.panels)}' data-selected="${isSelected}" onclick="togglePanel(this)" class="panel-tile cursor-pointer p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${isSelected ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300"}">
              <span class="text-[20px]">${p.icon}</span>
              <span class="text-[10px] font-bold uppercase tracking-tighter text-center">${p.name}</span>
            </div>
            `;
      })
      .join("")}
        </div>
      </div>
      ${!shop
      ? `
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <label class="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3">Initial Shop Owner Account</label>
        <div class="grid grid-cols-2 gap-3">
          <input id="shop-admin-username" type="text" placeholder="Admin Username" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
          <input id="shop-admin-password" type="password" placeholder="Admin Password" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 transition-all">
        </div>
      </div>`
      : ""
    }
    </div>
      `;
}

async function saveShop(id) {
  const selectedTiles = Array.from(
    document.querySelectorAll('.panel-tile[data-selected="true"]'),
  );
  const allowed_panels = [];
  selectedTiles.forEach((el) => {
    const panels = JSON.parse(el.dataset.panels || "[]");
    allowed_panels.push(...panels);
  });

  const payload = {
    name: $c("shop-name").value.trim(),
    allowed_panels: [...new Set(allowed_panels)],
  };
  if (!payload.name) return toast("Name required", "error");

  if (!id) {
    const adminUsername = $c("shop-admin-username").value.trim();
    const adminPassword = $c("shop-admin-password").value.trim();
    if (!adminUsername || !adminPassword)
      return toast("Admin credentials required", "error");
    payload.adminUsername = adminUsername;
    payload.adminPassword = adminPassword;
  }

  const method = id ? "PATCH" : "POST";
  const url = id ? `/api/shops/${id}` : "/api/shops";

  const r = await api(url, method, payload);
  if (r.error) return toast(r.error, "error");

  toast(id ? "Shop updated" : "Shop created & admin added");
  closeModal();
  renderHierarchy();
}

async function deleteShop(id) {
  if (id === 1) return toast("Cannot delete main shop", "warning");
  if (!confirm("Delete shop and all its data? This cannot be undone.")) return;
  await api(`/api/shops/${id}`, "DELETE");
  toast("Shop deleted");
  renderHierarchy();
}
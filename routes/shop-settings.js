const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const brandService = require('../services/BrandService');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "..", "public", "uploads", "receipt-assets");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `shop-${req.session.user.shop_id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// GET /api/shop-settings
router.get("/", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });

    const isPostgres = usePostgres();
    const query = `SELECT id, name, logo_path, logo_data, receipt_header_text, receipt_extended_name, receipt_phone, receipt_address, 
                receipt_images_json, receipt_policies, use_logo_on_receipt, use_text_on_receipt, receipt_font_family,
                header_font_size, header_font_weight, header_spacing,
                extended_name_font_size, extended_name_font_weight, extended_name_spacing,
                contact_font_size, contact_align, contact_padding,
                footer_font_size, footer_font_style, footer_margin,
                divider_style, divider_width, section_gap, auto_calculate_damage_to_loss,
                customer_bill_printer, unpaid_bill_printer, currency_code
         FROM shops WHERE id = ${isPostgres ? '$1' : '?'}`;

    let shop;
    if (isPostgres) shop = (await getPostgres().query(query, [shopId])).rows[0];
    else shop = getSqlite().prepare(query).get(shopId);

    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const parseJson = (val) => {
        if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return []; } }
        return val || [];
    };
    shop.receipt_images = parseJson(shop.receipt_images_json);
    delete shop.receipt_images_json;

    shop.use_logo_on_receipt = !!shop.use_logo_on_receipt;
    shop.use_text_on_receipt = !!shop.use_text_on_receipt;
    if (shop.logo_data) shop.logo_url = shop.logo_data;
    else if (shop.logo_path) shop.logo_url = `/uploads/receipt-assets/${path.basename(shop.logo_path)}`;

    res.json(shop);
  } catch (e) {
    console.error("Fetch settings error:", e);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /api/shop-settings
router.post("/", requireAuth, requireAdmin, upload.single("logo"), async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });

    const fields = [
      "receipt_header_text", "receipt_extended_name", "receipt_phone", "receipt_address", "receipt_policies",
      "use_logo_on_receipt", "use_text_on_receipt", "receipt_font_family", "header_font_size", "header_font_weight",
      "header_spacing", "extended_name_font_size", "extended_name_font_weight", "extended_name_spacing",
      "contact_font_size", "contact_align", "contact_padding", "footer_font_size", "footer_font_style",
      "footer_margin", "divider_style", "divider_width", "section_gap", "auto_calculate_damage_to_loss",
      "customer_bill_printer", "unpaid_bill_printer", "logo_data", "currency_code"
    ];

    const updates = [];
    const values = [];

    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            let val = req.body[f];
            if (f === "currency_code") {
                const allowed = ["PKR", "USD", "INR", "EUR", "GBP", "AED", "SAR", "BDT", "CAD", "AUD"];
                val = allowed.includes(String(val).toUpperCase()) ? String(val).toUpperCase() : "PKR";
            } else if (["use_logo_on_receipt", "use_text_on_receipt", "auto_calculate_damage_to_loss"].includes(f)) {
                val = (val === "true" || val === true || val === 1) ? 1 : 0;
            }
            updates.push(`${f} = ${isPostgres ? '$' + (values.push(val)) : '?'}`);
            if (!isPostgres) values.push(val);
        }
    });

    if (req.file) {
      let current;
      if (isPostgres) current = (await getPostgres().query("SELECT logo_path FROM shops WHERE id = $1", [shopId])).rows[0];
      else current = getSqlite().prepare("SELECT logo_path FROM shops WHERE id = ?").get(shopId);
      if (current?.logo_path) {
          const oldPath = path.join(__dirname, "..", "public", current.logo_path);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const relPath = `/uploads/receipt-assets/${req.file.filename}`;
      updates.push(`logo_path = ${isPostgres ? '$' + (values.push(relPath)) : '?'}`);
      if (!isPostgres) values.push(relPath);
    }

    if (updates.length > 0) {
        const query = `UPDATE shops SET ${updates.join(", ")} WHERE id = ${isPostgres ? '$' + (values.push(shopId)) : '?'}`;
        if (!isPostgres) values.push(shopId);
        if (isPostgres) await getPostgres().query(query, values);
        else getSqlite().prepare(query).run(...values);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Update settings error:", e);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// POST /api/shop-settings/images
router.post("/images", requireAuth, requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.status(403).json({ error: "No shop assigned" });
    
    // Support both file upload and direct logo_data (compressed Base64)
    const logoData = req.body.logo_data;
    if (!req.file && !logoData) return res.status(400).json({ error: "Missing image data" });

    const isPostgres = usePostgres();
    const { description } = req.body;
    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT receipt_images_json FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);

    let images = [];
    if (shop?.receipt_images_json) {
        try { images = typeof shop.receipt_images_json === 'string' ? JSON.parse(shop.receipt_images_json) : shop.receipt_images_json; } catch(e) { images = []; }
    }

    const imgPath = logoData ? logoData : `/uploads/receipt-assets/${req.file.filename}`;
    const newImg = { id: Date.now().toString(), path: imgPath, description: description || "", created_at: new Date().toISOString() };
    images.push(newImg);

    if (isPostgres) await getPostgres().query("UPDATE shops SET receipt_images_json = $1 WHERE id = $2", [JSON.stringify(images), shopId]);
    else getSqlite().prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(JSON.stringify(images), shopId);

    res.json({ ok: true, image: newImg });
  } catch (e) {
    console.error("Image upload error:", e);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// DELETE /api/shop-settings/logo
router.delete("/logo", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT logo_path FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT logo_path FROM shops WHERE id = ?").get(shopId);

    if (shop?.logo_path) {
      const fullPath = path.join(__dirname, "..", "public", shop.logo_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    if (isPostgres) await getPostgres().query("UPDATE shops SET logo_path = NULL, logo_data = NULL WHERE id = $1", [shopId]);
    else getSqlite().prepare("UPDATE shops SET logo_path = NULL, logo_data = NULL WHERE id = ?").run(shopId);
    res.json({ ok: true });
  } catch (e) {
    console.error("Logo delete error:", e);
    res.status(500).json({ error: "Failed to delete logo" });
  }
});

// DELETE /api/shop-settings/images/:id
router.delete("/images/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const imageId = req.params.id;
    const isPostgres = usePostgres();

    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT receipt_images_json FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);

    let images = [];
    if (shop?.receipt_images_json) {
        try { images = typeof shop.receipt_images_json === 'string' ? JSON.parse(shop.receipt_images_json) : shop.receipt_images_json; } catch(e) { images = []; }
    }
    const img = images.find(i => i.id === imageId);
    if (!img) return res.status(404).json({ error: "Not found" });

    if (img.path && !img.path.startsWith("data:")) {
      const fullPath = path.join(__dirname, "..", "public", img.path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    images = images.filter(i => i.id !== imageId);

    if (isPostgres) await getPostgres().query("UPDATE shops SET receipt_images_json = $1 WHERE id = $2", [JSON.stringify(images), shopId]);
    else getSqlite().prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(JSON.stringify(images), shopId);

    res.json({ ok: true });
  } catch (e) {
    console.error("Image delete error:", e);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// --- Discounts & Taxes Prefab Logic ---

// Commission partners are deliberately separate from whole-business partners.
router.get("/partner-allocations", requireAuth, async (req, res) => {
  try {
    const settings = await brandService.getAllocationSettings(req.session.user.shop_id);
    const inventory = await brandService.getInventoryShares(req.session.user.shop_id);
    res.json({ ...settings, inventoryValue: inventory.totalInventoryValue });
  } catch (e) { res.status(500).json({ error: e.message || 'Failed to load partner allocations' }); }
});

router.put("/partner-allocations", requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await brandService.saveAllocationSettings(req.session.user.shop_id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message || 'Failed to save partner allocations' }); }
});

router.get("/commission-partners", requireAuth, async (req, res) => {
  try {
    const rows = await require("../db/knex")('third_party_persons')
      .where({ shop_id: req.session.user.shop_id })
      .orderBy('name', 'asc');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch commission partners" });
  }
});

router.post("/commission-partners", requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require("../db/knex");
    const name = String(req.body.name || '').trim();
    const percentage = Number(req.body.default_commission_percentage);
    if (!name) return res.status(400).json({ error: "Partner name is required" });
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return res.status(400).json({ error: "Commission must be between 0 and 100" });
    }
    const [idObj] = await db('third_party_persons').insert({
      shop_id: req.session.user.shop_id,
      name,
      phone: String(req.body.phone || '').trim() || null,
      notes: String(req.body.notes || '').trim() || null,
      default_commission_percentage: percentage,
      maintain_cost_price: req.body.maintain_cost_price !== false,
      status: 'active'
    }).returning('id');
    res.json({ ok: true, id: typeof idObj === 'object' ? idObj.id : idObj });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to save commission partner" });
  }
});

router.put("/commission-partners/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require("../db/knex");
    const name = String(req.body.name || '').trim();
    const percentage = Number(req.body.default_commission_percentage);
    if (!name) return res.status(400).json({ error: "Partner name is required" });
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return res.status(400).json({ error: "Commission must be between 0 and 100" });
    }
    const updated = await db('third_party_persons')
      .where({ id: req.params.id, shop_id: req.session.user.shop_id })
      .update({ name, phone: req.body.phone || null, notes: req.body.notes || null,
        default_commission_percentage: percentage, maintain_cost_price: req.body.maintain_cost_price !== false,
        status: req.body.status === 'inactive' ? 'inactive' : 'active', updated_at: db.fn.now() });
    if (!updated) return res.status(404).json({ error: "Commission partner not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to update commission partner" });
  }
});

router.delete("/commission-partners/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require("../db/knex");
    const inUse = await db('products').where({ shop_id: req.session.user.shop_id, third_party_person_id: req.params.id }).first();
    const hasHistory = await db('sale_items as si').join('sales as s', 'si.sale_id', 's.id')
      .where({ 's.shop_id': req.session.user.shop_id, 'si.third_party_person_id': req.params.id }).first();
    if (inUse || hasHistory) return res.status(409).json({ error: "This partner has products or sales history. Mark it inactive to preserve reports." });
    await db('third_party_persons').where({ id: req.params.id, shop_id: req.session.user.shop_id }).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete commission partner" });
  }
});

// GET /api/shop-settings/discounts
router.get("/discounts", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    const query = `SELECT * FROM discounts WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
    let rows;
    if (isPostgres) rows = (await getPostgres().query(query, [shopId])).rows;
    else rows = getSqlite().prepare(query).all(shopId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch discounts" });
  }
});

// POST /api/shop-settings/discounts
router.post("/discounts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const { name, type, value } = req.body;
    if (!name || !value) return res.status(400).json({ error: "Missing name or value" });

    const isPostgres = usePostgres();
    if (isPostgres) {
      await getPostgres().query(
        "INSERT INTO discounts (shop_id, name, type, value) VALUES ($1, $2, $3, $4)",
        [shopId, name, type || 'percentage', value]
      );
    } else {
      getSqlite().prepare(
        "INSERT INTO discounts (shop_id, name, type, value) VALUES (?, ?, ?, ?)"
      ).run(shopId, name, type || 'percentage', value);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save discount" });
  }
});

// DELETE /api/shop-settings/discounts/:id
router.delete("/discounts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (isPostgres) await getPostgres().query("DELETE FROM discounts WHERE id = $1 AND shop_id = $2", [req.params.id, shopId]);
    else getSqlite().prepare("DELETE FROM discounts WHERE id = ? AND shop_id = ?").run(req.params.id, shopId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete discount" });
  }
});

// GET /api/shop-settings/taxes
router.get("/taxes", requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    const query = `SELECT * FROM taxes WHERE shop_id = ${isPostgres ? '$1' : '?'}`;
    let rows;
    if (isPostgres) rows = (await getPostgres().query(query, [shopId])).rows;
    else rows = getSqlite().prepare(query).all(shopId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch taxes" });
  }
});

// POST /api/shop-settings/taxes
router.post("/taxes", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const { name, percentage, linked_payment_method } = req.body;
    if (!name || percentage === undefined) return res.status(400).json({ error: "Missing name or percentage" });

    const isPostgres = usePostgres();
    if (isPostgres) {
      await getPostgres().query(
        "INSERT INTO taxes (shop_id, name, percentage, linked_payment_method) VALUES ($1, $2, $3, $4)",
        [shopId, name, percentage, linked_payment_method || null]
      );
    } else {
      getSqlite().prepare(
        "INSERT INTO taxes (shop_id, name, percentage, linked_payment_method) VALUES (?, ?, ?, ?)"
      ).run(shopId, name, percentage, linked_payment_method || null);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save tax" });
  }
});

// DELETE /api/shop-settings/taxes/:id
router.delete("/taxes/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    if (isPostgres) await getPostgres().query("DELETE FROM taxes WHERE id = $1 AND shop_id = $2", [req.params.id, shopId]);
    else getSqlite().prepare("DELETE FROM taxes WHERE id = ? AND shop_id = ?").run(req.params.id, shopId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete tax" });
  }
});

module.exports = router;

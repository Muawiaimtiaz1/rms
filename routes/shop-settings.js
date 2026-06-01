const express = require("express");
const { getSqlite, getPostgres, usePostgres } = require("../db/runtime");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

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
    const query = `SELECT id, name, logo_path, receipt_header_text, receipt_extended_name, receipt_phone, receipt_address, 
                receipt_images_json, receipt_policies, use_logo_on_receipt, use_text_on_receipt, receipt_font_family,
                header_font_size, header_font_weight, header_spacing,
                extended_name_font_size, extended_name_font_weight, extended_name_spacing,
                contact_font_size, contact_align, contact_padding,
                footer_font_size, footer_font_style, footer_margin,
                divider_style, divider_width, section_gap, auto_calculate_damage_to_loss,
                customer_bill_printer, unpaid_bill_printer
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
    if (shop.logo_path) shop.logo_url = `/uploads/receipt-assets/${path.basename(shop.logo_path)}`;

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
      "customer_bill_printer", "unpaid_bill_printer"
    ];

    const updates = [];
    const values = [];

    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            let val = req.body[f];
            if (["use_logo_on_receipt", "use_text_on_receipt", "auto_calculate_damage_to_loss"].includes(f)) {
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
    if (!shopId || !req.file) return res.status(400).json({ error: "Missing data" });

    const isPostgres = usePostgres();
    const { description } = req.body;
    let shop;
    if (isPostgres) shop = (await getPostgres().query("SELECT receipt_images_json FROM shops WHERE id = $1", [shopId])).rows[0];
    else shop = getSqlite().prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);

    let images = [];
    if (shop?.receipt_images_json) {
        try { images = typeof shop.receipt_images_json === 'string' ? JSON.parse(shop.receipt_images_json) : shop.receipt_images_json; } catch(e) { images = []; }
    }
    const newImg = { id: Date.now().toString(), path: `/uploads/receipt-assets/${req.file.filename}`, description: description || "", created_at: new Date().toISOString() };
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

    if (isPostgres) await getPostgres().query("UPDATE shops SET logo_path = NULL WHERE id = $1", [shopId]);
    else getSqlite().prepare("UPDATE shops SET logo_path = NULL WHERE id = ?").run(shopId);
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

    const fullPath = path.join(__dirname, "..", "public", img.path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
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

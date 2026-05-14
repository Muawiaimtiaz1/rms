const express = require("express");
const db = require("../db/db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "..", "public", "uploads", "receipt-assets");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `shop-${req.session.user.shop_id}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed"));
    }
  },
});

// GET /api/shop-settings — Get current shop receipt settings
router.get("/", requireAuth, (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) {
      return res.status(403).json({ error: "No shop assigned to user" });
    }

    const shop = db
      .prepare(
        `SELECT id, name, logo_path, receipt_header_text, receipt_extended_name, receipt_phone, receipt_address, 
                receipt_images_json, receipt_policies, use_logo_on_receipt, use_text_on_receipt, receipt_font_family,
                header_font_size, header_font_weight, header_spacing,
                extended_name_font_size, extended_name_font_weight, extended_name_spacing,
                contact_font_size, contact_align, contact_padding,
                footer_font_size, footer_font_style, footer_margin,
                divider_style, divider_width, section_gap, auto_calculate_damage_to_loss
         FROM shops WHERE id = ?`
      )
      .get(shopId);

    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Parse JSON fields
    if (shop.receipt_images_json) {
      try {
        shop.receipt_images = JSON.parse(shop.receipt_images_json);
      } catch (e) {
        shop.receipt_images = [];
      }
    } else {
      shop.receipt_images = [];
    }
    delete shop.receipt_images_json;

    // Convert to boolean
    shop.use_logo_on_receipt = shop.use_logo_on_receipt === 1;
    shop.use_text_on_receipt = shop.use_text_on_receipt === 1;

    // Generate full URLs for images
    if (shop.logo_path) {
      shop.logo_url = `/uploads/receipt-assets/${path.basename(shop.logo_path)}`;
    }

    res.json(shop);
  } catch (e) {
    console.error("Shop settings fetch error:", e);
    res.status(500).json({ error: "Failed to fetch shop settings" });
  }
});

// POST /api/shop-settings — Update shop receipt settings
router.post("/", requireAuth, requireAdmin, upload.single("logo"), (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) {
      return res.status(403).json({ error: "No shop assigned to user" });
    }

    const {
      receipt_header_text,
      receipt_extended_name,
      receipt_phone,
      receipt_address,
      receipt_policies,
      use_logo_on_receipt,
      use_text_on_receipt,
      receipt_font_family,
      header_font_size,
      header_font_weight,
      header_spacing,
      extended_name_font_size,
      extended_name_font_weight,
      extended_name_spacing,
      contact_font_size,
      contact_align,
      contact_padding,
      footer_font_size,
      footer_font_style,
      footer_margin,
      divider_style,
      divider_width,
      section_gap,
      auto_calculate_damage_to_loss
    } = req.body;

    // Build update fields
    const updates = [];
    const values = [];

    if (receipt_header_text !== undefined) {
      updates.push("receipt_header_text = ?");
      values.push(receipt_header_text);
    }
    
    if (receipt_extended_name !== undefined) {
      updates.push("receipt_extended_name = ?");
      values.push(receipt_extended_name);
    }

    if (receipt_phone !== undefined) {
      updates.push("receipt_phone = ?");
      values.push(receipt_phone);
    }

    if (receipt_address !== undefined) {
      updates.push("receipt_address = ?");
      values.push(receipt_address);
    }

    if (receipt_policies !== undefined) {
      updates.push("receipt_policies = ?");
      values.push(receipt_policies);
    }

    if (use_logo_on_receipt !== undefined) {
      updates.push("use_logo_on_receipt = ?");
      values.push(use_logo_on_receipt === "true" || use_logo_on_receipt === true || use_logo_on_receipt === 1 ? 1 : 0);
    }
    if (use_text_on_receipt !== undefined) {
      updates.push("use_text_on_receipt = ?");
      values.push(use_text_on_receipt === "true" || use_text_on_receipt === true || use_text_on_receipt === 1 ? 1 : 0);
    }

    if (receipt_font_family !== undefined) {
      updates.push("receipt_font_family = ?");
      values.push(receipt_font_family);
    }

    // Typography settings
    if (header_font_size !== undefined) {
      updates.push("header_font_size = ?");
      values.push(parseInt(header_font_size) || 18);
    }
    if (header_font_weight !== undefined) {
      updates.push("header_font_weight = ?");
      values.push(header_font_weight);
    }
    if (header_spacing !== undefined) {
      updates.push("header_spacing = ?");
      values.push(parseInt(header_spacing) || 10);
    }
    if (extended_name_font_size !== undefined) {
      updates.push("extended_name_font_size = ?");
      values.push(parseInt(extended_name_font_size) || 10);
    }
    if (extended_name_font_weight !== undefined) {
      updates.push("extended_name_font_weight = ?");
      values.push(extended_name_font_weight);
    }
    if (extended_name_spacing !== undefined) {
      updates.push("extended_name_spacing = ?");
      values.push(parseInt(extended_name_spacing) || 2);
    }
    if (contact_font_size !== undefined) {
      updates.push("contact_font_size = ?");
      values.push(parseInt(contact_font_size) || 10);
    }
    if (contact_align !== undefined) {
      updates.push("contact_align = ?");
      values.push(contact_align);
    }
    if (contact_padding !== undefined) {
      updates.push("contact_padding = ?");
      values.push(parseInt(contact_padding) || 10);
    }
    if (footer_font_size !== undefined) {
      updates.push("footer_font_size = ?");
      values.push(parseInt(footer_font_size) || 9);
    }
    if (footer_font_style !== undefined) {
      updates.push("footer_font_style = ?");
      values.push(footer_font_style);
    }
    if (footer_margin !== undefined) {
      updates.push("footer_margin = ?");
      values.push(parseInt(footer_margin) || 10);
    }
    if (divider_style !== undefined) {
      updates.push("divider_style = ?");
      values.push(divider_style);
    }
    if (divider_width !== undefined) {
      updates.push("divider_width = ?");
      values.push(parseInt(divider_width) || 1);
    }
    if (section_gap !== undefined) {
      updates.push("section_gap = ?");
      values.push(parseInt(section_gap) || 10);
    }
    if (auto_calculate_damage_to_loss !== undefined) {
      updates.push("auto_calculate_damage_to_loss = ?");
      values.push(auto_calculate_damage_to_loss === "true" || auto_calculate_damage_to_loss === true || auto_calculate_damage_to_loss === 1 ? 1 : 0);
    }

    // Handle logo upload
    if (req.file) {
      // Delete old logo if exists
      const current = db.prepare("SELECT logo_path FROM shops WHERE id = ?").get(shopId);
      if (current?.logo_path) {
        const oldPath = path.join(__dirname, "..", "public", current.logo_path);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const relativePath = `/uploads/receipt-assets/${req.file.filename}`;
      updates.push("logo_path = ?");
      values.push(relativePath);
    }

    if (updates.length === 0) {
      return res.json({ ok: true, message: "No changes made" });
    }

    values.push(shopId);

    const query = `UPDATE shops SET ${updates.join(", ")} WHERE id = ?`;
    db.prepare(query).run(...values);

    res.json({ ok: true, message: "Settings updated successfully" });
  } catch (e) {
    console.error("Shop settings update error:", e);
    res.status(500).json({ error: "Failed to update shop settings" });
  }
});

// POST /api/shop-settings/images — Add receipt image
router.post("/images", requireAuth, requireAdmin, upload.single("image"), (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) {
      return res.status(403).json({ error: "No shop assigned to user" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const { description } = req.body;
    const relativePath = `/uploads/receipt-assets/${req.file.filename}`;

    // Get current images
    const shop = db.prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);
    let images = [];
    if (shop?.receipt_images_json) {
      try {
        images = JSON.parse(shop.receipt_images_json);
      } catch (e) {
        images = [];
      }
    }

    // Add new image
    images.push({
      id: Date.now().toString(),
      path: relativePath,
      description: description || "",
      created_at: new Date().toISOString(),
    });

    // Save back
    db.prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(
      JSON.stringify(images),
      shopId
    );

    res.json({ ok: true, image: images[images.length - 1] });
  } catch (e) {
    console.error("Image upload error:", e);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// DELETE /api/shop-settings/logo — Remove logo
router.delete("/logo", requireAuth, requireAdmin, (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    if (!shopId) {
      return res.status(403).json({ error: "No shop assigned to user" });
    }

    const shop = db.prepare("SELECT logo_path FROM shops WHERE id = ?").get(shopId);
    if (shop?.logo_path) {
      const fullPath = path.join(__dirname, "..", "public", shop.logo_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    db.prepare("UPDATE shops SET logo_path = NULL WHERE id = ?").run(shopId);
    res.json({ ok: true });
  } catch (e) {
    console.error("Logo delete error:", e);
    res.status(500).json({ error: "Failed to delete logo" });
  }
});

// DELETE /api/shop-settings/images/:id — Remove receipt image
router.delete("/images/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const imageId = req.params.id;

    if (!shopId) {
      return res.status(403).json({ error: "No shop assigned to user" });
    }

    const shop = db.prepare("SELECT receipt_images_json FROM shops WHERE id = ?").get(shopId);
    let images = [];
    if (shop?.receipt_images_json) {
      try {
        images = JSON.parse(shop.receipt_images_json);
      } catch (e) {
        images = [];
      }
    }

    const imageToDelete = images.find((img) => img.id === imageId);
    if (!imageToDelete) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Delete file
    const fullPath = path.join(__dirname, "..", "public", imageToDelete.path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // Remove from array
    images = images.filter((img) => img.id !== imageId);

    db.prepare("UPDATE shops SET receipt_images_json = ? WHERE id = ?").run(
      JSON.stringify(images),
      shopId
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("Image delete error:", e);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

module.exports = router;

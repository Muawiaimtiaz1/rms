const express = require('express');
const productService = require('../services/ProductService');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// MULTER CONFIG FOR PRODUCT IMAGES (Kept in routes as it's part of the HTTP transport layer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, "..", "public", "uploads", "products");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `prod-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only images (jpg, png, webp) allowed"));
    }
  },
});

// GET /api/products
router.get('/', requireAuth, async (req, res) => {
    const products = await productService.getAllProducts(req.session.user.shop_id);
    res.json(products);
});

// POST /api/products
router.post('/', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    const { components, ingredients } = req.body;
    
    // Parse strings to arrays if needed (FormData sends strings)
    const parse = (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch(e) { return []; }
      }
      return val || [];
    }

    const payload = {
      ...req.body,
      barcode: req.body.barcode || null,
      brand_id: parseInt(req.body.brand_id),
      buying_price: parseFloat(req.body.buying_price),
      selling_price: parseFloat(req.body.selling_price),
      stock: parseInt(req.body.stock) || 0,
      min_stock_level: parseInt(req.body.min_stock_level) || 0,
      min_stock_level: parseInt(req.body.min_stock_level) || 0,
      components: parse(components),
      ingredients: parse(ingredients),
      image_path: req.file ? "/uploads/products/" + req.file.filename : null
    };

    const productId = await productService.createProduct(payload, req.session.user.shop_id, req.session.user.id);
    res.json({ ok: true, id: productId });
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await productService.setDeleted(req.params.id, req.session.user.shop_id);
  res.json({ ok: true });
});

// PUT /api/products/:id
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
    const { components, ingredients } = req.body;
    const parse = (val) => {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch(e) { return []; }
        }
        return val || [];
    }
    const payload = {
        ...req.body,
        barcode: req.body.barcode || null,
        brand_id: parseInt(req.body.brand_id),
        buying_price: parseFloat(req.body.buying_price),
        selling_price: parseFloat(req.body.selling_price),
        stock: req.body.stock !== undefined ? parseInt(req.body.stock) : undefined,
        min_stock_level: parseInt(req.body.min_stock_level) || 0,
        min_stock_level: parseInt(req.body.min_stock_level) || 0,
        components: parse(components),
        ingredients: parse(ingredients),
    };
    if (req.file) payload.image_path = "/uploads/products/" + req.file.filename;

    await productService.updateProduct(req.params.id, payload, req.session.user.shop_id, req.session.user.id);
    res.json({ ok: true });
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', requireAuth, async (req, res) => {
    const newStock = await productService.adjustStock(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true, stock: newStock });
});

// POST /api/products/:id/harvest
router.post('/:id/harvest', requireAuth, async (req, res) => {
    const newStock = await productService.harvest(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true, new_stock: newStock });
});

// PATCH /api/products/:id/damage/loss
router.patch('/:id/damage/loss', requireAuth, async (req, res) => {
    await productService.recordLoss(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true });
});

// PATCH /api/products/:id/damage/recovery
router.patch('/:id/damage/recovery', requireAuth, async (req, res) => {
    await productService.recordRecovery(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true });
});

module.exports = router;

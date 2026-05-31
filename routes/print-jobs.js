const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const { protect } = require('../middleware/auth');

/**
 * Poll for pending print jobs (Used by Local Print Agent)
 */
router.get('/poll', async (req, res) => {
  const { shop_id, api_key } = req.query;
  
  if (!shop_id) return res.status(400).json({ error: "shop_id required" });

  // Simple authentication: Check if shop exists
  // In a real world, we'd use a dedicated API KEY for the printer agent
  const shop = await db('shops').where({ id: shop_id }).first();
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  try {
    const jobs = await db('print_queue')
      .where({ shop_id, status: 'pending' })
      .orderBy('created_at', 'asc')
      .limit(10);

    res.json({
      jobs,
      shop_settings: {
        id: shop.id,
        name: shop.name,
        receipt_header_text: shop.receipt_header_text,
        receipt_extended_name: shop.receipt_extended_name,
        receipt_phone: shop.receipt_phone,
        receipt_address: shop.receipt_address,
        receipt_policies: shop.receipt_policies,
        use_logo_on_receipt: !!shop.use_logo_on_receipt,
        use_text_on_receipt: !!shop.use_text_on_receipt,
        receipt_font_family: shop.receipt_font_family,
        header_font_size: shop.header_font_size,
        header_font_weight: shop.header_font_weight,
        header_spacing: shop.header_spacing,
        extended_name_font_size: shop.extended_name_font_size,
        extended_name_font_weight: shop.extended_name_font_weight,
        extended_name_spacing: shop.extended_name_spacing,
        contact_font_size: shop.contact_font_size,
        contact_align: shop.contact_align,
        contact_padding: shop.contact_padding,
        footer_font_size: shop.footer_font_size,
        footer_font_style: shop.footer_font_style,
        footer_margin: shop.footer_margin,
        divider_style: shop.divider_style,
        divider_width: shop.divider_width,
        section_gap: shop.section_gap
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mark job as printed
 */
router.post('/:id/confirm', async (req, res) => {
  const { id } = req.params;
  try {
    await db('print_queue').where({ id }).update({ status: 'printed' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

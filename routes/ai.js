const express = require('express');
const aiService = require('../services/AIAnalystService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/ai/insights
router.get('/insights', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const period = req.query.period || '30days';
  
  const insights = await aiService.getInsights(shopId, period);
  res.json(insights);
});

module.exports = router;

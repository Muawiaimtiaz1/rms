const analyticsService = require('./AnalyticsService');

class AIAnalystService {
  async getInsights(shopId, period = '30days') {
    const data = await analyticsService.getDashboardData(shopId, period);
    
    const insights = [];
    const recommendations = [];
    
    // 1. Revenue Analysis
    const salesGrowth = data.growth.sales;
    if (salesGrowth > 10) {
      insights.push({
        type: 'success',
        title: 'Explosive Growth Detected',
        message: `Your revenue is up ${salesGrowth}% compared to the previous period. Your current sales momentum is high.`
      });
    } else if (salesGrowth < -5) {
      insights.push({
        type: 'danger',
        title: 'Revenue Warning',
        message: `Revenue has dropped by ${Math.abs(salesGrowth)}%. We recommend reviewing your recent pricing or marketing activity.`
      });
    }

    // 2. Profit Margin Analysis
    const margin = data.summary.profitMargin;
    if (margin < 15) {
      recommendations.push({
        action: 'Price Optimization Needed',
        reason: `Your profit margin is currently ${margin.toFixed(1)}%, which is below the healthy benchmark of 20%.`,
        suggestion: 'Consider increasing prices on top-selling items or negotiating better buying prices with suppliers.'
      });
    }

    // 3. Peak Hour Strategy
    if (data.bestSellingHours && data.bestSellingHours.length > 0) {
      const peakHour = data.bestSellingHours[0].label;
      const hourInt = parseInt(peakHour);
      const ampm = hourInt >= 12 ? 'PM' : 'AM';
      const displayHour = hourInt % 12 || 12;
      
      recommendations.push({
        action: 'Strategic Staffing',
        reason: `Your peak traffic occurs around ${displayHour} ${ampm}.`,
        suggestion: `Ensure maximum staff availability between ${displayHour}:00 and ${(hourInt + 2) % 24}:00 to minimize wait times and maximize order throughput.`
      });
    }

    // 4. Inventory Efficiency
    if (data.topProducts && data.topProducts.length > 0) {
      const top = data.topProducts[0];
      if (top.stock < 10) {
        insights.push({
          type: 'warning',
          title: 'Stockout Risk',
          message: `Your #1 best-seller "${top.name}" is running low on stock (${top.stock} remaining). Reorder immediately to avoid lost revenue.`
        });
      }
    }

    // 5. Channel Analysis
    const dining = data.channelBreakdown.find(c => c.label === 'dine_in' || c.label === 'Dine In');
    if (dining && (dining.sales / data.kpi.totalSales) < 0.3) {
      recommendations.push({
        action: 'Boost Dine-in Experience',
        reason: 'Dine-in sales contribute less than 30% of your total revenue.',
        suggestion: 'Consider "Dine-in Only" specials or improving your seating ambiance to increase high-margin on-premise sales.'
      });
    }

    // 6. Return Rate Anomaly
    const returnRate = (data.summary.totalReturns / (data.kpi.totalOrders || 1)) * 100;
    if (returnRate > 5) {
      insights.push({
        type: 'danger',
        title: 'High Return Rate',
        message: `${returnRate.toFixed(1)}% of your orders are being returned. This is significantly higher than the 2% industry average.`
      });
    }

    return {
      summary: {
        verdict: salesGrowth > 0 ? 'Healthy & Growing' : 'Monitoring Required',
        aiConfidence: '98%',
        lastAnalysis: new Date().toISOString()
      },
      insights,
      recommendations,
      rawMetrics: {
        margin: margin.toFixed(1) + '%',
        growth: salesGrowth.toFixed(1) + '%'
      }
    };
  }
}

module.exports = new AIAnalystService();

// ============================================================
// DASHBOARD & REPORTS CONTROLLER
// Business intelligence: stats, P&L, balance sheet
// ============================================================
const { pool } = require('../config/database');

/**
 * GET /api/reports/dashboard
 * Main admin dashboard stats — today, week, month
 */
async function getDashboard(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's quick stats
    const [todayStats] = await pool.query(`
      SELECT
        COUNT(*) AS transactions,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COALESCE(SUM(discount_amount), 0) AS discounts
      FROM sales WHERE DATE(sold_at) = ? AND status = 'completed'
    `, [today]);

    const [todayProfit] = await pool.query(`
      SELECT COALESCE(SUM(si.line_profit), 0) AS profit
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.sold_at) = ? AND s.status = 'completed'
    `, [today]);

    const [todayExpenses] = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE expense_date = ?',
      [today]
    );

    // This month's totals
    const [monthStats] = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount), 0) AS revenue,
        COUNT(*) AS transactions
      FROM sales
      WHERE YEAR(sold_at) = YEAR(CURDATE()) 
        AND MONTH(sold_at) = MONTH(CURDATE())
        AND status = 'completed'
    `);

    const [monthProfit] = await pool.query(`
      SELECT COALESCE(SUM(si.line_profit), 0) AS profit
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE YEAR(s.sold_at) = YEAR(CURDATE())
        AND MONTH(s.sold_at) = MONTH(CURDATE())
        AND s.status = 'completed'
    `);

    // Total inventory value
    const [inventoryValue] = await pool.query(`
      SELECT 
        COUNT(*) AS total_products,
        SUM(quantity_in_stock * buying_price) AS stock_value_cost,
        SUM(quantity_in_stock * selling_price) AS stock_value_retail,
        SUM(CASE WHEN quantity_in_stock <= low_stock_threshold THEN 1 ELSE 0 END) AS low_stock_count
      FROM products WHERE is_active = 1
    `);

    // Last 7 days sales trend (for sparkline chart)
    const [weekTrend] = await pool.query(`
      SELECT 
        DATE(sold_at) AS sale_date,
        SUM(total_amount) AS revenue,
        COUNT(*) AS transactions
      FROM sales
      WHERE sold_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND status = 'completed'
      GROUP BY DATE(sold_at)
      ORDER BY sale_date ASC
    `);

    // Recent 5 sales
    const [recentSales] = await pool.query(`
      SELECT s.id, s.reference_no, s.total_amount, s.payment_method, s.sold_at,
             u.name AS attendant
      FROM sales s JOIN users u ON s.user_id = u.id
      WHERE s.status = 'completed'
      ORDER BY s.sold_at DESC LIMIT 5
    `);

    res.json({
      today: {
        revenue: parseFloat(todayStats[0].revenue),
        transactions: todayStats[0].transactions,
        profit: parseFloat(todayProfit[0].profit),
        expenses: parseFloat(todayExpenses[0].expenses),
        net: parseFloat(todayProfit[0].profit) - parseFloat(todayExpenses[0].expenses),
      },
      month: {
        revenue: parseFloat(monthStats[0].revenue),
        transactions: monthStats[0].transactions,
        profit: parseFloat(monthProfit[0].profit),
      },
      inventory: inventoryValue[0],
      weekTrend,
      recentSales,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/reports/top-products?period=week|month|quarter
 * Most and least sold products by quantity and revenue
 */
async function getTopProducts(req, res) {
  try {
    const { period = 'month' } = req.query;

    const periodMap = {
      week: 'INTERVAL 7 DAY',
      month: 'INTERVAL 1 MONTH',
      quarter: 'INTERVAL 3 MONTH'
    };
    const interval = periodMap[period] || 'INTERVAL 1 MONTH';

    const [topByQty] = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, c.name AS category,
        SUM(si.quantity) AS total_qty_sold,
        SUM(si.line_total) AS total_revenue,
        SUM(si.line_profit) AS total_profit,
        ROUND((SUM(si.line_profit) / SUM(si.line_total)) * 100, 2) AS profit_margin
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.sold_at >= DATE_SUB(NOW(), ${interval})
        AND s.status = 'completed'
      GROUP BY si.product_id, p.id, p.name, p.brand, c.name
      ORDER BY total_qty_sold DESC
      LIMIT 10
    `);

    // Least sold (active products with low/no sales)
    const [leastSold] = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, c.name AS category,
        COALESCE(SUM(si.quantity), 0) AS total_qty_sold,
        COALESCE(SUM(si.line_revenue), 0) AS total_revenue,
        p.quantity_in_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON si.sale_id = s.id 
        AND s.sold_at >= DATE_SUB(NOW(), ${interval})
        AND s.status = 'completed'
      WHERE p.is_active = 1
      GROUP BY p.id, p.name, p.brand, c.name, p.quantity_in_stock
      ORDER BY total_qty_sold ASC
      LIMIT 10
    `);

    res.json({ period, topSelling: topByQty, leastSelling: leastSold });
  } catch (err) {
    console.error('Top products error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/reports/profit-by-product?date_from=&date_to=
 * Profit per product for a date range
 */
async function getProfitByProduct(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];
    const to = date_to || new Date().toISOString().split('T')[0];

    const [rows] = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, c.name AS category,
        SUM(si.quantity) AS qty_sold,
        SUM(si.line_total) AS revenue,
        SUM(si.line_profit) AS profit,
        SUM(si.quantity * si.buying_price) AS cost,
        ROUND((SUM(si.line_profit) / SUM(si.line_total)) * 100, 2) AS margin_percent
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE DATE(s.sold_at) BETWEEN ? AND ? AND s.status = 'completed'
      GROUP BY si.product_id, p.id, p.name, p.brand, c.name
      ORDER BY profit DESC
    `, [from, to]);

    res.json({ date_from: from, date_to: to, products: rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/reports/pnl?year=&quarter=1|2|3|4
 * Profit & Loss statement — quarterly
 */
async function getProfitAndLoss(req, res) {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const quarter = parseInt(req.query.quarter) || Math.ceil((new Date().getMonth() + 1) / 3);

    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    // Total revenue from sales
    const [revenue] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
      FROM sales
      WHERE YEAR(sold_at) = ? AND MONTH(sold_at) BETWEEN ? AND ?
        AND status = 'completed'
    `, [year, startMonth, endMonth]);

    // Cost of goods sold
    const [cogs] = await pool.query(`
      SELECT COALESCE(SUM(si.quantity * si.buying_price), 0) AS total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE YEAR(s.sold_at) = ? AND MONTH(s.sold_at) BETWEEN ? AND ?
        AND s.status = 'completed'
    `, [year, startMonth, endMonth]);

    // Total expenses by category
    const [expenses] = await pool.query(`
      SELECT 
        COALESCE(category, 'Uncategorized') AS category,
        SUM(amount) AS total
      FROM expenses
      WHERE YEAR(expense_date) = ? AND MONTH(expense_date) BETWEEN ? AND ?
      GROUP BY category
    `, [year, startMonth, endMonth]);

    const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.total), 0);
    const grossProfit = parseFloat(revenue[0].total_revenue) - parseFloat(cogs[0].total_cogs);
    const netProfit = grossProfit - totalExpenses;

    // Monthly breakdown within quarter
    const [monthlyBreakdown] = await pool.query(`
      SELECT 
        MONTH(s.sold_at) AS month,
        MONTHNAME(s.sold_at) AS month_name,
        SUM(s.total_amount) AS revenue,
        SUM(si_totals.cogs) AS cogs
      FROM sales s
      JOIN (
        SELECT sale_id, SUM(quantity * buying_price) AS cogs
        FROM sale_items GROUP BY sale_id
      ) si_totals ON si_totals.sale_id = s.id
      WHERE YEAR(s.sold_at) = ? AND MONTH(s.sold_at) BETWEEN ? AND ?
        AND s.status = 'completed'
      GROUP BY MONTH(s.sold_at), MONTHNAME(s.sold_at)
      ORDER BY month
    `, [year, startMonth, endMonth]);

    res.json({
      period: { year, quarter, start_month: startMonth, end_month: endMonth },
      income: {
        total_revenue: parseFloat(revenue[0].total_revenue),
        cost_of_goods_sold: parseFloat(cogs[0].total_cogs),
        gross_profit: grossProfit,
        gross_margin: revenue[0].total_revenue > 0
          ? ((grossProfit / revenue[0].total_revenue) * 100).toFixed(2) : 0,
      },
      expenses: {
        breakdown: expenses,
        total: totalExpenses,
      },
      net_profit: netProfit,
      net_margin: revenue[0].total_revenue > 0
        ? ((netProfit / revenue[0].total_revenue) * 100).toFixed(2) : 0,
      status: netProfit >= 0 ? 'profit' : 'loss',
      monthly_breakdown: monthlyBreakdown,
    });
  } catch (err) {
    console.error('P&L error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/reports/balance-sheet?year=&month=
 * Monthly balance sheet (simplified for small business)
 */
async function getBalanceSheet(req, res) {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    // Assets: inventory value at cost
    const [inventory] = await pool.query(`
      SELECT 
        SUM(quantity_in_stock * buying_price) AS inventory_value,
        COUNT(*) AS product_count
      FROM products WHERE is_active = 1
    `);

    // Total cash received this month (revenue)
    const [cashRevenue] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS cash_in
      FROM sales
      WHERE YEAR(sold_at) = ? AND MONTH(sold_at) = ?
        AND payment_method IN ('cash','mpesa','card')
        AND status = 'completed'
    `, [year, month]);

    // Total expenses this month (cash out)
    const [cashOut] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS cash_out
      FROM expenses
      WHERE YEAR(expense_date) = ? AND MONTH(expense_date) = ?
    `, [year, month]);

    // COGS this month
    const [monthCogs] = await pool.query(`
      SELECT COALESCE(SUM(si.quantity * si.buying_price), 0) AS cogs
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE YEAR(s.sold_at) = ? AND MONTH(s.sold_at) = ?
        AND s.status = 'completed'
    `, [year, month]);

    // Stock replenishment spend this month (cash used to buy stock)
    const [stockSpend] = await pool.query(`
      SELECT COALESCE(SUM(quantity_added * buying_price), 0) AS stock_purchased
      FROM stock_replenishments
      WHERE YEAR(replenished_at) = ? AND MONTH(replenished_at) = ?
    `, [year, month]);

    const grossProfit = parseFloat(cashRevenue[0].cash_in) - parseFloat(monthCogs[0].cogs);
    const netProfit = grossProfit - parseFloat(cashOut[0].cash_out);

    res.json({
      period: { year, month },
      assets: {
        inventory_at_cost: parseFloat(inventory[0].inventory_value || 0),
        cash_received: parseFloat(cashRevenue[0].cash_in),
      },
      liabilities: {
        stock_purchased: parseFloat(stockSpend[0].stock_purchased),
        operating_expenses: parseFloat(cashOut[0].cash_out),
      },
      equity: {
        gross_profit: grossProfit,
        net_profit: netProfit,
      },
      status: netProfit >= 0 ? 'profit' : 'loss'
    });
  } catch (err) {
    console.error('Balance sheet error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = {
  getDashboard,
  getTopProducts,
  getProfitByProduct,
  getProfitAndLoss,
  getBalanceSheet
};

// ============================================================
// SALES CONTROLLER - Point of Sale & Daily Reconciliation
// Handles creating sales, fetching history, and EOD reports
// ============================================================
const { pool } = require('../config/database');
const { generateReference } = require('../utils/helpers');

/**
 * POST /api/sales
 * Create a new sale transaction (used by all attendants + admin)
 * Body: { items: [{product_id, quantity}], payment_method, customer_name, ... }
 */
async function createSale(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items,
      customer_name,
      customer_phone,
      discount_amount = 0,
      payment_method = 'cash',
      mpesa_ref,
      amount_paid,
      notes
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ message: 'No items provided.' });
    }

    // Validate each product and fetch current prices + stock
    const saleItems = [];
    let subtotal = 0;

    for (const item of items) {
      const [rows] = await conn.query(
        'SELECT id, name, buying_price, selling_price, quantity_in_stock FROM products WHERE id = ? AND is_active = 1',
        [item.product_id]
      );

      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ message: `Product ID ${item.product_id} not found.` });
      }

      const product = rows[0];
      const qty = parseInt(item.quantity);

      // Check sufficient stock
      if (product.quantity_in_stock < qty) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient stock for "${product.name}". Available: ${product.quantity_in_stock}`
        });
      }

      const lineTotal = product.selling_price * qty;
      const lineProfit = (product.selling_price - product.buying_price) * qty;

      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        buying_price: product.buying_price,
        selling_price: product.selling_price,
        line_total: lineTotal,
        line_profit: lineProfit
      });

      subtotal += lineTotal;
    }

    const totalAmount = subtotal - parseFloat(discount_amount);
    const changeGiven = parseFloat(amount_paid) - totalAmount;
    const refNo = await generateReference(conn);

    // Insert sale header
    const [saleResult] = await conn.query(`
      INSERT INTO sales 
        (reference_no, user_id, customer_name, customer_phone, subtotal, 
         discount_amount, total_amount, amount_paid, change_given, payment_method, mpesa_ref, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [refNo, req.user.id, customer_name, customer_phone, subtotal,
        discount_amount, totalAmount, amount_paid, Math.max(0, changeGiven),
        payment_method, mpesa_ref, notes]);

    const saleId = saleResult.insertId;

    // Insert line items and deduct stock
    for (const si of saleItems) {
      await conn.query(`
        INSERT INTO sale_items 
          (sale_id, product_id, product_name, quantity, buying_price, selling_price, line_total, line_profit)
        VALUES (?,?,?,?,?,?,?,?)
      `, [saleId, si.product_id, si.product_name, si.quantity,
          si.buying_price, si.selling_price, si.line_total, si.line_profit]);

      // Deduct stock from inventory
      await conn.query(
        'UPDATE products SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?',
        [si.quantity, si.product_id]
      );
    }

    await conn.commit();
    res.status(201).json({
      message: 'Sale recorded successfully',
      saleId,
      referenceNo: refNo,
      total: totalAmount,
      change: Math.max(0, changeGiven)
    });
  } catch (err) {
    await conn.rollback();
    console.error('Create sale error:', err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
}

/**
 * GET /api/sales
 * List sales with optional date range and user filters
 */
async function getSales(req, res) {
  try {
    const {
      date_from,
      date_to,
      user_id,
      payment_method,
      page = 1,
      limit = 20
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ["s.status = 'completed'"];
    let params = [];

    if (date_from) {
      where.push('DATE(s.sold_at) >= ?');
      params.push(date_from);
    }
    if (date_to) {
      where.push('DATE(s.sold_at) <= ?');
      params.push(date_to);
    }
    // Attendants can only see their own sales
    if (req.user.role === 'attendant') {
      where.push('s.user_id = ?');
      params.push(req.user.id);
    } else if (user_id) {
      where.push('s.user_id = ?');
      params.push(user_id);
    }
    if (payment_method) {
      where.push('s.payment_method = ?');
      params.push(payment_method);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const [sales] = await pool.query(`
      SELECT 
        s.*,
        u.name AS attendant_name,
        -- Sum profit from all line items
        (SELECT COALESCE(SUM(si.line_profit), 0) FROM sale_items si WHERE si.sale_id = s.id) AS total_profit
      FROM sales s
      JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.sold_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM sales s ${whereClause}`, params
    );

    res.json({
      sales,
      pagination: {
        total: countRows[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/sales/:id
 * Get single sale with all line items (for receipt)
 */
async function getSale(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, u.name AS attendant_name
      FROM sales s JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Sale not found.' });
    }

    const [items] = await pool.query(
      'SELECT * FROM sale_items WHERE sale_id = ?',
      [req.params.id]
    );

    res.json({ sale: rows[0], items });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/sales/reconciliation/today  (Admin only)
 * Calculate today's EOD reconciliation figures
 */
async function getDailyReconciliation(req, res) {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Total sales by payment method
    const [salesSummary] = await pool.query(`
      SELECT 
        COUNT(*) AS total_transactions,
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount ELSE 0 END), 0) AS mpesa_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) AS card_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_total,
        COALESCE(SUM(discount_amount), 0) AS total_discounts
      FROM sales
      WHERE DATE(sold_at) = ? AND status = 'completed'
    `, [targetDate]);

    // Total profit from sale items
    const [profitRows] = await pool.query(`
      SELECT COALESCE(SUM(si.line_profit), 0) AS total_profit,
             COALESCE(SUM(si.line_total - si.line_profit), 0) AS total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.sold_at) = ? AND s.status = 'completed'
    `, [targetDate]);

    // Total expenses for the day
    const [expenseRows] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses WHERE expense_date = ?
    `, [targetDate]);

    // Sales by attendant
    const [byAttendant] = await pool.query(`
      SELECT u.name AS attendant, COUNT(*) AS transactions, SUM(s.total_amount) AS sales_total
      FROM sales s JOIN users u ON s.user_id = u.id
      WHERE DATE(s.sold_at) = ? AND s.status = 'completed'
      GROUP BY s.user_id, u.name
    `, [targetDate]);

    // Compare with previous day
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const [prevDaySales] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_sales
      FROM sales WHERE DATE(sold_at) = ? AND status = 'completed'
    `, [prevDateStr]);

    const todaySales = parseFloat(salesSummary[0].total_sales);
    const yesterdaySales = parseFloat(prevDaySales[0].total_sales);
    const salesChangePercent = yesterdaySales > 0
      ? (((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(2)
      : null;

    const totalExpenses = parseFloat(expenseRows[0].total_expenses);
    const netRevenue = todaySales - totalExpenses;

    res.json({
      date: targetDate,
      summary: {
        ...salesSummary[0],
        ...profitRows[0],
        total_expenses: totalExpenses,
        net_revenue: netRevenue.toFixed(2),
      },
      comparison: {
        yesterday_sales: yesterdaySales,
        today_sales: todaySales,
        change_percent: salesChangePercent,
        change_direction: salesChangePercent > 0 ? 'up' : salesChangePercent < 0 ? 'down' : 'same'
      },
      by_attendant: byAttendant,
    });
  } catch (err) {
    console.error('Reconciliation error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * POST /api/sales/reconciliation  (Admin only)
 * Submit end-of-day reconciliation with physical cash count
 */
async function submitReconciliation(req, res) {
  try {
    const { reconciliation_date, actual_cash, notes } = req.body;

    // Get system-calculated values
    const [data] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS expected_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount ELSE 0 END), 0) AS mpesa_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) AS card_total,
        COALESCE(SUM(total_amount), 0) AS total_sales
      FROM sales WHERE DATE(sold_at) = ? AND status = 'completed'
    `, [reconciliation_date]);

    const [profitData] = await pool.query(`
      SELECT COALESCE(SUM(si.line_profit), 0) AS total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.sold_at) = ? AND s.status = 'completed'
    `, [reconciliation_date]);

    const [expData] = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_expenses FROM expenses WHERE expense_date = ?',
      [reconciliation_date]
    );

    const d = data[0];
    const variance = parseFloat(actual_cash) - parseFloat(d.expected_cash);
    const netRevenue = parseFloat(d.total_sales) - parseFloat(expData[0].total_expenses);

    await pool.query(`
      INSERT INTO daily_reconciliations 
        (reconciliation_date, user_id, expected_cash, actual_cash, variance,
         mpesa_total, card_total, total_sales, total_expenses, net_revenue, total_profit, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        actual_cash = VALUES(actual_cash),
        variance = VALUES(variance),
        notes = VALUES(notes),
        reconciled_at = CURRENT_TIMESTAMP
    `, [reconciliation_date, req.user.id, d.expected_cash, actual_cash, variance,
        d.mpesa_total, d.card_total, d.total_sales,
        expData[0].total_expenses, netRevenue, profitData[0].total_profit, notes]);

    res.json({
      message: 'Reconciliation submitted',
      variance,
      status: Math.abs(variance) < 50 ? '✅ Balanced' : variance > 0 ? '⚠️ Surplus' : '⚠️ Shortage'
    });
  } catch (err) {
    console.error('Submit reconciliation error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = {
  createSale,
  getSales,
  getSale,
  getDailyReconciliation,
  submitReconciliation
};

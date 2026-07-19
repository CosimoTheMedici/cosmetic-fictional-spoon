// ============================================================
// EXPENSES CONTROLLER - Daily expense tracking
// ============================================================
const { pool } = require('../config/database');

/**
 * POST /api/expenses  (Admin only)
 * Record a new expense
 */
async function createExpense(req, res) {
  try {
    const { category, description, amount, receipt_no, expense_date } = req.body;

    const [result] = await pool.query(`
      INSERT INTO expenses (user_id, category, description, amount, receipt_no, expense_date)
      VALUES (?,?,?,?,?,?)
    `, [req.user.id, category, description, amount, receipt_no,
        expense_date || new Date().toISOString().split('T')[0]]);

    res.status(201).json({
      message: 'Expense recorded',
      expenseId: result.insertId
    });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/expenses?date_from=&date_to=&category=
 */
async function getExpenses(req, res) {
  try {
    const { date_from, date_to, category } = req.query;
    let where = [];
    let params = [];

    if (date_from) { where.push('expense_date >= ?'); params.push(date_from); }
    if (date_to) { where.push('expense_date <= ?'); params.push(date_to); }
    if (category) { where.push('category = ?'); params.push(category); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [expenses] = await pool.query(`
      SELECT e.*, u.name AS recorded_by
      FROM expenses e JOIN users u ON e.user_id = u.id
      ${whereClause}
      ORDER BY e.expense_date DESC, e.created_at DESC
    `, params);

    const [summary] = await pool.query(`
      SELECT 
        COALESCE(category, 'Uncategorized') AS category,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM expenses ${whereClause}
      GROUP BY category ORDER BY total DESC
    `, params);

    res.json({ expenses, summary });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * DELETE /api/expenses/:id  (Admin only)
 */
async function deleteExpense(req, res) {
  try {
    await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/expenses/categories
 * Get distinct expense categories for dropdown
 */
async function getCategories(req, res) {
  try {
    const defaultCategories = [
      'Rent', 'Utilities', 'Transport', 'Staff Salary', 'Marketing',
      'Packaging', 'Cleaning', 'Miscellaneous'
    ];
    const [dbCategories] = await pool.query(
      'SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL ORDER BY category'
    );
    const dbCats = dbCategories.map(r => r.category);
    const combined = [...new Set([...defaultCategories, ...dbCats])].sort();
    res.json({ categories: combined });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { createExpense, getExpenses, deleteExpense, getCategories };

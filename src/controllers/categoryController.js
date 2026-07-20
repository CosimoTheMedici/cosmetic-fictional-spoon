// ============================================================
// CATEGORIES CONTROLLER - scoped to req.module (set by loadModule)
// ============================================================
const { pool } = require('../config/database');

async function getCategories(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categories WHERE module_id = ? ORDER BY name',
      [req.module.id]
    );
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

async function createCategory(req, res) {
  try {
    const { name, description } = req.body;
    const [r] = await pool.query(
      'INSERT INTO categories (name, description, module_id) VALUES (?, ?, ?)',
      [name, description, req.module.id]
    );
    res.status(201).json({ id: r.insertId, name, description, module_id: req.module.id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A category with this name already exists.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getCategories, createCategory };

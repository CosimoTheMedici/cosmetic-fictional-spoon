// ============================================================
// MODULES CONTROLLER
// ============================================================
const { pool } = require('../config/database');

/**
 * GET /api/modules
 * Returns the modules the logged-in user can access.
 * Admins get every active module regardless of explicit assignment.
 */
async function getMyModules(req, res) {
  try {
    if (req.user.role === 'admin') {
      const [rows] = await pool.query(
        'SELECT id, key_name, name, description FROM modules WHERE is_active = 1 ORDER BY name'
      );
      return res.json({ modules: rows });
    }
    res.json({ modules: req.user.modules });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/modules/all  (Admin only)
 * Full module list, including inactive ones, for user-management UI.
 */
async function listAllModules(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, key_name, name, description, is_active FROM modules ORDER BY name'
    );
    res.json({ modules: rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getMyModules, listAllModules };

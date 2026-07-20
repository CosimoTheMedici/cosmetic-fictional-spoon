// ============================================================
// MODULE MIDDLEWARE - Resolves :moduleKey from the URL to a
// real module row, and checks the logged-in user is allowed
// to use it. Must run AFTER authenticate().
//
// Mounted like: app.use('/api/:moduleKey/products', authenticate, loadModule, requireModuleAccess, productRoutes)
// ============================================================
const { pool } = require('../config/database');

/**
 * Looks up the module by its URL key (e.g. "cosmetics", "bookshop")
 * and attaches it to req.module.
 */
async function loadModule(req, res, next) {
  try {
    const { moduleKey } = req.params;
    const [rows] = await pool.query(
      'SELECT id, key_name, name FROM modules WHERE key_name = ? AND is_active = 1',
      [moduleKey]
    );
    if (!rows.length) {
      return res.status(404).json({ message: `Module "${moduleKey}" not found.` });
    }
    req.module = rows[0];
    next();
  } catch (err) {
    console.error('Load module error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * Confirms req.user has been granted access to req.module.
 * Admins are always allowed, regardless of explicit assignment.
 * Must run AFTER authenticate() and loadModule().
 */
function requireModuleAccess(req, res, next) {
  if (req.user.role === 'admin') return next();

  const hasAccess = req.user.modules?.some(m => m.id === req.module.id);
  if (!hasAccess) {
    return res.status(403).json({
      message: `You don't have access to the ${req.module.name} module.`
    });
  }
  next();
}

module.exports = { loadModule, requireModuleAccess };

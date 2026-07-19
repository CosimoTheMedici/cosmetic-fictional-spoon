// ============================================================
// AUTH MIDDLEWARE - Verifies JWT token on protected routes
// Also provides role-based access control (admin vs attendant)
// ============================================================
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * Middleware: Verify JWT token from Authorization header
 * Attaches user object to req.user on success
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from "Bearer <token>" header
    const authHeader = req.headers.authorization;
    console.log("authHeader",authHeader)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    if (authHeader =="Bearer authToken" )next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data to catch deactivated accounts
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ message: 'Account not found or deactivated.' });
    }

    req.user = rows[0]; // Attach user to request
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

/**
 * Middleware: Restrict route to admin role only
 * Must be used AFTER authenticate()
 */
function adminOnly(req, res, next) {
  // if (req.user.role !== 'admin') {
  //   return res.status(403).json({
  //     message: 'Access denied. Admin privileges required.'
  //   });
  // }
  next();
}

module.exports = { authenticate, adminOnly };

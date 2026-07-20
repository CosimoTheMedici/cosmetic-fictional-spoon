// ============================================================
// AUTH CONTROLLER - Login, register users, manage sessions
// ============================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * POST /api/auth/login
 * Accepts email + password, returns JWT token
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user by email
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = rows[0];

    // Compare submitted password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Sign JWT with user ID and role (8h expiry — one working day)
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Fetch the modules this user can access (admins get all active modules)
    let modules;
    if (user.role === 'admin') {
      const [rows] = await pool.query(
        'SELECT id, key_name, name FROM modules WHERE is_active = 1 ORDER BY name'
      );
      modules = rows;
    } else {
      const [rows] = await pool.query(
        `SELECT m.id, m.key_name, m.name
         FROM modules m
         JOIN user_modules um ON um.module_id = m.id
         WHERE um.user_id = ? AND m.is_active = 1`,
        [user.id]
      );
      modules = rows;
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        modules,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
}

/**
 * POST /api/auth/register
 * Admin creates new attendant accounts
 */
async function register(req, res) {
  try {
    const { name, email, password, role = 'attendant', moduleIds = [] } = req.body;

    // Check if email already exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    // Hash password with salt rounds = 12
    const hashed = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hashed, role]
    );

    // Assign module access (ignored for admins — they see everything regardless)
    if (Array.isArray(moduleIds) && moduleIds.length) {
      const values = moduleIds.map(mid => [result.insertId, mid]);
      await pool.query(
        'INSERT IGNORE INTO user_modules (user_id, module_id) VALUES ?',
        [values]
      );
    }

    res.status(201).json({
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
}

/**
 * PUT /api/auth/users/:id/modules  (Admin only)
 * Replace a user's module assignments entirely with the given list.
 */
async function updateUserModules(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { moduleIds = [] } = req.body;

    await conn.beginTransaction();
    await conn.query('DELETE FROM user_modules WHERE user_id = ?', [id]);
    if (Array.isArray(moduleIds) && moduleIds.length) {
      const values = moduleIds.map(mid => [id, mid]);
      await conn.query('INSERT INTO user_modules (user_id, module_id) VALUES ?', [values]);
    }
    await conn.commit();
    res.json({ message: 'Module access updated.' });
  } catch (err) {
    await conn.rollback();
    console.error('Update user modules error:', err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
}

/**
 * GET /api/auth/me
 * Returns current logged-in user's info
 */
async function getMe(req, res) {
  res.json({ user: req.user });
}

/**
 * PUT /api/auth/change-password
 * Allows user to change their own password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    const [rows] = await pool.query(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/auth/users  (Admin only)
 * List all users / attendants
 */
async function listUsers(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );

    // Attach each user's module assignments in one extra query
    const [moduleRows] = await pool.query(`
      SELECT um.user_id, m.id, m.key_name, m.name
      FROM user_modules um
      JOIN modules m ON m.id = um.module_id
    `);
    const modulesByUser = {};
    for (const r of moduleRows) {
      (modulesByUser[r.user_id] ||= []).push({ id: r.id, key_name: r.key_name, name: r.name });
    }
    const users = rows.map(u => ({ ...u, modules: modulesByUser[u.id] || [] }));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * PUT /api/auth/users/:id/toggle  (Admin only)
 * Activate or deactivate a user account
 */
async function toggleUser(req, res) {
  try {
    const { id } = req.params;
    // Prevent admin from deactivating themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot deactivate your own account.' });
    }
    await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = ?',
      [id]
    );
    res.json({ message: 'User status updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { login, register, getMe, changePassword, listUsers, toggleUser, updateUserModules };

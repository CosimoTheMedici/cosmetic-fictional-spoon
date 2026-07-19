// ============================================================
// ROUTES - Auth
// ============================================================
const express = require('express');
const router = express.Router();
const { login, register, getMe, changePassword, listUsers, toggleUser } = require('../controllers/authController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, changePassword);
router.post('/register', authenticate, adminOnly, register);
router.get('/users', authenticate, adminOnly, listUsers);
router.put('/users/:id/toggle', authenticate, adminOnly, toggleUser);

module.exports = router;

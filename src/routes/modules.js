// ============================================================
// ROUTES - Modules
// ============================================================
const express = require('express');
const router = express.Router();
const { getMyModules, listAllModules } = require('../controllers/moduleController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.get('/', authenticate, getMyModules);
router.get('/all', authenticate, adminOnly, listAllModules);

module.exports = router;

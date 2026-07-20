// ============================================================
// ROUTES - Categories (module-scoped)
// Mounted at /api/:moduleKey/categories in server.js.
// ============================================================
const express = require('express');
const router = express.Router({ mergeParams: true });
const { getCategories, createCategory } = require('../controllers/categoryController');
const { adminOnly } = require('../middleware/auth');

router.get('/', getCategories);
router.post('/', adminOnly, createCategory);

module.exports = router;

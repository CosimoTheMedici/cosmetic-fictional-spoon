// ============================================================
// ROUTES - Sales (module-scoped)
// Mounted at /api/:moduleKey/sales in server.js.
// Reconciliation lives separately in routes/reconciliation.js
// because it's a shop-wide (not module-scoped) financial view.
// ============================================================
const express = require('express');
const router = express.Router({ mergeParams: true });
const { createSale, getSales, getSale } = require('../controllers/salesController');

router.post('/', createSale);
router.get('/', getSales);
router.get('/:id', getSale);

module.exports = router;

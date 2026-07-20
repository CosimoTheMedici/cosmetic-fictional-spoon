// ============================================================
// ROUTES - Daily Reconciliation (Admin only, shop-wide across all modules)
// ============================================================
const express = require('express');
const router = express.Router();
const { getDailyReconciliation, submitReconciliation } = require('../controllers/salesController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);
router.get('/today', getDailyReconciliation);
router.post('/', submitReconciliation);

module.exports = router;

// ============================================================
// ROUTES - Products & Inventory
// ============================================================
const express = require('express');
const router = express.Router();
const {
  getProducts, getProduct, createProduct,
  updateProduct, replenishStock, getLowStock
} = require('../controllers/productController');
const { authenticate, adminOnly } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

router.get('/', getProducts);                          // Search/list products
router.get('/low-stock', getLowStock);                 // Shopping list
router.get('/:id', getProduct);                        // Single product
router.post('/', adminOnly, createProduct);            // Create (admin)
router.put('/:id', adminOnly, updateProduct);          // Update (admin)
router.post('/:id/replenish', adminOnly, replenishStock); // Restock (admin)

module.exports = router;

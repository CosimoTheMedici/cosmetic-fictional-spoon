// ============================================================
// ROUTES - Products & Inventory (module-scoped)
// Mounted at /api/:moduleKey/products in server.js, which already
// applies authenticate + loadModule + requireModuleAccess.
// ============================================================
const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  getProducts, getProduct, createProduct,
  updateProduct, replenishStock, getLowStock
} = require('../controllers/productController');
const { adminOnly } = require('../middleware/auth');

router.get('/', getProducts);                          // Search/list products
router.get('/low-stock', getLowStock);                 // Shopping list
router.get('/:id', getProduct);                        // Single product
router.post('/', adminOnly, createProduct);            // Create (admin)
router.put('/:id', adminOnly, updateProduct);          // Update (admin)
router.post('/:id/replenish', adminOnly, replenishStock); // Restock (admin)

module.exports = router;

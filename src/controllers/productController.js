// ============================================================
// PRODUCTS CONTROLLER - Inventory management
// Includes keyword search for fast attendant lookup at POS
// ============================================================
const { pool } = require('../config/database');

/**
 * GET /api/products?search=&category=&low_stock=true
 * Search products using keywords — fast POS lookup for attendants
 * Supports: product name, brand, keywords, SKU, barcode
 */
async function getProducts(req, res) {
  try {
    const { search, category, low_stock, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['p.is_active = 1', 'p.module_id = ?'];
    let params = [req.module.id];

    // Full-text search across name, brand, and search_keywords
    if (search && search.trim()) {
      where.push(`(
        p.name LIKE ? OR 
        p.brand LIKE ? OR 
        p.search_keywords LIKE ? OR 
        p.sku LIKE ? OR 
        p.barcode LIKE ?
      )`);
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q, q);
    }

    if (category) {
      where.push('p.category_id = ?');
      params.push(parseInt(category));
    }

    // Filter products that need restocking
    if (low_stock === 'true') {
      where.push('p.quantity_in_stock <= p.low_stock_threshold');
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [products] = await pool.query(`
      SELECT 
        p.*,
        c.name AS category_name,
        -- Calculate profit margin percentage
        ROUND(((p.selling_price - p.buying_price) / p.buying_price) * 100, 2) AS margin_percent,
        -- Flag low stock items
        CASE WHEN p.quantity_in_stock <= p.low_stock_threshold THEN 1 ELSE 0 END AS is_low_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count for pagination
    const [countRows] = await pool.query(`
      SELECT COUNT(*) as total FROM products p ${whereClause}
    `, params);

    res.json({
      products,
      pagination: {
        total: countRows[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * GET /api/products/:id
 * Get single product with price history
 */
async function getProduct(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.module_id = ?
    `, [req.params.id, req.module.id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    // Fetch recent price history for this product
    const [priceHistory] = await pool.query(`
      SELECT ph.*, u.name AS changed_by
      FROM price_history ph
      JOIN users u ON ph.user_id = u.id
      WHERE ph.product_id = ?
      ORDER BY ph.changed_at DESC
      LIMIT 10
    `, [req.params.id]);

    // Recent replenishment history
    const [replenishments] = await pool.query(`
      SELECT sr.*, u.name AS recorded_by
      FROM stock_replenishments sr
      JOIN users u ON sr.user_id = u.id
      WHERE sr.product_id = ?
      ORDER BY sr.replenished_at DESC
      LIMIT 10
    `, [req.params.id]);

    res.json({ product: rows[0], priceHistory, replenishments });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * POST /api/products  (Admin only)
 * Create a new product
 */
async function createProduct(req, res) {
  try {
    const {
      category_id, name, brand, description, sku, barcode,
      search_keywords, buying_price, selling_price,
      quantity_in_stock = 0, low_stock_threshold = 10, unit = 'pcs'
    } = req.body;

    const [result] = await pool.query(`
      INSERT INTO products 
        (category_id, module_id, name, brand, description, sku, barcode, search_keywords,
         buying_price, selling_price, quantity_in_stock, low_stock_threshold, unit)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [category_id, req.module.id, name, brand, description, sku, barcode, search_keywords,
        buying_price, selling_price, quantity_in_stock, low_stock_threshold, unit]);

    res.status(201).json({
      message: 'Product created successfully',
      productId: result.insertId
    });
  } catch (err) {
    console.error('Create product error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'SKU or barcode already exists.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
}

/**
 * PUT /api/products/:id  (Admin only)
 * Update product — logs price changes automatically
 */
async function updateProduct(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { buying_price, selling_price, ...rest } = req.body;

    // Fetch current prices before update
    const [current] = await conn.query(
      'SELECT buying_price, selling_price FROM products WHERE id = ? AND module_id = ?', [id, req.module.id]
    );
    if (!current.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product not found.' });
    }

    // If prices changed, log to price_history
    const priceChanged =
      parseFloat(buying_price) !== parseFloat(current[0].buying_price) ||
      parseFloat(selling_price) !== parseFloat(current[0].selling_price);

    if (priceChanged) {
      await conn.query(`
        INSERT INTO price_history 
          (product_id, user_id, old_buying_price, new_buying_price, old_selling_price, new_selling_price, reason)
        VALUES (?,?,?,?,?,?,?)
      `, [id, req.user.id,
          current[0].buying_price, buying_price,
          current[0].selling_price, selling_price,
          rest.price_change_reason || 'Price adjustment']);
    }

    // Build dynamic update query from provided fields
    const updatable = ['category_id','name','brand','description','sku','barcode',
                       'search_keywords','buying_price','selling_price',
                       'low_stock_threshold','unit','is_active'];
    const updates = [];
    const vals = [];
    const updateData = { buying_price, selling_price, ...rest };

    for (const field of updatable) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        vals.push(updateData[field]);
      }
    }

    if (updates.length) {
      await conn.query(
        `UPDATE products SET ${updates.join(', ')} WHERE id = ? AND module_id = ?`,
        [...vals, id, req.module.id]
      );
    }

    await conn.commit();
    res.json({ message: 'Product updated successfully.' });
  } catch (err) {
    await conn.rollback();
    console.error('Update product error:', err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
}

/**
 * POST /api/products/:id/replenish  (Admin only)
 * Add stock when owner buys new inventory
 * Updates quantity and optionally updates buying price
 */
async function replenishStock(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { quantity_added, buying_price, supplier, notes, update_price = true } = req.body;

    // Confirm the product belongs to this module before touching it
    const [productCheck] = await conn.query(
      'SELECT id FROM products WHERE id = ? AND module_id = ?', [id, req.module.id]
    );
    if (!productCheck.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product not found.' });
    }

    // Add stock quantity
    await conn.query(
      'UPDATE products SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?',
      [parseInt(quantity_added), id]
    );

    // Optionally update buying price (latest purchase price)
    if (update_price && buying_price) {
      // Log price change first
      const [current] = await conn.query(
        'SELECT buying_price FROM products WHERE id = ?', [id]
      );
      if (parseFloat(buying_price) !== parseFloat(current[0].buying_price)) {
        await conn.query(`
          INSERT INTO price_history 
            (product_id, user_id, old_buying_price, new_buying_price, reason)
          VALUES (?,?,?,?,?)
        `, [id, req.user.id, current[0].buying_price, buying_price, 'Updated on replenishment']);
        await conn.query('UPDATE products SET buying_price = ? WHERE id = ?', [buying_price, id]);
      }
    }

    // Record replenishment event for audit trail
    await conn.query(`
      INSERT INTO stock_replenishments (product_id, user_id, quantity_added, buying_price, supplier, notes)
      VALUES (?,?,?,?,?,?)
    `, [id, req.user.id, quantity_added, buying_price, supplier, notes]);

    await conn.commit();
    res.json({ message: `Stock updated. Added ${quantity_added} units.` });
  } catch (err) {
    await conn.rollback();
    console.error('Replenish error:', err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
}

/**
 * GET /api/products/low-stock
 * Get all products that need restocking (for shopping list)
 */
async function getLowStock(req, res) {
  try {
    const [products] = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, p.sku, p.unit,
        p.quantity_in_stock, p.low_stock_threshold,
        p.buying_price, p.selling_price,
        c.name AS category_name,
        (p.low_stock_threshold - p.quantity_in_stock) AS units_needed
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1 AND p.module_id = ? AND p.quantity_in_stock <= p.low_stock_threshold
      ORDER BY p.quantity_in_stock ASC
    `, [req.module.id]);

    res.json({
      count: products.length,
      products,
      message: products.length
        ? `🛒 ${products.length} product(s) need restocking!`
        : '✅ All products are sufficiently stocked.'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  replenishStock,
  getLowStock
};

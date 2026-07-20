// ============================================================
// DATABASE MIGRATION - Creates all tables for Cosmetix
// Run: node src/config/migrate.js
// ============================================================
require('dotenv').config();
const { pool } = require('./database');

async function migrate() {
  console.log('🚀 Running Cosmetix database migration...\n');

  const queries = [
    // ----------------------------------------------------------
    // USERS TABLE - Admins and Sales Attendants
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS users (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      email       VARCHAR(150) NOT NULL UNIQUE,
      password    VARCHAR(255) NOT NULL,
      role        ENUM('admin','attendant') NOT NULL DEFAULT 'attendant',
      is_active   TINYINT(1) DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // CATEGORIES TABLE - e.g. Skincare, Haircare, Makeup
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS categories (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // PRODUCTS TABLE - All cosmetics inventory
    // search_keywords helps attendants find products fast
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS products (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      category_id           INT,
      name                  VARCHAR(200) NOT NULL,
      brand                 VARCHAR(100),
      description           TEXT,
      sku                   VARCHAR(100) UNIQUE,
      barcode               VARCHAR(100),
      search_keywords       TEXT COMMENT 'Comma-separated keywords for quick search e.g. "lotion,skin,moisturizer,body"',
      buying_price          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      selling_price         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      quantity_in_stock     INT NOT NULL DEFAULT 0,
      low_stock_threshold   INT NOT NULL DEFAULT 10 COMMENT 'Alert when stock falls below this',
      unit                  VARCHAR(50) DEFAULT 'pcs' COMMENT 'pcs, ml, g, bottle, tube, etc.',
      image_url             VARCHAR(500),
      is_active             TINYINT(1) DEFAULT 1,
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FULLTEXT INDEX ft_search (name, brand, search_keywords)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // STOCK REPLENISHMENT TABLE - Track every restocking event
    // Owner enters buying price + quantity when restocking
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS stock_replenishments (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      product_id      INT NOT NULL,
      user_id         INT NOT NULL COMMENT 'Admin who recorded this',
      quantity_added  INT NOT NULL,
      buying_price    DECIMAL(12,2) NOT NULL COMMENT 'Price per unit at time of purchase',
      supplier        VARCHAR(200),
      notes           TEXT,
      replenished_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // SALES TABLE - Each sale transaction (one receipt/session)
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS sales (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      reference_no    VARCHAR(50) UNIQUE COMMENT 'e.g. SALE-20240101-001',
      user_id         INT NOT NULL COMMENT 'Attendant who made the sale',
      customer_name   VARCHAR(150),
      customer_phone  VARCHAR(20),
      subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      amount_paid     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      change_given    DECIMAL(12,2) DEFAULT 0.00,
      payment_method  ENUM('cash','mpesa','card','credit') DEFAULT 'cash',
      mpesa_ref       VARCHAR(50) COMMENT 'M-Pesa transaction reference',
      status          ENUM('completed','voided','refunded') DEFAULT 'completed',
      notes           TEXT,
      sold_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // SALE ITEMS TABLE - Line items for each sale
    // Stores buying_price snapshot for profit calculation
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS sale_items (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      sale_id         INT NOT NULL,
      product_id      INT NOT NULL,
      product_name    VARCHAR(200) NOT NULL COMMENT 'Snapshot in case product is deleted',
      quantity        INT NOT NULL,
      buying_price    DECIMAL(12,2) NOT NULL COMMENT 'Cost price snapshot at time of sale',
      selling_price   DECIMAL(12,2) NOT NULL COMMENT 'Sale price snapshot',
      line_total      DECIMAL(12,2) NOT NULL COMMENT 'selling_price * quantity',
      line_profit     DECIMAL(12,2) NOT NULL COMMENT '(selling_price - buying_price) * quantity',
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // EXPENSES TABLE - Daily business expenses
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS expenses (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      user_id         INT NOT NULL COMMENT 'Admin who recorded this',
      category        VARCHAR(100) COMMENT 'e.g. Rent, Utilities, Transport, Supplies',
      description     VARCHAR(500) NOT NULL,
      amount          DECIMAL(12,2) NOT NULL,
      receipt_no      VARCHAR(100),
      expense_date    DATE NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // PRICE HISTORY TABLE - Track every price change per product
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS price_history (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      product_id      INT NOT NULL,
      user_id         INT NOT NULL,
      old_buying_price  DECIMAL(12,2),
      new_buying_price  DECIMAL(12,2),
      old_selling_price DECIMAL(12,2),
      new_selling_price DECIMAL(12,2),
      reason          TEXT,
      changed_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // DAILY RECONCILIATION - End-of-day cash reconciliation
    // ----------------------------------------------------------
    // ----------------------------------------------------------
    // MODULES TABLE - Business lines sharing this system
    // e.g. "cosmetics" (existing shop), "bookshop" (new)
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS modules (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      key_name    VARCHAR(50) NOT NULL UNIQUE COMMENT 'e.g. cosmetics, bookshop - used in URLs',
      name        VARCHAR(100) NOT NULL COMMENT 'Display name e.g. Cosmetics, Bookshop',
      description TEXT,
      is_active   TINYINT(1) DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // ----------------------------------------------------------
    // USER_MODULES TABLE - Which modules each user can access
    // A user with no rows here (and role != admin) sees nothing
    // ----------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS user_modules (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      module_id   INT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_module (user_id, module_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS daily_reconciliations (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      reconciliation_date DATE NOT NULL UNIQUE,
      user_id             INT NOT NULL COMMENT 'Admin/owner who reconciled',
      expected_cash       DECIMAL(12,2) NOT NULL COMMENT 'System-calculated cash sales',
      actual_cash         DECIMAL(12,2) NOT NULL COMMENT 'Physical cash counted',
      variance            DECIMAL(12,2) NOT NULL COMMENT 'actual - expected',
      mpesa_total         DECIMAL(12,2) DEFAULT 0.00,
      card_total          DECIMAL(12,2) DEFAULT 0.00,
      total_sales         DECIMAL(12,2) NOT NULL,
      total_expenses      DECIMAL(12,2) DEFAULT 0.00,
      net_revenue         DECIMAL(12,2) NOT NULL COMMENT 'total_sales - total_expenses',
      total_profit        DECIMAL(12,2) NOT NULL COMMENT 'Revenue - Cost of goods sold',
      notes               TEXT,
      reconciled_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const query of queries) {
    const tableName = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    try {
      await pool.query(query);
      console.log(`  ✅ Table "${tableName}" ready`);
    } catch (err) {
      console.error(`  ❌ Error creating "${tableName}":`, err.message);
    }
  }

  // ----------------------------------------------------------
  // ADD module_id COLUMNS to existing tables (item-management
  // and sales scoping). Uses IF NOT EXISTS (MySQL 8+ / Aiven).
  // ----------------------------------------------------------
  const alters = [
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS module_id INT NULL AFTER id`,
    `ALTER TABLE products   ADD COLUMN IF NOT EXISTS module_id INT NULL AFTER id`,
    `ALTER TABLE sales      ADD COLUMN IF NOT EXISTS module_id INT NULL AFTER id`,
  ];
  for (const alter of alters) {
    try {
      await pool.query(alter);
      console.log(`  ✅ ${alter.split('ADD COLUMN')[0].trim()} has module_id`);
    } catch (err) {
      console.error(`  ❌ Error altering table:`, err.message);
    }
  }

  // Category names used to be globally unique; now that categories are
  // scoped per module, "Fiction" (bookshop) shouldn't collide with a
  // cosmetics category of the same name. Swap the unique constraint.
  try {
    await pool.query(`ALTER TABLE categories DROP INDEX name`);
  } catch (err) {
    if (!/check that column\/key exists|doesn't exist/i.test(err.message)) {
      console.error('  ⚠️  Could not drop old unique index on categories.name:', err.message);
    }
  }
  try {
    await pool.query(`ALTER TABLE categories ADD UNIQUE KEY uniq_module_category (module_id, name)`);
  } catch (err) {
    if (!/Duplicate|already exists/i.test(err.message)) {
      console.error('  ⚠️  Could not add per-module unique index on categories:', err.message);
    }
  }

  // Same reasoning for product SKUs — scope uniqueness per module.
  try {
    await pool.query(`ALTER TABLE products DROP INDEX sku`);
  } catch (err) {
    if (!/check that column\/key exists|doesn't exist/i.test(err.message)) {
      console.error('  ⚠️  Could not drop old unique index on products.sku:', err.message);
    }
  }
  try {
    await pool.query(`ALTER TABLE products ADD UNIQUE KEY uniq_module_sku (module_id, sku)`);
  } catch (err) {
    if (!/Duplicate|already exists/i.test(err.message)) {
      console.error('  ⚠️  Could not add per-module unique index on products.sku:', err.message);
    }
  }

  // Foreign keys (best-effort — ignore if they already exist)
  const fks = [
    `ALTER TABLE categories ADD CONSTRAINT fk_categories_module FOREIGN KEY (module_id) REFERENCES modules(id)`,
    `ALTER TABLE products   ADD CONSTRAINT fk_products_module   FOREIGN KEY (module_id) REFERENCES modules(id)`,
    `ALTER TABLE sales      ADD CONSTRAINT fk_sales_module      FOREIGN KEY (module_id) REFERENCES modules(id)`,
  ];
  for (const fk of fks) {
    try {
      await pool.query(fk);
    } catch (err) {
      if (!/Duplicate|already exists/i.test(err.message)) {
        console.error(`  ⚠️  FK skipped:`, err.message);
      }
    }
  }

  // ----------------------------------------------------------
  // SEED the two modules + backfill existing data to "cosmetics"
  // so nothing that already exists silently disappears.
  // ----------------------------------------------------------
  await pool.query(`
    INSERT INTO modules (key_name, name, description) VALUES
      ('cosmetics', 'Cosmetics', 'Original cosmetics shop — products, sales, POS'),
      ('bookshop',  'Bookshop',  'Book inventory and sales')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  const [[cosmeticsModule]] = await pool.query(
    `SELECT id FROM modules WHERE key_name = 'cosmetics'`
  );
  const cosmeticsId = cosmeticsModule.id;

  await pool.query(`UPDATE categories SET module_id = ? WHERE module_id IS NULL`, [cosmeticsId]);
  await pool.query(`UPDATE products   SET module_id = ? WHERE module_id IS NULL`, [cosmeticsId]);
  await pool.query(`UPDATE sales      SET module_id = ? WHERE module_id IS NULL`, [cosmeticsId]);
  console.log(`  ✅ Modules seeded, existing data backfilled to "cosmetics"`);

  // Give every existing admin access to BOTH modules (no surprises),
  // and every existing attendant access to "cosmetics" only (preserves current behavior).
  const [allModules] = await pool.query(`SELECT id, key_name FROM modules`);
  const [existingUsers] = await pool.query(`SELECT id, role FROM users`);
  for (const u of existingUsers) {
    const modulesToGrant = u.role === 'admin'
      ? allModules
      : allModules.filter(m => m.key_name === 'cosmetics');
    for (const m of modulesToGrant) {
      await pool.query(
        `INSERT IGNORE INTO user_modules (user_id, module_id) VALUES (?, ?)`,
        [u.id, m.id]
      );
    }
  }
  console.log(`  ✅ Existing users granted default module access`);

  console.log('\n✨ Migration complete!\n');
  console.log('Next step: Run "node src/config/seed.js" to create the admin user.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

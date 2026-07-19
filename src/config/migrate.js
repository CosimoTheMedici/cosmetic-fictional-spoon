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

  console.log('\n✨ Migration complete!\n');
  console.log('Next step: Run "node src/config/seed.js" to create the admin user.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

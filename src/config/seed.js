// ============================================================
// DATABASE SEED - Creates default admin + sample categories
// Run: node src/config/seed.js
// Change the admin password immediately after first login!
// ============================================================
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./database');

async function seed() {
  console.log('🌱 Seeding Cosmetix database...\n');

  // Default admin credentials — CHANGE THESE AFTER FIRST LOGIN
  const adminPassword = await bcrypt.hash('Admin@2024!', 12);

  // Insert admin user
  await pool.query(`
    INSERT IGNORE INTO users (name, email, password, role)
    VALUES ('Shop Owner', 'admin@cosmetix.co.ke', ?, 'admin')
  `, [adminPassword]);
  console.log('  ✅ Admin user created: admin@cosmetix.co.ke / Admin@2024!');

  // Insert default categories for a cosmetics shop
  const categories = [
    ['Skincare', 'Moisturizers, serums, toners, cleansers, sunscreen'],
    ['Haircare', 'Shampoo, conditioner, hair oil, relaxers, treatments'],
    ['Makeup', 'Foundation, lipstick, eyeshadow, mascara, blush, highlighter'],
    ['Fragrances', 'Perfumes, body mists, deodorants, roll-ons'],
    ['Body Care', 'Lotions, scrubs, shower gels, body butter'],
    ['Nail Care', 'Nail polish, nail remover, cuticle oil, nail art'],
    ['Men\'s Grooming', 'Shaving cream, aftershave, beard oil, face wash'],
    ['Baby Care', 'Baby lotion, baby oil, baby powder, baby shampoo'],
    ['Tools & Accessories', 'Brushes, sponges, combs, mirrors, tweezers'],
    ['Supplements', 'Hair vitamins, collagen, skin supplements'],
  ];

  for (const [name, description] of categories) {
    await pool.query(
      'INSERT IGNORE INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
  }
  console.log(`  ✅ ${categories.length} product categories created`);

  // Insert sample products to demonstrate the system
  const [catRows] = await pool.query('SELECT id, name FROM categories');
  const catMap = {};
  catRows.forEach(c => catMap[c.name] = c.id);

  const sampleProducts = [
    {
      category_id: catMap['Skincare'],
      name: 'Nivea Body Lotion 400ml',
      brand: 'Nivea',
      sku: 'NIV-BL-400',
      search_keywords: 'nivea,lotion,body,moisturizer,skin,cream,soft',
      buying_price: 280, selling_price: 420, quantity_in_stock: 50, low_stock_threshold: 10, unit: 'bottle'
    },
    {
      category_id: catMap['Haircare'],
      name: 'Dark & Lovely Relaxer Kit',
      brand: 'Dark & Lovely',
      sku: 'DL-REL-KIT',
      search_keywords: 'dark lovely,relaxer,hair,straighten,kit,chemical',
      buying_price: 550, selling_price: 850, quantity_in_stock: 30, low_stock_threshold: 8, unit: 'kit'
    },
    {
      category_id: catMap['Makeup'],
      name: 'NYX Matte Lipstick',
      brand: 'NYX',
      sku: 'NYX-LIP-MAT',
      search_keywords: 'nyx,lipstick,matte,lip,color,makeup',
      buying_price: 400, selling_price: 700, quantity_in_stock: 40, low_stock_threshold: 12, unit: 'pcs'
    },
    {
      category_id: catMap['Fragrances'],
      name: 'Versace Eros Perfume 100ml',
      brand: 'Versace',
      sku: 'VER-EROS-100',
      search_keywords: 'versace,eros,perfume,fragrance,cologne,men,spray',
      buying_price: 3500, selling_price: 5500, quantity_in_stock: 15, low_stock_threshold: 5, unit: 'bottle'
    },
    {
      category_id: catMap['Body Care'],
      name: 'Palmer\'s Cocoa Butter Lotion',
      brand: 'Palmer\'s',
      sku: 'PAL-COC-LOT',
      search_keywords: 'palmers,cocoa butter,lotion,body,stretch marks,skin',
      buying_price: 350, selling_price: 550, quantity_in_stock: 60, low_stock_threshold: 15, unit: 'bottle'
    },
  ];

  for (const p of sampleProducts) {
    await pool.query(`
      INSERT IGNORE INTO products 
        (category_id, name, brand, sku, search_keywords, buying_price, selling_price, 
         quantity_in_stock, low_stock_threshold, unit)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [p.category_id, p.name, p.brand, p.sku, p.search_keywords,
        p.buying_price, p.selling_price, p.quantity_in_stock, p.low_stock_threshold, p.unit]);
  }
  console.log(`  ✅ ${sampleProducts.length} sample products created`);

  console.log('\n✨ Seeding complete!\n');
  console.log('⚠️  IMPORTANT: Change admin password on first login!');
  console.log('   Login: admin@cosmetix.co.ke');
  console.log('   Password: Admin@2024!\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

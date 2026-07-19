// ============================================================
// DATABASE CONNECTION - MySQL via mysql2
// Connects to cPanel MySQL on Namecheap hosting
// ============================================================
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool for efficient DB usage
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,       // max simultaneous connections
  queueLimit: 0,
  timezone: '+03:00',        // East Africa Time (Nairobi/Mombasa)
  charset: 'utf8mb4',        // supports emojis and all characters
});

// Test the connection on startup
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1); // Exit if DB is unavailable
  }
}

module.exports = { pool, testConnection };

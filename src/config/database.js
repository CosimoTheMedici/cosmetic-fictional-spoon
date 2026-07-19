// ============================================================
// DATABASE CONNECTION - MySQL via mysql2
// Matches the Python pymysql implementation
// ============================================================
const mysql = require("mysql2/promise");
require("dotenv").config();
const fs = require("fs"); // Added for SSL certificate handling
const path = require("path");
require("dotenv").config();

// Connection timeout in seconds (matches Python's timeout=10)
const TIMEOUT = 10;
const caPath2 = process.env.DB_SSL_CA || path.join(__dirname, "..", "ca.pem");
const caPath = path.join(__dirname, "ca.pem"); // Looks for ca.pem in same folder

console.log(caPath2);

// Create a connection pool matching Python's settings
const pool = mysql.createPool({
  host: process.env.DB_PROD_HOST || "mysql-64eed55-cosmetic.e.aivencloud.com",
  port: parseInt(process.env.DB_PROD_PORT) || 12998,
  user: process.env.DB_PROD_USER || "avnadmin",
  password: process.env.DB_PROD_PASSWORD,
  database: process.env.DB_PROD_NAME || "defaultdb",

  // Matching Python's charset and cursor settings
  charset: "utf8mb4", // matches charset="utf8mb4"
  timezone: "+00:00", // UTC (adjust as needed)

  // Connection pool settings (Node.js equivalent of Python's connection pooling)
  waitForConnections: true,
  connectionLimit: 10, // max simultaneous connections
  queueLimit: 0,

  // Timeout settings matching Python's connect_timeout, read_timeout, write_timeout
  connectTimeout: TIMEOUT * 1000, // 10 seconds (matches connect_timeout=10)
  acquireTimeout: TIMEOUT * 1000, // 10 seconds
  timeout: TIMEOUT * 1000, // 10 seconds (matches read_timeout/write_timeout)

  // Enable keep-alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // SSL configuration (for Aiven)
  ssl: {
    rejectUnauthorized: true, // SSL verification enabled
    // If you have a CA certificate file:
    ca: fs.readFileSync(caPath),
  },
});

// Test the connection on startup (matches Python's test_connection)
async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT VERSION() as version");
    console.log("✅ MySQL connected successfully");
    console.log(`📦 MySQL Version: ${rows[0].version}`);
    return true;
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    return false;
  } finally {
    if (connection) connection.release();
  }
}

// Helper: Execute query and return all rows (matches Python's fetchall)
async function query(sql, params = null) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows; // Returns array of rows (like Python's fetchall)
  } finally {
    connection.release();
  }
}


module.exports = { pool, testConnection };

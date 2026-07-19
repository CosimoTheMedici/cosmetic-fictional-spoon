// ============================================================
// COSMETIX SHOP MANAGEMENT SYSTEM - Express Server
// Entry point: sets up middleware, routes, and starts listening
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./config/database');

// Import route modules
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const { salesRouter, reportRouter, expenseRouter, categoryRouter } = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================

// Helmet adds standard security headers
app.use(helmet());

// CORS - Allow requests from the React frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // Set to your domain in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — prevents brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // max 200 requests per window
  message: { message: 'Too many requests. Please wait.' }
});
app.use('/api/', limiter);

// ============================================================
// GENERAL MIDDLEWARE
// ============================================================
app.use(morgan('dev'));                          // HTTP request logging
app.use(express.json({ limit: '10mb' }));       // Parse JSON request bodies
app.use(express.urlencoded({ extended: true }));

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRouter);
app.use('/api/reports', reportRouter);
app.use('/api/expenses', expenseRouter);
app.use('/api/categories', categoryRouter);

// Health check — useful for monitoring
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Cosmetix Shop Management System',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  const test = await testConnection(); // Verify DB before starting
  app.listen(PORT, () => {
    console.log(`\n🌸 Cosmetix API running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

startServer().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

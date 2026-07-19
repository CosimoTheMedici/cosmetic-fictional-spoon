// ============================================================
// ROUTES - Sales
// ============================================================
const express = require("express");
const salesRouter = express.Router();
const {
  createSale,
  getSales,
  getSale,
  getDailyReconciliation,
  submitReconciliation,
} = require("../controllers/salesController");
const { authenticate, adminOnly } = require("../middleware/auth");

salesRouter.use(authenticate);
salesRouter.post("/", createSale);
salesRouter.get("/", getSales);
salesRouter.get("/reconciliation/today", adminOnly, getDailyReconciliation);
salesRouter.post("/reconciliation", adminOnly, submitReconciliation);
salesRouter.get("/:id", getSale);

// ============================================================
// ROUTES - Reports (Admin only)
// ============================================================
const reportRouter = express.Router();
const {
  getDashboard,
  getTopProducts,
  getProfitByProduct,
  getProfitAndLoss,
  getBalanceSheet,
} = require("../controllers/reportController");

//reportRouter.use(authenticate, adminOnly);
reportRouter.get("/dashboard", getDashboard);
reportRouter.get("/top-products", getTopProducts);
reportRouter.get("/profit-by-product", getProfitByProduct);
reportRouter.get("/pnl", getProfitAndLoss);
reportRouter.get("/balance-sheet", getBalanceSheet);

// ============================================================
// ROUTES - Expenses
// ============================================================
const expenseRouter = express.Router();
const {
  createExpense,
  getExpenses,
  deleteExpense,
  getCategories,
} = require("../controllers/expenseController");

//expenseRouter.use(authenticate, adminOnly);
expenseRouter.get("/", getExpenses);
expenseRouter.post("/", createExpense);
expenseRouter.delete("/:id", deleteExpense);
expenseRouter.get("/meta/categories", getCategories);

// ============================================================
// ROUTES - Categories
// ============================================================
const categoryRouter = express.Router();
const { pool } = require("../config/database");

categoryRouter.use(authenticate);
categoryRouter.get("/", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM categories ORDER BY name");
  res.json({ categories: rows });
});
categoryRouter.post("/", adminOnly, async (req, res) => {
  const { name, description } = req.body;
  const [r] = await pool.query(
    "INSERT INTO categories (name, description) VALUES (?,?)",
    [name, description],
  );
  res.status(201).json({ id: r.insertId, name, description });
});

module.exports = { salesRouter, reportRouter, expenseRouter, categoryRouter };

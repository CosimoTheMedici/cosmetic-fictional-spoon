// ============================================================
// ROUTES - Reports (Admin only, shop-wide across all modules)
// ============================================================
const express = require("express");
const reportRouter = express.Router();
const {
  getDashboard,
  getTopProducts,
  getProfitByProduct,
  getProfitAndLoss,
  getBalanceSheet,
} = require("../controllers/reportController");
const { authenticate, adminOnly } = require("../middleware/auth");

reportRouter.use(authenticate, adminOnly);
reportRouter.get("/dashboard", getDashboard);
reportRouter.get("/top-products", getTopProducts);
reportRouter.get("/profit-by-product", getProfitByProduct);
reportRouter.get("/pnl", getProfitAndLoss);
reportRouter.get("/balance-sheet", getBalanceSheet);

// ============================================================
// ROUTES - Expenses (Admin only, shop-wide across all modules)
// ============================================================
const expenseRouter = express.Router();
const {
  createExpense,
  getExpenses,
  deleteExpense,
  getCategories,
} = require("../controllers/expenseController");

expenseRouter.use(authenticate, adminOnly);
expenseRouter.get("/", getExpenses);
expenseRouter.post("/", createExpense);
expenseRouter.delete("/:id", deleteExpense);
expenseRouter.get("/meta/categories", getCategories);

module.exports = { reportRouter, expenseRouter };

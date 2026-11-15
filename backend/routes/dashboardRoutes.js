const express = require("express");
const router = express.Router();
const {
  getDashboardOverview,
  getDashboardStats,
  getRecentSales,
  getTopSelling,
  getProfitLoss,
  getSupplierSummary,
  getRecentPayments,
  getInventorySummary,
  getCacheDiagnostics,
} = require("../controllers/dashboardController");

// Cache diagnostics telemetry
router.get("/cache-stats", getCacheDiagnostics);

// Main consolidated dashboard payload (Stats, KPIs, Trends, Recent Sales, Suppliers, Inventory)
router.get("/", getDashboardOverview);
router.get("/overview", getDashboardOverview);

// Specialized individual sub-endpoints
router.get("/stats", getDashboardStats);
router.get("/recent-sales", getRecentSales);
router.get("/top-selling", getTopSelling);
router.get("/profit-loss", getProfitLoss);
router.get("/supplier-summary", getSupplierSummary);
router.get("/recent-payments", getRecentPayments);
router.get("/inventory-summary", getInventorySummary);

module.exports = router;

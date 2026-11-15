const express = require("express");
const router = express.Router();
const {
  createSale,
  getSales,
  getSalesStats,
  // getSalesAnalytics,
  getSaleById,
} = require("../controllers/saleController");

// Sales analytics & stats endpoints (must be defined before /:id)
router.get("/stats", getSalesStats);
// router.get("/analytics", getSalesAnalytics);

// Core sales endpoints
router.post("/", createSale);
router.get("/", getSales);
router.get("/:id", getSaleById);

module.exports = router;

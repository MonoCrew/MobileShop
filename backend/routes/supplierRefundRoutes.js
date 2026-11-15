const express = require("express");
const router = express.Router();
const {
  checkImei,
  createSupplierRefund,
  getSupplierRefunds,
  getSupplierRefundById,
  getSupplierStockItems,
} = require("../controllers/supplierRefundController");

// Check IMEI eligibility for supplier refund
router.get("/check-imei", checkImei);

// Get available stock items for a supplier (optionally filtered by phone name)
router.get("/supplier-stock", getSupplierStockItems);

// Submit a supplier refund transaction
router.post("/", createSupplierRefund);

// Get list of refunds
router.get("/", getSupplierRefunds);

// Get single refund by ID
router.get("/:id", getSupplierRefundById);

module.exports = router;

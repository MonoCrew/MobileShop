const express = require("express");
const router = express.Router();
const {
  getShopkeepers,
  createOrGetShopkeeper,
  getShopkeeperById,
  getTransfers,
  getFilterOptions,
  createTransfer,
  returnStock,
  markAsSold,
  recordShopkeeperPayment,
} = require("../controllers/shopkeeperController");

// Transfer management endpoints
router.get("/transfers", getTransfers);
router.post("/transfers", createTransfer);
router.post("/transfers/:id/return", returnStock);
router.post("/transfers/:id/sell", markAsSold);

// Dynamic filter options endpoint (must be before /:id)
router.get("/filter-options", getFilterOptions);

// Shopkeeper directory & profile endpoints
router.get("/", getShopkeepers);
router.post("/", createOrGetShopkeeper);
router.get("/:id", getShopkeeperById);
router.post("/:id/payments", recordShopkeeperPayment);
router.post("/:id/payment", recordShopkeeperPayment);

module.exports = router;

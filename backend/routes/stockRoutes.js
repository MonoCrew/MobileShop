const express = require("express");
const router = express.Router();
const {
  getStock,
  getStockStats,
  createStock,
  getStockById,
  deleteStock,
  createStockBatch,
  verifyBarcodes,
  getStockItemByBarcode,
  getProductBarcodes,
  transferStock,
  getStockTransfers,
} = require("../controllers/stockController");
const {
  getPurchaseHistory,
  getPurchaseDetails,
} = require("../controllers/purchaseHistoryController");

// Stock Routes
router.get("/", getStock);
router.get("/stats", getStockStats);
router.get("/summary", getStockStats);

// Purchase History (Unified acquisition records: Supplier, Local, Exchange)
router.get("/purchase-history", getPurchaseHistory);
router.get("/purchase-history/:id", getPurchaseDetails);

// Stock Transfers
router.post("/transfer", transferStock);
router.get("/transfers", getStockTransfers);

// Batch & Serialized Item Endpoints
router.post("/batch", createStockBatch);
router.post("/verify-barcodes", verifyBarcodes);
router.get("/barcode/:barcode", getStockItemByBarcode);

router.post("/", createStock);
router.get("/:id/barcodes", getProductBarcodes);
router.get("/:id", getStockById);
router.delete("/:id", deleteStock);

module.exports = router;

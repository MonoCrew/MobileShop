const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Supplier = require("../models/Supplier");
const {
  getSuppliers,
  getSupplierById,
  getSupplierHistory,
  recordSupplierPayment,
  createSupplier,
} = require("../controllers/supplierController");
const { createStockBatch } = require("../controllers/stockController");

// List all suppliers with financial ledger summary metrics
router.get("/", getSuppliers);

// Specific supplier purchase, material, and payment history
router.get("/:identifier/history", getSupplierHistory);

// Direct stock purchase for a specific supplier
router.post("/:identifier/purchase", async (req, res, next) => {
  let supplierName = "";
  try {
    supplierName = decodeURIComponent(req.params.identifier).trim();
  } catch {
    supplierName = (req.params.identifier || "").trim();
  }

  let supplierDoc = null;
  if (mongoose.Types.ObjectId.isValid(supplierName)) {
    supplierDoc = await Supplier.findById(supplierName).lean();
  }
  if (!supplierDoc) {
    supplierDoc = await Supplier.findOne({
      name: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    }).lean();
  }

  if (!supplierDoc) {
    return res.status(404).json({ success: false, message: "Supplier not found in directory" });
  }

  req.body.entryOrigin = "supplier_ledger";
  req.body.supplierId = supplierDoc._id;
  supplierName = supplierDoc.name;

  if (!req.body.items && req.body.productName) {
    req.body.items = [
      {
        ...req.body,
        supplier: supplierName,
        supplierId: supplierDoc?._id,
        entryOrigin: "supplier_ledger",
      },
    ];
  } else if (Array.isArray(req.body.items)) {
    req.body.items = req.body.items.map((it) => ({
      ...it,
      supplier: it.supplier || supplierName,
      supplierId: it.supplierId || supplierDoc?._id,
      entryOrigin: "supplier_ledger",
    }));
  }
  return createStockBatch(req, res, next);
});

// Record payment settlement against a supplier's balance due (both payment and payments)
router.post("/:identifier/payments", recordSupplierPayment);
router.post("/:identifier/payment", recordSupplierPayment);

// Single supplier by ID or name
router.get("/:id", (req, res, next) => {
  // If id is not an ObjectId, fallback to supplier history
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
    return getSupplierHistory(req, res, next);
  }
  return getSupplierById(req, res, next);
});

// Create new supplier
router.post("/", createSupplier);

module.exports = router;

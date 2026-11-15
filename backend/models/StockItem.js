const mongoose = require("mongoose");

/**
 * StockItem Schema
 * Represents an individual serialized unit in inventory.
 * 1 physical piece = 1 document.
 * Barcode is optional (defaults to "N/A" if item lacks barcode).
 * Indexed for sub-millisecond barcode scanner queries at POS checkout.
 */
const StockItemSchema = new mongoose.Schema(
  {
    barcode: {
      type: String,
      default: null,
      trim: true,
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      index: true,
    },
    storage: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "General",
    },
    purchaseCost: {
      type: Number,
      required: [true, "Purchase cost is required"],
      min: [0, "Purchase cost cannot be negative"],
    },
    sellingPrice: {
      type: Number,
      min: [0, "Selling price cannot be negative"],
      default: 0,
    },
    estimatedSalePricePerUnit: {
      type: Number,
      min: [0, "Estimated sale price per unit cannot be negative"],
      default: null,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: [true, "Invoice reference is required"],
      index: true,
    },
    supplier: {
      type: String,
      required: [true, "Supplier is required"],
      trim: true,
      index: true,
    },
    isLocalPurchase: {
      type: Boolean,
      default: false,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    purchaseDate: {
      type: Date,
      required: [true, "Purchase date is required"],
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "sold", "returned", "returned_to_supplier", "damaged", "transferred"],
      default: "available",
      index: true,
    },
    shopkeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopkeeper",
      default: null,
      index: true,
    },
    transferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopkeeperTransfer",
      default: null,
      index: true,
    },
    location: {
      type: String,
      enum: ["shop", "warehouse"],
      default: "shop",
      index: true,
    },
    isLinkedToLedger: {
      type: Boolean,
      default: false,
    },
    entryOrigin: {
      type: String,
      enum: ["general_intake", "supplier_ledger", "local_purchase"],
      default: "general_intake",
    },
    transactionRef: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

StockItemSchema.index({ location: 1, status: 1, productName: 1 });
StockItemSchema.index({ location: 1, barcode: 1, status: 1 });
StockItemSchema.index({ status: 1, productName: 1 });
StockItemSchema.index({ productName: 1, barcode: 1, status: 1 });
StockItemSchema.index({ invoiceId: 1, status: 1 });
// Allow same barcode/IMEI across units (non-unique index for fast lookup)
StockItemSchema.index({ barcode: 1 });
StockItemSchema.index({ barcode: 1, location: 1 });
StockItemSchema.index({ productName: 1, location: 1 });

module.exports = mongoose.model("StockItem", StockItemSchema);

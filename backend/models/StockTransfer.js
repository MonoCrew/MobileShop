const mongoose = require("mongoose");

/**
 * StockTransfer Schema
 * Represents permanent, auditable internal inventory movements between locations (Shop <-> Warehouse).
 * Does not create revenue, supplier debt, cash payment, or profit.
 */
const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: [true, "Transfer number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      index: true,
    },
    barcode: {
      type: String,
      default: "N/A",
      trim: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Transfer quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    unitPurchaseCost: {
      type: Number,
      required: [true, "Unit purchase cost is required"],
      min: [0, "Purchase cost cannot be negative"],
    },
    totalTransferCost: {
      type: Number,
      required: [true, "Total transfer cost is required"],
      min: [0, "Total transfer cost cannot be negative"],
    },
    sourceLocation: {
      type: String,
      enum: ["shop", "warehouse"],
      required: [true, "Source location is required"],
      index: true,
    },
    destinationLocation: {
      type: String,
      enum: ["shop", "warehouse"],
      required: [true, "Destination location is required"],
      index: true,
    },
    sourceStockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: false,
      index: true,
    },
    destinationStockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: false,
      index: true,
    },
    supplier: {
      type: String,
      trim: true,
      default: "Unknown Supplier",
    },
    transferredStockItemIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StockItem",
      },
    ],
    transferredBarcodes: [
      {
        type: String,
        trim: true,
      },
    ],
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    transferDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

stockTransferSchema.index({ sourceLocation: 1, destinationLocation: 1, transferDate: -1 });
stockTransferSchema.index({ productName: 1, transferDate: -1 });
stockTransferSchema.index({ transferDate: -1, _id: -1 });

module.exports = mongoose.model("StockTransfer", stockTransferSchema);

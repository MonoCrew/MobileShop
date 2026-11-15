const mongoose = require("mongoose");

/**
 * Shopkeeper Schema
 * Represents external shopkeepers / merchants who take inventory on consignment / transfer.
 * Maintains real-time aggregates for stock held, completed sales, and accounts receivable balance.
 */
const shopkeeperSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Shopkeeper name is required"],
      trim: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    // Running aggregates updated upon transfer, return, and sale completion
    totalStockTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalStockReturned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalStockSold: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentStockHeld: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPayable: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalProfitGenerated: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast search and cursor sorting
shopkeeperSchema.index({ name: 1, _id: 1 });
shopkeeperSchema.index({ currentStockHeld: -1, _id: -1 });
shopkeeperSchema.index({ totalDue: -1, _id: -1 });
shopkeeperSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model("Shopkeeper", shopkeeperSchema);

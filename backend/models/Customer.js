const mongoose = require("mongoose");

/**
 * Customer Schema
 * Tracks customer profile, store credit balance (amount shopkeeper owes customer),
 * and complete ledger history of returns, payouts, exchanges, and sales.
 */
const customerLedgerEntrySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      enum: ["credit", "debit", "payout", "exchange", "adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    referenceType: {
      type: String,
      enum: ["Return", "Sale", "Payout", "Adjustment", "Manual"],
      default: "Return",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    referenceNumber: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    processedBy: {
      type: String,
      default: "Admin",
    },
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    balance: {
      type: Number,
      default: 0,
      description: "Store credit / amount shopkeeper owes the customer",
    },
    totalStoreCreditIssued: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalStoreCreditUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCashPayouts: {
      type: Number,
      default: 0,
      min: 0,
    },
    ledger: [customerLedgerEntrySchema],
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

customerSchema.index({ name: "text", phone: "text" });
customerSchema.index({ balance: -1, name: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ name: 1, phone: 1 });

module.exports = mongoose.model("Customer", customerSchema);

const mongoose = require("mongoose");

/**
 * SupplierRefund Schema
 * Dedicated transaction log recording every supplier return / refund.
 * Supports both Workflow A (Refund Only) and Workflow B (Refund + Replacement Purchase).
 */
const SupplierRefundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      required: [true, "Refund number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    supplier: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    refundDate: {
      type: Date,
      required: [true, "Refund date is required"],
      default: Date.now,
      index: true,
    },
    workflowType: {
      type: String,
      enum: ["refund_only", "refund_and_purchase"],
      default: "refund_only",
      index: true,
    },
    returnedItems: [
      {
        stockItemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockItem",
          required: true,
        },
        stockId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Stock",
          default: null,
        },
        productName: {
          type: String,
          required: true,
          trim: true,
        },
        storage: {
          type: String,
          default: "",
          trim: true,
        },
        color: {
          type: String,
          default: "",
          trim: true,
        },
        category: {
          type: String,
          default: "General",
          trim: true,
        },
        barcode: {
          type: String,
          required: true,
          trim: true,
        },
        originalPurchaseCost: {
          type: Number,
          required: true,
          min: 0,
        },
        refundAmount: {
          type: Number,
          required: true,
          min: 0,
        },
        invoiceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PurchaseInvoice",
          default: null,
        },
        invoiceNumber: {
          type: String,
          default: "N/A",
          trim: true,
        },
      },
    ],
    totalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    totalRefundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Replacement purchase details (if Workflow B)
    replacementInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      default: null,
    },
    replacementInvoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },
    replacementCartTotal: {
      type: Number,
      default: 0,
    },
    netDifference: {
      type: Number,
      default: 0, // replacementCartTotal - totalRefundAmount
    },
    cashPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    differenceSettlement: {
      type: String,
      enum: ["debt_adjusted", "paid_extra", "credit_retained", "even"],
      default: "debt_adjusted",
    },
    replacementItems: [
      {
        productName: { type: String, default: "" },
        storage: { type: String, default: "" },
        color: { type: String, default: "" },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
        barcodes: [{ type: String }],
      },
    ],
    // Ledger audit snapshots
    previousSupplierBalance: {
      type: Number,
      default: 0,
    },
    resultingSupplierBalance: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
      index: true,
    },
    processedBy: {
      type: String,
      default: "Admin",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

SupplierRefundSchema.index({ supplier: 1, refundDate: -1 });
SupplierRefundSchema.index({ status: 1, refundDate: -1 });
SupplierRefundSchema.index({ "returnedItems.barcode": 1 });

module.exports = mongoose.model("SupplierRefund", SupplierRefundSchema);

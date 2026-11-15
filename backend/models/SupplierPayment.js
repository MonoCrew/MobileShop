const mongoose = require("mongoose");

/**
 * SupplierPayment Schema
 * Dedicated transaction log recording every money transfer / disbursement sent to a supplier.
 */
const SupplierPaymentSchema = new mongoose.Schema(
  {
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
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0.01, "Payment amount must be greater than zero"],
    },
    paymentDate: {
      type: Date,
      required: [true, "Payment date is required"],
      default: Date.now,
      index: true,
    },
    paymentMethod: {
      type: String,
      default: "Cash",
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["Upfront Payment", "Debt Settlement", "Direct Payment", "Supplier Refund"],
      default: "Debt Settlement",
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      default: "Completed",
    },
  },
  {
    timestamps: true,
  }
);

SupplierPaymentSchema.index({ supplier: 1, paymentDate: -1, createdAt: -1 });
SupplierPaymentSchema.index({ status: 1, paymentMethod: 1, paymentDate: -1 });
SupplierPaymentSchema.index({ paymentDate: -1 });
SupplierPaymentSchema.index({ status: 1, paymentDate: -1 });

module.exports = mongoose.model("SupplierPayment", SupplierPaymentSchema);

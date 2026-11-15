const mongoose = require("mongoose");

/**
 * PurchaseInvoice Schema
 * Represents the master supplier purchasing transaction and batch invoice.
 */
const PurchaseInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
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
    isLocalPurchase: {
      type: Boolean,
      default: false,
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
    isLinkedToLedger: {
      type: Boolean,
      default: false,
      index: true,
    },
    entryOrigin: {
      type: String,
      enum: ["general_intake", "supplier_ledger", "local_purchase"],
      default: "general_intake",
      index: true,
    },
    standaloneReference: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    purchaseDate: {
      type: Date,
      required: [true, "Purchase date is required"],
      index: true,
    },
    totalQuantity: {
      type: Number,
      required: [true, "Total quantity is required"],
      min: [0, "Total quantity cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    amountPaid: {
      type: Number,
      required: [true, "Amount paid is required"],
      min: [0, "Amount paid cannot be negative"],
      default: 0,
    },
    amountDue: {
      type: Number,
      required: [true, "Amount due is required"],
      min: [0, "Amount due cannot be negative"],
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "unpaid", "due", "refunded"],
      required: true,
      default: "unpaid",
      index: true,
    },
    itemsSummary: [
      {
        productName: { type: String, required: true, trim: true },
        storage: { type: String, trim: true, default: "" },
        color: { type: String, trim: true, default: "" },
        category: { type: String, trim: true, default: "General" },
        quantity: { type: Number, required: true, min: [0, "Quantity cannot be negative"] },
        unitPrice: { type: Number, required: true, min: 0 },
        sellingPrice: { type: Number, default: 0, min: 0 },
        estimatedSalePricePerUnit: { type: Number, default: null },
        estimatedTotalSaleValue: { type: Number, default: null },
        subtotal: { type: Number, required: true, min: 0 },
        barcodes: [{ type: String, required: false, trim: true }],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for invoice list queries, payment stats, and date filtering
PurchaseInvoiceSchema.index({ purchaseDate: -1, createdAt: -1 });
PurchaseInvoiceSchema.index({ supplier: 1, amountDue: 1, purchaseDate: -1 });
PurchaseInvoiceSchema.index({ paymentStatus: 1, purchaseDate: -1 });

module.exports = mongoose.model("PurchaseInvoice", PurchaseInvoiceSchema);

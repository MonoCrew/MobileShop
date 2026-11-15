const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
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
    barcode: {
      type: String,
      required: [true, "Barcode / Code is required"],
      trim: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
    },
    // MUST store per unit price in database as specifically instructed
    unitPrice: {
      type: Number,
      required: [true, "Per unit price is required"],
      min: [0, "Per unit price cannot be negative"],
    },
    totalPrice: {
      type: Number,
      min: [0, "Total price cannot be negative"],
    },
    location: {
      type: String,
      enum: ["shop", "warehouse"],
      default: "shop",
      index: true,
    },
    estimatedSalePricePerUnit: {
      type: Number,
      min: [0, "Estimated sale price per unit cannot be negative"],
      default: null,
    },
    estimatedTotalSaleValue: {
      type: Number,
      min: [0, "Estimated total sale value cannot be negative"],
      default: null,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
      required: [true, "Purchase date is required"],
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },
    supplierName: {
      type: String,
      trim: true,
      default: "",
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
    transactionRef: {
      type: String,
      trim: true,
      index: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: [0, "Amount paid cannot be negative"],
    },
    amountDue: {
      type: Number,
      default: 0,
      min: [0, "Amount due cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Partial", "Due"],
      default: "Due",
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: auto-calculate totalPrice, amountDue, and paymentStatus based on stored unitPrice & quantity
stockSchema.pre("save", function () {
  if (this.unitPrice != null && this.quantity != null) {
    this.totalPrice = Number((this.unitPrice * this.quantity).toFixed(2));
    const paid = this.amountPaid || 0;
    this.amountDue = Math.max(0, Number((this.totalPrice - paid).toFixed(2)));
    if (paid >= this.totalPrice && this.totalPrice > 0) {
      this.paymentStatus = "Paid";
    } else if (paid > 0) {
      this.paymentStatus = "Partial";
    } else {
      this.paymentStatus = "Due";
    }
  }

  // Initial calculation of estimated prices strictly upon first creation
  if (this.isNew) {
    if (this.estimatedSalePricePerUnit != null && this.estimatedTotalSaleValue == null && this.quantity != null) {
      this.estimatedTotalSaleValue = Number((this.estimatedSalePricePerUnit * this.quantity).toFixed(2));
    } else if (this.estimatedTotalSaleValue != null && this.estimatedSalePricePerUnit == null && this.quantity != null && this.quantity > 0) {
      this.estimatedSalePricePerUnit = Number((this.estimatedTotalSaleValue / this.quantity).toFixed(2));
    }
  }
});

// Full-text search index for indexed text queries across product name and barcode
stockSchema.index(
  { productName: "text", barcode: "text" },
  { weights: { productName: 5, barcode: 10 }, name: "StockTextIndex" }
);

// Compound indexes for cursor keyset pagination with deterministic _id tie-breaker
stockSchema.index({ createdAt: -1, _id: -1 });
stockSchema.index({ createdAt: 1, _id: 1 });
stockSchema.index({ unitPrice: 1, _id: 1 });
stockSchema.index({ unitPrice: -1, _id: -1 });
stockSchema.index({ quantity: 1, _id: 1 });
stockSchema.index({ quantity: -1, _id: -1 });
stockSchema.index({ productName: 1, _id: 1 });
stockSchema.index({ productName: -1, _id: -1 });

// Filtering compound indexes
stockSchema.index({ location: 1, createdAt: -1, _id: -1 });
stockSchema.index({ location: 1, quantity: 1, createdAt: -1 });
stockSchema.index({ location: 1, productName: 1, createdAt: -1 });
stockSchema.index({ location: 1, barcode: 1, createdAt: -1 });
stockSchema.index({ paymentStatus: 1, createdAt: -1, _id: -1 });
stockSchema.index({ supplier: 1, createdAt: -1, _id: -1 });
stockSchema.index({ supplier: 1, paymentStatus: 1, createdAt: -1 });
stockSchema.index({ quantity: 1, createdAt: -1 });
stockSchema.index({ barcode: 1, location: 1 });
stockSchema.index({ productName: 1, location: 1 });

module.exports = mongoose.model("Stock", stockSchema);

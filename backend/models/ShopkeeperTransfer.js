const mongoose = require("mongoose");

/**
 * ShopkeeperTransfer Schema
 * Represents stock temporarily transferred to an external shopkeeper on consignment.
 * NOT a sale. Stock is held until returned or marked as sold.
 * Invariant: originalQuantity = returnedQuantity + soldQuantity + remainingQuantity.
 */
const shopkeeperTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: [true, "Transfer number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: [true, "Stock reference is required"],
      index: true,
    },
    shopkeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopkeeper",
      required: [true, "Shopkeeper reference is required"],
      index: true,
    },
    shopkeeperName: {
      type: String,
      required: [true, "Shopkeeper name is required"],
      trim: true,
      index: true,
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
    barcode: {
      type: String,
      default: "N/A",
      trim: true,
    },
    barcodes: [
      {
        type: String,
        trim: true,
      },
    ],
    originalQuantity: {
      type: Number,
      required: [true, "Original transfer quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    returnedQuantity: {
      type: Number,
      default: 0,
      min: [0, "Returned quantity cannot be negative"],
    },
    soldQuantity: {
      type: Number,
      default: 0,
      min: [0, "Sold quantity cannot be negative"],
    },
    remainingQuantity: {
      type: Number,
      required: true,
      min: [0, "Remaining quantity cannot be negative"],
    },
    // Historical unit cost frozen at transfer creation time
    unitCost: {
      type: Number,
      required: [true, "Unit cost is required"],
      min: [0, "Unit cost cannot be negative"],
    },
    // Agreed amount payable to my shop per unit
    agreedAmountPerUnit: {
      type: Number,
      required: [true, "Agreed amount payable per unit is required"],
      min: [0, "Agreed amount cannot be negative"],
    },
    totalExpectedAmount: {
      type: Number,
      required: true,
      min: [0, "Total expected amount cannot be negative"],
    },
    amountReceived: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "partially_completed", "completed", "returned"],
      default: "active",
      index: true,
    },
    transferDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    returns: [
      {
        quantity: { type: Number, required: true, min: 1 },
        returnDate: { type: Date, default: Date.now },
        notes: { type: String, default: "", trim: true },
      },
    ],
    sales: [
      {
        saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
        saleNumber: { type: String, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },
        agreedAmountPerUnit: { type: Number, required: true, min: 0 },
        customerSalePrice: { type: Number, default: 0, min: 0 },
        myProfitPerUnit: { type: Number, required: true },
        totalAmountPayable: { type: Number, required: true, min: 0 },
        totalProfit: { type: Number, required: true },
        amountPaid: { type: Number, default: 0, min: 0 },
        amountDue: { type: Number, default: 0, min: 0 },
        paymentMethod: { type: String, default: "Cash", trim: true },
        paymentStatus: { type: String, default: "Paid", trim: true },
        saleDate: { type: Date, default: Date.now },
        notes: { type: String, default: "", trim: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook ensuring reconciliation invariant:
// originalQuantity = returnedQuantity + soldQuantity + remainingQuantity
shopkeeperTransferSchema.pre("validate", function () {
  if (this.originalQuantity != null) {
    const ret = this.returnedQuantity || 0;
    const sold = this.soldQuantity || 0;
    this.remainingQuantity = Math.max(0, this.originalQuantity - (ret + sold));

    if (this.totalExpectedAmount == null && this.agreedAmountPerUnit != null) {
      this.totalExpectedAmount = Number((this.agreedAmountPerUnit * this.originalQuantity).toFixed(2));
    }

    // Determine status
    if (this.remainingQuantity === 0) {
      if (sold > 0 && ret === 0) {
        this.status = "completed";
      } else if (ret > 0 && sold === 0) {
        this.status = "returned";
      } else {
        this.status = "completed";
      }
    } else if (sold > 0 || ret > 0) {
      this.status = "partially_completed";
    } else {
      this.status = "active";
    }
  }
});

// Indexes for high-speed queries and filtering
shopkeeperTransferSchema.index({ shopkeeperId: 1, transferDate: -1 });
shopkeeperTransferSchema.index({ shopkeeperName: 1, transferDate: -1 });
shopkeeperTransferSchema.index({ productName: 1, transferDate: -1 });
shopkeeperTransferSchema.index({ status: 1, transferDate: -1 });
shopkeeperTransferSchema.index({ transferDate: -1, _id: -1 });

module.exports = mongoose.model("ShopkeeperTransfer", shopkeeperTransferSchema);

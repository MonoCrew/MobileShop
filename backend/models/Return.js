const mongoose = require("mongoose");

/**
 * Return Schema
 * Dedicated audit record preserving original sale reference, timestamp,
 * reasons, returned item breakdown, cost reversal, and settlement options.
 */
const returnItemSchema = new mongoose.Schema(
  {
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: false,
    },
    stockItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      default: null,
    },
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
      default: "N/A",
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    soldQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    returnQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPurchaseCost: {
      type: Number,
      required: true,
      min: 0,
    },
    unitSellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    originalSoldPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    actualRefundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    retainedProfit: {
      type: Number,
      default: 0,
    },
    returnFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    restoreToInventory: {
      type: Boolean,
      default: true,
    },
    costRefunded: {
      type: Number,
      required: true,
      min: 0,
    },
    profitReversed: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      default: "Customer Return",
      trim: true,
    },
    condition: {
      type: String,
      enum: ["resellable", "damaged", "defective"],
      default: "resellable",
    },
    saleSource: {
      type: String,
      enum: ["direct", "shopkeeper"],
      default: "direct",
    },
    shopkeeperName: {
      type: String,
      default: "",
      trim: true,
    },
    shopkeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopkeeper",
      default: null,
    },
    shopkeeperTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopkeeperTransfer",
      default: null,
    },
  },
  { _id: true }
);

const returnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: [true, "Return number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      index: true,
      default: null,
    },
    location: {
      type: String,
      enum: ["shop", "warehouse"],
      default: "shop",
      index: true,
    },
    saleNumber: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
      default: null,
    },
    customerName: {
      type: String,
      trim: true,
      default: "Walk-in Customer",
    },
    customerPhone: {
      type: String,
      trim: true,
      default: "",
    },
    saleSource: {
      type: String,
      enum: ["direct", "shopkeeper"],
      default: "direct",
      index: true,
    },
    shopkeeperName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    shopkeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopkeeper",
      default: null,
      index: true,
    },
    shopkeeperTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopkeeperTransfer",
      default: null,
      index: true,
    },
    items: [returnItemSchema],
    totalOriginalSoldPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRefundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalRetainedProfit: {
      type: Number,
      default: 0,
    },
    totalReturnFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCostRefunded: {
      type: Number,
      required: true,
      min: 0,
    },
    totalProfitReversed: {
      type: Number,
      default: 0,
    },
    totalUnitsReturned: {
      type: Number,
      required: true,
      min: 1,
    },
    settlementType: {
      type: String,
      enum: ["cash_payout", "store_credit", "exchange"],
      required: [true, "Settlement type is required"],
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: ["Cash", "Card", "Bank Transfer", "Store Credit", "Exchange"],
      default: "Cash",
    },
    cashRefundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    storeCreditAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    exchangeDetails: {
      exchangeSaleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sale",
        default: null,
      },
      exchangeSaleNumber: {
        type: String,
        default: "",
      },
      exchangeCartTotal: {
        type: Number,
        default: 0,
      },
      netDifference: {
        type: Number,
        default: 0,
      },
      differenceAction: {
        type: String,
        enum: ["customer_paid_extra", "refunded_to_customer", "store_credit_retained", "even"],
        default: "even",
      },
      exchangeItems: [
        {
          stockId: { type: mongoose.Schema.Types.ObjectId, ref: "Stock", default: null },
          productName: { type: String, default: "" },
          barcode: { type: String, default: "N/A" },
          barcodes: [{ type: String }],
          quantity: { type: Number, default: 1 },
          sellingPrice: { type: Number, default: 0 },
          subtotal: { type: Number, default: 0 },
        },
      ],
    },
    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
      index: true,
    },
    returnDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reason: {
      type: String,
      default: "Customer Return",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
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

returnSchema.index({ status: 1, returnDate: -1, _id: -1 });
returnSchema.index({ status: 1, settlementType: 1, returnDate: -1 });
returnSchema.index({ returnDate: -1, _id: -1 });
returnSchema.index({ customerId: 1, returnDate: -1 });
returnSchema.index({ saleId: 1, returnDate: -1 });

module.exports = mongoose.model("Return", returnSchema);

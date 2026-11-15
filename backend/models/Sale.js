const mongoose = require("mongoose");

/**
 * Sale Schema
 * Represents an individual retail sale transaction.
 * Stores immutable historical snapshots of product name, barcodes,
 * authoritative purchase cost, selling price, and final profit/loss.
 */
const saleSchema = new mongoose.Schema(
  {
    saleNumber: {
      type: String,
      required: [true, "Sale number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    items: [
      {
        stockId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Stock",
        },
        productName: { type: String, required: true, trim: true },
        storage: { type: String, trim: true, default: "" },
        color: { type: String, trim: true, default: "" },
        barcode: { type: String, default: "N/A", trim: true },
        category: { type: String, default: "General" },
        supplier: { type: String, default: "Unknown Supplier" },
        quantity: { type: Number, required: true, min: 1 },
        unitPurchaseCost: { type: Number, required: true, min: 0 },
        unitSellingPrice: { type: Number, required: true, min: 0 },
        totalCost: { type: Number, required: true, min: 0 },
         totalAmount: { type: Number, required: true, min: 0 },
        profit: { type: Number, default: 0 },
        loss: { type: Number, default: 0 },
        soldStockItemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "StockItem" }],
        soldBarcodes: [{ type: String, trim: true }],
        returnedQuantity: { type: Number, default: 0, min: 0 },
        refundedAmount: { type: Number, default: 0, min: 0 },
        location: {
          type: String,
          enum: ["shop", "warehouse"],
          default: "shop",
        },
        isSmallItem: {
          type: Boolean,
          default: false,
        },
        isLocalPurchase: {
          type: Boolean,
          default: false,
        },
        localPurchaseId: {
          type: mongoose.Schema.Types.ObjectId,
          default: null,
        },
        shopkeeperName: {
          type: String,
          default: "",
          trim: true,
        },
        saleSource: {
          type: String,
          enum: ["direct", "shopkeeper"],
          default: "direct",
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
        agreedAmountPerUnit: {
          type: Number,
          default: 0,
        },
        customerSalePrice: {
          type: Number,
          default: 0,
        },
        description: {
          type: String,
          trim: true,
          default: "",
        },
      },
    ],
    hasSmallItems: {
      type: Boolean,
      default: false,
      index: true,
    },
    hasLocalPurchases: {
      type: Boolean,
      default: false,
      index: true,
    },
    location: {
      type: String,
      enum: ["shop", "warehouse"],
      default: "shop",
      index: true,
    },
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
      required: false,
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
      required: [true, "Barcode is required"],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: "General",
    },
    supplier: {
      type: String,
      trim: true,
      default: "Unknown Supplier",
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Sale quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    // Immutable financial snapshots (derived strictly server-side from database)
    unitPurchaseCost: {
      type: Number,
      required: [true, "Unit purchase cost is required"],
      min: [0, "Purchase cost cannot be negative"],
    },
    unitSellingPrice: {
      type: Number,
      required: [true, "Unit selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },
    totalCost: {
      type: Number,
      required: [true, "Total cost is required"],
      min: [0, "Total cost cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total sale amount is required"],
      min: [0, "Total sale amount cannot be negative"],
    },
    // Profit = (sellingPrice - purchaseCost) * quantity if positive
    profit: {
      type: Number,
      default: 0,
      min: [0, "Profit cannot be negative"],
    },
    // Loss = (purchaseCost - sellingPrice) * quantity if positive
    loss: {
      type: Number,
      default: 0,
      min: [0, "Loss cannot be negative"],
    },
    soldStockItemIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StockItem",
      },
    ],
    soldBarcodes: [
      {
        type: String,
        trim: true,
      },
    ],
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Bank Transfer", "Online", "Credit", "Other"],
      default: "Cash",
      trim: true,
    },
    paymentStatus: {
      type: String,
      default: "Paid",
      trim: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    saleDate: {
      type: Date,
      default: Date.now,
      required: [true, "Sale date is required"],
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    billDescription: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    returnedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnStatus: {
      type: String,
      enum: ["none", "partial", "refunded"],
      default: "none",
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    isExchange: {
      type: Boolean,
      default: false,
      index: true,
    },
    tradeInItem: {
      stockId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stock",
        default: null,
      },
      productName: { type: String, default: "", trim: true },
      barcode: { type: String, default: "", trim: true },
      barcodes: [{ type: String, trim: true }],
      quantity: { type: Number, default: 0 },
      unitPrice: { type: Number, default: 0 },
      purchasePrice: { type: Number, default: 0 },
      totalValue: { type: Number, default: 0 },
      customerName: { type: String, default: "", trim: true },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null,
      },
      purchaseDate: { type: Date, default: null },
    },
    exchangeReturnNumber: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    returnCredit: {
      type: Number,
      default: 0,
    },
    netDifference: {
      type: Number,
      default: 0,
    },
    returnedItems: [
      {
        productName: { type: String, default: "" },
        barcode: { type: String, default: "" },
        returnBarcodes: [{ type: String }],
        quantity: { type: Number, default: 1 },
        refundAmount: { type: Number, default: 0 },
      },
    ],
    shopkeeperName: {
      type: String,
      trim: true,
      default: "",
      index: true,
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
    agreedAmountPerUnit: {
      type: Number,
      default: 0,
    },
    customerSalePrice: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["completed", "refunded", "cancelled"],
      default: "completed",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-speed cursor pagination, reporting, and analytics
saleSchema.index({ location: 1, status: 1, saleDate: -1 });
saleSchema.index({ location: 1, shopkeeperName: 1 });
saleSchema.index({ status: 1, saleDate: -1, _id: -1 });
saleSchema.index({ status: 1, paymentMethod: 1, saleDate: -1 });
saleSchema.index({ saleDate: -1, _id: -1 });
saleSchema.index({ customerId: 1, saleDate: -1 });
saleSchema.index({ productName: 1, saleDate: -1 });
saleSchema.index({ barcode: 1, saleDate: -1 });
saleSchema.index({ profit: -1, saleDate: -1 });
saleSchema.index({ "items.isSmallItem": 1, saleDate: -1 });
saleSchema.index({ isExchange: 1, saleDate: -1 });
saleSchema.index({ "tradeInItem.productName": 1 });

module.exports = mongoose.model("Sale", saleSchema);

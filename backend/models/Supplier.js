const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["supplier", "customer"],
      default: "supplier",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for cursor pagination and search
supplierSchema.index({ name: 1, _id: 1 });
supplierSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model("Supplier", supplierSchema);

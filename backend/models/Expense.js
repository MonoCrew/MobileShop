const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Expense title or description is required"],
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      default: "Food & Refreshment",
      enum: [
        "Food & Refreshment",
        "Staff & Daily Wages",
        "Utilities & Bills",
        "Personal / Someone Else",
        "Transportation",
        "Maintenance & Repairs",
        "Shop Supplies",
        "Other",
      ],
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    recordedBy: {
      type: String,
      trim: true,
      default: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast period filtering and category queries
expenseSchema.index({ date: -1, category: 1 });
expenseSchema.index({ category: 1, date: -1, _id: -1 });
expenseSchema.index({ date: -1, _id: -1 });

module.exports = mongoose.model("Expense", expenseSchema);

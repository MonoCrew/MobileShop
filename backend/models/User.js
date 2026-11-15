const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "admin",
      enum: ["admin"],
    },
    isPasswordUpdated: {
      type: Boolean,
      default: false,
    },
    passwordUpdatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to compare password hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Verifies candidate password, supporting initial .env fallback if never updated
userSchema.methods.verifyCandidatePassword = async function (candidatePassword) {
  if (!candidatePassword) return false;
  const isHashMatch = await bcrypt.compare(candidatePassword, this.password);
  if (isHashMatch) return true;

  // Fallback to initial .env credentials if user has never updated password
  const defaultPassword = process.env.AUTH_PASSWORD;
  if (!this.isPasswordUpdated && defaultPassword && candidatePassword === defaultPassword) {
    return true;
  }

  return false;
};

// Ensure password is never exposed in JSON serialization
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;

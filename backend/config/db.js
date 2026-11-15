const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// Serverless connection cache across function invocations
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Ensures strictly a single admin user exists in the database.
 * If empty, creates hammad@gmail.com with password 12345678.
 * Deletes any duplicate or extraneous user entries.
 */
const ensureSingleAdminUser = async () => {
  try {
    const configuredEmail = (process.env.AUTH_EMAIL || "hammad@gmail.com").trim().toLowerCase();
    const configuredPassword = process.env.AUTH_PASSWORD || "12345678";
    const hashedPassword = await bcrypt.hash(configuredPassword, 10);

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await User.create({
        email: configuredEmail,
        password: hashedPassword,
        role: "admin",
        isPasswordUpdated: false,
      });
      console.log(`[Auth] Empty database detected. Created single admin user: ${configuredEmail}`);
      return;
    }

    let targetUser = await User.findOne({ email: configuredEmail });

    if (!targetUser) {
      const existingUser = await User.findOne({});
      if (existingUser) {
        existingUser.email = configuredEmail;
        existingUser.password = hashedPassword;
        existingUser.role = "admin";
        existingUser.isPasswordUpdated = false;
        await existingUser.save();
        targetUser = existingUser;
        console.log(`[Auth] Migrated existing user account to ${configuredEmail}`);
      } else {
        targetUser = await User.create({
          email: configuredEmail,
          password: hashedPassword,
          role: "admin",
          isPasswordUpdated: false,
        });
      }
    } else {
      const isMatch = await bcrypt.compare(configuredPassword, targetUser.password);
      if (!isMatch) {
        targetUser.password = hashedPassword;
        targetUser.isPasswordUpdated = false;
        await targetUser.save();
        console.log(`[Auth] Synchronized password for ${configuredEmail}`);
      }
    }

    const deleteResult = await User.deleteMany({ _id: { $ne: targetUser._id } });
    if (deleteResult.deletedCount > 0) {
      console.log(`[Auth] Removed ${deleteResult.deletedCount} extra users to enforce single user entry.`);
    }
  } catch (err) {
    console.error(`[Auth] Error ensuring single admin user:`, err.message);
  }
};

/**
 * High-performance MongoDB Atlas connection with serverless connection pooling
 * and failure-resilient retry logic.
 */
const connectDB = async () => {
  const connUri = process.env.MONGODB_URI;
  if (!connUri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  // Reuse existing connection if active
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(connUri, {
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
      })
      .then(async (m) => {
        console.log("MongoDB Connected");

        // Automatically ensure single admin user with configured credentials
        await ensureSingleAdminUser();

        // Reconcile and settle trade-in exchange invoices
        try {
          const { autoSettleTradeInInvoices } = require("../controllers/supplierController");
          if (typeof autoSettleTradeInInvoices === "function") {
            await autoSettleTradeInInvoices();
          }
        } catch (e) {
          console.error("[DB] Error running reconciliations on connect:", e.message);
        }

        // Safely remove legacy unique barcode index on StockItem if it exists in MongoDB
        try {
          const stockItemCollection = mongoose.connection.collection("stockitems");
          const indexes = await stockItemCollection.indexes();
          for (const idx of indexes) {
            if (idx.unique && idx.key && idx.key.barcode) {
              await stockItemCollection.dropIndex(idx.name);
              console.log(`[DB] Successfully dropped unique barcode index: ${idx.name}`);
            }
          }
        } catch (e) {
          // Index might already be non-unique or not exist
        }

        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset cache so subsequent invocations can retry
    cached.promise = null;
    cached.conn = null;
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }

  return cached.conn;
};

module.exports = connectDB;

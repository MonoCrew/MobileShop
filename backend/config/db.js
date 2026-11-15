const dns = require("dns");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) { }
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

/**
 * Ensures strictly a single admin user exists in the database.
 * If empty, creates hamzanazir780@gmail.com with password 12345678.
 * If another user exists (e.g. arshadtraders112233@gmail.com), migrates to hamzanazir780@gmail.com.
 * Deletes any duplicate or extraneous user entries.
 */
const ensureSingleAdminUser = async () => {
  try {
    const configuredEmail = (process.env.AUTH_EMAIL).trim().toLowerCase();
    const configuredPassword = process.env.AUTH_PASSWORD ;
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
 * High-performance MongoDB Atlas connection with production connection pooling
 * and network latency optimizations.
 */
const connectDB = async () => {
  try {
    const connUri = process.env.MONGODB_URI;
    if (!connUri) {
      throw new Error("MONGODB_URI environment variable is not defined");
    }

    await mongoose.connect(connUri, {
      maxPoolSize: 25, // Optimal connection pool size for concurrent Atlas requests
      minPoolSize: 5,  // Keep 5 warm connections to avoid TLS/TCP handshake latency
      serverSelectionTimeoutMS: 5000, // Fast failover (5s)
      socketTimeoutMS: 45000, // Socket idle timeout
      family: 4, // Force IPv4 to eliminate slow SRV DNS resolution on Windows
    });

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
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
  }
};

module.exports = connectDB;

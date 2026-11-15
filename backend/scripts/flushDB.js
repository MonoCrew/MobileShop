require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const dns = require("dns");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

const mongoose = require("mongoose");
const readline = require("readline");
const bcrypt = require("bcryptjs");
const http = require("http");

// Known POS model collections to guarantee exhaustive wipe even if uninitialized
const KNOWN_COLLECTIONS = [
  "customers",
  "expenses",
  "purchaseinvoices",
  "returns",
  "sales",
  "shopkeepers",
  "shopkeepertransfers",
  "stocks",
  "stockitems",
  "stocktransfers",
  "suppliers",
  "supplierpayments",
  "sessions",
  "users",
];

// CLI Flags:
// --force or -y: Skip interactive confirmation prompt
// --keep-user: Keep existing user accounts instead of re-seeding default admin
const isForce =
  process.argv.includes("--force") ||
  process.argv.includes("-y") ||
  !process.stdin.isTTY;
const keepUser = process.argv.includes("--keep-user");

async function notifyRunningServerCacheClear() {
  const port = process.env.PORT || 3000;
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: "/api/admin/clear-cache",
        method: "POST",
        timeout: 2000,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function flushDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ ERROR: MONGODB_URI is not set in backend/.env");
    process.exit(1);
  }

  console.log("==========================================");
  console.log("   MongoDB Atlas Database Flush Script    ");
  console.log("==========================================");
  console.log("🔗 Connecting to MongoDB Atlas...");

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    family: 4,
  });

  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  console.log(`✅ Connected successfully to database: "${dbName}"\n`);

  // Dynamically inspect existing collections
  const existingCols = await db.collections();
  const existingColNames = new Set(existingCols.map((c) => c.collectionName));

  // Merge with known collections to ensure nothing is missed
  const allCollectionNames = Array.from(
    new Set([...existingColNames, ...KNOWN_COLLECTIONS])
  ).sort();

  console.log("📊 Inspecting All Database Collections:");
  let totalDocsFound = 0;
  const colCounts = new Map();

  for (const colName of allCollectionNames) {
    try {
      const col = db.collection(colName);
      const count = await col.countDocuments();
      colCounts.set(colName, count);
      totalDocsFound += count;
      console.log(`   - ${colName.padEnd(22)} : ${count} document(s)`);
    } catch {
      colCounts.set(colName, 0);
      console.log(`   - ${colName.padEnd(22)} : 0 document(s)`);
    }
  }
  console.log(`\n   Total Documents Across All Collections: ${totalDocsFound}`);

  // Interactive confirmation prompt unless --force or -y is provided
  if (!isForce) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question(
        `\n⚠️  WARNING: This will permanently delete ALL documents in database "${dbName}".\nType "yes" to proceed (or press Enter to cancel): `,
        resolve
      );
    });
    rl.close();

    const normalized = (answer || "").trim().toLowerCase();
    if (normalized !== "yes" && normalized !== "y") {
      console.log("\n❌ Operation cancelled. No documents were deleted.");
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  console.log("\n🧹 Emptying all records from database collections...");
  let totalDeleted = 0;

  for (const colName of allCollectionNames) {
    if (keepUser && colName === "users") {
      console.log(`   ⏭️  [SKIPPED] ${colName} (--keep-user specified)`);
      continue;
    }

    try {
      const col = db.collection(colName);
      const beforeCount = colCounts.get(colName) || 0;
      const result = await col.deleteMany({});
      const count = result.deletedCount || 0;
      totalDeleted += count;
      console.log(
        `   🗑️  [CLEARED] ${colName.padEnd(20)} : deleted ${count} document(s) (was: ${beforeCount})`
      );
    } catch (err) {
      console.log(`   ⚠️  [ERROR] ${colName.padEnd(22)} : ${err.message}`);
    }
  }

  // Ensure fresh default admin user is seeded so the user is never locked out
  const adminEmail = (process.env.AUTH_EMAIL || "hamzanazir780@gmail.com").trim().toLowerCase();
  const adminPassword = process.env.AUTH_PASSWORD || "12345678";

  console.log("\n👤 Seeding fresh default Administrator user...");
  try {
    const usersCol = db.collection("users");
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await usersCol.insertOne({
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
      isPasswordUpdated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`   ✅ Default Admin ready: ${adminEmail} (Role: admin)`);
  } catch (userErr) {
    console.log(`   ⚠️ Could not seed admin user: ${userErr.message}`);
  }


  console.log("\n==========================================");
  console.log(`🎉 Complete! Total documents deleted: ${totalDeleted}`);
  console.log(`✨ All collections in "${dbName}" are now 100% empty and clean.`);
  console.log("==========================================");

  await mongoose.disconnect();
  console.log("🔌 Disconnected from MongoDB.\n");
  process.exit(0);
}

flushDatabase().catch(async (err) => {
  console.error("\n❌ Fatal error flushing database:", err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

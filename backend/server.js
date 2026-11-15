require("dotenv").config();
const dns = require("dns");
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // fallback if custom DNS servers fail
}
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const connectDB = require("./config/db");
const passport = require("./config/passport");
const { requireAuth } = require("./middleware/auth");

const authRoutes = require("./routes/authRoutes");
const stockRoutes = require("./routes/stockRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const saleRoutes = require("./routes/saleRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const returnRoutes = require("./routes/returnRoutes");
const customerRoutes = require("./routes/customerRoutes");
const shopkeeperRoutes = require("./routes/shopkeeperRoutes");
const adminRoutes = require("./routes/adminRoutes");
const historyRoutes = require("./routes/historyRoutes");
const supplierRefundRoutes = require("./routes/supplierRefundRoutes");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

// Connect to MongoDB Atlas with connection pooling
connectDB();

// High-speed response compression for JSON payloads and static assets
app.use(compression());

// CORS configuration supporting both same-origin frontend and external dev clients
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// High-performance API header & Server-Timing instrumentation
app.use("/api", (req, res, next) => {
  const reqStart = process.hrtime.bigint();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const originalEnd = res.end;
  res.end = function (...args) {
    const reqEnd = process.hrtime.bigint();
    const durationMs = Number(reqEnd - reqStart) / 1e6;
    try {
      res.setHeader("Server-Timing", `total;dur=${durationMs.toFixed(2)}`);
    } catch { }
    return originalEnd.apply(this, args);
  };
  next();
});

// Express Session configured with MongoDB session store
app.use(
  session({
    name: "pos_sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      autoRemove: "native",
      mongoOptions: {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        family: 4,
      },
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
  })
);

// Initialize Passport and Session Deserialization
app.use(passport.initialize());
app.use(passport.session());

// Authentication Routes (Public: /login, /logout, /me)
app.use("/api/auth", authRoutes);

// Stock Routes (supports both /api/stock and /api/stocks) - Protected
app.use("/api/stock", requireAuth, stockRoutes);
app.use("/api/stocks", requireAuth, stockRoutes);

// Supplier Routes (supports both /api/suppliers and /api/supplier) - Protected
app.use("/api/suppliers", requireAuth, supplierRoutes);
app.use("/api/supplier", requireAuth, supplierRoutes);

// Supplier Refund & Returns Routes - Protected
app.use("/api/supplier-refunds", requireAuth, supplierRefundRoutes);
app.use("/api/supplier-refund", requireAuth, supplierRefundRoutes);

// Sales & POS Routes (supports both /api/sales and /api/sale) - Protected
app.use("/api/sales", requireAuth, saleRoutes);
app.use("/api/sale", requireAuth, saleRoutes);

// Unified History Routes (Sales, Stock Intakes, Exchanges, Returns) - Protected
app.use("/api/history", requireAuth, historyRoutes);

// Daily Expenses Routes (supports both /api/expenses and /api/expense) - Protected
app.use("/api/expenses", requireAuth, expenseRoutes);
app.use("/api/expense", requireAuth, expenseRoutes);

// Returns & Refunds Routes (supports both /api/returns and /api/return) - Protected
app.use("/api/returns", requireAuth, returnRoutes);
app.use("/api/return", requireAuth, returnRoutes);

// Customer Accounts & Store Credit Ledger Routes - Protected
app.use("/api/customers", requireAuth, customerRoutes);
app.use("/api/customer", requireAuth, customerRoutes);

// Shopkeeper Consignment Stock & Transfers - Protected
app.use("/api/shopkeepers", requireAuth, shopkeeperRoutes);
app.use("/api/shopkeeper", requireAuth, shopkeeperRoutes);

// Dashboard Business Intelligence Routes - Protected
app.use("/api/dashboard", requireAuth, dashboardRoutes);

// Admin Management & Cloud Synchronization Routes - Protected
app.use("/api/admin", adminRoutes);
app.use("/api/sync", adminRoutes);

// Public Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    message: "POS Backend API is running smoothly",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// Serve Compiled Frontend (SPA Production Serving)
// ==========================================
const frontendDistPath = path.resolve(__dirname, "../frontend/dist");

// Serve static assets from frontend dist with caching
app.use((req, res, next) => {
  if (fs.existsSync(frontendDistPath)) {
    return express.static(frontendDistPath, {
      maxAge: "1d",
      setHeaders: (res, filePath) => {
        if (filePath.includes(path.sep + "assets" + path.sep)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        }
      },
    })(req, res, next);
  }
  next();
});

// SPA fallback: Send index.html for all non-API GET routes to support React Router at port 3000
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    const indexPath = path.join(frontendDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return res.sendFile(indexPath);
    }
    return res.json({
      message: "POS Backend API is running. Frontend build not found.",
      hint: "Run 'npm run build' inside the frontend directory to compile the client.",
      endpoints: {
        health: "/api/health",
        auth: "/api/auth",
        stock: "/api/stock",
        suppliers: "/api/suppliers",
        sales: "/api/sales",
      },
    });
  }
  next();
});

// 404 handler for unmatched API routes
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

app.listen(PORT, () => {
  console.log(`POS Server running at http://localhost:${PORT}`);
});

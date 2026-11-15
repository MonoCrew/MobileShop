const mongoose = require("mongoose");
const Stock = require("../models/Stock");
const Supplier = require("../models/Supplier");
const Customer = require("../models/Customer");
const StockItem = require("../models/StockItem");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const SupplierPayment = require("../models/SupplierPayment");
const StockTransfer = require("../models/StockTransfer");
const ShopkeeperTransfer = require("../models/ShopkeeperTransfer");

// Configurable stock thresholds for low, normal, and high stock inventory
const STOCK_THRESHOLDS = {
  OUT_OF_STOCK: 0,
  LOW_STOCK: 20,
  NORMAL_MAX: 100,
};

// Allowlisted sort keys to prevent injection
const ALLOWED_SORTS = {
  newest: { field: "createdAt", dir: -1 },
  oldest: { field: "createdAt", dir: 1 },
  price_desc: { field: "unitPrice", dir: -1 },
  price_asc: { field: "unitPrice", dir: 1 },
  stock_desc: { field: "quantity", dir: -1 },
  stock_asc: { field: "quantity", dir: 1 },
  name_asc: { field: "productName", dir: 1 },
  name_desc: { field: "productName", dir: -1 },
};

// In-Memory Barcode Cache with TTL and Promise Deduplication
class SimpleBarcodeCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.inFlight = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 120000) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + ttlMs });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  async dedupe(key, asyncFn, ttlMs = 120000) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        const result = await asyncFn();
        if (result !== undefined && result !== null) {
          this.set(key, result, ttlMs);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }
}

const barcodeCache = new SimpleBarcodeCache(1000);

// Base64URL Cursor serialization
const encodeCursor = (obj) => {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
};

const decodeCursor = (cursorStr) => {
  if (!cursorStr || typeof cursorStr !== "string") return null;
  try {
    return JSON.parse(Buffer.from(cursorStr, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
};

/**
 * Helper to build fuzzy regex matching conditions for a product name.
 * Supports exact substring, multi-word unordered matching, character sequence fuzzy (e.g. "chgr" -> charger),
 * and single-word typo tolerance (wildcard substitution & single-letter omission).
 */
function buildFuzzyNameConditions(rawName) {
  if (!rawName || typeof rawName !== "string" || !rawName.trim()) return [];
  const trimmed = rawName.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const conditions = [{ productName: { $regex: escaped, $options: "i" } }];

  const words = trimmed.split(/\s+/).filter(Boolean);

  // 1. Multi-word unordered matching (e.g. "7 pixel" matches "Google Pixel 7 Pro")
  if (words.length > 1) {
    const allWordsPattern = words
      .map((w) => `(?=.*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`)
      .join("");
    conditions.push({ productName: { $regex: allWordsPattern, $options: "i" } });
  }

  // 2. Character sequence fuzzy pattern (e.g. "chgr" or "chager" matches "charger", "pxl" matches "Pixel")
  if (trimmed.length >= 2 && trimmed.length <= 25 && !/\s/.test(trimmed)) {
    const seqPattern = trimmed
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    conditions.push({ productName: { $regex: seqPattern, $options: "i" } });
  }

  // 3. Typo tolerance (substitutions & omissions for single word query)
  if (words.length === 1 && trimmed.length >= 3 && trimmed.length <= 20) {
    // Wildcard substitution: allow 1 wrong letter (e.g. "sumsung" -> "s.msung" matches "samsung")
    for (let i = 0; i < trimmed.length; i++) {
      const subPattern =
        trimmed.slice(0, i).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "." +
        trimmed.slice(i + 1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({ productName: { $regex: subPattern, $options: "i" } });
    }

    // Single-letter omission (e.g. user typed extra letter "iphnone" -> "iphone")
    if (trimmed.length >= 4) {
      for (let i = 0; i < trimmed.length; i++) {
        const delPattern = (trimmed.slice(0, i) + trimmed.slice(i + 1)).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        conditions.push({ productName: { $regex: delPattern, $options: "i" } });
      }
    }
  }

  return conditions;
}

/**
 * Shared server-side filter query builder
 * Used by both getStock (pagination list) and getStockStats (aggregation summary)
 * Guarantees that the stock list and the summary cards always match identical filtered datasets.
 */
const buildStockFilterQuery = async (query = {}) => {
  const {
    search,
    name,
    productName,
    minPrice,
    maxPrice,
    stockStatus,
    paymentStatus,
    supplier,
    supplierId,
  } = query;

  const andClauses = [];

  // 1. Dedicated Product Name Filter with Fuzzy Matching
  const targetName = (productName || name || "").trim();
  if (targetName) {
    const nameConditions = buildFuzzyNameConditions(targetName);
    if (nameConditions.length > 0) {
      andClauses.push({ $or: nameConditions });
    }
  }

  // 2. Global search across indexed fields (productName, barcode) and matching suppliers
  if (search && typeof search === "string" && search.trim() !== "") {
    const rawSearch = search.trim();
    const cleanSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Build optional character-sequence fuzzy pattern (e.g. "chager" matches "charger")
    let fuzzyPattern = null;
    if (rawSearch.length >= 3 && rawSearch.length <= 15 && !/\s/.test(rawSearch)) {
      fuzzyPattern = rawSearch
        .split("")
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
    }

    // Concurrently query matching suppliers and matching serialized barcode items
    const [matchingSuppliers, matchingStockItems] = await Promise.all([
      Supplier.find({
        name: { $regex: cleanSearch, $options: "i" },
      })
        .select("_id")
        .limit(50)
        .lean(),
      StockItem.find({
        barcode: { $regex: cleanSearch, $options: "i" },
      })
        .select("productName")
        .limit(100)
        .lean(),
    ]);

    const matchingSupplierIds = matchingSuppliers.map((s) => s._id);

    const searchConditions = [
      { productName: { $regex: cleanSearch, $options: "i" } },
      { barcode: { $regex: cleanSearch, $options: "i" } },
    ];

    if (fuzzyPattern) {
      searchConditions.push({ productName: { $regex: fuzzyPattern, $options: "i" } });
    }

    const words = rawSearch.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const allWordsPattern = words
        .map((w) => `(?=.*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`)
        .join("");
      searchConditions.push({ productName: { $regex: allWordsPattern, $options: "i" } });
    }

    const matchingNames = Array.from(
      new Set(matchingStockItems.map((si) => si.productName).filter(Boolean))
    );
    if (matchingNames.length > 0) {
      searchConditions.push({ productName: { $in: matchingNames } });
    }

    if (matchingSupplierIds.length > 0) {
      searchConditions.push({ supplier: { $in: matchingSupplierIds } });
    }

    andClauses.push({ $or: searchConditions });
  }

  // 3. Database-driven Price range filter (on unitPrice)
  const parsedMinPrice = parseFloat(minPrice);
  const parsedMaxPrice = parseFloat(maxPrice);
  if (!isNaN(parsedMinPrice) || !isNaN(parsedMaxPrice)) {
    const priceFilter = {};
    if (!isNaN(parsedMinPrice) && parsedMinPrice >= 0) {
      priceFilter.$gte = parsedMinPrice;
    }
    if (!isNaN(parsedMaxPrice) && parsedMaxPrice >= 0) {
      priceFilter.$lte = parsedMaxPrice;
    }
    andClauses.push({ unitPrice: priceFilter });
  }

  // 4. Database-driven Stock quantity filter based on configurable thresholds
  if (stockStatus && typeof stockStatus === "string") {
    const statusLower = stockStatus.toLowerCase();
    if (statusLower === "in_stock") {
      andClauses.push({ quantity: { $gt: 0 } });
    } else if (statusLower === "out") {
      andClauses.push({ quantity: { $lte: STOCK_THRESHOLDS.OUT_OF_STOCK } });
    } else if (statusLower === "low" || statusLower === "low_stock") {
      andClauses.push({
        quantity: {
          $gt: STOCK_THRESHOLDS.OUT_OF_STOCK,
          $lte: STOCK_THRESHOLDS.LOW_STOCK,
        },
      });
    } else if (statusLower === "normal") {
      andClauses.push({
        quantity: {
          $gt: STOCK_THRESHOLDS.LOW_STOCK,
          $lte: STOCK_THRESHOLDS.NORMAL_MAX,
        },
      });
    } else if (statusLower === "high") {
      andClauses.push({ quantity: { $gt: STOCK_THRESHOLDS.NORMAL_MAX } });
    }
  }

  // 5. Payment status filter
  let normalizedPaymentStatus = paymentStatus;
  if (normalizedPaymentStatus === "Unpaid") normalizedPaymentStatus = "Due";
  if (normalizedPaymentStatus && ["Paid", "Partial", "Due"].includes(normalizedPaymentStatus)) {
    andClauses.push({ paymentStatus: normalizedPaymentStatus });
  }

  // 6. Database Supplier filter (supports supplierId or supplier parameter)
  const effectiveSupplier = supplierId || supplier;
  if (
    effectiveSupplier &&
    typeof effectiveSupplier === "string" &&
    effectiveSupplier.trim() !== ""
  ) {
    const trimmed = effectiveSupplier.trim();
    if (mongoose.Types.ObjectId.isValid(trimmed)) {
      const objId = new mongoose.Types.ObjectId(trimmed);
      const foundSup = await Supplier.findById(objId).select("name").lean();
      const supConditions = [{ supplier: objId }];
      if (foundSup?.name) {
        supConditions.push({
          supplierName: {
            $regex: `^${foundSup.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i",
          },
        });
      }
      andClauses.push({ $or: supConditions });
    } else {
      const cleanRegex = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const found = await Supplier.findOne({
        name: { $regex: `^${cleanRegex}$`, $options: "i" },
      })
        .select("_id")
        .lean();

      andClauses.push({
        $or: [
          ...(found ? [{ supplier: found._id }] : []),
          { supplierName: { $regex: cleanRegex, $options: "i" } },
        ],
      });
    }
  }

  // 7. Database-driven Location filter (defaults to "shop")
  const loc = query.location ? query.location.toLowerCase() : "shop";
  if (loc === "warehouse") {
    andClauses.push({ location: "warehouse" });
  } else if (loc === "all") {
    // no location constraint
  } else {
    // Default to shop
    andClauses.push({ location: { $ne: "warehouse" } });
  }

  if (andClauses.length === 0) return {};
  if (andClauses.length === 1) return andClauses[0];
  return { $and: andClauses };
};

/**
 * @route   GET /api/stock
 * @desc    Cursor-based keyset infinite pagination with database-driven search & filtering
 * @access  Public
 */
const getStock = async (req, res) => {
  try {
    const {
      limit = 50,
      cursor,
      sort = "newest",
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    const isBatchMode = req.query.view === "batch" || req.query.stockMode === "batch";

    if (isBatchMode) {
      const invoiceAnd = [];

      if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
        const cleanS = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({
          $or: [
            { invoiceNumber: { $regex: cleanS, $options: "i" } },
            { supplier: { $regex: cleanS, $options: "i" } },
            { customerName: { $regex: cleanS, $options: "i" } },
            { "itemsSummary.productName": { $regex: cleanS, $options: "i" } },
            { "itemsSummary.barcodes": { $regex: cleanS, $options: "i" } },
          ],
        });
      }

      if (req.query.productName && typeof req.query.productName === "string" && req.query.productName.trim()) {
        const cleanPN = req.query.productName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({
          "itemsSummary.productName": { $regex: cleanPN, $options: "i" },
        });
      }

      if (req.query.supplierId && mongoose.Types.ObjectId.isValid(req.query.supplierId)) {
        invoiceAnd.push({ supplierId: new mongoose.Types.ObjectId(req.query.supplierId) });
      } else if (req.query.supplier && typeof req.query.supplier === "string" && req.query.supplier.trim()) {
        const cleanSup = req.query.supplier.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({ supplier: { $regex: cleanSup, $options: "i" } });
      }

      if (req.query.paymentStatus && typeof req.query.paymentStatus === "string") {
        let pStatus = req.query.paymentStatus.trim();
        if (pStatus.toLowerCase() === "unpaid") pStatus = "Due";
        invoiceAnd.push({ paymentStatus: { $regex: `^${pStatus}$`, $options: "i" } });
      }

      if (req.query.minPrice !== undefined && req.query.minPrice !== "" && !isNaN(Number(req.query.minPrice))) {
        invoiceAnd.push({ totalAmount: { $gte: Number(req.query.minPrice) } });
      }
      if (req.query.maxPrice !== undefined && req.query.maxPrice !== "" && !isNaN(Number(req.query.maxPrice))) {
        invoiceAnd.push({ totalAmount: { $lte: Number(req.query.maxPrice) } });
      }

      const decoded = decodeCursor(cursor);
      let cursorCondition = null;
      if (decoded && decoded.id && decoded.val !== undefined) {
        const cursorVal = new Date(decoded.val);
        const cursorId = new mongoose.Types.ObjectId(decoded.id);
        cursorCondition = {
          $or: [
            { createdAt: { $lt: cursorVal } },
            { createdAt: cursorVal, _id: { $lt: cursorId } },
          ],
        };
      }

      const invoiceFilter = invoiceAnd.length > 0 ? { $and: invoiceAnd } : {};
      const finalInvoiceQuery = cursorCondition
        ? { $and: [invoiceFilter, cursorCondition] }
        : invoiceFilter;

      const rawInvoices = await PurchaseInvoice.find(finalInvoiceQuery)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limitNum + 1)
        .lean();

      const hasMore = rawInvoices.length > limitNum;
      if (hasMore) rawInvoices.pop();

      const invoiceIds = rawInvoices.map((inv) => inv._id);
      const invoiceRefs = rawInvoices.map((inv) => inv.standaloneReference).filter(Boolean);

      const stockItems = await StockItem.find({
        $or: [
          { invoiceId: { $in: invoiceIds } },
          ...(invoiceRefs.length > 0 ? [{ transactionRef: { $in: invoiceRefs } }] : []),
        ],
      }).lean();

      const stockDocs = await Stock.find({
        transactionRef: { $in: invoiceRefs },
      }).select("transactionRef quantity").lean();

      const stockQtyByRef = new Map();
      for (const s of stockDocs) {
        if (s.transactionRef) {
          stockQtyByRef.set(s.transactionRef, (stockQtyByRef.get(s.transactionRef) || 0) + (s.quantity || 0));
        }
      }

      const stockItemsByInvoice = new Map();
      for (const si of stockItems) {
        const key = (si.invoiceId || si.transactionRef || "").toString();
        if (!stockItemsByInvoice.has(key)) {
          stockItemsByInvoice.set(key, []);
        }
        stockItemsByInvoice.get(key).push(si);
      }

      const activeTransfers = await ShopkeeperTransfer.find({
        status: "active",
      }).select("stockId barcodes shopkeeperName remainingQuantity originalQuantity productName").lean();

      const transfersByStockId = new Map();
      const transfersByBarcode = new Map();
      for (const t of activeTransfers) {
        if (t.stockId) {
          const sId = t.stockId.toString();
          transfersByStockId.set(sId, (transfersByStockId.get(sId) || 0) + (t.remainingQuantity || 0));
        }
        if (Array.isArray(t.barcodes)) {
          for (const b of t.barcodes) {
            if (b) transfersByBarcode.set(b, t.shopkeeperName);
          }
        }
      }

      const items = rawInvoices.map((inv) => {
        const invIdStr = inv._id.toString();
        const invRefStr = (inv.standaloneReference || "").toString();
        const itemsForInv = [
          ...(stockItemsByInvoice.get(invIdStr) || []),
          ...(invRefStr && invRefStr !== invIdStr ? (stockItemsByInvoice.get(invRefStr) || []) : []),
        ];
        const uniqueUnits = Array.from(new Map(itemsForInv.map((u) => [u._id.toString(), u])).values());

        // Attach shopkeeperName if transferred
        uniqueUnits.forEach((u) => {
          if (u.status === "transferred" && !u.shopkeeperName && u.barcode && transfersByBarcode.has(u.barcode)) {
            u.shopkeeperName = transfersByBarcode.get(u.barcode);
          }
        });

        const availableSerializedUnits = uniqueUnits.filter((u) => u.status === "available");
        const transferredSerializedUnits = uniqueUnits.filter((u) => u.status === "transferred");
        const soldSerializedUnits = uniqueUnits.filter((u) => u.status === "sold");
        const returnedSerializedUnits = uniqueUnits.filter((u) => u.status === "returned" || u.status === "returned_to_supplier");

        const availableUnitsCount = availableSerializedUnits.length;
        let transferredUnitsCount = transferredSerializedUnits.length;
        let soldUnitsCount = soldSerializedUnits.length;

        const stockQty = invRefStr ? (stockQtyByRef.get(invRefStr) || 0) : 0;
        if (uniqueUnits.length === 0) {
          for (const s of stockDocs) {
            if (s.transactionRef === invRefStr && transfersByStockId.has(s._id.toString())) {
              transferredUnitsCount += transfersByStockId.get(s._id.toString()) || 0;
            }
          }
          soldUnitsCount = Math.max(0, (inv.totalQuantity || 0) - stockQty - transferredUnitsCount);
        }

        const effectiveAvailable = uniqueUnits.length > 0 ? availableUnitsCount : stockQty;

        const itemSummaries = Array.isArray(inv.itemsSummary) ? inv.itemsSummary : [];
        const productNamesList = itemSummaries.map((s) => s.productName).filter(Boolean);
        let summaryLabel = "";
        if (itemSummaries.length === 1) {
          summaryLabel = itemSummaries[0].productName;
          if (itemSummaries[0].quantity > 1) {
            summaryLabel += ` (${itemSummaries[0].quantity} units)`;
          }
        } else if (itemSummaries.length > 1) {
          summaryLabel = productNamesList.join(", ");
        } else {
          summaryLabel = "Batch Intake";
        }

        const normPaymentStatus =
          inv.amountDue <= 0 && inv.totalAmount > 0
            ? "Paid"
            : inv.amountPaid > 0
            ? "Partial"
            : "Due";

        const uniqueBarcodes = Array.from(
          new Set(
            uniqueUnits
              .map((u) => u.barcode)
              .filter((b) => b && b.toUpperCase() !== "N/A")
          )
        );

        return {
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          isBatch: true,
          productName: summaryLabel,
          productNames: productNamesList,
          items: itemSummaries,
          supplier: {
            _id: inv.supplierId || null,
            name: inv.supplier || inv.customerName || "General Supplier",
          },
          supplierName: inv.supplier || inv.customerName || "General Supplier",
          isLocalPurchase: Boolean(inv.isLocalPurchase),
          customerName: inv.customerName || "",
          purchaseDate: inv.purchaseDate || inv.createdAt,
          totalQuantity: inv.totalQuantity,
          availableQuantity: effectiveAvailable,
          transferredQuantity: transferredUnitsCount,
          soldQuantity: soldUnitsCount,
          returnedQuantity: returnedSerializedUnits.length,
          quantity: effectiveAvailable,
          statusBreakdown: {
            available: effectiveAvailable,
            transferred: transferredUnitsCount,
            sold: soldUnitsCount,
            returned: returnedSerializedUnits.length,
            total: inv.totalQuantity,
          },
          unitPrice: inv.totalQuantity > 0 ? Number((inv.totalAmount / inv.totalQuantity).toFixed(2)) : inv.totalAmount,
          totalPrice: inv.totalAmount,
          amountPaid: inv.amountPaid || 0,
          amountDue: inv.amountDue || 0,
          paymentStatus: normPaymentStatus,
          barcodes: uniqueBarcodes,
          serializedUnits: uniqueUnits,
          availableSerializedUnits: availableSerializedUnits,
          transferredSerializedUnits: transferredSerializedUnits,
          soldSerializedUnits: soldSerializedUnits,
          barcodesCount: uniqueBarcodes.length,
          availableBarcodesCount: effectiveAvailable,
          location: "shop",
          createdAt: inv.createdAt,
        };
      });

      // Keep transferred and sold batches visible so stock is not silently minused away
      const availableItems = req.query.stockStatus === "in_stock"
        ? items.filter((it) => (it.availableQuantity || 0) > 0)
        : req.query.stockStatus === "out"
        ? items.filter((it) => (it.availableQuantity || 0) === 0)
        : items;

      let nextCursor = null;
      if (hasMore && rawInvoices.length > 0) {
        const lastInv = rawInvoices[rawInvoices.length - 1];
        nextCursor = encodeCursor({
          val: lastInv.createdAt.toISOString(),
          id: lastInv._id.toString(),
        });
      }

      let totalCount = null;
      if (!cursor) {
        totalCount = availableItems.length;
      }

      return res.status(200).json({
        success: true,
        data: availableItems,
        nextCursor,
        hasMore,
        count: availableItems.length,
        totalCount,
        thresholds: STOCK_THRESHOLDS,
      });
    }

    // Validate sort configuration
    const sortConfig = ALLOWED_SORTS[sort] || ALLOWED_SORTS.newest;
    const { field: sortField, dir } = sortConfig;

    // 1. Build Base Filter Conditions using shared query builder
    const baseFilter = await buildStockFilterQuery(req.query);

    // 2. Build Keyset Pagination Condition
    const decoded = decodeCursor(cursor);
    let cursorCondition = null;

    if (decoded && decoded.id && decoded.val !== undefined) {
      const cursorVal =
        sortField === "createdAt" ? new Date(decoded.val) : decoded.val;
      const cursorId = new mongoose.Types.ObjectId(decoded.id);

      if (dir === -1) {
        // Descending sort: item < cursorVal OR (item === cursorVal AND _id < cursorId)
        cursorCondition = {
          $or: [
            { [sortField]: { $lt: cursorVal } },
            { [sortField]: cursorVal, _id: { $lt: cursorId } },
          ],
        };
      } else {
        // Ascending sort: item > cursorVal OR (item === cursorVal AND _id > cursorId)
        cursorCondition = {
          $or: [
            { [sortField]: { $gt: cursorVal } },
            { [sortField]: cursorVal, _id: { $gt: cursorId } },
          ],
        };
      }
    }

    // 3. Combine filters & cursor condition
    const queryConditions = [baseFilter];
    if (cursorCondition) {
      queryConditions.push(cursorCondition);
    }
    const finalQuery =
      queryConditions.length > 1 ? { $and: queryConditions } : queryConditions[0];

    // Compound Sort Criteria with deterministic unique _id tie-breaker
    const sortCriteria = { [sortField]: dir, _id: dir };

    // Request limit + 1 to detect whether subsequent pages exist without full collection scan
    const rawItems = await Stock.find(finalQuery)
      .populate({
        path: "supplier",
        select: "name",
      })
      .sort(sortCriteria)
      .limit(limitNum + 1)
      .lean();

    const hasMore = rawItems.length > limitNum;
    if (hasMore) {
      rawItems.pop(); // Remove the lookahead item
    }

    const items = rawItems.map((item) => ({
      ...item,
      supplier: item.supplier
        ? item.supplier
        : { _id: null, name: item.isLocalPurchase ? (item.customerName || "Local Customer") : (item.supplierName || "Independent Intake") },
    }));

    // Generate next cursor from the last item in the page
    let nextCursor = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const sortVal = lastItem[sortField];
      nextCursor = encodeCursor({
        val: sortVal instanceof Date ? sortVal.toISOString() : sortVal,
        id: lastItem._id.toString(),
      });
    }

    // Only compute totalCount on initial request (cursor absent) to avoid expensive count queries on infinite scroll
    let totalCount = null;
    if (!cursor) {
      totalCount = await Stock.countDocuments(baseFilter);
    }

    // Enrich products with all their serialized physical barcodes from StockItem
    if (items.length > 0) {
      const productNames = items.map((it) => it.productName);
      const [stockItems, activeTransfers] = await Promise.all([
        StockItem.find({
          productName: { $in: productNames },
          barcode: { $nin: ["N/A", null, ""] },
        })
          .select("productName barcode storage color status sellingPrice purchaseDate")
          .sort({ createdAt: -1 })
          .lean(),
        ShopkeeperTransfer.find({
          productName: { $in: productNames },
          status: "active",
        })
          .select("productName remainingQuantity stockId barcodes shopkeeperName")
          .lean(),
      ]);

      const itemsByProduct = new Map();
      for (const si of stockItems) {
        const key = si.productName.trim().toLowerCase();
        if (!itemsByProduct.has(key)) {
          itemsByProduct.set(key, []);
        }
        itemsByProduct.get(key).push(si);
      }

      const transfersByProduct = new Map();
      for (const tr of activeTransfers) {
        const key = (tr.productName || "").trim().toLowerCase();
        transfersByProduct.set(key, (transfersByProduct.get(key) || 0) + (tr.remainingQuantity || 0));
      }

      for (const it of items) {
        const key = (it.productName || "").trim().toLowerCase();
        const allUnits = itemsByProduct.get(key) || [];
        const availableUnits = allUnits.filter((u) => u.status === "available");
        const transferredUnits = allUnits.filter((u) => u.status === "transferred");
        const soldUnits = allUnits.filter((u) => u.status === "sold");

        const uniqueBarcodes = Array.from(
          new Set(allUnits.map((u) => u.barcode).filter(Boolean))
        );

        // Fallback: If no StockItems recorded but Stock collection has a barcode, include it
        if (
          uniqueBarcodes.length === 0 &&
          it.barcode &&
          it.barcode.toUpperCase() !== "N/A"
        ) {
          uniqueBarcodes.push(it.barcode);
          if ((it.quantity || 0) > 0) {
            availableUnits.push({
              barcode: it.barcode,
              storage: it.storage || "",
              color: it.color || "",
              status: "available",
            });
          }
        }

        const transferredCount = allUnits.length > 0
          ? transferredUnits.length
          : (transfersByProduct.get(key) || 0);

        it.barcodes = uniqueBarcodes;
        it.serializedUnits = allUnits.length > 0 ? allUnits : availableUnits;
        it.availableSerializedUnits = availableUnits;
        it.transferredSerializedUnits = transferredUnits;
        it.soldSerializedUnits = soldUnits;
        it.barcodesCount = uniqueBarcodes.length;
        it.availableBarcodesCount = availableUnits.length;
        it.availableQuantity = it.quantity || 0;
        it.transferredQuantity = transferredCount;
        it.soldQuantity = soldUnits.length;
        it.totalQuantity = (it.quantity || 0) + transferredCount + soldUnits.length;
        it.statusBreakdown = {
          available: it.quantity || 0,
          transferred: transferredCount,
          sold: soldUnits.length,
          total: it.totalQuantity,
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: items,
      nextCursor,
      hasMore,
      count: items.length,
      totalCount,
      thresholds: STOCK_THRESHOLDS,
    });
  } catch (error) {
    console.error("Error in getStock controller:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve stock records.",
    });
  }
};

/**
 * @route   GET /api/stock/stats & GET /api/stock/summary
 * @desc    Database summary statistics of stock inventory using shared filter query & MongoDB aggregation
 * @access  Public
 */
const getStockStats = async (req, res) => {
  try {
    const isBatchMode = req.query.view === "batch" || req.query.stockMode === "batch";

    if (isBatchMode) {
      const invoiceAnd = [];
      if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
        const cleanS = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({
          $or: [
            { invoiceNumber: { $regex: cleanS, $options: "i" } },
            { supplier: { $regex: cleanS, $options: "i" } },
            { customerName: { $regex: cleanS, $options: "i" } },
            { "itemsSummary.productName": { $regex: cleanS, $options: "i" } },
          ],
        });
      }
      if (req.query.productName && typeof req.query.productName === "string" && req.query.productName.trim()) {
        const cleanPN = req.query.productName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({
          "itemsSummary.productName": { $regex: cleanPN, $options: "i" },
        });
      }
      if (req.query.supplierId && mongoose.Types.ObjectId.isValid(req.query.supplierId)) {
        invoiceAnd.push({ supplierId: new mongoose.Types.ObjectId(req.query.supplierId) });
      } else if (req.query.supplier && typeof req.query.supplier === "string" && req.query.supplier.trim()) {
        const cleanSup = req.query.supplier.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        invoiceAnd.push({ supplier: { $regex: cleanSup, $options: "i" } });
      }
      if (req.query.paymentStatus && typeof req.query.paymentStatus === "string") {
        let pStatus = req.query.paymentStatus.trim();
        if (pStatus.toLowerCase() === "unpaid") pStatus = "Due";
        invoiceAnd.push({ paymentStatus: { $regex: `^${pStatus}$`, $options: "i" } });
      }

      const matchStage = invoiceAnd.length > 0 ? { $and: invoiceAnd } : {};

      const rawInvoices = await PurchaseInvoice.find(matchStage)
        .select("_id standaloneReference invoiceNumber totalQuantity totalAmount amountPaid amountDue")
        .lean();

      const invoiceIds = rawInvoices.map((inv) => inv._id);
      const invoiceRefs = rawInvoices.map((inv) => inv.standaloneReference).filter(Boolean);

      const [stockItems, stockDocs, activeTransfers] = await Promise.all([
        StockItem.find({
          $or: [
            { invoiceId: { $in: invoiceIds } },
            ...(invoiceRefs.length > 0 ? [{ transactionRef: { $in: invoiceRefs } }] : []),
          ],
        }).select("status invoiceId transactionRef").lean(),
        Stock.find({
          ...(invoiceRefs.length > 0 ? { transactionRef: { $in: invoiceRefs } } : {}),
        }).select("quantity transactionRef _id").lean(),
        ShopkeeperTransfer.find({
          status: "active",
        }).select("remainingQuantity stockId barcodes").lean(),
      ]);

      const stockQtyByRef = new Map();
      for (const s of stockDocs) {
        if (s.transactionRef) {
          stockQtyByRef.set(s.transactionRef, (stockQtyByRef.get(s.transactionRef) || 0) + (s.quantity || 0));
        }
      }

      const itemsByInvoice = new Map();
      for (const si of stockItems) {
        const key = (si.invoiceId || si.transactionRef || "").toString();
        if (!itemsByInvoice.has(key)) itemsByInvoice.set(key, []);
        itemsByInvoice.get(key).push(si);
      }

      let totalUnits = 0;
      let availableUnits = 0;
      let transferredUnits = 0;
      let soldUnits = 0;
      let availableProducts = 0;
      let inventoryValue = 0;
      let paidToSuppliers = 0;
      let remainingToSuppliers = 0;

      for (const inv of rawInvoices) {
        const invIdStr = inv._id.toString();
        const invRefStr = (inv.standaloneReference || "").toString();
        const itemsForInv = [
          ...(itemsByInvoice.get(invIdStr) || []),
          ...(invRefStr && invRefStr !== invIdStr ? (itemsByInvoice.get(invRefStr) || []) : []),
        ];
        const uniqueUnits = Array.from(new Map(itemsForInv.map((u) => [u._id?.toString() || u.barcode, u])).values());

        let avail = 0;
        let tr = 0;
        let so = 0;

        if (uniqueUnits.length > 0) {
          avail = uniqueUnits.filter((u) => u.status === "available").length;
          tr = uniqueUnits.filter((u) => u.status === "transferred").length;
          so = uniqueUnits.filter((u) => u.status === "sold").length;
          availableUnits += avail;
          transferredUnits += tr;
          soldUnits += so;
          if (avail > 0) availableProducts++;
        } else {
          const stockQty = invRefStr ? (stockQtyByRef.get(invRefStr) || 0) : 0;
          availableUnits += stockQty;
          avail = stockQty;
          if (stockQty > 0) availableProducts++;
        }

        totalUnits += (avail + tr + so);

        // Active inventory value is based strictly on available & transferred units
        const unitCost = (inv.totalQuantity > 0 && inv.totalAmount > 0)
          ? (inv.totalAmount / inv.totalQuantity)
          : (inv.unitPrice || 0);
        inventoryValue += (avail + tr) * unitCost;

        paidToSuppliers += inv.amountPaid || 0;
        remainingToSuppliers += inv.amountDue || 0;
      }

      const totalActiveTransferQty = activeTransfers.reduce((sum, t) => sum + (t.remainingQuantity || 0), 0);
      if (totalActiveTransferQty > transferredUnits) {
        transferredUnits = totalActiveTransferQty;
      }

      const summary = {
        totalProducts: rawInvoices.length,
        availableProducts,
        totalUnits,
        availableUnits,
        transferredUnits,
        soldUnits,
        inventoryValue: Number(inventoryValue.toFixed(2)),
        paidToSuppliers: Number(paidToSuppliers.toFixed(2)),
        remainingToSuppliers: Number(remainingToSuppliers.toFixed(2)),
        totalItems: rawInvoices.length,
        totalStockUnits: availableUnits,
        totalInventoryValue: Number(inventoryValue.toFixed(2)),
        thresholds: STOCK_THRESHOLDS,
      };

      return res.status(200).json({ success: true, data: summary });
    }

    // 1. Build Base Filter Conditions using identical shared query builder
    const baseFilter = await buildStockFilterQuery(req.query);

    const [rawStocks, activeTransfers, stockItemStatusCounts] = await Promise.all([
      Stock.find(baseFilter).select("_id quantity unitPrice amountPaid amountDue").lean(),
      ShopkeeperTransfer.find({ status: "active" }).select("remainingQuantity").lean(),
      StockItem.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const totalTransfersQty = activeTransfers.reduce((sum, t) => sum + (t.remainingQuantity || 0), 0);
    const statusMap = Object.fromEntries(stockItemStatusCounts.map((c) => [c._id, c.count]));
    const transferredFromItems = statusMap.transferred || 0;
    const transferredUnits = Math.max(totalTransfersQty, transferredFromItems);
    const soldUnits = statusMap.sold || 0;

    let availableUnits = 0;
    let availableProducts = 0;
    let inventoryValue = 0;
    let paidToSuppliers = 0;
    let remainingToSuppliers = 0;

    for (const s of rawStocks) {
      const q = Math.max(0, s.quantity || 0);
      availableUnits += q;
      if (q > 0) availableProducts++;
      inventoryValue += q * (s.unitPrice || 0);
      paidToSuppliers += s.amountPaid || 0;
      remainingToSuppliers += s.amountDue || 0;
    }

    const totalUnits = availableUnits + transferredUnits + soldUnits;

    const summary = {
      totalProducts: rawStocks.length,
      availableProducts,
      totalUnits,
      availableUnits,
      transferredUnits,
      soldUnits,
      inventoryValue: Number(inventoryValue.toFixed(2)),
      paidToSuppliers: Number(paidToSuppliers.toFixed(2)),
      remainingToSuppliers: Number(remainingToSuppliers.toFixed(2)),
      totalItems: rawStocks.length,
      totalStockUnits: availableUnits,
      totalInventoryValue: Number(inventoryValue.toFixed(2)),
      thresholds: STOCK_THRESHOLDS,
    };

    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Error in getStockStats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate stock summary.",
    });
  }
};

/**
 * Helper to get a unique supplier name for generic stock intake.
 * If the entered supplier name already exists, it auto-increments to create a
 * distinct, independent supplier (e.g. "Random Supplier #1" -> "Random Supplier #2").
 */
const getUniqueSupplierName = async (baseName, session = null) => {
  let clean = (typeof baseName === "string" ? baseName.trim() : "") || "Random Supplier";

  // Check if supplier with this exact name already exists
  const existQuery = Supplier.findOne({
    name: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });
  if (session) existQuery.session(session);
  const existing = await existQuery.lean();

  if (!existing) {
    return clean;
  }

  // If it already exists, auto-differentiate by incrementing the number
  const hashMatch = clean.match(/^(.*?)\s*#\s*(\d+)$/i);
  const spaceMatch = clean.match(/^(.*?)\s+(\d+)$/i);
  let rootName = clean;
  if (hashMatch) {
    rootName = hashMatch[1].trim();
  } else if (spaceMatch) {
    rootName = spaceMatch[1].trim();
  }
  if (!rootName) rootName = "Random Supplier";

  const searchRegex = new RegExp(`^${rootName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*#?\\s*(\\d+))?$`, "i");
  const allMatchingQuery = Supplier.find({ name: { $regex: searchRegex } }).select("name").lean();
  if (session) allMatchingQuery.session(session);
  const allMatching = await allMatchingQuery;

  let maxNum = 1;
  for (const s of allMatching) {
    if (!s.name) continue;
    const m = s.name.trim().match(searchRegex);
    if (m) {
      const num = m[1] ? parseInt(m[1], 10) : 1;
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  if (/^random\s*supplier$/i.test(rootName)) {
    return `Random Supplier #${nextNum}`;
  }
  return `${rootName} #${nextNum}`;
};

/**
 * @route   POST /api/stock
 * @desc    Create new stock item and store per-unit price with normalized supplier relation
 * @access  Public
 */
const createStock = async (req, res) => {
  try {
    const {
      productName,
      storage: rawStorage,
      color: rawColor,
      barcode,
      quantity,
      purchasePrice,
      priceMode,
      unitPrice: providedUnitPrice,
      purchaseDate,
      supplier,
      amountPaid,
      estimatedSalePricePerUnit: rawEstUnit,
      estimatedTotalSaleValue: rawEstTotal,
      estimatedPriceMode,
      estimatedPrice,
    } = req.body;

    const storage = typeof rawStorage === "string" ? rawStorage.trim() : "";
    const color = typeof rawColor === "string" ? rawColor.trim() : "";

    const parsedQty = Number(quantity);
    if (!productName || isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "Product name and a valid quantity (> 0) are required.",
      });
    }

    const rawBarcode = typeof barcode === "string" ? barcode.trim() : "";
    const finalBarcode = rawBarcode && rawBarcode.toUpperCase() !== "N/A" ? rawBarcode : "N/A";

    let calculatedUnitPrice;
    if (
      providedUnitPrice != null &&
      !isNaN(Number(providedUnitPrice)) &&
      Number(providedUnitPrice) > 0
    ) {
      calculatedUnitPrice = Number(providedUnitPrice);
    } else if (priceMode === "total") {
      const parsedTotalPrice = Number(purchasePrice);
      if (isNaN(parsedTotalPrice) || parsedTotalPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "A valid total purchase price (> 0) is required.",
        });
      }
      calculatedUnitPrice = Number((parsedTotalPrice / parsedQty).toFixed(2));
    } else {
      const parsedPrice = Number(purchasePrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "A valid per-unit purchase price (> 0) is required.",
        });
      }
      calculatedUnitPrice = Number(parsedPrice.toFixed(2));
    }

    // Process estimated sale price per unit & total
    let estUnitPrice = null;
    let estTotalValue = null;

    const inputEstUnit = rawEstUnit != null ? rawEstUnit : (estimatedPriceMode === "unit" ? estimatedPrice : null);
    const inputEstTotal = rawEstTotal != null ? rawEstTotal : (estimatedPriceMode === "total" ? estimatedPrice : null);

    if (inputEstUnit !== null && inputEstUnit !== undefined && inputEstUnit !== "" && !isNaN(Number(inputEstUnit))) {
      const num = Number(inputEstUnit);
      if (num >= 0) {
        estUnitPrice = Number(num.toFixed(2));
        if (inputEstTotal !== null && inputEstTotal !== undefined && inputEstTotal !== "" && !isNaN(Number(inputEstTotal))) {
          estTotalValue = Number(Number(inputEstTotal).toFixed(2));
        } else {
          estTotalValue = Number((estUnitPrice * parsedQty).toFixed(2));
        }
      }
    } else if (inputEstTotal !== null && inputEstTotal !== undefined && inputEstTotal !== "" && !isNaN(Number(inputEstTotal))) {
      const num = Number(inputEstTotal);
      if (num >= 0) {
        estTotalValue = Number(num.toFixed(2));
        estUnitPrice = parsedQty > 0 ? Number((estTotalValue / parsedQty).toFixed(2)) : 0;
      }
    }

    const isLocal = Boolean(req.body.isLocalPurchase);
    let isExplicitSupplierLedger = false;
    let supplierDocId = null;
    let finalSupplierName = "";
    let customerDocId = null;
    let resolvedCustomer = "";
    let isLinkedToLedger = false;
    let entryOrigin = isLocal ? "local_purchase" : "general_intake";

    if (isLocal) {
      // 1. Local Purchase from Customer - DO NOT save in Supplier collection
      const rawCustomerName = (req.body.customerName || req.body.supplier || req.body.supplierName || "").trim();
      const explicitCustomerId = req.body.customerId || req.body.customer_id || null;
      let customerDoc = null;
      if (explicitCustomerId && mongoose.Types.ObjectId.isValid(explicitCustomerId)) {
        customerDoc = await Customer.findById(explicitCustomerId);
      }
      if (!customerDoc && rawCustomerName) {
        // Explicit selection was not made - create new Customer record without silently linking by name
        customerDoc = await Customer.create({
          name: rawCustomerName,
          phone: req.body.customerPhone || "",
        });
      }
      customerDocId = customerDoc ? customerDoc._id : null;
      resolvedCustomer = customerDoc ? customerDoc.name : rawCustomerName;
      isLinkedToLedger = Boolean(customerDocId);
      entryOrigin = "local_purchase";
    } else {
      // 2. Regular Supplier Purchase
      const requestedOrigin = req.body.entryOrigin;
      const explicitSupplierId = req.body.supplierId || req.body.supplier_id || null;
      finalSupplierName = typeof supplier === "string" ? supplier.trim() : (req.body.supplierName ? String(req.body.supplierName).trim() : "");

      if (explicitSupplierId && mongoose.Types.ObjectId.isValid(explicitSupplierId)) {
        const existing = await Supplier.findById(explicitSupplierId).select("_id name type").lean();
        if (existing && existing.type !== "customer") {
          isExplicitSupplierLedger = true;
          supplierDocId = existing._id;
          finalSupplierName = existing.name;
          isLinkedToLedger = true;
          entryOrigin = requestedOrigin || "general_intake";
        }
      }

      if (!isExplicitSupplierLedger) {
        // Explicit selection was not made - create new Supplier record without silently linking by name
        const supplierDoc = await Supplier.create({
          name: finalSupplierName || "General Supplier",
          type: "supplier",
        });
        supplierDocId = supplierDoc._id;
        finalSupplierName = supplierDoc.name;
        isLinkedToLedger = true;
        entryOrigin = "general_intake";
        console.log(`[GENERAL INTAKE] Created new supplier entry: "${supplierDoc.name}" (${supplierDoc._id})`);
      } else {
        console.log(`[SUPPLIER LEDGER UPDATE]\nsupplierId: ${supplierDocId}\nentryOrigin: supplier_ledger\nisLinkedToLedger: true`);
      }
    }

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const transactionRef = `TXN-STK-${yy}${mm}${dd}-${randomPart}`;

    const rawBarcodesList = Array.isArray(req.body.barcodes)
      ? req.body.barcodes
      : (finalBarcode !== "N/A" ? [finalBarcode] : []);

    const normalizedBarcodesList = [];
    for (let i = 0; i < parsedQty; i++) {
      const b = rawBarcodesList[i];
      const cleanB = typeof b === "string" ? b.trim() : "";
      normalizedBarcodesList.push(cleanB && cleanB.toUpperCase() !== "N/A" ? cleanB : "N/A");
    }

    const realBarcodes = normalizedBarcodesList.filter((b) => b !== "N/A");
    // Duplicate IMEIs are permitted across inventory

    const effectiveBarcode = finalBarcode !== "N/A" ? finalBarcode : (normalizedBarcodesList.find((b) => b !== "N/A") || "N/A");

    const newStock = new Stock({
      productName: productName.trim(),
      storage,
      color,
      barcode: effectiveBarcode,
      quantity: parsedQty,
      unitPrice: calculatedUnitPrice,
      estimatedSalePricePerUnit: estUnitPrice,
      estimatedTotalSaleValue: estTotalValue,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      supplier: isLocal ? null : supplierDocId,
      supplierName: isLocal ? resolvedCustomer : finalSupplierName,
      isLocalPurchase: isLocal,
      customerName: resolvedCustomer,
      customerId: customerDocId,
      isLinkedToLedger,
      entryOrigin,
      transactionRef,
      amountPaid: amountPaid ? Math.max(0, Number(amountPaid)) : 0,
    });

    const savedStock = await newStock.save();
    if (supplierDocId) {
      await savedStock.populate({ path: "supplier", select: "name" });
    }

    let invoiceNum = "";
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 25) {
      attempts++;
      const randomInv = Math.floor(1000 + Math.random() * 9000);
      invoiceNum = isLocal ? `INV-LOC-${yy}${mm}${dd}-${randomInv}` : `INV-GEN-${yy}${mm}${dd}-${randomInv}`;
      const dbExists = await PurchaseInvoice.findOne({ invoiceNumber: invoiceNum });
      if (!dbExists) {
        isUnique = true;
      }
    }

    const itemSubtotal = Number((calculatedUnitPrice * parsedQty).toFixed(2));
    const paidAmount = amountPaid ? Math.max(0, Number(amountPaid)) : 0;
    const dueAmount = Math.max(0, Number((itemSubtotal - paidAmount).toFixed(2)));

    let payStatus = "unpaid";
    if (dueAmount <= 0 && itemSubtotal > 0) {
      payStatus = "paid";
    } else if (paidAmount > 0) {
      payStatus = "partial";
    }

    const [createdInvoice] = await PurchaseInvoice.create([
      {
        invoiceNumber: invoiceNum,
        supplier: isLocal ? resolvedCustomer : finalSupplierName,
        supplierId: isLocal ? null : supplierDocId,
        isLocalPurchase: isLocal,
        customerName: isLocal ? resolvedCustomer : "",
        customerId: isLocal ? customerDocId : null,
        isLinkedToLedger,
        entryOrigin,
        standaloneReference: transactionRef,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        totalQuantity: parsedQty,
        totalAmount: itemSubtotal,
        amountPaid: paidAmount,
        amountDue: dueAmount,
        paymentStatus: payStatus,
        itemsSummary: [
          {
            productName: productName.trim(),
            storage,
            color,
            category: "General",
            quantity: parsedQty,
            unitPrice: calculatedUnitPrice,
            sellingPrice: estUnitPrice || 0,
            estimatedSalePricePerUnit: estUnitPrice,
            estimatedTotalSaleValue: estTotalValue,
            subtotal: itemSubtotal,
            barcodes: normalizedBarcodesList,
            amountPaid: paidAmount,
            amountDue: dueAmount,
          },
        ],
      },
    ]);

    const stockItemDocs = [];
    for (const b of normalizedBarcodesList) {
      stockItemDocs.push({
        barcode: b && b !== "N/A" ? b : null,
        productName: productName.trim(),
        storage,
        color,
        category: "General",
        purchaseCost: calculatedUnitPrice,
        sellingPrice: estUnitPrice || 0,
        estimatedSalePricePerUnit: estUnitPrice,
        invoiceId: createdInvoice._id,
        supplier: isLocal ? resolvedCustomer : finalSupplierName,
        isLocalPurchase: isLocal,
        customerName: isLocal ? resolvedCustomer : "",
        customerId: isLocal ? customerDocId : null,
        isLinkedToLedger,
        entryOrigin,
        transactionRef,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        status: "available",
        location: "shop",
      });
    }

    if (stockItemDocs.length > 0) {
      await StockItem.insertMany(stockItemDocs);
    }

    if (isLocal && amountPaid && Number(amountPaid) > 0) {
      let pDate = new Date();
      if (purchaseDate) {
        const parsed = new Date(purchaseDate);
        if (!isNaN(parsed.getTime())) {
          if (typeof purchaseDate === "string" && purchaseDate.trim().length <= 10) {
            const now = new Date();
            parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
          }
          pDate = parsed;
        }
      }

      await SupplierPayment.create({
        supplier: resolvedCustomer,
        supplierId: null,
        customerId: customerDocId,
        amount: Math.max(0, Number(amountPaid)),
        paymentDate: pDate,
        paymentMethod: req.body.paymentMethod || "Cash",
        paymentType: "Upfront Payment",
        invoiceNumber: transactionRef,
        notes: req.body.notes || (isLocal ? "Local purchase payment" : "Supplier payment"),
        status: "Completed",
      });
    }

    // Update timestamps on Supplier and Customer documents so lastActivityDate updates immediately
    const touchDate = new Date();
    if (isLocal) {
      if (customerDocId) {
        await Customer.updateOne({ _id: customerDocId }, { $set: { updatedAt: touchDate } });
      }
    } else {
      if (supplierDocId) {
        await Supplier.updateOne({ _id: supplierDocId }, { $set: { updatedAt: touchDate } });
      }
    }

    return res.status(201).json({
      success: true,
      message: `Stock for "${savedStock.productName}" added successfully!`,
      data: savedStock,
      invoice: createdInvoice,
    });
  } catch (error) {
    console.error("Error creating stock record:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error while saving stock.",
    });
  }
};

/**
 * @route   GET /api/stock/:id
 * @desc    Get single stock item with populated supplier
 */
const getStockById = async (req, res) => {
  try {
    let item = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      item = await Stock.findById(req.params.id)
        .populate({
          path: "supplier",
          select: "name",
        })
        .lean();
    }

    if (!item && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const inv = await PurchaseInvoice.findById(req.params.id).lean();
      if (inv) {
        const invRefs = [inv.standaloneReference, inv.invoiceNumber].filter(Boolean);
        const units = await StockItem.find({
          $or: [
            { invoiceId: inv._id },
            ...(invRefs.length > 0 ? [{ transactionRef: { $in: invRefs } }] : []),
          ],
        }).lean();

        const availableUnits = units.filter((u) => u.status === "available");
        const availableBarcodes = availableUnits
          .map((u) => u.barcode)
          .filter((b) => b && b.toUpperCase() !== "N/A");

        item = {
          _id: inv._id,
          isBatch: true,
          invoiceNumber: inv.invoiceNumber,
          productName: inv.itemsSummary?.[0]?.productName || inv.invoiceNumber,
          quantity: availableUnits.length > 0 ? availableUnits.length : inv.totalQuantity,
          unitPrice:
            inv.totalQuantity > 0
              ? Number((inv.totalAmount / inv.totalQuantity).toFixed(2))
              : inv.totalAmount,
          supplierName: inv.supplier || inv.customerName || "General Supplier",
          units,
          barcodes: availableBarcodes,
        };
      }
    }

    if (!item) {
      return res.status(404).json({ success: false, message: "Stock item not found" });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   DELETE /api/stock/:id
 * @desc    Delete stock item
 */
const deleteStock = async (req, res) => {
  try {
    const deleted = await Stock.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Stock item not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Stock record deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper to compute and validate static estimated sale price per unit & total
 */
const resolveEstimatedPrices = (it, quantity) => {
  const q = Number(quantity) || 1;
  let estUnitPrice = null;
  let estTotalValue = null;

  const rawVal =
    it.estimatedSalePrice != null
      ? it.estimatedSalePrice
      : it.estimatedPrice != null
      ? it.estimatedPrice
      : null;

  const rawEstUnit =
    it.estimatedSalePricePerUnit != null
      ? it.estimatedSalePricePerUnit
      : it.estimatedPriceMode === "unit"
      ? rawVal
      : null;
  const rawEstTotal =
    it.estimatedTotalSaleValue != null
      ? it.estimatedTotalSaleValue
      : it.estimatedPriceMode === "total"
      ? rawVal
      : null;

  if (
    rawEstUnit !== null &&
    rawEstUnit !== undefined &&
    rawEstUnit !== "" &&
    !isNaN(Number(rawEstUnit))
  ) {
    const num = Number(rawEstUnit);
    if (num >= 0) {
      estUnitPrice = Number(num.toFixed(2));
      if (
        rawEstTotal !== null &&
        rawEstTotal !== undefined &&
        rawEstTotal !== "" &&
        !isNaN(Number(rawEstTotal))
      ) {
        estTotalValue = Number(Number(rawEstTotal).toFixed(2));
      } else {
        estTotalValue = Number((estUnitPrice * q).toFixed(2));
      }
    }
  } else if (
    rawEstTotal !== null &&
    rawEstTotal !== undefined &&
    rawEstTotal !== "" &&
    !isNaN(Number(rawEstTotal))
  ) {
    const num = Number(rawEstTotal);
    if (num >= 0) {
      estTotalValue = Number(num.toFixed(2));
      estUnitPrice = q > 0 ? Number((estTotalValue / q).toFixed(2)) : 0;
    }
  }

  return { estUnitPrice, estTotalValue };
};

/**
 * @route   POST /api/stock/batch
 * @desc    Atomic transaction for creating multi-supplier PurchaseInvoices and inserting serialized StockItem documents
 */
const createStockBatch = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let resultData = null;

    await session.withTransaction(async () => {
      const { items = [] } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        const err = new Error(
          "At least one inventory line item is required to process stock batch."
        );
        err.statusCode = 400;
        throw err;
      }

      // 1. Validate all line items
      const actualRealBarcodes = [];
      const seenBarcodesInBatch = new Set();
      const batchDuplicates = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const itemIndex = i + 1;

        if (
          !it.productName ||
          typeof it.productName !== "string" ||
          !it.productName.trim()
        ) {
          const err = new Error(
            `Item #${itemIndex} is missing a valid product name.`
          );
          err.statusCode = 400;
          throw err;
        }

        const supplierName =
          (typeof it.supplier === "string" && it.supplier.trim()) ||
          (typeof req.body.supplier === "string" && req.body.supplier.trim()) ||
          "Random Supplier";

        const qty = parseInt(it.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          const err = new Error(
            `Item "${it.productName}" must have a valid positive integer quantity (minimum 1).`
          );
          err.statusCode = 400;
          throw err;
        }

        const cost = Number(it.unitPrice);
        if (isNaN(cost) || cost < 0) {
          const err = new Error(
            `Item "${it.productName}" has an invalid unit purchase cost.`
          );
          err.statusCode = 400;
          throw err;
        }

        const itemSubtotal =
          typeof it.subtotal === "number" && !isNaN(it.subtotal)
            ? it.subtotal
            : Number((cost * qty).toFixed(2));

        const itemPaid =
          it.amountPaid != null && !isNaN(Number(it.amountPaid))
            ? Math.max(0, Number(it.amountPaid))
            : itemSubtotal;

        if (itemPaid > itemSubtotal + 0.05) {
          const err = new Error(
            `Amount paid for "${it.productName}" (Rs. ${itemPaid}) cannot exceed line total cost (Rs. ${itemSubtotal}).`
          );
          err.statusCode = 400;
          throw err;
        }

        const itemBarcodes = Array.isArray(it.barcodes) ? it.barcodes : [];

        for (let b = 0; b < qty; b++) {
          const rawBarcode = itemBarcodes[b];
          let bc = typeof rawBarcode === "string" ? rawBarcode.trim() : "";

          // Normalize empty or missing barcodes to "N/A"
          if (!bc || bc.toUpperCase() === "N/A") {
            bc = "N/A";
          }

          // Real physical barcodes collected (duplicates allowed)
          if (bc !== "N/A") {
            actualRealBarcodes.push(bc);
          }
        }
      }

      // Check entry origin and explicit supplier linking
      const rawEntryOrigin = req.body.entryOrigin;
      const explicitSupplierId = req.body.supplierId || req.body.supplier_id || null;
      let isExplicitSupplierLedger = false;
      let supplierDoc = null;

      if (
        rawEntryOrigin === "supplier_ledger" &&
        explicitSupplierId &&
        mongoose.Types.ObjectId.isValid(explicitSupplierId)
      ) {
        supplierDoc = await Supplier.findById(explicitSupplierId).session(session);
        if (supplierDoc && supplierDoc.type !== "customer") {
          isExplicitSupplierLedger = true;
        }
      }

      const createdInvoices = [];
      const allStockItemDocs = [];
      const allStockDocs = [];
      const generatedInvoiceNumbers = new Set();
      const supplierBatchPayments = new Map();

      const today = new Date();
      const yy = String(today.getFullYear()).slice(-2);
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");

      if (isExplicitSupplierLedger) {
        // =========================================================================
        // CASE 1: Explicit Supplier Profile Purchase (From Supplier Ledger)
        // Only updates ledger and transaction history when created from supplier profile
        // =========================================================================
        console.log(
          `[SUPPLIER LEDGER UPDATE]\nsupplierId: ${supplierDoc._id}\nentryOrigin: supplier_ledger\nisLinkedToLedger: true`
        );

        const supplierName = supplierDoc.name;

        // Generate unique invoice number for this supplier transaction
        let invoiceNum = "";
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 25) {
          attempts++;
          const randomPart = Math.floor(1000 + Math.random() * 9000);
          invoiceNum = `INV-${yy}${mm}${dd}-${randomPart}-1`;
          if (!generatedInvoiceNumbers.has(invoiceNum)) {
            const dbExists = await PurchaseInvoice.findOne({
              invoiceNumber: invoiceNum,
            }).session(session);
            if (!dbExists) {
              isUnique = true;
              generatedInvoiceNumbers.add(invoiceNum);
            }
          }
        }

        let totalQuantity = 0;
        let totalAmount = 0;
        let amountPaid = 0;
        let earliestDate = null;

        const itemsSummary = items.map((it) => {
          const q = parseInt(it.quantity, 10);
          const uPrice = Number(it.unitPrice);
          const sPrice = Number(it.sellingPrice) || 0;
          const { estUnitPrice, estTotalValue } = resolveEstimatedPrices(it, q);
          const sub =
            typeof it.subtotal === "number" && !isNaN(it.subtotal)
              ? it.subtotal
              : Number((uPrice * q).toFixed(2));
          const paid =
            it.amountPaid != null && !isNaN(Number(it.amountPaid))
              ? Math.max(0, Number(it.amountPaid))
              : sub;

          totalQuantity += q;
          totalAmount += sub;
          amountPaid += paid;

          let itDate = new Date();
          if (it.purchaseDate) {
            const parsed = new Date(it.purchaseDate);
            if (!isNaN(parsed.getTime())) {
              if (typeof it.purchaseDate === "string" && it.purchaseDate.trim().length <= 10) {
                const now = new Date();
                parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
              }
              itDate = parsed;
            }
          }
          if (!earliestDate || itDate < earliestDate) {
            earliestDate = itDate;
          }

          const rawList = Array.isArray(it.barcodes) ? it.barcodes : [];
          const normalizedBarcodes = [];
          for (let b = 0; b < q; b++) {
            const itemBc = typeof rawList[b] === "string" ? rawList[b].trim() : "";
            normalizedBarcodes.push(
              itemBc && itemBc.toUpperCase() !== "N/A" ? itemBc : "N/A"
            );
          }

          const itStorage = typeof it.storage === "string" ? it.storage.trim() : "";
          const itColor = typeof it.color === "string" ? it.color.trim() : "";

          return {
            productName: it.productName.trim(),
            storage: itStorage,
            color: itColor,
            category: it.category ? it.category.trim() : "General",
            quantity: q,
            unitPrice: uPrice,
            sellingPrice: sPrice,
            estimatedSalePricePerUnit: estUnitPrice,
            estimatedTotalSaleValue: estTotalValue,
            subtotal: sub,
            barcodes: normalizedBarcodes,
            amountPaid: Number(paid.toFixed(2)),
            amountDue: Math.max(0, Number((sub - paid).toFixed(2))),
          };
        });

        totalAmount = Number(totalAmount.toFixed(2));
        amountPaid = Math.min(totalAmount, Number(amountPaid.toFixed(2)));
        const amountDue = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));

        let paymentStatus = "unpaid";
        if (amountDue <= 0 && totalAmount > 0) {
          paymentStatus = "paid";
        } else if (amountPaid > 0) {
          paymentStatus = "partial";
        }

        const [createdInvoice] = await PurchaseInvoice.create(
          [
            {
              invoiceNumber: invoiceNum,
              supplier: supplierName,
              supplierId: supplierDoc._id,
              isLinkedToLedger: true,
              entryOrigin: "supplier_ledger",
              purchaseDate: earliestDate || new Date(),
              totalQuantity,
              totalAmount,
              amountPaid,
              amountDue,
              paymentStatus,
              itemsSummary,
            },
          ],
          { session }
        );

        createdInvoices.push(createdInvoice);

        // Touch supplier updatedAt timestamp so they jump to top of supplier list
        await Supplier.updateOne({ _id: supplierDoc._id }, { $set: { updatedAt: new Date() } }).session(session);

        if (amountPaid > 0) {
          await SupplierPayment.create(
            [
              {
                supplier: supplierName,
                supplierId: supplierDoc._id,
                amount: amountPaid,
                paymentDate: earliestDate || new Date(),
                paymentMethod: "Cash",
                paymentType: "Upfront Payment",
                invoiceNumber: invoiceNum,
                status: "Completed",
              },
            ],
            { session }
          );
        }

        for (const itemSummary of itemsSummary) {
          for (const barcode of itemSummary.barcodes) {
            allStockItemDocs.push({
              barcode: barcode && barcode !== "N/A" ? barcode : null,
              productName: itemSummary.productName,
              storage: itemSummary.storage || "",
              color: itemSummary.color || "",
              category: itemSummary.category || "General",
              purchaseCost: itemSummary.unitPrice,
              sellingPrice: itemSummary.sellingPrice || 0,
              estimatedSalePricePerUnit: itemSummary.estimatedSalePricePerUnit,
              invoiceId: createdInvoice._id,
              supplier: supplierName,
              isLinkedToLedger: true,
              entryOrigin: "supplier_ledger",
              transactionRef: invoiceNum,
              purchaseDate: createdInvoice.purchaseDate,
              status: "available",
            });
          }

          allStockDocs.push({
            productName: itemSummary.productName,
            storage: itemSummary.storage || "",
            color: itemSummary.color || "",
            barcode: itemSummary.barcodes.find((b) => b && b !== "N/A") || "N/A",
            quantity: itemSummary.quantity,
            unitPrice: itemSummary.unitPrice,
            totalPrice: itemSummary.subtotal,
            estimatedSalePricePerUnit: itemSummary.estimatedSalePricePerUnit,
            estimatedTotalSaleValue: itemSummary.estimatedTotalSaleValue,
            purchaseDate: createdInvoice.purchaseDate,
            supplier: supplierDoc._id,
            supplierName: supplierName,
            isLinkedToLedger: true,
            entryOrigin: "supplier_ledger",
            transactionRef: invoiceNum,
            amountPaid: itemSummary.amountPaid,
            amountDue: itemSummary.amountDue,
            paymentStatus:
              itemSummary.amountDue <= 0 && itemSummary.subtotal > 0
                ? "Paid"
                : itemSummary.amountPaid > 0
                ? "Partial"
                : "Due",
          });
        }
      } else {
        // =========================================================================
        // CASE 2: General Stock Intake (From Generic Add Stock Page / Standalone Entry)
        // Group items by party (supplier / customer) so all items purchased together
        // from the same party form a SINGLE unified PurchaseInvoice and batch entry!
        // =========================================================================
        let itemCounter = 1;
        const sessionCreatedSuppliers = new Map();
        const sessionCreatedCustomers = new Map();

        // 1. Resolve party for each item and group items by party
        const partyGroups = new Map();

        for (const it of items) {
          const isItemLocal = Boolean(it.isLocalPurchase);
          let supplierDoc = null;
          let customerDoc = null;
          let resolvedCustomerName = "";
          let resolvedCustomerId = null;

          if (isItemLocal) {
            const rawCustomerText =
              (typeof it.customerName === "string" && it.customerName.trim()) ||
              (typeof it.supplier === "string" && it.supplier.trim()) ||
              (typeof it.supplierName === "string" && it.supplierName.trim()) ||
              "Walk-in Customer";
            const cleanCustomerText = rawCustomerText.trim();
            const explicitItemCustomerId = it.customerId || null;
            if (explicitItemCustomerId && mongoose.Types.ObjectId.isValid(explicitItemCustomerId)) {
              customerDoc = await Customer.findById(explicitItemCustomerId).session(session);
            }
            if (!customerDoc && cleanCustomerText) {
              const lowerCust = cleanCustomerText.toLowerCase();
              if (sessionCreatedCustomers.has(lowerCust)) {
                customerDoc = sessionCreatedCustomers.get(lowerCust);
              } else {
                const [newCust] = await Customer.create(
                  [{ name: cleanCustomerText, phone: it.customerPhone || "" }],
                  { session }
                );
                customerDoc = newCust;
                sessionCreatedCustomers.set(lowerCust, newCust);
              }
            }
            resolvedCustomerName = customerDoc ? customerDoc.name : cleanCustomerText;
            resolvedCustomerId = customerDoc ? customerDoc._id : null;
          } else {
            const rawSupplierText =
              (typeof it.supplierName === "string" && it.supplierName.trim()) ||
              (typeof it.supplier === "string" && it.supplier.trim()) ||
              "General Supplier";
            const cleanSupplierText = rawSupplierText.trim();

            const explicitItemSupplierId = it.supplierId || null;
            if (explicitItemSupplierId && mongoose.Types.ObjectId.isValid(explicitItemSupplierId)) {
              const existing = await Supplier.findById(explicitItemSupplierId).session(session);
              if (existing && existing.type !== "customer") {
                supplierDoc = existing;
              }
            }

            if (!supplierDoc && cleanSupplierText) {
              const lowerName = cleanSupplierText.toLowerCase();
              if (sessionCreatedSuppliers.has(lowerName)) {
                supplierDoc = sessionCreatedSuppliers.get(lowerName);
              } else {
                const [newSup] = await Supplier.create([{ name: cleanSupplierText, type: "supplier" }], { session });
                supplierDoc = newSup;
                sessionCreatedSuppliers.set(lowerName, newSup);
                console.log(
                  `[GENERAL INTAKE] Created new supplier entry: "${supplierDoc.name}" (${supplierDoc._id}) for "${it.productName}"`
                );
              }
            }
          }

          const effectiveSupplierName = isItemLocal
            ? (resolvedCustomerName || "Local Purchase")
            : (supplierDoc ? supplierDoc.name : (it.supplier || it.supplierName || "General Supplier").trim());
          const effectiveSupplierId = isItemLocal ? null : (supplierDoc ? supplierDoc._id : null);
          const effectiveIsLinked = isItemLocal ? Boolean(resolvedCustomerId) : Boolean(supplierDoc);

          const groupKey = isItemLocal
            ? `cust_${resolvedCustomerId || resolvedCustomerName.toLowerCase()}`
            : `sup_${effectiveSupplierId || effectiveSupplierName.toLowerCase()}`;

          if (!partyGroups.has(groupKey)) {
            partyGroups.set(groupKey, {
              isItemLocal,
              supplierDoc,
              customerDoc,
              resolvedCustomerName,
              resolvedCustomerId,
              effectiveSupplierName,
              effectiveSupplierId,
              effectiveIsLinked,
              items: [],
            });
          }

          partyGroups.get(groupKey).items.push(it);
        }

        // 2. Process each party group into a SINGLE PurchaseInvoice
        for (const group of partyGroups.values()) {
          const {
            isItemLocal,
            supplierDoc,
            customerDoc,
            resolvedCustomerName,
            resolvedCustomerId,
            effectiveSupplierName,
            effectiveSupplierId,
            effectiveIsLinked,
            items: groupItems,
          } = group;

          // Generate unique standalone transaction reference & invoice number for this unified group
          let invoiceNum = "";
          let isUnique = false;
          let attempts = 0;

          while (!isUnique && attempts < 25) {
            attempts++;
            const randomPart = Math.floor(1000 + Math.random() * 9000);
            invoiceNum = `INV-GEN-${yy}${mm}${dd}-${randomPart}-${itemCounter}`;
            if (!generatedInvoiceNumbers.has(invoiceNum)) {
              const dbExists = await PurchaseInvoice.findOne({
                invoiceNumber: invoiceNum,
              }).session(session);
              if (!dbExists) {
                isUnique = true;
                generatedInvoiceNumbers.add(invoiceNum);
              }
            }
          }

          const txnRef = `TXN-GEN-${yy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}-${itemCounter}`;
          itemCounter++;

          let groupTotalQty = 0;
          let groupTotalAmount = 0;
          let groupTotalPaid = 0;
          let groupEarliestDate = new Date();
          const groupItemsSummary = [];

          // Group products within this party group by product name (for inventory stock documents)
          // E.g. If user enters Pixel 6 and Pixel 6, merge them into 1 stock record with quantity: 2
          const consolidatedStockMap = new Map();

          const hasItemLevelPaid = groupItems.some(
            (it) => it.amountPaid != null && !isNaN(Number(it.amountPaid))
          );
          let remainingBatchPaid =
            !hasItemLevelPaid && req.body.amountPaid != null && !isNaN(Number(req.body.amountPaid))
              ? Math.max(0, Number(req.body.amountPaid))
              : null;

          for (const it of groupItems) {
            const q = parseInt(it.quantity, 10);
            const uPrice = Number(it.unitPrice);
            const sPrice = Number(it.sellingPrice) || 0;
            const { estUnitPrice, estTotalValue } = resolveEstimatedPrices(it, q);
            const sub =
              typeof it.subtotal === "number" && !isNaN(it.subtotal)
                ? it.subtotal
                : Number((uPrice * q).toFixed(2));

            let paid;
            if (hasItemLevelPaid) {
              paid =
                it.amountPaid != null && !isNaN(Number(it.amountPaid))
                  ? Math.min(sub, Math.max(0, Number(Number(it.amountPaid).toFixed(2))))
                  : sub;
            } else if (remainingBatchPaid !== null) {
              paid = Math.min(sub, remainingBatchPaid);
              remainingBatchPaid = Math.max(0, remainingBatchPaid - paid);
            } else {
              paid = sub;
            }

            const due = Math.max(0, Number((sub - paid).toFixed(2)));

            let itDate = new Date();
            if (it.purchaseDate) {
              const parsed = new Date(it.purchaseDate);
              if (!isNaN(parsed.getTime())) {
                if (typeof it.purchaseDate === "string" && it.purchaseDate.trim().length <= 10) {
                  const now = new Date();
                  parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
                }
                itDate = parsed;
              }
            }
            if (itDate < groupEarliestDate) {
              groupEarliestDate = itDate;
            }

            const rawList = Array.isArray(it.barcodes) ? it.barcodes : [];
            const normalizedBarcodes = [];
            for (let b = 0; b < q; b++) {
              const itemBc = typeof rawList[b] === "string" ? rawList[b].trim() : "";
              normalizedBarcodes.push(
                itemBc && itemBc.toUpperCase() !== "N/A" ? itemBc : "N/A"
              );
            }

            groupTotalQty += q;
            groupTotalAmount = Number((groupTotalAmount + sub).toFixed(2));
            groupTotalPaid = Number((groupTotalPaid + paid).toFixed(2));

            const itStorage = typeof it.storage === "string" ? it.storage.trim() : "";
            const itColor = typeof it.color === "string" ? it.color.trim() : "";

            groupItemsSummary.push({
              productName: it.productName.trim(),
              storage: itStorage,
              color: itColor,
              category: it.category ? it.category.trim() : "General",
              quantity: q,
              unitPrice: uPrice,
              sellingPrice: sPrice,
              estimatedSalePricePerUnit: estUnitPrice,
              estimatedTotalSaleValue: estTotalValue,
              subtotal: sub,
              barcodes: normalizedBarcodes,
              amountPaid: Number(paid.toFixed(2)),
              amountDue: due,
            });

            // Map serialized StockItem documents
            for (const barcode of normalizedBarcodes) {
              allStockItemDocs.push({
                barcode: barcode && barcode !== "N/A" ? barcode : null,
                productName: it.productName.trim(),
                storage: itStorage,
                color: itColor,
                category: it.category ? it.category.trim() : "General",
                purchaseCost: uPrice,
                sellingPrice: sPrice,
                estimatedSalePricePerUnit: estUnitPrice,
                invoiceId: null, // assigned below after invoice creation
                supplier: effectiveSupplierName,
                isLocalPurchase: isItemLocal,
                customerName: isItemLocal ? resolvedCustomerName : "",
                customerId: isItemLocal ? resolvedCustomerId : null,
                isLinkedToLedger: effectiveIsLinked,
                entryOrigin: isItemLocal ? "local_purchase" : "general_intake",
                transactionRef: txnRef,
                purchaseDate: itDate,
                status: "available",
              });
            }

            // Consolidate stock documents by productName + storage + color
            const prodKey = `${it.productName.trim()}_${itStorage}_${itColor}`.toLowerCase();
            if (!consolidatedStockMap.has(prodKey)) {
              consolidatedStockMap.set(prodKey, {
                productName: it.productName.trim(),
                storage: itStorage,
                color: itColor,
                barcodes: [...normalizedBarcodes],
                quantity: q,
                unitPrice: uPrice,
                totalPrice: sub,
                estimatedSalePricePerUnit: estUnitPrice,
                estimatedTotalSaleValue: estTotalValue,
                purchaseDate: itDate,
                supplier: effectiveSupplierId,
                supplierName: effectiveSupplierName,
                isLocalPurchase: isItemLocal,
                customerName: isItemLocal ? resolvedCustomerName : "",
                customerId: isItemLocal ? resolvedCustomerId : null,
                isLinkedToLedger: effectiveIsLinked,
                entryOrigin: isItemLocal ? "local_purchase" : "general_intake",
                transactionRef: txnRef,
                amountPaid: paid,
                amountDue: due,
              });
            } else {
              const existing = consolidatedStockMap.get(prodKey);
              existing.quantity += q;
              existing.totalPrice = Number((existing.totalPrice + sub).toFixed(2));
              existing.unitPrice = Number((existing.totalPrice / existing.quantity).toFixed(2));
              existing.amountPaid = Number((existing.amountPaid + paid).toFixed(2));
              existing.amountDue = Math.max(0, Number((existing.totalPrice - existing.amountPaid).toFixed(2)));
              existing.barcodes.push(...normalizedBarcodes);
            }
          }

          groupTotalAmount = Number(groupTotalAmount.toFixed(2));
          groupTotalPaid = Math.min(groupTotalAmount, Number(groupTotalPaid.toFixed(2)));
          const groupTotalDue = Math.max(0, Number((groupTotalAmount - groupTotalPaid).toFixed(2)));

          let groupPaymentStatus = "unpaid";
          if (groupTotalDue <= 0 && groupTotalAmount > 0) {
            groupPaymentStatus = "paid";
          } else if (groupTotalPaid > 0) {
            groupPaymentStatus = "partial";
          }

          // Single unified PurchaseInvoice for this group
          const [createdInvoice] = await PurchaseInvoice.create(
            [
              {
                invoiceNumber: invoiceNum,
                supplier: effectiveSupplierName,
                supplierId: effectiveSupplierId,
                isLocalPurchase: isItemLocal,
                customerName: isItemLocal ? resolvedCustomerName : "",
                customerId: isItemLocal ? resolvedCustomerId : null,
                isLinkedToLedger: effectiveIsLinked,
                entryOrigin: isItemLocal ? "local_purchase" : "general_intake",
                standaloneReference: txnRef,
                purchaseDate: groupEarliestDate,
                totalQuantity: groupTotalQty,
                totalAmount: groupTotalAmount,
                amountPaid: groupTotalPaid,
                amountDue: groupTotalDue,
                paymentStatus: groupPaymentStatus,
                itemsSummary: groupItemsSummary,
              },
            ],
            { session }
          );

          createdInvoices.push(createdInvoice);

          // Assign createdInvoice._id to child StockItem docs
          for (const si of allStockItemDocs) {
            if (si.transactionRef === txnRef && !si.invoiceId) {
              si.invoiceId = createdInvoice._id;
            }
          }

          // Add consolidated Stock docs
          for (const stockData of consolidatedStockMap.values()) {
            allStockDocs.push({
              productName: stockData.productName,
              storage: stockData.storage || "",
              color: stockData.color || "",
              barcode: stockData.barcodes.find((b) => b && b !== "N/A") || "N/A",
              quantity: stockData.quantity,
              unitPrice: stockData.unitPrice,
              totalPrice: stockData.totalPrice,
              estimatedSalePricePerUnit: stockData.estimatedSalePricePerUnit,
              estimatedTotalSaleValue: stockData.estimatedTotalSaleValue,
              purchaseDate: stockData.purchaseDate,
              supplier: stockData.supplier,
              supplierName: stockData.supplierName,
              isLocalPurchase: stockData.isLocalPurchase,
              customerName: stockData.customerName,
              customerId: stockData.customerId,
              isLinkedToLedger: stockData.isLinkedToLedger,
              entryOrigin: stockData.entryOrigin,
              transactionRef: txnRef,
              amountPaid: stockData.amountPaid,
              amountDue: stockData.amountDue,
              paymentStatus:
                stockData.amountDue <= 0 && stockData.totalPrice > 0
                  ? "Paid"
                  : stockData.amountPaid > 0
                  ? "Partial"
                  : "Due",
            });
          }

          // Record lump-sum SupplierPayment for upfront amount paid
          if (groupTotalPaid > 0) {
            const supKey = isItemLocal
              ? `cust_${resolvedCustomerId || resolvedCustomerName}`
              : `sup_${effectiveSupplierId || effectiveSupplierName}`;

            if (!supplierBatchPayments.has(supKey)) {
              supplierBatchPayments.set(supKey, {
                supplier: effectiveSupplierName,
                supplierId: effectiveSupplierId,
                customerId: isItemLocal ? resolvedCustomerId : null,
                amount: 0,
                paymentDate: groupEarliestDate,
                invoiceNumbers: [],
              });
            }
            const sPay = supplierBatchPayments.get(supKey);
            sPay.amount = Number((sPay.amount + groupTotalPaid).toFixed(2));
            sPay.invoiceNumbers.push(invoiceNum);
          }

          // Touch customer or supplier updatedAt timestamp so they jump to top of list
          const itemTouchDate = new Date();
          if (isItemLocal) {
            if (customerDoc) {
              await Customer.updateOne({ _id: customerDoc._id }, { $set: { updatedAt: itemTouchDate } }).session(session);
            }
          } else {
            if (supplierDoc) {
              await Supplier.updateOne({ _id: supplierDoc._id }, { $set: { updatedAt: itemTouchDate } }).session(session);
            }
          }
        }
      }

      // 4. Bulk Insert serialized StockItem and aggregated Stock documents
      if (allStockItemDocs.length > 0) {
        await StockItem.insertMany(allStockItemDocs, { session });
      }
      if (allStockDocs.length > 0) {
        await Stock.insertMany(allStockDocs, { session });
      }

      // Record actual lump-sum SupplierPayment transactions per distinct supplier/customer (exact transaction logging)
      for (const sPay of supplierBatchPayments.values()) {
        if (sPay.amount > 0) {
          await SupplierPayment.create(
            [
              {
                supplier: sPay.supplier,
                supplierId: sPay.supplierId,
                customerId: sPay.customerId,
                amount: sPay.amount,
                paymentDate: sPay.paymentDate || new Date(),
                paymentMethod: "Cash",
                paymentType: "Upfront Payment",
                notes: sPay.invoiceNumbers.length > 1
                  ? `Upfront payment for ${sPay.invoiceNumbers.length} items (${sPay.invoiceNumbers.join(", ")})`
                  : `Upfront payment (${sPay.invoiceNumbers[0] || "Stock intake"})`,
                invoiceNumber: sPay.invoiceNumbers.length === 1 ? sPay.invoiceNumbers[0] : null,
                status: "Completed",
              },
            ],
            { session }
          );
        }
      }

      // 5. Compute global response summary metrics
      const grandTotalUnits = allStockItemDocs.length;
      const grandTotalBill = createdInvoices.reduce(
        (acc, inv) => acc + inv.totalAmount,
        0
      );
      const totalPaid = createdInvoices.reduce(
        (acc, inv) => acc + inv.amountPaid,
        0
      );
      const totalDue = createdInvoices.reduce(
        (acc, inv) => acc + inv.amountDue,
        0
      );

      resultData = {
        invoices: createdInvoices,
        totalInvoices: createdInvoices.length,
        totalSuppliers: isExplicitSupplierLedger ? 1 : createdInvoices.length,
        totalUnits: grandTotalUnits,
        grandTotalBill: Number(grandTotalBill.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalDue: Number(totalDue.toFixed(2)),
      };
    });

    return res.status(201).json({
      success: true,
      message: `Successfully processed ${resultData.totalUnits} unit(s) across ${resultData.totalSuppliers} supplier invoice(s).`,
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      console.warn(`[Stock Batch Error] ${error.message}`);
    } else {
      console.error("[Stock Batch Error]", error.message || error);
    }
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to process multi-supplier stock batch.",
      duplicates: error.duplicates || undefined,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * @route   POST /api/stock/verify-barcodes
 * @desc    Quick lookup to test an array of barcodes for collision before staging
 */
const verifyBarcodes = async (req, res) => {
  try {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(200).json({ success: true, duplicates: [] });
    }

    const cleanList = barcodes
      .map((b) => (typeof b === "string" ? b.trim() : ""))
      .filter(Boolean);

    const existing = await StockItem.find({ barcode: { $in: cleanList } })
      .select("barcode productName")
      .lean();

    return res.status(200).json({
      success: true,
      duplicates: existing.map((item) => ({
        barcode: item.barcode,
        productName: item.productName,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/stock/barcode/:barcode
 * @desc    Ultra-fast checkout scanner lookup with in-memory LRU caching, promise deduplication, and indexed queries
 */
const getStockItemByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode parameter is required.",
      });
    }

    const cleanBarcode = barcode.trim();
    const loc = req.query.location ? req.query.location.toLowerCase() : "shop";
    const locFilter = loc === "warehouse" ? "warehouse" : { $ne: "warehouse" };
    const cacheKey = `bc:${loc}:${cleanBarcode}`;

    // 1. Instant Bounded LRU Cache Check
    const cached = barcodeCache.get(cacheKey);
    if (cached !== undefined) {
      if (cached === "__NOT_FOUND__") {
        return res.status(404).json({
          success: false,
          message: `Barcode "${cleanBarcode}" not found in inventory.`,
          cached: true,
        });
      }
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    // 2. In-flight Promise Deduplication & Fast Indexed Query
    const payload = await barcodeCache.dedupe(
      cacheKey,
      async () => {
        // A. Primary lookup: Exact serialized unit with lean projection (prioritize available units)
        const item = (await StockItem.findOne({ barcode: cleanBarcode, location: locFilter, status: "available" })
          .select("productName barcode category purchaseCost sellingPrice estimatedSalePricePerUnit supplier status location storage color")
          .lean()) ||
          (await StockItem.findOne({ barcode: cleanBarcode, location: locFilter })
          .select("productName barcode category purchaseCost sellingPrice estimatedSalePricePerUnit supplier status location storage color")
          .lean());

        if (item) {
          // B. Exact indexed lookup on parent Stock collection (NO unindexed regex!)
          const parentStock = await Stock.findOne({
            productName: item.productName,
            location: locFilter,
          })
            .select("_id quantity unitPrice estimatedSalePricePerUnit estimatedTotalSaleValue supplierName storage color")
            .lean();

          return {
            ...item,
            stockId: parentStock?._id,
            availableQuantity: parentStock?.quantity ?? 0,
            unitPurchaseCost: parentStock?.unitPrice ?? item.purchaseCost,
            estimatedSalePricePerUnit:
              item.estimatedSalePricePerUnit != null
                ? item.estimatedSalePricePerUnit
                : parentStock?.estimatedSalePricePerUnit ?? null,
            estimatedTotalSaleValue: parentStock?.estimatedTotalSaleValue ?? null,
            supplier: parentStock?.supplierName || item.supplier,
            parentStock,
          };
        }

        // C. Secondary fallback: check catalog Stock collection directly with lean projection
        const catalogStock = await Stock.findOne({ barcode: cleanBarcode, location: locFilter })
          .select("_id productName barcode quantity unitPrice estimatedSalePricePerUnit estimatedTotalSaleValue supplierName category location")
          .lean();

        if (catalogStock) {
          return {
            ...catalogStock,
            stockId: catalogStock._id,
            status: catalogStock.quantity > 0 ? "available" : "sold",
            availableQuantity: catalogStock.quantity,
            purchaseCost: catalogStock.unitPrice,
            unitPurchaseCost: catalogStock.unitPrice,
            estimatedSalePricePerUnit: catalogStock.estimatedSalePricePerUnit ?? null,
            estimatedTotalSaleValue: catalogStock.estimatedTotalSaleValue ?? null,
            supplier: catalogStock.supplierName || "Unknown",
            isCatalogOnly: true,
          };
        }

        return null;
      },
      120000 // 2 minutes TTL
    );

    if (!payload) {
      // Short 5-second negative cache to protect against rapid burst scans of bad barcodes
      barcodeCache.set(cacheKey, "__NOT_FOUND__", 5000);
      return res.status(404).json({
        success: false,
        message: `Barcode "${cleanBarcode}" not found in inventory.`,
      });
    }

    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/stock/:id/barcodes
 * @desc    Fetch all serialized unit barcodes for a specific product
 */
const getProductBarcodes = async (req, res) => {
  try {
    const { id } = req.params;
    let stock = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      stock = await Stock.findById(id).lean();
    }
    if (!stock) {
      stock = await Stock.findOne({ productName: decodeURIComponent(id) }).lean();
    }
    if (!stock && mongoose.Types.ObjectId.isValid(id)) {
      const inv = await PurchaseInvoice.findById(id).lean();
      if (inv) {
        const invRefs = [inv.standaloneReference, inv.invoiceNumber].filter(Boolean);
        const units = await StockItem.find({
          $or: [
            { invoiceId: inv._id },
            ...(invRefs.length > 0 ? [{ transactionRef: { $in: invRefs } }] : []),
          ],
          barcode: { $nin: ["N/A", null, ""] },
        })
          .select("barcode status purchaseCost sellingPrice estimatedSalePricePerUnit purchaseDate location storage color")
          .sort({ createdAt: -1 })
          .lean();

        return res.status(200).json({
          success: true,
          data: {
            stockId: inv._id,
            productName: inv.itemsSummary?.[0]?.productName || inv.invoiceNumber,
            availableQuantity: units.filter((u) => u.status === "available").length,
            totalBarcodes: units.length,
            availableBarcodes: units.filter((u) => u.status === "available").length,
            units,
          },
        });
      }
    }
    if (!stock) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    const locFilter = stock.location === "warehouse" ? "warehouse" : { $ne: "warehouse" };
    const units = await StockItem.find({
      productName: stock.productName,
      barcode: { $nin: ["N/A", null, ""] },
      location: locFilter,
    })
      .select("barcode status purchaseCost sellingPrice estimatedSalePricePerUnit purchaseDate location storage color")
      .sort({ createdAt: -1 })
      .lean();

    let finalUnits = units;
    if (finalUnits.length === 0 && stock.barcode && stock.barcode.toUpperCase() !== "N/A") {
      finalUnits = [
        {
          barcode: stock.barcode,
          storage: stock.storage || "",
          color: stock.color || "",
          status: stock.quantity > 0 ? "available" : "sold",
          purchaseCost: stock.unitPrice,
          estimatedSalePricePerUnit: stock.estimatedSalePricePerUnit ?? null,
        },
      ];
    }

    return res.status(200).json({
      success: true,
      data: {
        stockId: stock._id,
        productName: stock.productName,
        availableQuantity: stock.quantity,
        estimatedSalePricePerUnit: stock.estimatedSalePricePerUnit ?? null,
        estimatedTotalSaleValue: stock.estimatedTotalSaleValue ?? null,
        totalBarcodes: finalUnits.length,
        availableBarcodes: finalUnits.filter((u) => u.status === "available").length,
        units: finalUnits,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/stock/transfer
 * @desc    Transfer stock between Shop and Warehouse without creating supplier debt or cash movements
 */
const transferStock = async (req, res) => {
  const {
    stockId,
    barcode,
    quantity,
    sourceLocation = "shop",
    destinationLocation = "warehouse",
    notes = "",
  } = req.body;

  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({
      success: false,
      message: "Transfer quantity must be a positive integer (minimum 1).",
    });
  }

  const validLocations = ["shop", "warehouse"];
  const src = (sourceLocation || "shop").toLowerCase();
  const dest = (destinationLocation || "warehouse").toLowerCase();

  if (!validLocations.includes(src) || !validLocations.includes(dest)) {
    return res.status(400).json({
      success: false,
      message: "Invalid location. Locations must be either 'shop' or 'warehouse'.",
    });
  }

  if (src === dest) {
    return res.status(400).json({
      success: false,
      message: "Source and destination locations cannot be identical.",
    });
  }

  if (!stockId || !mongoose.Types.ObjectId.isValid(stockId)) {
    return res.status(400).json({
      success: false,
      message: "A valid stock ID is required for transfer.",
    });
  }

  let session = null;
  let useTransactions = false;
  try {
    session = await mongoose.startSession();
    if (mongoose.connection?.client?.topology?.description?.type !== "Single") {
      session.startTransaction();
      useTransactions = true;
    }
  } catch {
    useTransactions = false;
    if (session) {
      try {
        await session.endSession();
      } catch {}
      session = null;
    }
  }

  try {
    // 1. Locate source stock document
    const srcQuery = Stock.findById(stockId);
    if (useTransactions && session) srcQuery.session(session);
    const sourceStock = await srcQuery;

    if (!sourceStock) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Source stock item not found.",
      });
    }

    // Verify source location
    const actualSourceLoc = sourceStock.location || "shop";
    if (actualSourceLoc !== src) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Stock item "${sourceStock.productName}" is located in "${actualSourceLoc}", not "${src}".`,
      });
    }

    // Validate available quantity
    if (sourceStock.quantity < parsedQty) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient quantity in ${src}. Available: ${sourceStock.quantity}, requested: ${parsedQty}.`,
      });
    }

    // 2. Decrement source stock atomically
    const updateSrcQuery = Stock.findOneAndUpdate(
      { _id: sourceStock._id, quantity: { $gte: parsedQty } },
      {
        $inc: {
          quantity: -parsedQty,
          totalPrice: -Number((sourceStock.unitPrice * parsedQty).toFixed(2)),
        },
      },
      { returnDocument: "after" }
    );
    if (useTransactions && session) updateSrcQuery.session(session);
    const updatedSource = await updateSrcQuery;

    if (!updatedSource) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: `Concurrency conflict on "${sourceStock.productName}". Not enough stock remaining to transfer.`,
      });
    }

    // If source stock has reached 0 quantity (all units moved to destination), delete the depleted source stock document
    if (updatedSource.quantity <= 0) {
      const deleteSrcQuery = Stock.findByIdAndDelete(sourceStock._id);
      if (useTransactions && session) deleteSrcQuery.session(session);
      await deleteSrcQuery;
    }

    // 3. Move matching serialized StockItem units (if any exist)
    const stockItemFilter = {
      productName: sourceStock.productName,
      status: "available",
      location: src === "warehouse" ? "warehouse" : { $ne: "warehouse" },
    };
    if (barcode && barcode !== "N/A") {
      stockItemFilter.barcode = barcode;
    } else if (sourceStock.barcode && sourceStock.barcode !== "N/A") {
      stockItemFilter.barcode = sourceStock.barcode;
    }

    const itemFindQuery = StockItem.find(stockItemFilter).limit(parsedQty);
    if (useTransactions && session) itemFindQuery.session(session);
    const matchingItems = await itemFindQuery;

    const transferredItemIds = matchingItems.map((it) => it._id);
    const transferredBarcodes = matchingItems.map((it) => it.barcode).filter(Boolean);

    if (transferredItemIds.length > 0) {
      const updateItemsQuery = StockItem.updateMany(
        { _id: { $in: transferredItemIds } },
        { $set: { location: dest } }
      );
      if (useTransactions && session) updateItemsQuery.session(session);
      await updateItemsQuery;
    }

    // 4. Increment or create destination Stock record
    const destFindQuery = Stock.findOne({
      productName: sourceStock.productName,
      barcode: sourceStock.barcode,
      unitPrice: sourceStock.unitPrice,
      supplier: sourceStock.supplier,
      location: dest,
    });
    if (useTransactions && session) destFindQuery.session(session);
    let destStock = await destFindQuery;

    if (destStock) {
      const updateDestQuery = Stock.findByIdAndUpdate(
        destStock._id,
        {
          $inc: {
            quantity: parsedQty,
            totalPrice: Number((destStock.unitPrice * parsedQty).toFixed(2)),
          },
        },
        { returnDocument: "after" }
      );
      if (useTransactions && session) updateDestQuery.session(session);
      destStock = await updateDestQuery;
    } else {
      const newDestDoc = {
        productName: sourceStock.productName,
        barcode: sourceStock.barcode,
        quantity: parsedQty,
        unitPrice: sourceStock.unitPrice,
        totalPrice: Number((sourceStock.unitPrice * parsedQty).toFixed(2)),
        estimatedSalePricePerUnit: sourceStock.estimatedSalePricePerUnit ?? null,
        estimatedTotalSaleValue: sourceStock.estimatedSalePricePerUnit
          ? Number((sourceStock.estimatedSalePricePerUnit * parsedQty).toFixed(2))
          : null,
        purchaseDate: sourceStock.purchaseDate || new Date(),
        supplier: sourceStock.supplier,
        supplierName: sourceStock.supplierName,
        isLinkedToLedger: false,
        entryOrigin: sourceStock.entryOrigin || "general_intake",
        transactionRef: sourceStock.transactionRef,
        amountPaid: 0,
        amountDue: 0,
        paymentStatus: "Paid",
        location: dest,
      };

      if (useTransactions && session) {
        const [createdDest] = await Stock.create([newDestDoc], { session });
        destStock = createdDest;
      } else {
        destStock = await Stock.create(newDestDoc);
      }
    }

    // 5. Create permanent StockTransfer record
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const transferNum = `TRF-${yy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}`;

    const transferDoc = {
      transferNumber: transferNum,
      productName: sourceStock.productName,
      barcode: sourceStock.barcode,
      quantity: parsedQty,
      unitPurchaseCost: sourceStock.unitPrice,
      totalTransferCost: Number((sourceStock.unitPrice * parsedQty).toFixed(2)),
      sourceLocation: src,
      destinationLocation: dest,
      sourceStockId: sourceStock._id,
      destinationStockId: destStock._id,
      supplier: sourceStock.supplierName || "Unknown Supplier",
      transferredStockItemIds: transferredItemIds,
      transferredBarcodes: transferredBarcodes,
      notes: notes ? notes.trim() : "",
      transferDate: new Date(),
    };

    let createdTransfer = null;
    if (useTransactions && session) {
      const [t] = await StockTransfer.create([transferDoc], { session });
      createdTransfer = t;
      await session.commitTransaction();
    } else {
      createdTransfer = await StockTransfer.create(transferDoc);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully transferred ${parsedQty} unit(s) of "${sourceStock.productName}" from ${src.toUpperCase()} to ${dest.toUpperCase()}.`,
      data: {
        transfer: createdTransfer,
        sourceStock: updatedSource,
        destinationStock: destStock,
      },
    });
  } catch (error) {
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    console.error("Stock transfer error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer stock.",
    });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {}
    }
  }
};

/**
 * @route   GET /api/stock/transfers
 * @desc    Fetch historical stock transfer audit log
 */
const getStockTransfers = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const skip = (pageNum - 1) * limitNum;

    const [transfers, total] = await Promise.all([
      StockTransfer.find({})
        .sort({ transferDate: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockTransfer.countDocuments({}),
    ]);

    return res.status(200).json({
      success: true,
      data: transfers,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getStock,
  getStockStats,
  createStock,
  getStockById,
  deleteStock,
  createStockBatch,
  verifyBarcodes,
  getStockItemByBarcode,
  getProductBarcodes,
  transferStock,
  getStockTransfers,
  buildStockFilterQuery,
  STOCK_THRESHOLDS,
};

const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Return = require("../models/Return");
const StockItem = require("../models/StockItem");
const SupplierPayment = require("../models/SupplierPayment");
const Supplier = require("../models/Supplier");
const SupplierRefund = require("../models/SupplierRefund");

/**
 * Helper to extract storage/GB from product name if not explicitly set
 */
const extractSpecsFromName = (name = "") => {
  if (!name || typeof name !== "string") return { storage: "", color: "" };
  let storage = "";
  const stMatch = name.match(/\b(16|32|64|128|256|512)\s*(GB|gb)\b|\b1\s*(TB|tb)\b/i);
  if (stMatch) {
    storage = stMatch[0].toUpperCase().replace(/\s+/, "");
  }
  return { storage, color: "" };
};

/**
 * Escape regex special characters
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Parse date range (startDate, endDate)
 */
const parseDateRange = (startDate, endDate) => {
  const filter = {};
  if (startDate) {
    const sDate = new Date(startDate);
    if (!isNaN(sDate.getTime())) {
      sDate.setHours(0, 0, 0, 0);
      filter.$gte = sDate;
    }
  }
  if (endDate) {
    const eDate = new Date(endDate);
    if (!isNaN(eDate.getTime())) {
      eDate.setHours(23, 59, 59, 999);
      filter.$lte = eDate;
    }
  }
  return Object.keys(filter).length > 0 ? filter : null;
};

/**
 * Encode / Decode base64 cursor
 */
const encodeCursor = (obj) => {
  if (!obj) return null;
  return Buffer.from(JSON.stringify(obj)).toString("base64");
};

const decodeCursor = (cursorStr) => {
  if (!cursorStr || typeof cursorStr !== "string") return null;
  try {
    const jsonStr = Buffer.from(cursorStr, "base64").toString("utf8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

/**
 * @route   GET /api/history
 * @desc    Unified history stream merging Sales, Stock Intakes, Exchanges, and Returns with Cursor-based pagination
 * @query   type (all|sale|purchase|exchange|return), search, period, startDate, endDate, cursor, limit, sortBy
 */
const getUnifiedHistory = async (req, res) => {
  try {
    const {
      type = "all", // 'all' | 'sale' | 'purchase' | 'exchange' | 'return'
      search = "",
      startDate,
      endDate,
      cursor = null,
      limit = 25,
      sortBy = "newest", // 'newest' | 'oldest' | 'amount_high' | 'amount_low'
    } = req.query;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const cursorData = decodeCursor(cursor);

    const trimmedSearch = search.trim();
    const searchRegex = trimmedSearch ? new RegExp(escapeRegex(trimmedSearch), "i") : null;
    const dateRange = parseDateRange(startDate, endDate);

    // ─────────────────────────────────────────────────────────────
    // Fetch aggregated overall stats (independent of pagination/cursor)
    // ─────────────────────────────────────────────────────────────
    const dateQueryForSales = dateRange ? { createdAt: dateRange } : {};
    const dateQueryForPurchases = dateRange ? { purchaseDate: dateRange } : {};
    const dateQueryForReturns = dateRange ? { createdAt: dateRange } : {};

    const [salesStatsAgg, purchaseStatsAgg, returnStatsAgg] = await Promise.all([
      Sale.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            isExchange: { $ne: true },
            exchangeReturnNumber: { $in: [null, ""] },
            ...dateQueryForSales,
          },
        },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: "$totalAmount" },
            totalSalesCount: { $sum: 1 },
            totalProfit: { $sum: "$profit" },
            totalLoss: { $sum: "$loss" },
          },
        },
      ]),
      PurchaseInvoice.aggregate([
        { $match: { ...dateQueryForPurchases } },
        {
          $group: {
            _id: null,
            totalPurchaseAmount: { $sum: "$totalAmount" },
            totalPurchaseCount: { $sum: 1 },
            totalPaid: { $sum: "$amountPaid" },
            totalDue: { $sum: "$amountDue" },
          },
        },
      ]),
      Return.aggregate([
        { $match: { status: { $ne: "rejected" }, ...dateQueryForReturns } },
        {
          $group: {
            _id: null,
            totalRefundAmount: { $sum: "$totalRefundAmount" },
            totalReturnCount: { $sum: 1 },
            exchangeCount: {
              $sum: { $cond: [{ $eq: ["$settlementType", "exchange"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const stats = {
      totalSalesAmount: salesStatsAgg[0]?.totalSalesAmount || 0,
      totalSalesCount: salesStatsAgg[0]?.totalSalesCount || 0,
      totalProfit: salesStatsAgg[0]?.totalProfit || 0,
      totalLoss: salesStatsAgg[0]?.totalLoss || 0,
      totalExchangesCount: returnStatsAgg[0]?.exchangeCount || 0,
      totalPurchaseAmount: purchaseStatsAgg[0]?.totalPurchaseAmount || 0,
      totalPurchaseCount: purchaseStatsAgg[0]?.totalPurchaseCount || 0,
      totalPurchasePaid: purchaseStatsAgg[0]?.totalPaid || 0,
      totalPurchaseDue: purchaseStatsAgg[0]?.totalDue || 0,
      totalRefundAmount: returnStatsAgg[0]?.totalRefundAmount || 0,
      totalReturnCount: returnStatsAgg[0]?.totalReturnCount || 0,
    };

    // ─────────────────────────────────────────────────────────────
    // Query individual datasets based on type filter
    // ─────────────────────────────────────────────────────────────
    // For exchanges, the Return document with settlementType: 'exchange' is the single official record.
    // Exclude linked exchange Sale records to prevent duplicate bills on the History page.
    const fetchSales = type === "all" || type === "sale";
    const fetchPurchases = type === "all" || type === "purchase";
    const fetchReturns = type === "all" || type === "return" || type === "exchange";
    const fetchSupplierRefunds = type === "all" || type === "supplier_refund";

    // 1. Build Base Filters for Collections
    const saleBaseFilter = {
      status: { $ne: "cancelled" },
      isExchange: { $ne: true },
      exchangeReturnNumber: { $in: [null, ""] },
    };
    if (dateRange) saleBaseFilter.createdAt = dateRange;

    if (searchRegex) {
      saleBaseFilter.$or = [
        { saleNumber: searchRegex },
        { customerName: searchRegex },
        { paymentMethod: searchRegex },
        { "items.productName": searchRegex },
        { "items.barcode": searchRegex },
        { "items.soldBarcodes": searchRegex },
        { "items.barcodes": searchRegex },
      ];
    }

    const purchaseBaseFilter = {};
    if (dateRange) purchaseBaseFilter.purchaseDate = dateRange;
    if (searchRegex) {
      purchaseBaseFilter.$or = [
        { invoiceNumber: searchRegex },
        { supplier: searchRegex },
        { customerName: searchRegex },
        { paymentMethod: searchRegex },
        { "itemsSummary.productName": searchRegex },
        { "itemsSummary.barcodes": searchRegex },
      ];
    }

    const returnBaseFilter = { status: { $ne: "rejected" } };
    if (dateRange) returnBaseFilter.createdAt = dateRange;
    if (type === "exchange") {
      returnBaseFilter.settlementType = "exchange";
    } else if (type === "return") {
      returnBaseFilter.settlementType = { $ne: "exchange" };
    }

    if (searchRegex) {
      returnBaseFilter.$or = [
        { returnNumber: searchRegex },
        { saleNumber: searchRegex },
        { originalSaleNumber: searchRegex },
        { "exchangeDetails.exchangeSaleNumber": searchRegex },
        { customerName: searchRegex },
        { payoutMethod: searchRegex },
        { settlementType: searchRegex },
        { "items.productName": searchRegex },
        { "items.barcode": searchRegex },
      ];
    }

    const refundBaseFilter = { status: "completed" };
    if (dateRange) refundBaseFilter.refundDate = dateRange;
    if (searchRegex) {
      refundBaseFilter.$or = [
        { refundNumber: searchRegex },
        { supplier: searchRegex },
        { "returnedItems.productName": searchRegex },
        { "returnedItems.barcode": searchRegex },
      ];
    }

    // 2. Count Total Matching Documents for Filter Stats
    const [totalSalesCount, totalPurchasesCount, totalReturnsCount, totalSupplierRefundsCount] = await Promise.all([
      fetchSales ? Sale.countDocuments(saleBaseFilter) : Promise.resolve(0),
      fetchPurchases ? PurchaseInvoice.countDocuments(purchaseBaseFilter) : Promise.resolve(0),
      fetchReturns ? Return.countDocuments(returnBaseFilter) : Promise.resolve(0),
      fetchSupplierRefunds ? SupplierRefund.countDocuments(refundBaseFilter) : Promise.resolve(0),
    ]);
    const totalCount = totalSalesCount + totalPurchasesCount + totalReturnsCount + totalSupplierRefundsCount;

    // 3. Prepare Cursor Filters for Keyset Pagination
    let cursorDate = null;
    let cursorObjId = null;
    let cursorAmount = null;

    if (cursorData && cursorData.id) {
      cursorObjId = mongoose.Types.ObjectId.isValid(cursorData.id)
        ? new mongoose.Types.ObjectId(cursorData.id)
        : null;
      if (cursorData.date) {
        cursorDate = new Date(cursorData.date);
      }
      if (typeof cursorData.amount === "number") {
        cursorAmount = cursorData.amount;
      }
    }

    // Helper to generate cursor conditions per model
    const buildCursorQuery = (baseFilter, dateField, amountField) => {
      if (!cursorObjId) return baseFilter;

      let cursorCondition = null;
      if (sortBy === "oldest" && cursorDate) {
        cursorCondition = {
          $or: [
            { [dateField]: { $gt: cursorDate } },
            { [dateField]: cursorDate, _id: { $gt: cursorObjId } },
          ],
        };
      } else if (sortBy === "amount_high" && cursorAmount !== null) {
        cursorCondition = {
          $or: [
            { [amountField]: { $lt: cursorAmount } },
            { [amountField]: cursorAmount, _id: { $lt: cursorObjId } },
          ],
        };
      } else if (sortBy === "amount_low" && cursorAmount !== null) {
        cursorCondition = {
          $or: [
            { [amountField]: { $gt: cursorAmount } },
            { [amountField]: cursorAmount, _id: { $gt: cursorObjId } },
          ],
        };
      } else if (cursorDate) {
        // Default: newest on top
        cursorCondition = {
          $or: [
            { [dateField]: { $lt: cursorDate } },
            { [dateField]: cursorDate, _id: { $lt: cursorObjId } },
          ],
        };
      }

      if (!cursorCondition) return baseFilter;

      return {
        $and: [baseFilter, cursorCondition],
      };
    };

    // Sort order for DB queries
    let saleDbSort = { createdAt: -1, _id: -1 };
    let purchaseDbSort = { purchaseDate: -1, _id: -1 };
    let returnDbSort = { createdAt: -1, _id: -1 };

    if (sortBy === "oldest") {
      saleDbSort = { createdAt: 1, _id: 1 };
      purchaseDbSort = { purchaseDate: 1, _id: 1 };
      returnDbSort = { createdAt: 1, _id: 1 };
    } else if (sortBy === "amount_high") {
      saleDbSort = { totalAmount: -1, _id: -1 };
      purchaseDbSort = { totalAmount: -1, _id: -1 };
      returnDbSort = { totalRefundAmount: -1, _id: -1 };
    } else if (sortBy === "amount_low") {
      saleDbSort = { totalAmount: 1, _id: 1 };
      purchaseDbSort = { totalAmount: 1, _id: 1 };
      returnDbSort = { totalRefundAmount: 1, _id: 1 };
    }

    const fetchLimitPerModel = limitNum + 5; // buffer to ensure adequate items after merge
    const promises = [];

    // 1. Sales & Exchanges Query
    if (fetchSales) {
      const queryFilter = buildCursorQuery(saleBaseFilter, "createdAt", "totalAmount");
      promises.push(
        Sale.find(queryFilter)
          .populate("items.stockId", "productName storage color barcode category")
          .sort(saleDbSort)
          .limit(fetchLimitPerModel)
          .lean()
          .then(async (docs) => {
            const missingBarcodes = [];
            docs.forEach((doc) => {
              (doc.items || []).forEach((it) => {
                if (!it.storage || !it.color) {
                  if (it.barcode && it.barcode !== "N/A") missingBarcodes.push(it.barcode);
                  if (Array.isArray(it.soldBarcodes)) missingBarcodes.push(...it.soldBarcodes);
                }
              });
            });

            const stockItemMap = new Map();
            if (missingBarcodes.length > 0) {
              const matchedItems = await StockItem.find({
                barcode: { $in: missingBarcodes },
              })
                .select("barcode storage color productName")
                .lean();
              matchedItems.forEach((si) => {
                if (si.barcode) stockItemMap.set(si.barcode, si);
              });
            }

            return docs.map((doc) => {
              const isExc = Boolean(doc.isExchange);
              const itemsList = Array.isArray(doc.items) ? doc.items : [];
              const allBarcodes = [];
              itemsList.forEach((it) => {
                if (Array.isArray(it.soldBarcodes)) allBarcodes.push(...it.soldBarcodes);
                else if (Array.isArray(it.barcodes)) allBarcodes.push(...it.barcodes);
                else if (it.barcode && it.barcode.toUpperCase() !== "N/A") allBarcodes.push(it.barcode);
              });

              const isShopkeeper = Boolean(
                doc.saleSource === "shopkeeper" ||
                doc.shopkeeperId ||
                doc.shopkeeperName ||
                itemsList.some((it) => it.saleSource === "shopkeeper" || it.shopkeeperName)
              );
              const shopkeeperName =
                doc.shopkeeperName ||
                itemsList.find((it) => it.shopkeeperName)?.shopkeeperName ||
                "";

              const billDesc =
                doc.billDescription ||
                doc.description ||
                (doc.notes
                  ? doc.notes
                      .replace(/^Customer:\s*[^-\n]+(\s*-\s*)?/i, "")
                      .replace(/\(Trade-in[^\)]*\)/i, "")
                      .replace(/Original Return Value:[^\n]*/i, "")
                      .replace(/Net Difference:[^\n]*/i, "")
                      .trim()
                  : "");

              doc.billDescription = billDesc;
              doc.description = billDesc;

              return {
                _id: doc._id,
                recordType: isExc ? "exchange" : "sale",
                transactionNumber: doc.saleNumber || `SALE-${doc._id}`,
                billDescription: billDesc,
                description: billDesc,
                date: doc.createdAt || doc.saleDate,
                partyName: doc.customerName || "Walk-in Customer",
                partyType: "Customer",
                totalAmount: doc.totalAmount || 0,
                amountPaid: doc.amountPaid ?? doc.totalAmount ?? 0,
                amountDue: doc.amountDue || 0,
                profit: doc.profit || 0,
                loss: doc.loss || 0,
                paymentStatus: doc.paymentStatus || (doc.amountDue > 0 ? (doc.amountPaid > 0 ? "Partial" : "Due") : "Paid"),
                paymentMethod: doc.paymentMethod || "Cash",
                status: doc.status || "completed",
                returnStatus: doc.returnStatus || "none",
                returnedQuantity: doc.returnedQuantity || 0,
                isRefunded: Boolean(doc.status === "refunded" || doc.returnStatus === "refunded" || (doc.returnedQuantity && doc.quantity && doc.returnedQuantity >= doc.quantity)),
                saleSource: doc.saleSource || (isShopkeeper ? "shopkeeper" : "direct"),
                shopkeeperName,
                isShopkeeper,
                items: itemsList.map((it) => {
                  const bc = it.barcode && it.barcode !== "N/A" ? it.barcode : (Array.isArray(it.soldBarcodes) ? it.soldBarcodes[0] : null);
                  const matchedSi = bc ? stockItemMap.get(bc) : null;
                  const extracted = extractSpecsFromName(it.productName);

                  const resolvedStorage =
                    it.storage ||
                    it.stockId?.storage ||
                    matchedSi?.storage ||
                    doc.storage ||
                    extracted.storage ||
                    "";

                  const resolvedColor =
                    it.color ||
                    it.stockId?.color ||
                    matchedSi?.color ||
                    doc.color ||
                    "";

                  it.storage = resolvedStorage;
                  it.color = resolvedColor;
                  it.description = it.description || billDesc || "";

                  return {
                    productName: it.productName,
                    storage: resolvedStorage,
                    color: resolvedColor,
                    description: it.description || billDesc || "",
                    quantity: it.quantity || 1,
                    unitPrice: it.unitSellingPrice || it.sellingPrice || 0,
                    subtotal: it.totalAmount || (it.sellingPrice || 0) * (it.quantity || 1),
                    barcodes: it.soldBarcodes || it.barcodes || (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
                    flow: "OUT",
                    saleSource: it.saleSource || (it.shopkeeperName ? "shopkeeper" : doc.saleSource),
                    shopkeeperName: it.shopkeeperName || shopkeeperName || "",
                  };
                }),
                tradeInItem: doc.tradeInItem?.productName
                  ? {
                      productName: doc.tradeInItem.productName,
                      storage: doc.tradeInItem.storage || extractSpecsFromName(doc.tradeInItem.productName).storage || "",
                      color: doc.tradeInItem.color || "",
                      quantity: doc.tradeInItem.quantity || 1,
                      tradeInValue: doc.tradeInItem.tradeInValue || doc.tradeInItem.unitCost || 0,
                      barcodes: doc.tradeInItem.barcodes || (doc.tradeInItem.barcode ? [doc.tradeInItem.barcode] : []),
                      flow: "IN",
                    }
                  : null,
                allBarcodes: Array.from(new Set(allBarcodes)),
                rawDoc: doc,
              };
            });
          })
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    // 2. Compute latest transaction ID per party across both purchases and refunds
    let latestSupplierTxnIdSet = new Set();
    if (fetchPurchases || fetchSupplierRefunds) {
      const [latestInvoicesAgg, latestRefundsAgg] = await Promise.all([
        PurchaseInvoice.aggregate([
          { $sort: { purchaseDate: -1, createdAt: -1, _id: -1 } },
          {
            $group: {
              _id: {
                $cond: [
                  { $eq: ["$isLocalPurchase", true] },
                  { $ifNull: ["$customerId", "$customerName"] },
                  { $ifNull: ["$supplierId", "$supplier"] },
                ],
              },
              latestId: { $first: "$_id" },
              date: { $first: { $ifNull: ["$purchaseDate", "$createdAt"] } },
            },
          },
        ]),
        SupplierRefund.aggregate([
          { $match: { status: "completed" } },
          { $sort: { refundDate: -1, createdAt: -1, _id: -1 } },
          {
            $group: {
              _id: { $ifNull: ["$supplierId", "$supplier"] },
              latestId: { $first: "$_id" },
              date: { $first: { $ifNull: ["$refundDate", "$createdAt"] } },
            },
          },
        ]),
      ]);

      const partyLatestTxnMap = new Map();

      latestInvoicesAgg.forEach((inv) => {
        if (!inv._id) return;
        const key = String(inv._id).toLowerCase();
        const invDate = new Date(inv.date).getTime() || 0;
        partyLatestTxnMap.set(key, { id: String(inv.latestId), date: invDate });
      });

      latestRefundsAgg.forEach((ref) => {
        if (!ref._id) return;
        const key = String(ref._id).toLowerCase();
        const refDate = new Date(ref.date).getTime() || 0;
        const existing = partyLatestTxnMap.get(key);
        if (!existing || refDate >= existing.date) {
          partyLatestTxnMap.set(key, { id: String(ref.latestId), date: refDate });
        }
      });

      latestSupplierTxnIdSet = new Set(
        Array.from(partyLatestTxnMap.values()).map((v) => v.id)
      );
    }

    // 2. Purchase Invoices Query
    if (fetchPurchases) {
      const queryFilter = buildCursorQuery(purchaseBaseFilter, "purchaseDate", "totalAmount");

      promises.push(
        (async () => {
          const docs = await PurchaseInvoice.find(queryFilter)
            .sort(purchaseDbSort)
            .limit(fetchLimitPerModel)
            .lean();

          return Promise.all(
            docs.map(async (doc) => {
              const itemSummaries = Array.isArray(doc.itemsSummary) ? doc.itemsSummary : [];
              const allBarcodes = [];
              itemSummaries.forEach((it) => {
                if (Array.isArray(it.barcodes)) allBarcodes.push(...it.barcodes);
                else if (it.barcode && it.barcode.toUpperCase() !== "N/A") allBarcodes.push(it.barcode);
              });

              const isLocal = Boolean(doc.isLocalPurchase);
              const partyName = isLocal
                ? doc.customerName || "Local Customer"
                : doc.supplier || "Supplier";

              const isLatest = latestSupplierTxnIdSet.has(String(doc._id));
              let previousBalance = 0;
              let totalPayable = doc.totalAmount || 0;
              let totalRemainingDue = doc.amountDue || 0;

              if (isLatest) {
                const escName = escapeRegex(partyName);
                const partyInvFilter = isLocal
                  ? doc.customerId
                    ? { customerId: doc.customerId, isLocalPurchase: true }
                    : { customerName: { $regex: `^${escName}$`, $options: "i" }, isLocalPurchase: true }
                  : doc.supplierId
                  ? { supplierId: doc.supplierId, isLocalPurchase: { $ne: true } }
                  : { supplier: { $regex: `^${escName}$`, $options: "i" }, isLocalPurchase: { $ne: true } };

                const priorInvoices = await PurchaseInvoice.find({
                  ...partyInvFilter,
                  _id: { $ne: doc._id },
                  createdAt: { $lt: doc.createdAt },
                })
                  .select("totalAmount amountPaid amountDue")
                  .lean();

                const priorPurchases = priorInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0);

                const paymentQuery = isLocal
                  ? doc.customerId
                    ? { customerId: doc.customerId }
                    : { supplier: { $regex: `^${escName}$`, $options: "i" } }
                  : doc.supplierId
                  ? { supplierId: doc.supplierId }
                  : { supplier: { $regex: `^${escName}$`, $options: "i" } };

                const priorPaymentsDocs = await SupplierPayment.find({
                  ...paymentQuery,
                  createdAt: { $lt: doc.createdAt },
                })
                  .select("amount paymentType invoiceNumber")
                  .lean();

                const refundQuery = isLocal
                  ? { _id: null }
                  : doc.supplierId
                  ? { supplierId: doc.supplierId, status: "completed", createdAt: { $lt: doc.createdAt } }
                  : { supplier: { $regex: `^${escName}$`, $options: "i" }, status: "completed", createdAt: { $lt: doc.createdAt } };

                const priorRefundsDocs = isLocal
                  ? []
                  : await SupplierRefund.find(refundQuery).select("totalRefundAmount").lean();
                const priorRefunds = priorRefundsDocs.reduce((acc, r) => acc + (Number(r.totalRefundAmount) || 0), 0);

                let priorGrossPaid = 0;
                let priorRefundsReceived = 0;
                priorPaymentsDocs.forEach((p) => {
                  const amt = Number(p.amount) || 0;
                  if (p.paymentType === "Supplier Refund" || String(p.invoiceNumber || "").startsWith("SUP-RET")) {
                    priorRefundsReceived += amt;
                  } else {
                    priorGrossPaid += amt;
                  }
                });

                const netPriorPurchases = Math.max(0, Number((priorPurchases - priorRefunds).toFixed(2)));
                const netPriorPaid = Math.max(0, Number((priorGrossPaid - priorRefundsReceived).toFixed(2)));
                previousBalance = Math.max(0, Number((netPriorPurchases - netPriorPaid).toFixed(2)));

                if (previousBalance === 0 && !isLocal && doc.supplierId && priorPurchases === 0) {
                  const supDoc = await Supplier.findById(doc.supplierId).select("balance totalDue").lean();
                  if (supDoc && (supDoc.balance > 0 || supDoc.totalDue > 0)) {
                    previousBalance = Number(supDoc.balance || supDoc.totalDue || 0);
                  }
                }

                totalPayable = Number((previousBalance + (doc.totalAmount || 0)).toFixed(2));
                totalRemainingDue = Number((previousBalance + (doc.amountDue || 0)).toFixed(2));
              }

              return {
                _id: doc._id,
                recordType: "purchase",
                isLocalPurchase: isLocal,
                isLatest,
                previousBalance,
                totalPayable,
                totalRemainingDue,
                transactionNumber: doc.invoiceNumber || `INV-${doc._id}`,
                date: doc.purchaseDate || doc.createdAt,
                partyName,
                partyType: isLocal ? "Local Customer" : "Supplier",
                totalAmount: doc.totalAmount || 0,
                amountPaid: doc.amountPaid || 0,
                amountDue: doc.amountDue || 0,
                paymentStatus:
                  doc.amountDue <= 0 && doc.totalAmount > 0
                    ? "Paid"
                    : doc.amountPaid > 0
                    ? "Partial"
                    : "Due",
                paymentMethod: doc.paymentMethod || "Cash",
                items: itemSummaries.map((it) => {
                  const extracted = extractSpecsFromName(it.productName);
                  const resolvedStorage = it.storage || extracted.storage || "";
                  const resolvedColor = it.color || "";
                  it.storage = resolvedStorage;
                  it.color = resolvedColor;
                  return {
                    productName: it.productName,
                    storage: resolvedStorage,
                    color: resolvedColor,
                    quantity: it.quantity || 1,
                    unitPrice: it.unitPrice || 0,
                    subtotal: it.subtotal || (it.unitPrice || 0) * (it.quantity || 1),
                    barcodes: it.barcodes || (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
                    flow: "IN",
                  };
                }),
                tradeInItem: null,
                allBarcodes: Array.from(new Set(allBarcodes)),
                rawDoc: doc,
              };
            })
          );
        })()
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    // 3. Returns & Refunds Query
    if (fetchReturns) {
      const queryFilter = buildCursorQuery(returnBaseFilter, "createdAt", "totalRefundAmount");
      promises.push(
        Return.find(queryFilter)
          .populate({
            path: "saleId",
            select: "saleNumber saleSource shopkeeperName shopkeeperId items",
          })
          .populate({
            path: "exchangeDetails.exchangeSaleId",
            select: "saleNumber items totalAmount paymentMethod",
          })
          .sort(returnDbSort)
          .limit(fetchLimitPerModel)
          .lean()
          .then((docs) =>
            docs.map((doc) => {
              const returnItems = Array.isArray(doc.items) ? doc.items : [];
              const allBarcodes = [];
              returnItems.forEach((it) => {
                if (it.barcode && it.barcode.toUpperCase() !== "N/A") allBarcodes.push(it.barcode);
              });

              const isShopkeeper = Boolean(
                doc.saleSource === "shopkeeper" ||
                doc.shopkeeperId ||
                doc.shopkeeperName ||
                returnItems.some((it) => it.saleSource === "shopkeeper" || it.shopkeeperName) ||
                doc.saleId?.saleSource === "shopkeeper" ||
                doc.saleId?.shopkeeperName
              );

              const retShopkeeper =
                doc.shopkeeperName ||
                returnItems.find((it) => it.shopkeeperName)?.shopkeeperName ||
                doc.saleId?.shopkeeperName ||
                doc.saleId?.items?.find((it) => it.shopkeeperName)?.shopkeeperName ||
                "";

              const totalRetainedProfit = Number(
                doc.totalRetainedProfit ||
                doc.totalReturnFee ||
                doc.retainedProfit ||
                returnItems.reduce((acc, it) => acc + (Number(it.retainedProfit) || Number(it.returnFee) || 0), 0)
              );

              const originalSoldTotal = returnItems.reduce(
                (acc, it) => acc + (Number(it.originalSoldPrice) || (Number(it.unitSellingPrice || 0) * (it.returnQuantity || 1))),
                0
              );

              const excSale = doc.exchangeDetails?.exchangeSaleId;
              let exchangeItems = [];
              if (Array.isArray(doc.exchangeDetails?.exchangeItems) && doc.exchangeDetails.exchangeItems.length > 0) {
                exchangeItems = doc.exchangeDetails.exchangeItems.map((it) => {
                  const extracted = extractSpecsFromName(it.productName);
                  const st = it.storage || it.stockId?.storage || extracted.storage || "";
                  const col = it.color || it.stockId?.color || "";
                  return {
                    ...it,
                    storage: st,
                    color: col,
                  };
                });
              } else if (excSale && Array.isArray(excSale.items)) {
                exchangeItems = excSale.items.map((it) => {
                  const extracted = extractSpecsFromName(it.productName);
                  const st = it.storage || it.stockId?.storage || extracted.storage || "";
                  const col = it.color || it.stockId?.color || "";
                  return {
                    productName: it.productName,
                    storage: st,
                    color: col,
                    barcode: it.barcode || "N/A",
                    barcodes: it.soldBarcodes || it.barcodes || (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
                    quantity: it.quantity || 1,
                    sellingPrice: it.unitSellingPrice || it.sellingPrice || 0,
                    subtotal: it.totalAmount || (it.unitSellingPrice || it.sellingPrice || 0) * (it.quantity || 1),
                  };
                });
              }
              doc.exchangeItems = exchangeItems;

              return {
                _id: doc._id,
                recordType: "return",
                transactionNumber: doc.returnNumber || `RET-${doc._id}`,
                exchangeItems,
                originalSaleNumber: doc.originalSaleNumber || doc.saleNumber || "",
                date: doc.returnDate || doc.createdAt,
                partyName: doc.customerName || "Customer",
                partyType: "Customer",
                totalAmount: doc.totalRefundAmount || 0,
                amountPaid: doc.totalRefundAmount || 0,
                amountDue: 0,
                paymentStatus: "Refunded",
                paymentMethod: doc.payoutMethod || (doc.settlementType === "exchange" ? "Exchange" : doc.settlementType === "store_credit" ? "Store Credit" : "Cash"),
                settlementType: doc.settlementType || (doc.exchangeSaleId ? "exchange" : "cash"),
                retainedFee: totalRetainedProfit,
                originalSoldAmount: originalSoldTotal,
                saleSource: doc.saleSource || (isShopkeeper ? "shopkeeper" : "direct"),
                shopkeeperName: retShopkeeper,
                isShopkeeper,
                items: returnItems.map((it) => {
                  const extracted = extractSpecsFromName(it.productName);
                  const resolvedStorage = it.storage || it.stockId?.storage || extracted.storage || "";
                  const resolvedColor = it.color || it.stockId?.color || "";
                  it.storage = resolvedStorage;
                  it.color = resolvedColor;
                  return {
                    productName: it.productName,
                    storage: resolvedStorage,
                    color: resolvedColor,
                    quantity: it.returnQuantity || 1,
                    unitPrice: it.unitSellingPrice || 0,
                    subtotal: it.refundAmount || 0,
                    originalSoldPrice: it.originalSoldPrice || (Number(it.unitSellingPrice || 0) * (it.returnQuantity || 1)),
                    actualRefundedAmount: it.actualRefundedAmount || it.refundAmount || 0,
                    retainedProfit: it.retainedProfit || it.returnFee || 0,
                    barcodes: it.barcode && it.barcode !== "N/A" ? [it.barcode] : [],
                    flow: "RETURN",
                    reason: it.reason || "Customer Return",
                    saleSource: it.saleSource || (it.shopkeeperName ? "shopkeeper" : (doc.saleSource || "direct")),
                    shopkeeperName: it.shopkeeperName || retShopkeeper || "",
                  };
                }),
                tradeInItem: null,
                allBarcodes: Array.from(new Set(allBarcodes)),
                rawDoc: doc,
              };
            })
          )
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    // 4. Supplier Refunds Query
    if (fetchSupplierRefunds) {
      const queryFilter = buildCursorQuery(refundBaseFilter, "refundDate", "totalRefundAmount");
      promises.push(
        SupplierRefund.find(queryFilter)
          .sort(returnDbSort)
          .limit(fetchLimitPerModel)
          .lean()
          .then((docs) =>
            docs.map((doc) => {
              const returnedItems = Array.isArray(doc.returnedItems) ? doc.returnedItems : [];
              const allBarcodes = returnedItems.map((it) => it.barcode).filter(Boolean);

              return {
                _id: doc._id,
                id: String(doc._id),
                recordType: "supplier_refund",
                transactionNumber: doc.refundNumber,
                date: doc.refundDate || doc.createdAt,
                partyName: doc.supplier,
                partyType: "Supplier",
                totalAmount: doc.totalRefundAmount || 0,
                paymentMethod: "Supplier Return",
                isLatest: latestSupplierTxnIdSet.has(String(doc._id)),
                workflowType: doc.workflowType,
                items: returnedItems.map((it) => ({
                  productName: it.productName,
                  storage: it.storage || "",
                  color: it.color || "",
                  quantity: 1,
                  unitPrice: it.originalPurchaseCost || it.refundAmount || 0,
                  subtotal: it.refundAmount || it.originalPurchaseCost || 0,
                  barcodes: [it.barcode],
                  flow: "RETURN",
                  invoiceNumber: it.invoiceNumber,
                })),
                tradeInItem: null,
                allBarcodes,
                rawDoc: doc,
              };
            })
          )
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    const [salesList, purchasesList, returnsList, supplierRefundsList] = await Promise.all(promises);

    // Merge all lists
    let combined = [...salesList, ...purchasesList, ...returnsList, ...(supplierRefundsList || [])];

    // Sort unified collection deterministically
    if (sortBy === "oldest") {
      combined.sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return String(a._id).localeCompare(String(b._id));
      });
    } else if (sortBy === "amount_high") {
      combined.sort((a, b) => {
        const diff = (b.totalAmount || 0) - (a.totalAmount || 0);
        if (diff !== 0) return diff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    } else if (sortBy === "amount_low") {
      combined.sort((a, b) => {
        const diff = (a.totalAmount || 0) - (b.totalAmount || 0);
        if (diff !== 0) return diff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    } else {
      // Default: newest on top
      combined.sort((a, b) => {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (diff !== 0) return diff;
        return String(b._id).localeCompare(String(a._id));
      });
    }

    // Take current page slice
    const paginatedItems = combined.slice(0, limitNum);
    const hasMore = combined.length > limitNum;
    let nextCursor = null;

    if (hasMore && paginatedItems.length > 0) {
      const lastItem = paginatedItems[paginatedItems.length - 1];
      nextCursor = encodeCursor({
        date: lastItem.date,
        amount: lastItem.totalAmount,
        id: lastItem._id.toString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      pagination: {
        limit: limitNum,
        cursor: cursor || null,
        nextCursor,
        hasMore,
        totalCount,
      },
      stats,
    });
  } catch (error) {
    console.error("Unified history error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch unified transaction history.",
    });
  }
};

module.exports = {
  getUnifiedHistory,
};

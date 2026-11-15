
const mongoose = require("mongoose");
const Supplier = require("../models/Supplier");
const Customer = require("../models/Customer");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Stock = require("../models/Stock");
const StockItem = require("../models/StockItem");
const SupplierPayment = require("../models/SupplierPayment");
const Sale = require("../models/Sale");
const SupplierRefund = require("../models/SupplierRefund");

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
 * Automatically reconciles and settles any purchase invoices / stock records
 * created from trade-in / exchange sales so they never show as an unpaid remaining balance.
 */
const autoSettleTradeInInvoices = async () => {
  try {
    const exchangeSales = await Sale.find({
      $or: [
        { isExchange: true },
        { "tradeInItem.productName": { $exists: true, $ne: "" } },
      ],
    }).select("saleNumber customerName tradeInItem saleDate createdAt").lean();

    if (!exchangeSales || exchangeSales.length === 0) return;

    let modified = false;

    for (const sale of exchangeSales) {
      if (!sale.tradeInItem) continue;
      const ti = sale.tradeInItem;
      const stockId = ti.stockId;
      const custName = (sale.customerName || ti.customerName || "").trim();
      const tiVal = Number(ti.totalValue || ti.purchasePrice || 0);

      let stock = null;
      if (stockId && mongoose.Types.ObjectId.isValid(stockId)) {
        stock = await Stock.findById(stockId);
      }
      if (!stock && custName && ti.productName) {
        stock = await Stock.findOne({
          isLocalPurchase: true,
          productName: ti.productName,
          customerName: { $regex: `^${custName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        });
      }

      const totalVal = stock ? (stock.totalPrice || (stock.unitPrice * stock.quantity)) : tiVal;

      if (stock && (stock.amountDue > 0 || (stock.amountPaid || 0) < totalVal)) {
        stock.amountPaid = totalVal;
        stock.amountDue = 0;
        stock.paymentStatus = "Paid";
        await stock.save();
        modified = true;
      }

      // Find matching PurchaseInvoice
      let invoice = null;
      if (stock && stock.transactionRef) {
        invoice = await PurchaseInvoice.findOne({
          $or: [
            { standaloneReference: stock.transactionRef },
            { invoiceNumber: stock.transactionRef },
          ],
        });
      }
      if (!invoice && custName) {
        invoice = await PurchaseInvoice.findOne({
          isLocalPurchase: true,
          customerName: { $regex: `^${custName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          "itemsSummary.productName": ti.productName,
        });
      }

      if (invoice) {
        const invTotal = invoice.totalAmount || totalVal;
        if (invoice.amountDue > 0 || (invoice.amountPaid || 0) < invTotal) {
          invoice.amountPaid = invTotal;
          invoice.amountDue = 0;
          invoice.paymentStatus = "paid";
          if (Array.isArray(invoice.itemsSummary)) {
            invoice.itemsSummary.forEach((it) => {
              it.amountPaid = it.subtotal || (it.unitPrice * it.quantity);
              it.amountDue = 0;
            });
          }
          await invoice.save();
          modified = true;
        }

        // Ensure SupplierPayment exists
        const paymentExists = await SupplierPayment.findOne({
          $or: [
            { invoiceNumber: invoice.invoiceNumber },
            { invoiceNumber: invoice.standaloneReference },
            ...(stock?.transactionRef ? [{ invoiceNumber: stock.transactionRef }] : []),
          ],
        });

        if (!paymentExists && invTotal > 0) {
          await SupplierPayment.create({
            supplier: custName || invoice.customerName || invoice.supplier,
            customerId: invoice.customerId || null,
            amount: invTotal,
            paymentDate: invoice.purchaseDate || invoice.createdAt || sale.saleDate || sale.createdAt || new Date(),
            paymentMethod: "Trade-in Credit",
            paymentType: "Upfront Payment",
            invoiceNumber: invoice.invoiceNumber || invoice.standaloneReference || "EXCHANGE-SETTLEMENT",
            notes: `Trade-in exchange credit applied towards sale #${sale.saleNumber || ""}`.trim(),
            status: "Completed",
          });
          modified = true;
        }
      }
    }
  } catch (err) {
    console.error("Auto settle trade in invoices error:", err);
  }
};
/**
 * Deduplication helper - safely disabled to preserve all records and ledger integrity.
 */
const deduplicateSuppliersAndCustomers = async () => {
  // Destructive deduplication disabled: records must never be merged or deleted just because names match.
  return;
};

/**
 * @route   GET /api/suppliers
 * @desc    Get suppliers and customers with optional search and financial ledger metrics
 * @query   limit (default 100), cursor, search, withStats (default true), suppliersOnly, type
 */
const getSuppliers = async (req, res) => {
  try {
    await autoSettleTradeInInvoices();

    const { limit = 100, cursor, search, withStats = "true", suppliersOnly, type } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);

    const baseFilter = {};
    if (suppliersOnly === "true" || type === "supplier") {
      baseFilter.type = { $ne: "customer" };
    }
    if (type === "customer") {
      baseFilter.type = "customer";
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const cleanSearch = search.trim();
      const escaped = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tokens = cleanSearch.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const subseqTokens = cleanSearch.split(/\s+/).filter(Boolean).map((t) => {
        return t.split("").map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      });

      const orConditions = [{ name: { $regex: escaped, $options: "i" } }];
      if (tokens.length > 0) {
        orConditions.push({ $and: tokens.map((t) => ({ name: { $regex: t, $options: "i" } })) });
      }
      if (subseqTokens.length > 0) {
        orConditions.push({ $and: subseqTokens.map((st) => ({ name: { $regex: st, $options: "i" } })) });
      }
      baseFilter.$or = orConditions;
    }

    // 1. Fetch registered suppliers from Supplier collection & existing customers
    const shouldFetchCustomers = suppliersOnly !== "true" && type !== "supplier";

    const customerFilter = {};
    if (search && typeof search === "string" && search.trim() !== "") {
      const cleanSearch = search.trim();
      const escaped = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      customerFilter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
      ];
    }

const parseTime = (dateVal) => {
  if (!dateVal) return 0;
  const t = new Date(dateVal).getTime();
  return isNaN(t) ? 0 : t;
};

const sanitizeTime = (timeVal, fallbackVal) => {
  const t = parseTime(timeVal);
  if (t <= 0) return 0;
  if (t > Date.now()) {
    return parseTime(fallbackVal) || 0;
  }
  return t;
};

    const [suppliers, rawExistingCustomers, allWholesaleSuppliers] = await Promise.all([
      Supplier.find(baseFilter).sort({ name: 1 }).lean(),
      shouldFetchCustomers ? Customer.find(customerFilter).sort({ name: 1 }).lean() : Promise.resolve([]),
      Supplier.find({ type: { $ne: "customer" } }).select("_id name").lean(),
    ]);

    const wholesaleSupplierNames = new Set(
      allWholesaleSuppliers.map((s) => (s.name || "").trim().toLowerCase()).filter(Boolean)
    );
    const wholesaleSupplierIdSet = new Set(allWholesaleSuppliers.map((s) => String(s._id)));

    // Preserve all existing customer records as distinct entities
    const existingCustomers = rawExistingCustomers;

    const customerNamesSet = new Set(
      existingCustomers.map((c) => (c.name || "").trim().toLowerCase()).filter(Boolean)
    );
    const supplierObjectIds = suppliers.map((s) => s._id);
    const supplierNames = suppliers.map((s) => s.name).filter(Boolean);
    const customerObjectIds = existingCustomers.map((c) => c._id);
    const customerNames = existingCustomers.map((c) => c.name).filter(Boolean);

    const customerIdSet = new Set(existingCustomers.map((c) => String(c._id)));
    const customerNameToId = new Map();
    existingCustomers.forEach((c) => {
      const nLower = (c.name || "").trim().toLowerCase();
      if (nLower) customerNameToId.set(nLower, String(c._id));
    });

    const supplierIdSet = new Set(suppliers.map((s) => String(s._id)));
    const supplierNameToId = new Map();
    suppliers.forEach((s) => {
      const nLower = (s.name || "").trim().toLowerCase();
      if (nLower) supplierNameToId.set(nLower, String(s._id));
    });

    // 2. Aggregate financial ledger metrics for suppliers and payment activity
    const [invoiceStats, stockStats, rawPayments, allSupplierRefunds] = await Promise.all([
      PurchaseInvoice.aggregate([
        {
          $match: {
            $or: [
              { isLinkedToLedger: true, supplierId: { $in: supplierObjectIds } },
              { supplierId: { $in: supplierObjectIds } },
              { isLocalPurchase: { $ne: true }, supplier: { $in: supplierNames } },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$supplierId", { $toLower: "$supplier" }] },
            totalOrders: { $sum: 1 },
            totalPurchases: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
            totalDue: { $sum: { $ifNull: ["$amountDue", 0] } },
            totalUnits: { $sum: { $ifNull: ["$totalQuantity", 0] } },
            lastPurchaseDate: {
              $max: {
                $ifNull: ["$updatedAt", { $ifNull: ["$createdAt", "$purchaseDate"] }],
              },
            },
          },
        },
      ]),
      Stock.aggregate([
        {
          $match: {
            $or: [
              { isLinkedToLedger: true, supplier: { $in: supplierObjectIds } },
              { supplier: { $in: supplierObjectIds } },
              { isLocalPurchase: { $ne: true }, supplierName: { $in: supplierNames } },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$supplier", { $toLower: "$supplierName" }] },
            stockCount: { $sum: 1 },
            stockUnits: { $sum: { $ifNull: ["$quantity", 0] } },
            stockValue: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$quantity", 0] },
                  { $ifNull: ["$unitPrice", 0] },
                ],
              },
            },
            stockPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
            stockDue: { $sum: { $ifNull: ["$amountDue", 0] } },
            lastStockDate: {
              $max: {
                $ifNull: ["$updatedAt", { $ifNull: ["$createdAt", "$purchaseDate"] }],
              },
            },
          },
        },
      ]),
      SupplierPayment.find({})
        .select("supplier supplierId customerId amount paymentType paymentDate createdAt updatedAt")
        .lean(),
      SupplierRefund.find({ status: "completed" })
        .select("supplier supplierId totalRefundAmount totalQuantity")
        .lean(),
    ]);

    const invoiceStatsMap = new Map();
    if (Array.isArray(invoiceStats)) {
      invoiceStats.forEach((s) => {
        if (s && s._id) {
          invoiceStatsMap.set(String(s._id), s);
          if (typeof s._id === "string") {
            invoiceStatsMap.set(s._id.toLowerCase(), s);
          }
        }
      });
    }

    const stockStatsMap = new Map();
    if (Array.isArray(stockStats)) {
      stockStats.forEach((s) => {
        if (s && s._id) {
          stockStatsMap.set(String(s._id), s);
          if (typeof s._id === "string") {
            stockStatsMap.set(s._id.toLowerCase(), s);
          }
        }
      });
    }

    const supplierRefundsMap = new Map();
    if (Array.isArray(allSupplierRefunds)) {
      allSupplierRefunds.forEach((r) => {
        const amt = Number(r.totalRefundAmount) || 0;
        const qty = Number(r.totalQuantity) || 0;
        const keys = new Set();
        if (r.supplierId) keys.add(String(r.supplierId));
        const sNameLower = (r.supplier || "").trim().toLowerCase();
        if (sNameLower) {
          keys.add(sNameLower);
          if (supplierNameToId.has(sNameLower)) {
            keys.add(String(supplierNameToId.get(sNameLower)));
          }
        }
        for (const k of keys) {
          const cur = supplierRefundsMap.get(k) || { totalRefundAmount: 0, totalRefundQuantity: 0 };
          cur.totalRefundAmount += amt;
          cur.totalRefundQuantity += qty;
          supplierRefundsMap.set(k, cur);
        }
      });
    }

    // Accumulate payments cleanly per entity ID to guarantee NO double-counting
    const customerPaymentsMap = new Map();
    const supplierPaymentsMap = new Map();

    const recordPayment = (map, entityId, pAmt, pDate, isRefund = false) => {
      if (!entityId) return;
      const key = String(entityId);
      const entry = map.get(key) || { totalPaid: 0, refundsReceived: 0, lastPaymentDate: null };
      if (isRefund) {
        entry.refundsReceived = Number((entry.refundsReceived + pAmt).toFixed(2));
      } else {
        entry.totalPaid = Number((entry.totalPaid + pAmt).toFixed(2));
      }
      if (pDate && (!entry.lastPaymentDate || parseTime(entry.lastPaymentDate) < parseTime(pDate))) {
        entry.lastPaymentDate = pDate;
      }
      map.set(key, entry);
    };

    if (Array.isArray(rawPayments)) {
      rawPayments.forEach((p) => {
        const pAmt = Number(p.amount) || 0;
        const isRefund = p.paymentType === "Supplier Refund";
        const pTime = Math.max(
          parseTime(p.updatedAt),
          parseTime(p.createdAt),
          sanitizeTime(p.paymentDate, p.createdAt)
        );
        const pDate = pTime > 0 ? new Date(pTime) : null;

        // 1. Check if payment explicitly belongs to a customer
        if (p.customerId && customerIdSet.has(String(p.customerId))) {
          recordPayment(customerPaymentsMap, String(p.customerId), pAmt, pDate, isRefund);
          return;
        }

        // 2. Check if payment explicitly belongs to a supplier
        if (p.supplierId && (supplierIdSet.has(String(p.supplierId)) || wholesaleSupplierIdSet.has(String(p.supplierId)))) {
          recordPayment(supplierPaymentsMap, String(p.supplierId), pAmt, pDate, isRefund);
          return;
        }

        // 3. Fallback: match by name
        const nameLower = (p.supplier || "").trim().toLowerCase();
        if (nameLower) {
          if (wholesaleSupplierNames.has(nameLower) || supplierNameToId.has(nameLower)) {
            recordPayment(supplierPaymentsMap, supplierNameToId.get(nameLower) || nameLower, pAmt, pDate, isRefund);
          } else if (customerNameToId.has(nameLower)) {
            recordPayment(customerPaymentsMap, customerNameToId.get(nameLower), pAmt, pDate, isRefund);
          }
        }
      });
    }

    // 3. Map metrics for suppliers
    const enrichedSuppliers = suppliers
      .filter((sup) => {
        if (suppliersOnly === "true" || type === "supplier") {
          if (sup.type === "customer") return false;
        }
        return true;
      })
      .map((sup) => {
        const supIdStr = String(sup._id);
        const invData = invoiceStatsMap.get(supIdStr);
        const stockData = stockStatsMap.get(supIdStr);
        const payData = supplierPaymentsMap.get(supIdStr);

        const isCustomer = sup.type === "customer";
        const effectiveType = isCustomer ? "customer" : (sup.type || "supplier");

        let grossPurchases = 0;
        let grossUnits = 0;
        let totalOrders = 0;
        let lastPurchaseDate = sup.createdAt;

        if (invData) {
          grossPurchases = Number((invData.totalPurchases || 0).toFixed(2));
          grossUnits = invData.totalUnits || 0;
          totalOrders = invData.totalOrders || 0;
          lastPurchaseDate = invData.lastPurchaseDate || sup.createdAt;
        } else if (stockData) {
          grossPurchases = Number((stockData.stockValue || 0).toFixed(2));
          grossUnits = stockData.stockUnits || 0;
          totalOrders = stockData.stockCount || 0;
          lastPurchaseDate = stockData.lastStockDate || sup.createdAt;
        }

        const refData = supplierRefundsMap.get(supIdStr) ||
          supplierRefundsMap.get((sup.name || "").trim().toLowerCase()) ||
          { totalRefundAmount: 0, totalRefundQuantity: 0 };

        const totalPurchases = Number((grossPurchases - refData.totalRefundAmount).toFixed(2));
        const totalUnits = Math.max(0, grossUnits - refData.totalRefundQuantity);

        let grossPaid = payData ? payData.totalPaid : (invData?.totalPaid || stockData?.stockPaid || 0);
        let refundsRec = payData ? payData.refundsReceived : 0;
        let totalPaid = Number((grossPaid - refundsRec).toFixed(2));

        let totalDue = Number((totalPurchases - totalPaid).toFixed(2));

        let lastPaymentDate = null;
        if (payData && payData.lastPaymentDate) {
          lastPaymentDate = payData.lastPaymentDate;
        }

        const candidateTimes = [
          parseTime(sup.updatedAt),
          parseTime(sup.createdAt),
          sanitizeTime(lastPurchaseDate, sup.updatedAt || sup.createdAt),
          sanitizeTime(lastPaymentDate, sup.updatedAt || sup.createdAt),
        ].filter((t) => t > 0);

        const maxTime = candidateTimes.length > 0 ? Math.max(...candidateTimes) : parseTime(sup.createdAt);
        const lastActivityDate = new Date(maxTime || 0);

        return {
          _id: sup._id,
          name: sup.name,
          type: effectiveType,
          isCustomer,
          totalPurchases,
          totalPaid,
          totalDue,
          totalUnits,
          totalOrders,
          lastPurchaseDate,
          lastPaymentDate,
          lastActivityDate,
          updatedAt: sup.updatedAt || sup.createdAt,
          paymentStatus: totalDue === 0 ? "Settled" : totalDue > 0 ? (totalPaid > 0 ? "Partial" : "Due") : "Credit",
          createdAt: sup.createdAt,
        };
      });

    // 4. Map metrics for customers if not suppliersOnly
    let enrichedCustomers = [];
    if (shouldFetchCustomers) {
      const customerIds = existingCustomers.map((c) => c._id);
      const customerNames = existingCustomers.map((c) => c.name).filter(Boolean);

      const [customerInvoiceStats, customerStockStats] = await Promise.all([
        PurchaseInvoice.aggregate([
          {
            $match: {
              $or: [
                { customerId: { $in: customerIds } },
                { isLocalPurchase: true },
                { customerName: { $in: customerNames } },
              ],
            },
          },
          {
            $group: {
              _id: {
                $ifNull: ["$customerId", { $toLower: { $ifNull: ["$customerName", "$supplier"] } }],
              },
              totalOrders: { $sum: 1 },
              totalPurchases: { $sum: { $ifNull: ["$totalAmount", 0] } },
              totalPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
              totalDue: { $sum: { $ifNull: ["$amountDue", 0] } },
              totalUnits: { $sum: { $ifNull: ["$totalQuantity", 0] } },
              lastPurchaseDate: {
                $max: {
                  $ifNull: ["$updatedAt", { $ifNull: ["$createdAt", "$purchaseDate"] }],
                },
              },
            },
          },
        ]),
        Stock.aggregate([
          {
            $match: {
              $or: [
                { customerId: { $in: customerIds } },
                { isLocalPurchase: true },
                { customerName: { $in: customerNames } },
              ],
            },
          },
          {
            $group: {
              _id: {
                $ifNull: ["$customerId", { $toLower: { $ifNull: ["$customerName", "$supplierName"] } }],
              },
              stockCount: { $sum: 1 },
              stockUnits: { $sum: { $ifNull: ["$quantity", 0] } },
              stockValue: {
                $sum: {
                  $multiply: [
                    { $ifNull: ["$quantity", 0] },
                    { $ifNull: ["$unitPrice", 0] },
                  ],
                },
              },
              stockPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
              stockDue: { $sum: { $ifNull: ["$amountDue", 0] } },
              lastStockDate: {
                $max: {
                  $ifNull: ["$updatedAt", { $ifNull: ["$createdAt", "$purchaseDate"] }],
                },
              },
            },
          },
        ]),
      ]);

      const custInvoiceStatsMap = new Map();
      if (Array.isArray(customerInvoiceStats)) {
        customerInvoiceStats.forEach((s) => {
          if (s && s._id) {
            custInvoiceStatsMap.set(String(s._id), s);
            if (typeof s._id === "string") {
              custInvoiceStatsMap.set(s._id.toLowerCase(), s);
            }
          }
        });
      }

      const custStockStatsMap = new Map();
      if (Array.isArray(customerStockStats)) {
        customerStockStats.forEach((s) => {
          if (s && s._id) {
            custStockStatsMap.set(String(s._id), s);
            if (typeof s._id === "string") {
              custStockStatsMap.set(s._id.toLowerCase(), s);
            }
          }
        });
      }

      enrichedCustomers = existingCustomers.map((cust) => {
          const custIdStr = String(cust._id);

          const invData = custInvoiceStatsMap.get(custIdStr);
          const stData = custStockStatsMap.get(custIdStr);
          const payData = customerPaymentsMap.get(custIdStr);

          let totalPurchases = 0;
          let totalPaid = 0;
          let totalDue = 0;
          let totalUnits = 0;
          let totalOrders = 0;
          let lastPurchaseDate = cust.createdAt;

          if (invData) {
            totalPurchases = Number((invData.totalPurchases || 0).toFixed(2));
            totalUnits = invData.totalUnits || 0;
            totalOrders = invData.totalOrders || 0;
            lastPurchaseDate = invData.lastPurchaseDate || cust.createdAt;
          } else if (stData) {
            totalPurchases = Number((stData.stockValue || 0).toFixed(2));
            totalUnits = stData.stockUnits || 0;
            totalOrders = stData.stockCount || 0;
            lastPurchaseDate = stData.lastStockDate || cust.createdAt;
          }

          if (payData && payData.totalPaid > 0) {
            totalPaid = Number(payData.totalPaid.toFixed(2));
          } else {
            const pInv = invData?.totalPaid || 0;
            const pStk = stData?.stockPaid || 0;
            if (pInv > 0) totalPaid = Number(pInv.toFixed(2));
            else if (pStk > 0) totalPaid = Number(pStk.toFixed(2));
          }

          totalDue = Number((totalPurchases - totalPaid).toFixed(2));

          let lastPaymentDate = null;
          if (payData?.lastPaymentDate) {
            lastPaymentDate = payData.lastPaymentDate;
          }

          // If customer has a store credit balance (shopkeeper owes customer from returns)
          if (cust.balance && cust.balance > 0) {
            totalDue = Number((totalDue + cust.balance).toFixed(2));
          }

          const candidateTimes = [
            parseTime(cust.updatedAt),
            parseTime(cust.createdAt),
            sanitizeTime(lastPurchaseDate, cust.updatedAt || cust.createdAt),
            sanitizeTime(lastPaymentDate, cust.updatedAt || cust.createdAt),
          ].filter((t) => t > 0);

          const maxTime = candidateTimes.length > 0 ? Math.max(...candidateTimes) : parseTime(cust.createdAt);
          const lastActivityDate = new Date(maxTime || 0);

          return {
            _id: cust._id,
            name: cust.name,
            type: "customer",
            isCustomer: true,
            phone: cust.phone || "",
            totalPurchases,
            totalPaid,
            totalDue,
            totalUnits,
            totalOrders,
            lastPurchaseDate,
            lastPaymentDate,
            lastActivityDate,
            updatedAt: cust.updatedAt || cust.createdAt,
            paymentStatus: totalDue === 0 ? "Settled" : totalDue > 0 ? (totalPaid > 0 ? "Partial" : "Due") : "Credit",
            createdAt: cust.createdAt,
          };
        });
    }

    // Combine suppliers and customers based on requested type preserving distinct entities
    let enrichedList = [];
    if (type === "customer") {
      const seenIds = new Set();
      const list = [];
      for (const c of enrichedCustomers) {
        const idStr = String(c._id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          list.push(c);
        }
      }
      for (const s of enrichedSuppliers.filter((s) => s.isCustomer || s.type === "customer")) {
        const idStr = String(s._id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          list.push(s);
        }
      }
      enrichedList = list;
    } else if (suppliersOnly === "true" || type === "supplier") {
      enrichedList = enrichedSuppliers.filter((s) => !s.isCustomer && s.type !== "customer");
    } else {
      const seenIds = new Set();
      const list = [];
      for (const s of enrichedSuppliers) {
        const idStr = String(s._id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          list.push(s);
        }
      }
      for (const c of enrichedCustomers) {
        const idStr = String(c._id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          list.push(c);
        }
      }
      enrichedList = list;
    }

    // Sort logic
    if (search && typeof search === "string" && search.trim() !== "") {
      const qLower = search.trim().toLowerCase();
      const getScore = (name) => {
        const nLower = (name || "").toLowerCase();
        if (nLower === qLower) return 0;
        if (nLower.startsWith(qLower)) return 1;
        const words = nLower.split(/\s+/);
        if (words.some((w) => w.startsWith(qLower))) return 2;
        if (nLower.includes(qLower)) return 3;
        return 4;
      };

      enrichedList.sort((a, b) => {
        const scoreA = getScore(a.name);
        const scoreB = getScore(b.name);
        if (scoreA !== scoreB) return scoreA - scoreB;
        const timeA = parseTime(a.lastActivityDate) || parseTime(a.updatedAt) || parseTime(a.createdAt);
        const timeB = parseTime(b.lastActivityDate) || parseTime(b.updatedAt) || parseTime(b.createdAt);
        if (timeB !== timeA) return timeB - timeA;
        return a.name.localeCompare(b.name);
      });
    } else {
      // Sort by newest activity / creation / modification date DESCENDING (newest on top)
      enrichedList.sort((a, b) => {
        const timeA = parseTime(a.lastActivityDate) || parseTime(a.updatedAt) || parseTime(a.createdAt);
        const timeB = parseTime(b.lastActivityDate) || parseTime(b.updatedAt) || parseTime(b.createdAt);
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        return a.name.localeCompare(b.name);
      });
    }

    const finalData = limitNum ? enrichedList.slice(0, limitNum) : enrichedList;

    const responsePayload = {
      success: true,
      data: finalData,
      count: finalData.length,
      totalCount: enrichedList.length,
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Error in getSuppliers controller:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve suppliers.",
    });
  }
};

/**
 * @route   GET /api/suppliers/:identifier/history
 * @desc    Get complete purchase and payment history for a specific supplier or customer by name or ID
 */
const getSupplierHistory = async (req, res) => {
  try {
    const { identifier } = req.params;
    if (!identifier) {
      return res.status(400).json({ success: false, message: "Supplier identifier is required" });
    }

    await autoSettleTradeInInvoices();

    let supplierDoc = null;
    let customerDoc = null;
    let supplierName = "";
    let isCustomer = false;

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      supplierDoc = await Supplier.findById(identifier).lean();
      if (supplierDoc) {
        supplierName = supplierDoc.name;
        isCustomer = supplierDoc.type === "customer";
      } else {
        customerDoc = await Customer.findById(identifier).lean();
        if (customerDoc) {
          supplierName = customerDoc.name;
          isCustomer = true;
        }
      }
    }

    if (!supplierDoc && !customerDoc) {
      try {
        supplierName = decodeURIComponent(identifier).trim();
      } catch {
        supplierName = (identifier || "").trim();
      }

      supplierDoc = await Supplier.findOne({
        name: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      }).lean();

      if (supplierDoc) {
        supplierName = supplierDoc.name;
        isCustomer = supplierDoc.type === "customer";
      } else {
        customerDoc = await Customer.findOne({
          name: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        }).lean();
        if (customerDoc) {
          supplierName = customerDoc.name;
          isCustomer = true;
        }
      }
    }

    if (!supplierDoc && !customerDoc) {
      const invoiceExists = await PurchaseInvoice.findOne({
        $or: [
          { customerName: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
          { supplier: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
        ],
      }).lean();

      if (invoiceExists) {
        isCustomer = invoiceExists.isLocalPurchase || Boolean(invoiceExists.customerName);
      } else {
        return res.status(404).json({ success: false, message: "Supplier or customer not found in directory" });
      }
    }

    const supplierId = supplierDoc?._id || null;
    const customerId = customerDoc?._id || null;

    // 1. Fetch PurchaseInvoices for this entity strictly by ID when present
    const escName = supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const invoiceQuery = isCustomer
      ? customerId
        ? { customerId }
        : {
            customerId: null,
            customerName: { $regex: `^${escName}$`, $options: "i" },
          }
      : supplierId
        ? {
            $or: [
              { supplierId },
              { supplier: { $regex: `^${escName}$`, $options: "i" } },
            ],
          }
        : {
            supplierId: null,
            isLocalPurchase: { $ne: true },
            supplier: { $regex: `^${escName}$`, $options: "i" },
          };

    const invoices = await PurchaseInvoice.find(invoiceQuery)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();

    // 2. Fetch Stock records explicitly linked to this entity strictly by ID when present
    const stockQuery = isCustomer
      ? customerId
        ? { customerId }
        : {
            customerId: null,
            customerName: { $regex: `^${escName}$`, $options: "i" },
          }
      : supplierId
        ? { supplier: supplierId }
        : {
            supplier: null,
            isLocalPurchase: { $ne: true },
            supplierName: { $regex: `^${escName}$`, $options: "i" },
          };

    const stockRecords = await Stock.find(stockQuery)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();

    // 3. Flatten purchased line items / materials
    const itemsList = [];

    const invoiceIds = invoices.map((inv) => inv._id);
    const invoiceRefs = invoices.map((inv) => inv.standaloneReference).filter(Boolean);
    const stockItemsForInvoices = await StockItem.find({
      $or: [
        { invoiceId: { $in: invoiceIds } },
        ...(invoiceRefs.length > 0 ? [{ transactionRef: { $in: invoiceRefs } }] : []),
      ],
      barcode: { $nin: ["N/A", null, ""] },
    })
      .select("invoiceId transactionRef productName barcode")
      .lean();

    const stockItemsMap = new Map();
    for (const si of stockItemsForInvoices) {
      const invKey = (si.invoiceId || si.transactionRef || "").toString();
      const prodKey = (si.productName || "").trim().toLowerCase();
      const combinedKey = `${invKey}_${prodKey}`;
      if (!stockItemsMap.has(combinedKey)) {
        stockItemsMap.set(combinedKey, []);
      }
      stockItemsMap.get(combinedKey).push(si.barcode);
    }

    for (const inv of invoices) {
      if (Array.isArray(inv.itemsSummary)) {
        for (const it of inv.itemsSummary) {
          const invKey = inv._id.toString();
          const prodKey = (it.productName || "").trim().toLowerCase();
          const combinedKey = `${invKey}_${prodKey}`;
          const fallbackBarcodes = stockItemsMap.get(combinedKey) || [];
          const combinedBarcodes = Array.from(
            new Set([
              ...(Array.isArray(it.barcodes) ? it.barcodes : []),
              ...fallbackBarcodes,
            ].filter((b) => b && b.toUpperCase() !== "N/A"))
          );

          itemsList.push({
            id: `${inv._id}_${it.productName}_${it.unitPrice}`,
            invoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber,
            productName: it.productName,
            category: it.category || "General",
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalCost: it.subtotal != null ? it.subtotal : Number((it.unitPrice * it.quantity).toFixed(2)),
            amountPaid: it.amountPaid != null ? it.amountPaid : (inv.amountPaid != null ? inv.amountPaid : it.subtotal),
            amountDue:
              it.amountDue != null
                ? it.amountDue
                : (inv.amountDue != null ? inv.amountDue : Math.max(0, (it.subtotal || 0) - (it.amountPaid || 0))),
            paymentStatus:
              (it.amountDue != null ? it.amountDue : inv.amountDue) <= 0
                ? "Paid"
                : (it.amountPaid != null ? it.amountPaid : inv.amountPaid) > 0
                  ? "Partial"
                  : "Due",
            purchaseDate: inv.purchaseDate || inv.createdAt,
            barcodes: combinedBarcodes,
          });
        }
      }
    }

    // If no invoices exist but standalone stock records exist
    if (itemsList.length === 0 && stockRecords.length > 0) {
      for (const st of stockRecords) {
        itemsList.push({
          id: st._id.toString(),
          invoiceId: null,
          invoiceNumber: "STOCK-ENTRY",
          productName: st.productName,
          category: "General",
          quantity: st.quantity,
          unitPrice: st.unitPrice,
          totalCost: st.totalPrice || Number((st.unitPrice * st.quantity).toFixed(2)),
          amountPaid: st.amountPaid || 0,
          amountDue:
            st.amountDue != null
              ? st.amountDue
              : Math.max(0, (st.totalPrice || 0) - (st.amountPaid || 0)),
          paymentStatus: st.paymentStatus || (st.amountDue <= 0 ? "Paid" : "Due"),
          purchaseDate: st.purchaseDate || st.createdAt,
          barcodes: [st.barcode],
        });
      }
    }

    // 4. Calculate overall financial summary
    let grossPurchases = 0;
    let grossUnits = 0;

    if (invoices.length > 0) {
      invoices.forEach((inv) => {
        grossPurchases += inv.totalAmount || 0;
        grossUnits += inv.totalQuantity || 0;
      });
    } else {
      itemsList.forEach((it) => {
        grossPurchases += it.totalCost || 0;
        grossUnits += it.quantity || 0;
      });
    }

    grossPurchases = Number(grossPurchases.toFixed(2));

    // Fetch supplier refunds for this supplier to accurately compute net purchases and returned units
    const refundQuery = isCustomer
      ? (customerId
          ? { $or: [{ customerId }, { supplier: { $regex: `^${escName}$`, $options: "i" } }], status: "completed" }
          : { supplier: { $regex: `^${escName}$`, $options: "i" }, status: "completed" })
      : (supplierId
          ? { $or: [{ supplierId }, { supplier: { $regex: `^${escName}$`, $options: "i" } }], status: "completed" }
          : { supplier: { $regex: `^${escName}$`, $options: "i" }, status: "completed" });

    const supplierRefunds = await SupplierRefund.find(refundQuery).sort({ refundDate: -1, createdAt: -1 }).lean();
    const totalRefundedAmount = supplierRefunds.reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);
    const totalRefundedUnits = supplierRefunds.reduce((sum, r) => sum + (Number(r.totalQuantity) || 0), 0);

    // Append returned / refunded materials into itemsList so they are visible in the Materials tab
    for (const ref of supplierRefunds) {
      if (Array.isArray(ref.returnedItems)) {
        for (const ret of ref.returnedItems) {
          itemsList.push({
            id: `refund_${ref._id}_${ret.barcode || ret.stockItemId || Math.random()}`,
            invoiceId: ret.invoiceId || null,
            invoiceNumber: ref.refundNumber,
            productName: ret.productName,
            category: ret.category || "General",
            quantity: 1,
            unitPrice: ret.refundAmount != null ? ret.refundAmount : (ret.originalPurchaseCost || 0),
            totalCost: ret.refundAmount != null ? ret.refundAmount : (ret.originalPurchaseCost || 0),
            amountPaid: 0,
            amountDue: 0,
            paymentStatus: "Refunded",
            isRefund: true,
            purchaseDate: ref.refundDate || ref.createdAt,
            barcodes: ret.barcode ? [ret.barcode] : [],
            storage: ret.storage || "",
            color: ret.color || "",
          });
        }
      }
    }

    // Sort materials newest first
    itemsList.sort((a, b) => {
      const timeA = new Date(a.purchaseDate || 0).getTime();
      const timeB = new Date(b.purchaseDate || 0).getTime();
      return timeB - timeA;
    });

    const totalPurchases = Number((grossPurchases - totalRefundedAmount).toFixed(2));
    const totalUnits = Math.max(0, grossUnits - totalRefundedUnits);

    // 5. Payment Disbursement History (Real-world transactions ledger)
    const paymentQuery = isCustomer
      ? customerId
        ? { $or: [{ customerId }, { supplier: { $regex: `^${escName}$`, $options: "i" } }] }
        : {
            customerId: null,
            supplierId: null,
            supplier: { $regex: `^${escName}$`, $options: "i" },
          }
      : supplierId
        ? { $or: [{ supplierId }, { supplier: { $regex: `^${escName}$`, $options: "i" } }] }
        : {
            supplierId: null,
            customerId: null,
            supplier: { $regex: `^${escName}$`, $options: "i" },
          };

    let rawPayments = await SupplierPayment.find(paymentQuery)
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    // Calculate totalPaid from actual SupplierPayment transactions
    let grossPaid = 0;
    let totalRefundsReceived = 0;

    if (rawPayments && rawPayments.length > 0) {
      rawPayments.forEach((p) => {
        const amt = Number(p.amount) || 0;
        if (p.paymentType === "Supplier Refund" || String(p.invoiceNumber || "").startsWith("SUP-RET")) {
          totalRefundsReceived += amt;
        } else {
          grossPaid += amt;
        }
      });
    } else {
      // Fallback for legacy records created prior to dedicated SupplierPayment tracking
      if (invoices.length > 0) {
        grossPaid = invoices.reduce((sum, inv) => sum + (Number(inv.amountPaid) || 0), 0);
      } else {
        grossPaid = itemsList.filter((it) => !it.isRefund).reduce((sum, it) => sum + (Number(it.amountPaid) || 0), 0);
      }
    }
    const totalPaid = Number((grossPaid - totalRefundsReceived).toFixed(2));

    // Balance Left = Total Purchases - Total Paid
    let totalDue = Number((totalPurchases - totalPaid).toFixed(2));

    // If customer has a store credit balance (money shopkeeper owes to customer from returns)
    if (customerDoc && customerDoc.balance > 0) {
      totalDue = Number((totalDue + customerDoc.balance).toFixed(2));
    }
    totalDue = Number(totalDue.toFixed(2));

    // Sort newest payments first
    rawPayments.sort((a, b) => {
      const getPayTime = (p) => {
        if (p.createdAt && p.paymentDate) {
          const pd = new Date(p.paymentDate);
          if (pd.getUTCHours() === 0 && pd.getUTCMinutes() === 0 && pd.getUTCSeconds() === 0) {
            return new Date(p.createdAt).getTime();
          }
        }
        return new Date(p.paymentDate || p.createdAt || 0).getTime();
      };
      return getPayTime(b) - getPayTime(a);
    });

    const paymentHistory = rawPayments.map((p) => {
      let resolvedDate = p.paymentDate || p.createdAt;
      if (p.createdAt && p.paymentDate) {
        const pd = new Date(p.paymentDate);
        if (pd.getUTCHours() === 0 && pd.getUTCMinutes() === 0 && pd.getUTCSeconds() === 0) {
          resolvedDate = p.createdAt;
        }
      }
      const isRefund =
        p.paymentType === "Supplier Refund" ||
        String(p.invoiceNumber || "").startsWith("SUP-RET") ||
        String(p.paymentMethod || "").toLowerCase().includes("refund") ||
        String(p.notes || "").toLowerCase().includes("supplier return") ||
        String(p.notes || "").toLowerCase().includes("supplier refund");
      return {
        id: p._id,
        date: resolvedDate,
        amount: Number(p.amount) || 0,
        paymentMethod: p.paymentMethod || "Cash",
        paymentType: isRefund ? "Supplier Refund" : (p.paymentType || "Payment"),
        isRefund,
        flow: isRefund ? "collected" : "given",
        invoiceNumber: p.invoiceNumber || "",
        notes: p.notes || "",
        status: p.status || "Completed",
      };
    });

    // Also include all SupplierRefund documents that do not already have a dedicated SupplierPayment entry
    const seenRefundNumbers = new Set(
      paymentHistory
        .map((p) => p.invoiceNumber)
        .filter((num) => num && String(num).startsWith("SUP-RET"))
    );

    for (const ref of supplierRefunds) {
      if (!seenRefundNumbers.has(ref.refundNumber)) {
        const itemNames = (ref.returnedItems || []).map((it) => it.productName).filter(Boolean).slice(0, 2).join(", ");
        paymentHistory.push({
          id: ref._id,
          date: ref.refundDate || ref.createdAt,
          amount: Number(ref.totalRefundAmount) || 0,
          paymentMethod: ref.workflowType === "refund_and_purchase" ? "Stock Adjustment" : "Supplier Refund",
          paymentType: "Supplier Refund",
          isRefund: true,
          flow: "collected",
          invoiceNumber: ref.refundNumber,
          notes: ref.notes || `Refund voucher #${ref.refundNumber} (${ref.totalQuantity || 1} returned${itemNames ? `: ${itemNames}` : ""})`,
          status: "Completed",
        });
      }
    }

    // Sort full payment ledger descending by transaction date
    paymentHistory.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    return res.status(200).json({
      success: true,
      data: {
        supplier: {
          _id: supplierDoc?._id || customerDoc?._id || null,
          name: supplierName,
          type: isCustomer ? "customer" : "supplier",
          isCustomer: Boolean(isCustomer),
          phone: customerDoc?.phone || "",
          createdAt: supplierDoc?.createdAt || customerDoc?.createdAt || null,
        },
        summary: {
          totalPurchases,
          totalPaid,
          totalDue,
          totalUnits,
          totalInvoices: invoices.length || (stockRecords.length > 0 ? 1 : 0),
        },
        items: itemsList,
        paymentHistory,
      },
    });
  } catch (error) {
    console.error("Error in getSupplierHistory controller:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve supplier/customer history.",
    });
  }
};

/**
 * @route   POST /api/suppliers/:identifier/payments
 * @desc    Record a payment against a supplier's or customer's balance due
 */
const recordSupplierPayment = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { amount, flow, direction, paymentType } = req.body;
    const isCollecting =
      flow === "collected" ||
      direction === "receive" ||
      paymentType === "Supplier Refund" ||
      String(paymentType || "").toLowerCase().includes("refund");

    const paymentAmount = Number(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid positive payment amount is required.",
      });
    }

    let supplierDoc = null;
    let customerDoc = null;
    let targetName = "";
    let isCustomer = false;

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      supplierDoc = await Supplier.findById(identifier);
      if (supplierDoc) {
        targetName = supplierDoc.name;
        isCustomer = supplierDoc.type === "customer";
      } else {
        customerDoc = await Customer.findById(identifier);
        if (customerDoc) {
          targetName = customerDoc.name;
          isCustomer = true;
        }
      }
    }

    if (!supplierDoc && !customerDoc) {
      let rawName = "";
      try {
        rawName = decodeURIComponent(identifier).trim();
      } catch {
        rawName = (identifier || "").trim();
      }
      targetName = rawName;

      supplierDoc = await Supplier.findOne({
        name: { $regex: `^${rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });

      if (supplierDoc) {
        targetName = supplierDoc.name;
        isCustomer = supplierDoc.type === "customer";
      } else {
        customerDoc = await Customer.findOne({
          name: { $regex: `^${rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        });
        if (customerDoc) {
          targetName = customerDoc.name;
          isCustomer = true;
        }
      }
    }

    if (!supplierDoc && !customerDoc) {
      const invCheck = await PurchaseInvoice.findOne({
        $or: [
          { customerName: { $regex: `^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
          { supplier: { $regex: `^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
        ],
      });
      if (invCheck) {
        isCustomer = true;
      } else {
        return res.status(404).json({
          success: false,
          message: "Supplier or customer not found in directory.",
        });
      }
    }



    let remainingToDistribute = paymentAmount;
    const updatedInvoices = [];


    if (!isCollecting) {
      // Find unpaid/partial invoices strictly for this entity
    const invoiceQuery = isCustomer
      ? (customerDoc
          ? { customerId: customerDoc._id, amountDue: { $gt: 0 } }
          : { customerId: null, customerName: { $regex: `^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, amountDue: { $gt: 0 } })
      : {
          supplierId: supplierDoc._id,
          amountDue: { $gt: 0 },
        };

    const invoices = await PurchaseInvoice.find(invoiceQuery).sort({ purchaseDate: 1, createdAt: 1 });



    for (const inv of invoices) {
      if (remainingToDistribute <= 0) break;
      const applyAmount = Math.min(inv.amountDue, remainingToDistribute);
      inv.amountPaid = Number((inv.amountPaid + applyAmount).toFixed(2));
      inv.amountDue = Number(Math.max(0, inv.amountDue - applyAmount).toFixed(2));
      inv.paymentStatus = inv.amountDue <= 0 ? "paid" : "partial";
      await inv.save();

      // Synchronize corresponding Stock records if linked via standaloneReference
      if (inv.standaloneReference) {
        await Stock.updateMany(
          { transactionRef: inv.standaloneReference },
          {
            $set: {
              amountPaid: inv.amountPaid,
              amountDue: inv.amountDue,
              paymentStatus: inv.amountDue <= 0 ? "Paid" : "Partial",
            },
          }
        );
      }

      remainingToDistribute = Number((remainingToDistribute - applyAmount).toFixed(2));
      updatedInvoices.push(inv);
    }

    // Also update any standalone Stock records if needed (strictly un-invoiced legacy stock)
    if (remainingToDistribute > 0) {
      const invoicedRefs = await PurchaseInvoice.distinct("standaloneReference", {
        standaloneReference: { $ne: null },
      });

      const stockQuery = isCustomer
        ? (customerDoc
            ? { customerId: customerDoc._id, amountDue: { $gt: 0 }, ...(invoicedRefs.length > 0 ? { transactionRef: { $nin: invoicedRefs } } : {}) }
            : { customerId: null, customerName: { $regex: `^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, amountDue: { $gt: 0 }, ...(invoicedRefs.length > 0 ? { transactionRef: { $nin: invoicedRefs } } : {}) })
        : {
            supplier: supplierDoc._id,
            amountDue: { $gt: 0 },
            ...(invoicedRefs.length > 0 ? { transactionRef: { $nin: invoicedRefs } } : {}),
          };

      const stockDocs = await Stock.find(stockQuery);

      for (const st of stockDocs) {
        if (remainingToDistribute <= 0) break;
        const applyAmount = Math.min(st.amountDue, remainingToDistribute);
        st.amountPaid = Number(((st.amountPaid || 0) + applyAmount).toFixed(2));
        st.amountDue = Number(Math.max(0, st.amountDue - applyAmount).toFixed(2));
        st.paymentStatus = st.amountDue <= 0 ? "Paid" : "Partial";
        await st.save();
        remainingToDistribute = Number((remainingToDistribute - applyAmount).toFixed(2));
      }
    }

    // If customer has a store credit balance in Customer collection, reduce it
    if (customerDoc && customerDoc.balance > 0 && remainingToDistribute > 0) {
      const creditSettle = Math.min(customerDoc.balance, remainingToDistribute);
      customerDoc.balance = Number((customerDoc.balance - creditSettle).toFixed(2));
      customerDoc.totalCashPayouts = Number(((customerDoc.totalCashPayouts || 0) + creditSettle).toFixed(2));
      customerDoc.ledger.push({
        date: new Date(),
        type: "payout",
        amount: creditSettle,
        balanceAfter: customerDoc.balance,
        referenceType: "Payout",
        description: `Cash payout settlement of Rs. ${creditSettle.toLocaleString()}`,
        processedBy: "Admin",
      });
      await customerDoc.save();
      remainingToDistribute = Number((remainingToDistribute - creditSettle).toFixed(2));
    }
    }

    // Record dedicated SupplierPayment disbursement transaction
    let resolvedPaymentDate = new Date();
    if (req.body.paymentDate) {
      const parsed = new Date(req.body.paymentDate);
      if (!isNaN(parsed.getTime())) {
        if (typeof req.body.paymentDate === "string" && req.body.paymentDate.trim().length <= 10) {
          const now = new Date();
          parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        }
        resolvedPaymentDate = parsed;
      }
    }

    const paymentRecord = await SupplierPayment.create({
      supplier: targetName,
      supplierId: isCustomer ? null : supplierDoc?._id,
      customerId: isCustomer ? (customerDoc?._id || null) : null,
      amount: paymentAmount,
      paymentDate: resolvedPaymentDate,
      paymentMethod: req.body.paymentMethod || "Cash",
      paymentType: isCollecting ? "Supplier Refund" : (paymentType || "Debt Settlement"),
      notes: req.body.notes || (isCollecting ? `Settlement payment collected from ${isCustomer ? "customer" : "supplier"}` : ""),
      status: "Completed",
    });

    // Update timestamps on Supplier or Customer document so lastActivityDate updates immediately
    const touchDate = new Date();
    if (supplierDoc) {
      await Supplier.updateOne({ _id: supplierDoc._id }, { $set: { updatedAt: touchDate } });
    }
    if (customerDoc) {
      await Customer.updateOne({ _id: customerDoc._id }, { $set: { updatedAt: touchDate } });
    }

    return res.status(200).json({
      success: true,
      message: isCollecting
        ? `Settlement of Rs. ${paymentAmount.toLocaleString()} collected from ${targetName} recorded successfully!`
        : `Payment of Rs. ${paymentAmount.toLocaleString()} recorded successfully!`,
      appliedAmount: isCollecting ? paymentAmount : paymentAmount - remainingToDistribute,
      remainingUnapplied: isCollecting ? 0 : remainingToDistribute,
      updatedInvoicesCount: updatedInvoices.length,
      paymentRecord,
    });
  } catch (error) {
    console.error("Error recording supplier payment:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to record payment.",
    });
  }
};

/**
 * @route   GET /api/suppliers/:id
 * @desc    Get single supplier or customer by ID
 */
const getSupplierById = async (req, res) => {
  try {
    let item = await Supplier.findById(req.params.id).lean();
    if (!item) {
      item = await Customer.findById(req.params.id).lean();
      if (item) {
        item.isCustomer = true;
        item.type = "customer";
      }
    }
    if (!item) {
      return res.status(404).json({ success: false, message: "Supplier/Customer not found" });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/suppliers
 * @desc    Create new supplier or customer
 */
const createSupplier = async (req, res) => {
  try {
    const { name, totalAmount, amountPaid, type = "supplier" } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: `${type === "customer" ? "Customer" : "Supplier"} name is required.`,
      });
    }

    const cleanName = name.trim();
    const isCustomerType = type === "customer";

    let createdSupplier = null;
    let createdCustomer = null;

    if (isCustomerType) {
      createdCustomer = await Customer.create({ name: cleanName });
    } else {
      createdSupplier = await Supplier.create({ name: cleanName, type: "supplier" });
    }

    const parsedTotal = Math.max(0, Number(totalAmount) || 0);
    const parsedPaid = Math.max(0, Number(amountPaid) || 0);

    // If opening totalAmount is provided, create an initial ledger invoice
    if (parsedTotal > 0) {
      const invPaid = Math.min(parsedTotal, parsedPaid);
      const invDue = Math.max(0, Number((parsedTotal - invPaid).toFixed(2)));
      const invoiceNum = `INV-OPEN-${Date.now().toString().slice(-6)}`;

      await PurchaseInvoice.create({
        invoiceNumber: invoiceNum,
        supplier: cleanName,
        supplierId: isCustomerType ? null : createdSupplier._id,
        isLocalPurchase: isCustomerType,
        customerName: isCustomerType ? cleanName : "",
        customerId: isCustomerType ? createdCustomer._id : null,
        isLinkedToLedger: true,
        entryOrigin: isCustomerType ? "local_purchase" : "supplier_ledger",
        purchaseDate: new Date(),
        totalQuantity: 1,
        totalAmount: parsedTotal,
        amountPaid: invPaid,
        amountDue: invDue,
        paymentStatus: invDue <= 0 ? "paid" : invPaid > 0 ? "partial" : "unpaid",
        itemsSummary: [
          {
            productName: "Opening Balance / Initial Bill",
            category: "General",
            quantity: 1,
            unitPrice: parsedTotal,
            subtotal: parsedTotal,
            barcodes: ["OPENING-BALANCE"],
          },
        ],
      });

      if (invPaid > 0) {
        await SupplierPayment.create({
          supplier: cleanName,
          supplierId: isCustomerType ? null : createdSupplier._id,
          customerId: isCustomerType ? createdCustomer._id : null,
          amount: invPaid,
          paymentDate: new Date(),
          paymentMethod: "Cash",
          paymentType: "Upfront Payment",
          invoiceNumber: invoiceNum,
          notes: `Initial payment upon ${isCustomerType ? "customer" : "supplier"} creation`,
          status: "Completed",
        });
      }
    } else if (parsedPaid > 0) {
      await SupplierPayment.create({
        supplier: cleanName,
        supplierId: isCustomerType ? null : createdSupplier._id,
        customerId: isCustomerType ? createdCustomer._id : null,
        amount: parsedPaid,
        paymentDate: new Date(),
        paymentMethod: "Cash",
        paymentType: "Upfront Payment",
        notes: `Advance payment upon ${isCustomerType ? "customer" : "supplier"} creation`,
        status: "Completed",
      });
    }

    return res.status(201).json({
      success: true,
      data: isCustomerType ? createdCustomer : createdSupplier,
      message: `${isCustomerType ? "Customer" : "Supplier"} "${cleanName}" created successfully!`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  getSupplierHistory,
  recordSupplierPayment,
  createSupplier,
  autoSettleTradeInInvoices,
  deduplicateSuppliersAndCustomers,
};

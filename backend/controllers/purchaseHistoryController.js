const mongoose = require("mongoose");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const Supplier = require("../models/Supplier");
const Customer = require("../models/Customer");
const SupplierPayment = require("../models/SupplierPayment");
const SupplierRefund = require("../models/SupplierRefund");

/**
 * Helper to escape regex special characters for safe search queries
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Helper to parse start/end date range
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
 * @route   GET /api/stock/purchase-history
 * @desc    Fetch unified stock acquisition history (Supplier, Local, & Exchange Trade-In)
 * @query   type (all|supplier_purchase|local_purchase|exchange), search, startDate, endDate, paymentStatus, page, limit, sortBy
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const {
      type = "all",
      search = "",
      startDate,
      endDate,
      paymentStatus = "all",
      page = 1,
      limit = 20,
      sortBy = "newest",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skipNum = (pageNum - 1) * limitNum;

    const trimmedSearch = search.trim();
    const searchRegex = trimmedSearch ? new RegExp(escapeRegex(trimmedSearch), "i") : null;
    const dateRange = parseDateRange(startDate, endDate);

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. Identify and isolate Exchange Trade-In transactions to avoid double-counting
    // ─────────────────────────────────────────────────────────────────────────────
    // Find all Sales that are exchanges or have trade-in items
    const exchangeSaleFilter = {
      $or: [
        { isExchange: true },
        { "tradeInItem.productName": { $exists: true, $ne: "" } },
        { exchangeReturnNumber: { $exists: true, $ne: "" } },
      ],
      status: { $ne: "cancelled" },
    };

    if (dateRange) {
      exchangeSaleFilter.saleDate = dateRange;
    }

    if (paymentStatus && paymentStatus !== "all") {
      if (paymentStatus === "paid") {
        exchangeSaleFilter.$and = [
          ...(exchangeSaleFilter.$and || []),
          { $or: [{ paymentStatus: { $in: ["Paid", "paid", "Completed"] } }, { amountDue: { $lte: 0 } }] },
        ];
      } else if (paymentStatus === "partial") {
        exchangeSaleFilter.$and = [
          ...(exchangeSaleFilter.$and || []),
          { $or: [{ paymentStatus: { $in: ["Partial", "partial", "Credit"] } }, { amountDue: { $gt: 0 }, amountPaid: { $gt: 0 } }] },
        ];
      } else if (paymentStatus === "unpaid") {
        exchangeSaleFilter.$and = [
          ...(exchangeSaleFilter.$and || []),
          { $or: [{ paymentStatus: { $in: ["Unpaid", "unpaid"] } }, { amountPaid: { $lte: 0 }, amountDue: { $gt: 0 } }] },
        ];
      }
    }

    if (searchRegex) {
      exchangeSaleFilter.$and = [
        ...(exchangeSaleFilter.$and || []),
        {
          $or: [
            { saleNumber: searchRegex },
            { customerName: searchRegex },
            { customerPhone: searchRegex },
            { "tradeInItem.productName": searchRegex },
            { "tradeInItem.barcode": searchRegex },
            { "tradeInItem.barcodes": searchRegex },
            { "items.productName": searchRegex },
            { "items.barcode": searchRegex },
            { "items.soldBarcodes": searchRegex },
          ],
        },
      ];
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. Identify Intake Invoices linked to Trade-Ins (so they are not double-counted)
    // ─────────────────────────────────────────────────────────────────────────────
    // Fetch trade-in stockIds and barcodes from all relevant exchange sales to exclude from PurchaseInvoice
    const allExchangeSales = await Sale.find({
      $or: [
        { isExchange: true },
        { "tradeInItem.productName": { $exists: true, $ne: "" } },
      ],
    })
      .select("tradeInItem")
      .lean();

    const tradeInStockIds = [];
    const tradeInBarcodes = [];
    for (const es of allExchangeSales) {
      if (es.tradeInItem) {
        if (es.tradeInItem.stockId) tradeInStockIds.push(es.tradeInItem.stockId.toString());
        if (es.tradeInItem.barcode && es.tradeInItem.barcode !== "N/A") {
          tradeInBarcodes.push(es.tradeInItem.barcode);
        }
        if (Array.isArray(es.tradeInItem.barcodes)) {
          for (const b of es.tradeInItem.barcodes) {
            if (b && b !== "N/A") tradeInBarcodes.push(b);
          }
        }
      }
    }

    // Also find trade-in payment settlement references
    const tradeInPayments = await SupplierPayment.find({
      paymentMethod: "Trade-in Credit",
    })
      .select("invoiceNumber")
      .lean();
    const tradeInInvoiceNums = tradeInPayments.map((p) => p.invoiceNumber).filter(Boolean);

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. Query PurchaseInvoice for Supplier (Type A) and Local (Type B)
    // ─────────────────────────────────────────────────────────────────────────────
    const invoiceBaseFilter = {};

    if (dateRange) {
      invoiceBaseFilter.purchaseDate = dateRange;
    }

    if (paymentStatus && paymentStatus !== "all") {
      invoiceBaseFilter.paymentStatus = paymentStatus.toLowerCase();
    }

    if (searchRegex) {
      invoiceBaseFilter.$or = [
        { invoiceNumber: searchRegex },
        { supplier: searchRegex },
        { customerName: searchRegex },
        { standaloneReference: searchRegex },
        { "itemsSummary.productName": searchRegex },
        { "itemsSummary.barcodes": searchRegex },
      ];
    }

    // Exclude invoices that belong exclusively to trade-in exchanges
    const invoiceExclusions = [];
    if (tradeInInvoiceNums.length > 0) {
      invoiceExclusions.push({ invoiceNumber: { $nin: tradeInInvoiceNums } });
      invoiceExclusions.push({ standaloneReference: { $nin: tradeInInvoiceNums } });
    }
    if (tradeInBarcodes.length > 0) {
      invoiceExclusions.push({ "itemsSummary.barcodes": { $nin: tradeInBarcodes } });
    }
    invoiceExclusions.push({ entryOrigin: { $ne: "trade_in" } });

    // Build specific filters for Supplier vs Local
    let supplierInvoices = [];
    let localInvoices = [];
    let exchangeTransactions = [];

    const shouldFetchSupplier = type === "all" || type === "supplier_purchase";
    const shouldFetchLocal = type === "all" || type === "local_purchase";
    const shouldFetchExchange = type === "all" || type === "exchange";

    const fetchPromises = [];

    if (shouldFetchSupplier) {
      const supplierFilter = {
        ...invoiceBaseFilter,
        isLocalPurchase: { $ne: true },
      };
      fetchPromises.push(
        PurchaseInvoice.find(supplierFilter)
          .populate("supplierId", "name type")
          .lean()
          .then((docs) => {
            supplierInvoices = docs;
          })
      );
    }

    if (shouldFetchLocal) {
      const localFilter = {
        ...invoiceBaseFilter,
        isLocalPurchase: true,
        $and: invoiceExclusions.length > 0 ? invoiceExclusions : undefined,
      };
      fetchPromises.push(
        PurchaseInvoice.find(localFilter)
          .populate("customerId", "name phone email address")
          .lean()
          .then((docs) => {
            localInvoices = docs;
          })
      );
    }

    if (shouldFetchExchange) {
      fetchPromises.push(
        Sale.find(exchangeSaleFilter)
          .populate("customerId", "name phone email address")
          .lean()
          .then((docs) => {
            exchangeTransactions = docs;
          })
      );
    }

    await Promise.all(fetchPromises);

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. Normalize records into unified transaction structure
    // ─────────────────────────────────────────────────────────────────────────────
    const unifiedList = [];

    // Map Supplier Invoices (Type A)
    for (const inv of supplierInvoices) {
      unifiedList.push({
        id: inv._id,
        transactionId: inv.invoiceNumber,
        receiptNumber: inv.invoiceNumber,
        transactionType: "supplier_purchase",
        date: inv.purchaseDate || inv.createdAt,
        party: {
          name: inv.supplier || (inv.supplierId?.name) || "General Supplier",
          type: "supplier",
          id: inv.supplierId?._id || inv.supplierId || null,
          phone: "",
        },
        itemsSummary: (inv.itemsSummary || []).map((it) => ({
          productName: it.productName,
          category: it.category || "General",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal != null ? it.subtotal : Number((it.unitPrice * it.quantity).toFixed(2)),
          barcodes: Array.isArray(it.barcodes) ? it.barcodes : [],
          sellingPrice: it.sellingPrice || it.estimatedSalePricePerUnit || 0,
        })),
        totalQuantity: inv.totalQuantity || (inv.itemsSummary || []).reduce((s, i) => s + (i.quantity || 0), 0),
        totalAmount: inv.totalAmount || 0,
        amountPaid: inv.amountPaid || 0,
        amountDue: inv.amountDue != null ? inv.amountDue : Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0)),
        paymentStatus: (inv.paymentStatus || "unpaid").toLowerCase(),
        entryOrigin: inv.entryOrigin || "general_intake",
        standaloneReference: inv.standaloneReference || null,
        isLinkedToLedger: Boolean(inv.isLinkedToLedger),
        sourceModel: "PurchaseInvoice",
        sourceId: inv._id,
        exchangeDetails: null,
      });
    }

    // Map Local Purchases (Type B)
    for (const inv of localInvoices) {
      const sellerName = (inv.customerName || inv.supplier || inv.customerId?.name || "Local Seller").trim();
      const sellerPhone = inv.customerId?.phone || "";
      unifiedList.push({
        id: inv._id,
        transactionId: inv.invoiceNumber,
        receiptNumber: inv.invoiceNumber,
        transactionType: "local_purchase",
        date: inv.purchaseDate || inv.createdAt,
        party: {
          name: sellerName,
          type: "seller",
          id: inv.customerId?._id || inv.customerId || null,
          phone: sellerPhone,
        },
        itemsSummary: (inv.itemsSummary || []).map((it) => ({
          productName: it.productName,
          category: it.category || "General",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal != null ? it.subtotal : Number((it.unitPrice * it.quantity).toFixed(2)),
          barcodes: Array.isArray(it.barcodes) ? it.barcodes : [],
          sellingPrice: it.sellingPrice || it.estimatedSalePricePerUnit || 0,
        })),
        totalQuantity: inv.totalQuantity || (inv.itemsSummary || []).reduce((s, i) => s + (i.quantity || 0), 0),
        totalAmount: inv.totalAmount || 0,
        amountPaid: inv.amountPaid || 0,
        amountDue: inv.amountDue != null ? inv.amountDue : Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0)),
        paymentStatus: (inv.paymentStatus || "unpaid").toLowerCase(),
        entryOrigin: "local_purchase",
        standaloneReference: inv.standaloneReference || null,
        isLinkedToLedger: Boolean(inv.isLinkedToLedger),
        sourceModel: "PurchaseInvoice",
        sourceId: inv._id,
        exchangeDetails: null,
      });
    }

    // Map Exchange Trade-Ins (Type C)
    for (const sale of exchangeTransactions) {
      const ti = sale.tradeInItem || {};
      const tiQty = Number(ti.quantity) || 1;
      const tiValue = Number(ti.totalValue || ti.purchasePrice || sale.returnCredit || 0);
      const tiUnit = tiQty > 0 ? Number((tiValue / tiQty).toFixed(2)) : tiValue;
      const tiBarcodes = Array.isArray(ti.barcodes)
        ? ti.barcodes
        : ti.barcode && ti.barcode !== "N/A"
        ? [ti.barcode]
        : [];

      const customerName = (sale.customerName || ti.customerName || sale.customerId?.name || "Exchange Customer").trim();
      const customerPhone = sale.customerPhone || sale.customerId?.phone || "";

      // Given items from shop stock
      const givenItems = (sale.items || []).map((it) => ({
        productName: it.productName,
        barcode: it.barcode || "N/A",
        soldBarcodes: Array.isArray(it.soldBarcodes) ? it.soldBarcodes : (it.barcode ? [it.barcode] : []),
        quantity: it.quantity || 1,
        sellingPrice: it.unitSellingPrice || it.sellingPrice || 0,
        totalAmount: it.totalAmount || 0,
      }));

      // Settlement status
      let mappedStatus = "paid";
      if (sale.amountDue > 0 && sale.amountPaid > 0) {
        mappedStatus = "partial";
      } else if (sale.amountDue > 0 && sale.amountPaid <= 0) {
        mappedStatus = "unpaid";
      }

      unifiedList.push({
        id: sale._id,
        transactionId: sale.saleNumber,
        receiptNumber: sale.saleNumber,
        transactionType: "exchange",
        date: sale.saleDate || sale.createdAt,
        party: {
          name: customerName,
          type: "customer",
          id: sale.customerId?._id || sale.customerId || null,
          phone: customerPhone,
        },
        // Stock intake item represents the phone acquired
        itemsSummary: [
          {
            productName: ti.productName || "Trade-in Device",
            category: "Mobile",
            quantity: tiQty,
            unitPrice: tiUnit,
            subtotal: tiValue,
            barcodes: tiBarcodes,
            sellingPrice: 0,
          },
        ],
        totalQuantity: tiQty,
        totalAmount: tiValue, // Agreed acquisition trade-in value of phone received
        amountPaid: tiValue, // Credited towards the exchange sale
        amountDue: 0, // Stock intake is fully credited
        paymentStatus: mappedStatus,
        entryOrigin: "trade_in_exchange",
        standaloneReference: sale.saleNumber,
        isLinkedToLedger: false,
        sourceModel: "Sale",
        sourceId: sale._id,
        exchangeDetails: {
          receivedDevice: {
            productName: ti.productName || "Trade-in Device",
            barcodes: tiBarcodes,
            quantity: tiQty,
            agreedValue: tiValue,
          },
          givenDevices: givenItems,
          saleNumber: sale.saleNumber,
          saleTotal: sale.totalAmount || 0,
          tradeInCredit: tiValue,
          netDifference: sale.netDifference != null ? sale.netDifference : ((sale.totalAmount || 0) - tiValue),
          amountPaid: sale.amountPaid || 0,
          amountDue: sale.amountDue || 0,
          paymentStatus: sale.paymentStatus || "Paid",
          paymentMethod: sale.paymentMethod || "Cash",
          notes: sale.notes || "",
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. Aggregate KPI Totals (Across matched dataset, before pagination)
    // ─────────────────────────────────────────────────────────────────────────────
    let totalStockAcquired = 0;
    let totalPurchaseValue = 0;
    let totalAmountPaid = 0;
    let totalOutstandingPayables = 0;
    let totalExchangeTransactions = 0;

    for (const item of unifiedList) {
      totalStockAcquired += item.totalQuantity || 0;
      totalPurchaseValue += item.totalAmount || 0;
      totalAmountPaid += item.amountPaid || 0;
      totalOutstandingPayables += item.amountDue || 0;
      if (item.transactionType === "exchange") {
        totalExchangeTransactions += 1;
      }
    }

    const stats = {
      totalTransactions: unifiedList.length,
      totalStockAcquired,
      totalPurchaseValue: Number(totalPurchaseValue.toFixed(2)),
      totalAmountPaid: Number(totalAmountPaid.toFixed(2)),
      totalOutstandingPayables: Number(totalOutstandingPayables.toFixed(2)),
      totalExchangeTransactions,
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. Tag Latest Transaction per Party (Only the latest bill can be printed)
    // ─────────────────────────────────────────────────────────────────────────────
    const latestPartyTxnMap = new Map();
    const byDateDesc = [...unifiedList].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    for (const item of byDateDesc) {
      const partyId = item.party?.id ? String(item.party.id) : null;
      const partyType = item.transactionType || "supplier";
      const partyKey = partyId
        ? `${partyType}_id_${partyId}`
        : `${partyType}_name_${(item.party?.name || "").trim().toLowerCase()}`;

      if (partyKey && !latestPartyTxnMap.has(partyKey)) {
        latestPartyTxnMap.set(partyKey, String(item.receiptNumber || item.id));
      }
    }

    for (const item of unifiedList) {
      const partyId = item.party?.id ? String(item.party.id) : null;
      const partyType = item.transactionType || "supplier";
      const partyKey = partyId
        ? `${partyType}_id_${partyId}`
        : `${partyType}_name_${(item.party?.name || "").trim().toLowerCase()}`;

      item.isLatestForParty =
        latestPartyTxnMap.get(partyKey) === String(item.receiptNumber || item.id);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. Sorting
    // ─────────────────────────────────────────────────────────────────────────────
    unifiedList.sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;

      if (sortBy === "oldest") {
        return dateA - dateB;
      }
      if (sortBy === "amount_high") {
        return (b.totalAmount || 0) - (a.totalAmount || 0);
      }
      if (sortBy === "amount_low") {
        return (a.totalAmount || 0) - (b.totalAmount || 0);
      }
      // Default: "newest"
      return dateB - dateA;
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. Server-Side Pagination
    // ─────────────────────────────────────────────────────────────────────────────
    const totalCount = unifiedList.length;
    const paginatedItems = unifiedList.slice(skipNum, skipNum + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      stats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: pageNum < totalPages,
      },
    });
  } catch (err) {
    console.error("[purchaseHistoryController] getPurchaseHistory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock purchase history.",
      error: err.message,
    });
  }
};

/**
 * @route   GET /api/stock/purchase-history/:id
 * @desc    Fetch individual stock acquisition details, live payment allocations, & receipt data
 */
const getPurchaseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Transaction ID is required." });
    }

    const isMongoId = mongoose.Types.ObjectId.isValid(id);

    // 1. Try finding in PurchaseInvoice first
    let invoice = null;
    if (isMongoId) {
      invoice = await PurchaseInvoice.findById(id)
        .populate("supplierId", "name type")
        .populate("customerId", "name phone email address")
        .lean();
    }
    if (!invoice) {
      invoice = await PurchaseInvoice.findOne({
        $or: [{ invoiceNumber: id }, { standaloneReference: id }],
      })
        .populate("supplierId", "name type")
        .populate("customerId", "name phone email address")
        .lean();
    }

    if (invoice) {
      const isLocal = Boolean(invoice.isLocalPurchase);
      const partyName = (
        invoice.customerName ||
        invoice.supplier ||
        invoice.customerId?.name ||
        invoice.supplierId?.name ||
        "Vendor"
      ).trim();
      const escName = escapeRegex(partyName);
      const supplierId = invoice.supplierId?._id || invoice.supplierId || null;
      const customerId = invoice.customerId?._id || invoice.customerId || null;

      // Check if this is the latest invoice for this party strictly by ID
      const partyInvFilter = isLocal
        ? customerId
          ? { customerId, isLocalPurchase: true }
          : { customerName: { $regex: `^${escName}$`, $options: "i" }, isLocalPurchase: true }
        : supplierId
        ? { supplierId, isLocalPurchase: { $ne: true } }
        : { supplier: { $regex: `^${escName}$`, $options: "i" }, isLocalPurchase: { $ne: true } };

      const newerInvoice = await PurchaseInvoice.findOne({
        _id: { $ne: invoice._id },
        createdAt: { $gt: invoice.createdAt },
        ...partyInvFilter,
      })
        .select("_id")
        .lean();

      // Also check if a newer SupplierRefund exists for this supplier
      const newerRefund = isLocal
        ? null
        : await SupplierRefund.findOne({
            status: "completed",
            createdAt: { $gt: invoice.createdAt },
            ...(supplierId ? { supplierId } : { supplier: { $regex: `^${escName}$`, $options: "i" } }),
          })
            .select("_id")
            .lean();

      const isLatest = !newerInvoice && !newerRefund;

      // Query all invoices for this party to compute running ledger and all-time totals
      const allPartyInvoices = await PurchaseInvoice.find(partyInvFilter)
        .select("totalAmount amountPaid amountDue createdAt purchaseDate")
        .sort({ createdAt: 1 })
        .lean();

      // Find dedicated payment history
      const paymentQuery = isLocal
        ? customerId
          ? {
              $or: [
                { customerId },
                { invoiceNumber: invoice.invoiceNumber },
                ...(invoice.standaloneReference ? [{ invoiceNumber: invoice.standaloneReference }] : []),
              ],
            }
          : {
              $or: [
                { invoiceNumber: invoice.invoiceNumber },
                ...(invoice.standaloneReference ? [{ invoiceNumber: invoice.standaloneReference }] : []),
                { supplier: { $regex: `^${escName}$`, $options: "i" } },
              ],
            }
        : supplierId
        ? {
            $or: [
              { supplierId },
              { invoiceNumber: invoice.invoiceNumber },
              ...(invoice.standaloneReference ? [{ invoiceNumber: invoice.standaloneReference }] : []),
            ],
          }
        : {
            $or: [
              { invoiceNumber: invoice.invoiceNumber },
              ...(invoice.standaloneReference ? [{ invoiceNumber: invoice.standaloneReference }] : []),
              { supplier: { $regex: `^${escName}$`, $options: "i" } },
            ],
          };

      const allPartyPayments = await SupplierPayment.find(paymentQuery)
        .sort({ paymentDate: 1, createdAt: 1 })
        .lean();

      // Query supplier refunds for this party
      const refundQuery = isLocal
        ? { _id: null }
        : supplierId
        ? { supplierId, status: "completed" }
        : { supplier: { $regex: `^${escName}$`, $options: "i" }, status: "completed" };

      const allPartyRefunds = isLocal ? [] : await SupplierRefund.find(refundQuery).lean();

      // Calculate prior balance before this invoice was created
      const invoiceTime = new Date(invoice.createdAt || invoice.purchaseDate).getTime();
      let priorPurchases = 0;
      for (const inv of allPartyInvoices) {
        const invTime = new Date(inv.createdAt || inv.purchaseDate).getTime();
        if (invTime < invoiceTime && String(inv._id) !== String(invoice._id)) {
          priorPurchases += Number(inv.totalAmount || 0);
        }
      }

      let priorRefunds = 0;
      for (const ref of allPartyRefunds) {
        const refTime = new Date(ref.refundDate || ref.createdAt).getTime();
        if (refTime <= invoiceTime) {
          priorRefunds += Number(ref.totalRefundAmount || 0);
        }
      }

      let priorGrossPaid = 0;
      let priorRefundsReceived = 0;
      for (const pay of allPartyPayments) {
        // Exclude payments made specifically for this current invoice
        const isCurrentInvPay =
          pay.invoiceNumber &&
          (pay.invoiceNumber === invoice.invoiceNumber ||
            (invoice.standaloneReference && pay.invoiceNumber === invoice.standaloneReference));
        if (isCurrentInvPay) continue;

        const payTime = new Date(pay.paymentDate || pay.createdAt).getTime();
        if (payTime <= invoiceTime) {
          const amt = Number(pay.amount || 0);
          if (pay.paymentType === "Supplier Refund" || String(pay.invoiceNumber || "").startsWith("SUP-RET")) {
            priorRefundsReceived += amt;
          } else {
            priorGrossPaid += amt;
          }
        }
      }

      const netPriorPurchases = Math.max(0, Number((priorPurchases - priorRefunds).toFixed(2)));
      const netPriorPaid = Math.max(0, Number((priorGrossPaid - priorRefundsReceived).toFixed(2)));
      let previousBalance = Math.max(0, Number((netPriorPurchases - netPriorPaid).toFixed(2)));

      if (previousBalance === 0 && !isLocal && supplierId && priorPurchases === 0) {
        const supDoc = await Supplier.findById(supplierId).select("balance totalDue").lean();
        if (supDoc && (supDoc.balance > 0 || supDoc.totalDue > 0)) {
          previousBalance = Number(supDoc.balance || supDoc.totalDue || 0);
        }
      }

      // All-time totals
      const allTimePurchasesGross = allPartyInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
      const allTimeRefunds = allPartyRefunds.reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);
      const allTimePurchases = Math.max(0, Number((allTimePurchasesGross - allTimeRefunds).toFixed(2)));

      let allTimeGrossPaid = 0;
      let allTimeRefundsReceived = 0;
      allPartyPayments.forEach((p) => {
        const amt = Number(p.amount || 0);
        if (p.paymentType === "Supplier Refund" || String(p.invoiceNumber || "").startsWith("SUP-RET")) {
          allTimeRefundsReceived += amt;
        } else {
          allTimeGrossPaid += amt;
        }
      });
      const allTimePaid = allPartyPayments.length > 0
        ? Math.max(0, Number((allTimeGrossPaid - allTimeRefundsReceived).toFixed(2)))
        : allPartyInvoices.reduce((sum, inv) => sum + (Number(inv.amountPaid) || 0), 0);
      const currentBalanceDue = Math.max(0, Number((allTimePurchases - allTimePaid).toFixed(2)));

      const thisPurchase = Number(invoice.totalAmount || 0);
      const amountPaid = Number(invoice.amountPaid || 0);
      const amountDue =
        invoice.amountDue != null
          ? Number(invoice.amountDue)
          : Math.max(0, thisPurchase - amountPaid);
      const totalPayable = Number((previousBalance + thisPurchase).toFixed(2));
      const totalRemainingAmount = Number((previousBalance + amountDue).toFixed(2));
      const effectivePaymentStatus =
        totalRemainingAmount <= 0 ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";

      // Format receipt data matching StockReceiptModal structure
      const receiptData = {
        receiptNumber: invoice.invoiceNumber,
        allInvoiceNumbers: [invoice.invoiceNumber],
        date: invoice.purchaseDate || invoice.createdAt,
        supplier: isLocal ? partyName : (invoice.supplier || "Vendor"),
        customerName: isLocal ? partyName : "",
        isLocalPurchase: isLocal,
        items: (invoice.itemsSummary || []).map((it) => ({
          productName: it.productName,
          storage: it.storage || "",
          color: it.color || "",
          category: it.category || "General",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.subtotal != null ? it.subtotal : Number((it.unitPrice * it.quantity).toFixed(2)),
          barcodes: Array.isArray(it.barcodes) ? it.barcodes : [],
          sellingPrice: it.sellingPrice || it.estimatedSalePricePerUnit || 0,
        })),
        totalUnits: invoice.totalQuantity || (invoice.itemsSummary || []).reduce((s, i) => s + (i.quantity || 0), 0),
        grandTotal: thisPurchase,
        amountPaid: amountPaid,
        amountDue: amountDue,
        previousBalance: previousBalance,
        isExistingSupplier: previousBalance > 0 || allPartyInvoices.length > 1 || allPartyRefunds.length > 0,
        totalPayable: totalPayable,
        totalRemainingAmount: totalRemainingAmount,
        paymentStatus: effectivePaymentStatus,
        isLatest: isLatest,
      };

      return res.status(200).json({
        success: true,
        data: {
          id: invoice._id,
          transactionId: invoice.invoiceNumber,
          receiptNumber: invoice.invoiceNumber,
          transactionType: isLocal ? "local_purchase" : "supplier_purchase",
          date: invoice.purchaseDate || invoice.createdAt,
          party: {
            name: partyName,
            type: isLocal ? "seller" : "supplier",
            phone: invoice.customerId?.phone || "",
            email: invoice.customerId?.email || "",
            address: invoice.customerId?.address || "",
            id: isLocal ? invoice.customerId?._id : invoice.supplierId?._id,
          },
          items: invoice.itemsSummary || [],
          totalQuantity: invoice.totalQuantity,
          totalAmount: thisPurchase,
          amountPaid: amountPaid,
          amountDue: amountDue,
          previousBalance: previousBalance,
          totalPayable: totalPayable,
          totalRemainingAmount: totalRemainingAmount,
          allTimePurchases: Number(allTimePurchases.toFixed(2)),
          allTimePaid: Number(allTimePaid.toFixed(2)),
          currentBalanceDue: currentBalanceDue,
          paymentStatus: effectivePaymentStatus,
          isLatest: isLatest,
          receiptData,
          sourceModel: "PurchaseInvoice",
          sourceId: invoice._id,
        },
      });
    }

    // 2. Try finding in Sale (Exchange / Trade-in)
    let sale = null;
    if (isMongoId) {
      sale = await Sale.findById(id)
        .populate("customerId", "name phone email address")
        .lean();
    }
    if (!sale) {
      sale = await Sale.findOne({ saleNumber: id })
        .populate("customerId", "name phone email address")
        .lean();
    }

    if (sale && (sale.isExchange || sale.tradeInItem?.productName)) {
      const ti = sale.tradeInItem || {};
      const tiQty = Number(ti.quantity) || 1;
      const tiValue = Number(ti.totalValue || ti.purchasePrice || sale.returnCredit || 0);
      const tiUnit = tiQty > 0 ? Number((tiValue / tiQty).toFixed(2)) : tiValue;
      const tiBarcodes = Array.isArray(ti.barcodes)
        ? ti.barcodes
        : ti.barcode && ti.barcode !== "N/A"
        ? [ti.barcode]
        : [];

      const customerName = (sale.customerName || ti.customerName || sale.customerId?.name || "Customer").trim();
      const customerPhone = sale.customerPhone || sale.customerId?.phone || "";

      // Given items
      const givenItems = (sale.items || []).map((it) => ({
        productName: it.productName,
        barcode: it.barcode || "N/A",
        soldBarcodes: Array.isArray(it.soldBarcodes) ? it.soldBarcodes : (it.barcode ? [it.barcode] : []),
        quantity: it.quantity || 1,
        sellingPrice: it.unitSellingPrice || it.sellingPrice || 0,
        totalAmount: it.totalAmount || 0,
      }));

      return res.status(200).json({
        success: true,
        data: {
          id: sale._id,
          transactionId: sale.saleNumber,
          receiptNumber: sale.saleNumber,
          transactionType: "exchange",
          date: sale.saleDate || sale.createdAt,
          party: {
            name: customerName,
            type: "customer",
            phone: customerPhone,
            email: sale.customerId?.email || "",
            address: sale.customerId?.address || "",
            id: sale.customerId?._id || null,
          },
          items: [
            {
              productName: ti.productName || "Trade-in Device",
              category: "Mobile",
              quantity: tiQty,
              unitPrice: tiUnit,
              subtotal: tiValue,
              barcodes: tiBarcodes,
            },
          ],
          totalQuantity: tiQty,
          totalAmount: tiValue,
          amountPaid: tiValue,
          amountDue: 0,
          paymentStatus: sale.paymentStatus || "Paid",
          exchangeDetails: {
            receivedDevice: {
              productName: ti.productName || "Trade-in Device",
              barcodes: tiBarcodes,
              quantity: tiQty,
              agreedValue: tiValue,
            },
            givenDevices: givenItems,
            saleNumber: sale.saleNumber,
            saleTotal: sale.totalAmount || 0,
            tradeInCredit: tiValue,
            netDifference: sale.netDifference != null ? sale.netDifference : ((sale.totalAmount || 0) - tiValue),
            amountPaid: sale.amountPaid || 0,
            amountDue: sale.amountDue || 0,
            paymentStatus: sale.paymentStatus || "Paid",
            paymentMethod: sale.paymentMethod || "Cash",
            notes: sale.notes || "",
          },
          paymentHistory: [
            {
              id: sale._id,
              amount: sale.amountPaid || 0,
              paymentDate: sale.saleDate || sale.createdAt,
              paymentMethod: sale.paymentMethod || "Cash",
              paymentType: "Trade-in Settlement",
              notes: `Trade-in exchange difference settlement for sale #${sale.saleNumber}`,
              status: "Completed",
            },
          ],
          // Full sale document formatted for SaleReceiptModal
          receiptData: sale,
          isLatest: true,
          sourceModel: "Sale",
          sourceId: sale._id,
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: "Stock acquisition record not found.",
    });
  } catch (err) {
    console.error("[purchaseHistoryController] getPurchaseDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction details.",
      error: err.message,
    });
  }
};

module.exports = {
  getPurchaseHistory,
  getPurchaseDetails,
};

const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Supplier = require("../models/Supplier");
const SupplierPayment = require("../models/SupplierPayment");
const SupplierRefund = require("../models/SupplierRefund");
const Expense = require("../models/Expense");
const Return = require("../models/Return");
const Shopkeeper = require("../models/Shopkeeper");
const ShopkeeperTransfer = require("../models/ShopkeeperTransfer");

/**
 * Standard date range boundary calculator
 * Handles: today, yesterday, last7days, this_month, last_month, this_year, all, and custom from/to.
 * Always establishes strict day boundaries (00:00:00.000 to 23:59:59.999).
 */
const getDateRangeFilter = (period = "this_month", customFrom, customTo) => {
  const now = new Date();
  let start = null;
  let end = null;
  let groupByFormat = "%Y-%m-%d";
  let label = "This Month";

  if (customFrom || customTo) {
    if (customFrom) {
      start = new Date(customFrom);
      start.setHours(0, 0, 0, 0);
    }
    if (customTo) {
      end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
    }

    if (start && end) {
      const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
      if (diffDays <= 2) {
        groupByFormat = "%Y-%m-%d %H:00";
      } else if (diffDays > 90) {
        groupByFormat = "%Y-%m";
      } else {
        groupByFormat = "%Y-%m-%d";
      }
    }
    return {
      start,
      end,
      period: "custom",
      groupByFormat,
      label: `Custom (${start ? start.toLocaleDateString() : ""} - ${end ? end.toLocaleDateString() : ""})`,
    };
  }

  const p = String(period).toLowerCase().trim();

  switch (p) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d %H:00";
      label = "Today";
      break;
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d %H:00";
      label = "Yesterday";
      break;
    }
    case "last7days":
    case "last_7_days": {
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d";
      label = "Last 7 Days";
      break;
    }
    case "this_month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d";
      label = "This Month";
      break;
    }
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d";
      label = "Last Month";
      break;
    }
    case "this_year": {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      groupByFormat = "%Y-%m";
      label = "This Year";
      break;
    }
    case "all":
    case "all_time": {
      start = null;
      end = null;
      groupByFormat = "%Y-%m";
      label = "All Time";
      break;
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      groupByFormat = "%Y-%m-%d";
      label = "This Month";
      break;
    }
  }

  return { start, end, period: p, groupByFormat, label };
};

/**
 * Builds standard period match conditions for Date fields
 */
const buildDateMatch = (fieldName, start, end) => {
  const match = {};
  if (start || end) {
    match[fieldName] = {};
    if (start) match[fieldName].$gte = start;
    if (end) match[fieldName].$lte = end;
  }
  return match;
};

/**
 * @route   GET /api/dashboard
 * @desc    Complete aggregated dashboard payload in a single, high-performance database round-trip
 */
const getDashboardOverview = async (req, res) => {
  try {
    const { period, from, to, startDate, endDate, recentLimit = 10, topLimit = 8 } = req.query;
    const customFrom = from || startDate;
    const customTo = to || endDate;

    const { start, end, groupByFormat, label, period: activePeriod } = getDateRangeFilter(
      period,
      customFrom,
      customTo
    );

    // 1. Period Match Filters
    const saleDateMatch = {
      status: { $in: ["completed", "refunded"] },
      ...buildDateMatch("saleDate", start, end),
    };

    const invoiceDateMatch = {
      ...buildDateMatch("purchaseDate", start, end),
    };

    const paymentDateMatch = {
      status: { $ne: "Cancelled" },
      ...buildDateMatch("paymentDate", start, end),
    };

    const expenseDateMatch = {
      ...buildDateMatch("date", start, end),
    };

    const returnDateMatch = {
      status: "completed",
      ...buildDateMatch("returnDate", start, end),
    };

    // Limit parsers
    const parsedRecentLimit = Math.min(Math.max(parseInt(recentLimit, 10) || 10, 1), 50);
    const parsedTopLimit = Math.min(Math.max(parseInt(topLimit, 10) || 8, 1), 30);

    // =========================================================================
    // 2. PARALLEL MONGO AGGREGATION QUERIES
    // =========================================================================
    const [
      salesStatsRes,
      periodPurchasesRes,
      periodPaymentsRes,
      periodExpensesRes,
      returnStatsRes,
      cashRefundsRes,
      recentReturnsRes,
      currentSupplierDueRes,
      supplierCountRes,
      suppliersWithDueRes,
      inventoryValuationRes,
      profitLossTrendRes,
      topSellingRes,
      recentSalesRes,
      recentPaymentsRes,
      cashSalesRes,
      cashSupplierPaymentsRes,
      cashExpensesRes,
      shopkeeperDueRes,
      shopkeeperStockRes,
    ] = await Promise.all([
      // A. Sales & Profitability for period (Completed sales only)
      Sale.aggregate([
        { $match: saleDateMatch },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$totalAmount" },
            totalCost: { $sum: "$totalCost" },
            totalProfit: { $sum: "$profit" },
            totalLoss: { $sum: "$loss" },
            totalUnitsSold: { $sum: "$quantity" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]),

      // B. Supplier Purchases for period (From PurchaseInvoice)
      PurchaseInvoice.aggregate([
        { $match: invoiceDateMatch },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: "$totalAmount" },
            totalInvoicesCount: { $sum: 1 },
            totalUnitsPurchased: { $sum: "$totalQuantity" },
          },
        },
      ]),

      // C. Actual Cash Paid to Suppliers (All-time standing metric, unfiltered by period)
      SupplierPayment.aggregate([
        {
          $match: {
            status: { $ne: "Cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            totalPaidToSuppliers: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentType", "Supplier Refund"] },
                  { $multiply: ["$amount", -1] },
                  "$amount",
                ],
              },
            },
            paymentCount: { $sum: 1 },
          },
        },
      ]),

      // D. Daily Expenses for period (From Expense)
      Expense.aggregate([
        { $match: expenseDateMatch },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: "$amount" },
            expenseCount: { $sum: 1 },
          },
        },
      ]),

      // E. Stock Returns & Refunds for period (From Return)
      Return.aggregate([
        { $match: returnDateMatch },
        {
          $group: {
            _id: null,
            totalOriginalSoldPrice: { $sum: "$totalOriginalSoldPrice" },
            totalRefundAmount: { $sum: "$totalRefundAmount" },
            totalRetainedProfit: { $sum: "$totalRetainedProfit" },
            totalCostRefunded: { $sum: "$totalCostRefunded" },
            totalProfitReversed: { $sum: "$totalProfitReversed" },
            totalUnitsReturned: { $sum: "$totalUnitsReturned" },
            totalCashRefunded: { $sum: "$cashRefundAmount" },
            totalReturnsCount: { $sum: 1 },
          },
        },
      ]),

      // F. Cash Outflows for Physical Cash Refunds Handed Out
      Return.aggregate([
        {
          $match: {
            status: "completed",
            cashRefundAmount: { $gt: 0 },
            ...(end ? { returnDate: { $lte: end } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            cumulativeCashRefunds: { $sum: "$cashRefundAmount" },
            periodCashRefunds: {
              $sum: {
                $cond: [
                  start ? { $gte: ["$returnDate", start] } : true,
                  "$cashRefundAmount",
                  0,
                ],
              },
            },
          },
        },
      ]),

      // G. Recent Completed Returns for Period
      Return.find(returnDateMatch)
        .sort({ returnDate: -1, _id: -1 })
        .limit(parsedRecentLimit)
        .select(
          "returnNumber saleNumber customerName totalRefundAmount totalCostRefunded totalProfitReversed totalUnitsReturned settlementType payoutMethod returnDate items"
        )
        .lean(),

      // H. Current-State Total Supplier Payable & Invoices Breakdown (ALL-TIME CURRENT STATE)
      PurchaseInvoice.aggregate([
        {
          $match: {
            isLinkedToLedger: true,
          },
        },
        {
          $group: {
            _id: null,
            totalCurrentDue: { $sum: "$amountDue" },
            allTimePurchases: { $sum: "$totalAmount" },
            allTimePaid: { $sum: "$amountPaid" },
            totalInvoices: { $sum: 1 },
            paidInvoicesCount: {
              $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
            },
            partialInvoicesCount: {
              $sum: { $cond: [{ $eq: ["$paymentStatus", "partial"] }, 1, 0] },
            },
            unpaidInvoicesCount: {
              $sum: { $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0] },
            },
          },
        },
      ]),

      // E. Total registered suppliers
      Supplier.countDocuments({}),

      // F. Count of suppliers with outstanding balance (amountDue > 0)
      PurchaseInvoice.distinct("supplierId", {
        isLinkedToLedger: true,
        supplierId: { $ne: null },
        amountDue: { $gt: 0 },
      }),

      // G. Current-State Inventory Snapshot (Broken down by Location: Shop vs Warehouse)
      Stock.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$location", "shop"] },
            inventoryValue: {
              $sum: {
                $multiply: [
                  { $max: ["$quantity", 0] },
                  { $ifNull: ["$unitPrice", 0] },
                ],
              },
            },
            totalUnits: { $sum: { $max: ["$quantity", 0] } },
            totalProducts: {
              $sum: { $cond: [{ $gt: ["$quantity", 0] }, 1, 0] },
            },
            lowStockCount: {
              $sum: {
                $cond: [{ $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", 20] }] }, 1, 0],
              },
            },
            outOfStockCount: {
              $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] },
            },
            inStockCount: {
              $sum: { $cond: [{ $gt: ["$quantity", 20] }, 1, 0] },
            },
          },
        },
      ]),

      // H. Profit & Loss Time-Series Trend
      Sale.aggregate([
        { $match: saleDateMatch },
        {
          $group: {
            _id: { $dateToString: { format: groupByFormat, date: "$saleDate" } },
            revenue: { $sum: "$totalAmount" },
            cost: { $sum: "$totalCost" },
            profit: { $sum: "$profit" },
            loss: { $sum: "$loss" },
            units: { $sum: "$quantity" },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            date: "$_id",
            revenue: { $round: ["$revenue", 2] },
            cost: { $round: ["$cost", 2] },
            profit: { $round: ["$profit", 2] },
            loss: { $round: ["$loss", 2] },
            netProfit: { $round: [{ $subtract: ["$profit", "$loss"] }, 2] },
            units: "$units",
            transactions: "$transactions",
            _id: 0,
          },
        },
      ]),

      // I. Top Selling Products (supports multi-item carts and single item sales)
      Sale.aggregate([
        { $match: saleDateMatch },
        {
          $project: {
            itemsList: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
                "$items",
                [
                  {
                    productName: "$productName",
                    quantity: "$quantity",
                    totalAmount: "$totalAmount",
                    totalCost: "$totalCost",
                    profit: "$profit",
                    loss: "$loss",
                  },
                ],
              ],
            },
          },
        },
        { $unwind: "$itemsList" },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$itemsList.productName" } } },
            productName: { $first: "$itemsList.productName" },
            unitsSold: { $sum: "$itemsList.quantity" },
            totalRevenue: { $sum: "$itemsList.totalAmount" },
            totalCost: { $sum: "$itemsList.totalCost" },
            totalProfit: { $sum: "$itemsList.profit" },
            totalLoss: { $sum: "$itemsList.loss" },
          },
        },
        { $sort: { unitsSold: -1, totalRevenue: -1 } },
        { $limit: parsedTopLimit },
        {
          $project: {
            productName: "$productName",
            unitsSold: "$unitsSold",
            totalRevenue: { $round: ["$totalRevenue", 2] },
            totalCost: { $round: ["$totalCost", 2] },
            totalProfit: { $round: ["$totalProfit", 2] },
            totalLoss: { $round: ["$totalLoss", 2] },
            netProfit: { $round: [{ $subtract: ["$totalProfit", "$totalLoss"] }, 2] },
            _id: 0,
          },
        },
      ]),

      // J. Recent Completed Sales for Period (or fallback to latest 10)
      Sale.find(saleDateMatch)
        .sort({ saleDate: -1, _id: -1 })
        .limit(parsedRecentLimit)
        .select(
          "saleNumber productName quantity unitSellingPrice totalAmount unitPurchaseCost totalCost profit loss paymentMethod saleDate status items"
        )
        .lean(),

      // K. Recent Supplier Payments (matching date or latest)
      SupplierPayment.find(paymentDateMatch)
        .sort({ paymentDate: -1, _id: -1 })
        .limit(parsedRecentLimit)
        .lean(),

      // L. Cash Inflows (Sales with Cash payment method)
      Sale.aggregate([
        {
          $match: {
            status: { $in: ["completed", "refunded"] },
            paymentMethod: { $in: ["Cash", "cash"] },
            ...(end ? { saleDate: { $lte: end } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            cumulativeCashSales: { $sum: "$totalAmount" },
            periodCashSales: {
              $sum: {
                $cond: [
                  start ? { $gte: ["$saleDate", start] } : true,
                  "$totalAmount",
                  0,
                ],
              },
            },
          },
        },
      ]),

      // M. Cash Outflows to Suppliers (Supplier payments with Cash payment method)
      SupplierPayment.aggregate([
        {
          $match: {
            status: { $ne: "Cancelled" },
            paymentMethod: { $in: ["Cash", "cash"] },
            ...(end ? { paymentDate: { $lte: end } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            cumulativeCashPaid: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentType", "Supplier Refund"] },
                  { $multiply: ["$amount", -1] },
                  "$amount",
                ],
              },
            },
            periodCashPaid: {
              $sum: {
                $cond: [
                  start ? { $gte: ["$paymentDate", start] } : true,
                  {
                    $cond: [
                      { $eq: ["$paymentType", "Supplier Refund"] },
                      { $multiply: ["$amount", -1] },
                      "$amount",
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),

      // N. Cash Outflows for Daily Expenses (Physical cash disbursements)
      Expense.aggregate([
        {
          $match: {
            paymentMethod: { $nin: ["Bank Transfer", "Card", "Cheque", "Online"] },
            ...(end ? { date: { $lte: end } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            cumulativeCashExpenses: { $sum: "$amount" },
            periodCashExpenses: {
              $sum: {
                $cond: [
                  start ? { $gte: ["$date", start] } : true,
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]),

      // O. Consignment Shopkeeper Accounts Receivable
      Shopkeeper.aggregate([
        {
          $group: {
            _id: null,
            totalDue: { $sum: "$totalDue" },
          },
        },
      ]),

      // P. Active Consignment Stock with other shopkeepers (Stock transferred out of shop)
      ShopkeeperTransfer.aggregate([
        {
          $match: {
            remainingQuantity: { $gt: 0 },
            status: { $ne: "returned" },
          },
        },
        {
          $group: {
            _id: null,
            totalUnitsHeld: { $sum: "$remainingQuantity" },
            totalAgreedValue: {
              $sum: { $multiply: ["$remainingQuantity", "$agreedAmountPerUnit"] },
            },
            totalCostValue: {
              $sum: { $multiply: ["$remainingQuantity", "$unitCost"] },
            },
            activeTransfersCount: { $sum: 1 },
            uniqueShopkeepers: { $addToSet: "$shopkeeperId" },
          },
        },
      ]),
    ]);

    // =========================================================================
    // 3. COMPOSE AUTHORITATIVE STATS
    // =========================================================================
    const salesStats = salesStatsRes[0] || {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      totalLoss: 0,
      totalUnitsSold: 0,
      totalTransactions: 0,
    };

    const periodPurchases = periodPurchasesRes[0] || {
      totalPurchases: 0,
      totalInvoicesCount: 0,
      totalUnitsPurchased: 0,
    };

    const periodPayments = periodPaymentsRes[0] || {
      totalPaidToSuppliers: 0,
      paymentCount: 0,
    };

    const periodExpenses = periodExpensesRes[0] || {
      totalExpenses: 0,
      expenseCount: 0,
    };

    const currentSupplierDue = currentSupplierDueRes[0] || {
      totalCurrentDue: 0,
      allTimePurchases: 0,
      allTimePaid: 0,
      totalInvoices: 0,
      paidInvoicesCount: 0,
      partialInvoicesCount: 0,
      unpaidInvoicesCount: 0,
    };

    const shopEntry = (Array.isArray(inventoryValuationRes) ? inventoryValuationRes.find((r) => r._id === "shop") : null) || {
      inventoryValue: 0,
      totalUnits: 0,
      totalProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      inStockCount: 0,
    };
    const warehouseEntry = (Array.isArray(inventoryValuationRes) ? inventoryValuationRes.find((r) => r._id === "warehouse") : null) || {
      inventoryValue: 0,
      totalUnits: 0,
      totalProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      inStockCount: 0,
    };

    const shopAssetValue = Number((shopEntry.inventoryValue || 0).toFixed(2));
    const warehouseAssetValue = Number((warehouseEntry.inventoryValue || 0).toFixed(2));
    const totalInventoryValue = Number((shopAssetValue + warehouseAssetValue).toFixed(2));
    const totalUnits = (shopEntry.totalUnits || 0) + (warehouseEntry.totalUnits || 0);
    const totalProducts = (shopEntry.totalProducts || 0) + (warehouseEntry.totalProducts || 0);

    // Consignment stock held by other shopkeepers
    const shopkeeperStockData = (shopkeeperStockRes && shopkeeperStockRes[0]) || {
      totalUnitsHeld: 0,
      totalAgreedValue: 0,
      totalCostValue: 0,
      activeTransfersCount: 0,
      uniqueShopkeepers: [],
    };
    const shopkeeperStockValue = Number((shopkeeperStockData.totalAgreedValue || 0).toFixed(2));
    const shopkeeperStockCost = Number((shopkeeperStockData.totalCostValue || 0).toFixed(2));
    const shopkeeperStockUnits = shopkeeperStockData.totalUnitsHeld || 0;
    const shopkeeperCount = shopkeeperStockData.uniqueShopkeepers ? shopkeeperStockData.uniqueShopkeepers.length : 0;

    const inventoryValuation = {
      inventoryValue: totalInventoryValue,
      totalUnits,
      totalProducts,
      lowStockCount: (shopEntry.lowStockCount || 0) + (warehouseEntry.lowStockCount || 0),
      outOfStockCount: (shopEntry.outOfStockCount || 0) + (warehouseEntry.outOfStockCount || 0),
      inStockCount: (shopEntry.inStockCount || 0) + (warehouseEntry.inStockCount || 0),
    };

    const returnStats = returnStatsRes[0] || {
      totalRefundAmount: 0,
      totalCostRefunded: 0,
      totalProfitReversed: 0,
      totalUnitsReturned: 0,
      totalCashRefunded: 0,
      totalReturnsCount: 0,
    };

    // Gross Sales metrics before returns
    const grossRevenue = Number(salesStats.totalSales.toFixed(2));
    const grossCost = Number(salesStats.totalCost.toFixed(2));
    const grossProfit = Number(salesStats.totalProfit.toFixed(2));
    const totalLoss = Number(salesStats.totalLoss.toFixed(2));
    const totalExpenses = Number(periodExpenses.totalExpenses.toFixed(2));

    // Revert financial metrics per requirements:
    // Total Revenue: decrease by retail sale refund amount
    // COGS: decrease by purchase cost basis refunded
    // Gross Profit: adjust by net difference
    const totalRefundAmount = Number(returnStats.totalRefundAmount.toFixed(2));
    const totalCostRefunded = Number(returnStats.totalCostRefunded.toFixed(2));
    const totalProfitReversed = Number(returnStats.totalProfitReversed.toFixed(2));
    const totalUnitsReturned = returnStats.totalUnitsReturned || 0;

    const totalRevenue = Number(Math.max(0, grossRevenue - totalRefundAmount).toFixed(2));
    const totalCost = Number(Math.max(0, grossCost - totalCostRefunded).toFixed(2));
    const totalProfit = Number((grossProfit - totalProfitReversed).toFixed(2));
    const totalUnitsSold = Math.max(0, (salesStats.totalUnitsSold || 0) - totalUnitsReturned);

    // Authoritative Net Profit = Gross Profit (Net of Returns) - Sales Loss - Daily Expenses
    const netProfit = Number((totalProfit - totalLoss - totalExpenses).toFixed(2));
    const avgOrderValue =
      salesStats.totalTransactions > 0
        ? Number((totalRevenue / salesStats.totalTransactions).toFixed(2))
        : 0;

    // --- CASH IN HAND CALCULATION ---
    const cashSalesData = cashSalesRes[0] || {
      cumulativeCashSales: 0,
      periodCashSales: 0,
    };

    const cashRawData = cashSupplierPaymentsRes[0] || {
      cumulativeCashPaid: 0,
      periodCashPaid: 0,
    };
    const cashSupplierPaymentsData = {
      cumulativeCashPaid: Math.max(0, cashRawData.cumulativeCashPaid || 0),
      periodCashPaid: Math.max(0, cashRawData.periodCashPaid || 0),
    };

    const cashExpensesData = cashExpensesRes[0] || {
      cumulativeCashExpenses: 0,
      periodCashExpenses: 0,
    };

    const cashRefundsData = cashRefundsRes[0] || {
      cumulativeCashRefunds: 0,
      periodCashRefunds: 0,
    };

    // Cumulative Physical Cash Position up to selected point in time (or all-time)
    // Deducts supplier payments, daily expenses, and customer refunds
    const cumulativeCashInflows = cashSalesData.cumulativeCashSales;
    const cumulativeCashOutflows =
      cashSupplierPaymentsData.cumulativeCashPaid +
      cashExpensesData.cumulativeCashExpenses +
      cashRefundsData.cumulativeCashRefunds;
    const cashInHand = Number((cumulativeCashInflows - cumulativeCashOutflows).toFixed(2));

    // Period Cash Flow Movement
    const periodCashInflows = Number(cashSalesData.periodCashSales.toFixed(2));
    const periodCashOutflows = Number(
      (
        cashSupplierPaymentsData.periodCashPaid +
        cashExpensesData.periodCashExpenses +
        cashRefundsData.periodCashRefunds
      ).toFixed(2)
    );
    const periodNetCashMovement = Number((periodCashInflows - periodCashOutflows).toFixed(2));

    // Accounts Payable calculation
    const totalSupplierDueVal = Number((currentSupplierDue.totalCurrentDue || 0).toFixed(2));
    const combinedTotalAccountsPayable = totalSupplierDueVal;
    const totalShopkeeperDueVal = Number(((shopkeeperDueRes && shopkeeperDueRes[0]?.totalDue) || 0).toFixed(2));

    const mergedTrend = Array.isArray(profitLossTrendRes) ? profitLossTrendRes : [];

    const responsePayload = {
      success: true,
      filter: {
        period: activePeriod,
        label,
        start,
        end,
        groupByFormat,
      },
      // Core KPI Cards
      kpis: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalLoss,
        totalExpenses,
        expenseCount: periodExpenses.expenseCount,
        netProfit,
        totalCashPaidToSuppliers: Number(
          Math.max(
            Number((periodPayments.totalPaidToSuppliers || 0).toFixed(2)),
            Number((currentSupplierDue.allTimePaid || 0).toFixed(2))
          )
        ),
        currentSupplierDue: combinedTotalAccountsPayable,
        totalAccountsPayable: combinedTotalAccountsPayable,
        supplierDue: totalSupplierDueVal,
        shopkeeperDue: totalShopkeeperDueVal,
        localPurchaseProfit: 0,
        localPurchaseCost: 0,
        localPurchaseSelling: 0,
        localPurchaseUnits: 0,
        localPurchaseCount: 0,
        totalUnitsSold,
        totalInventoryValue,
        shopAssetValue,
        shopUnits: shopEntry.totalUnits || 0,
        shopProducts: shopEntry.totalProducts || 0,
        warehouseAssetValue,
        warehouseUnits: warehouseEntry.totalUnits || 0,
        warehouseProducts: warehouseEntry.totalProducts || 0,
        // Shopkeeper Consignment Stock (stock that went from my shop to other shop)
        shopkeeperStockValue,
        shopkeeperStockCost,
        shopkeeperStockUnits,
        shopkeeperCount,
        // Returns & Refunds KPI metrics
        totalRefunds: totalRefundAmount,
        totalCostRefunded,
        totalProfitReversed,
        totalUnitsReturned,
        totalReturnsCount: returnStats.totalReturnsCount || 0,
        grossRevenue,
        grossCost,
        grossProfit,
        // Supporting KPI counters
        totalTransactions: salesStats.totalTransactions,
        avgOrderValue,
        // Real Business Cash Position
        cashInHand,
        periodCashInflows,
        periodCashOutflows,
        periodNetCashMovement,
      },
      // Returns & Refunds Summary
      returnsSummary: {
        totalOriginalSoldPrice: Number((returnStats.totalOriginalSoldPrice || 0).toFixed(2)),
        totalRefundAmount,
        totalRetainedProfit: Number((returnStats.totalRetainedProfit || 0).toFixed(2)),
        totalCostRefunded,
        totalProfitReversed,
        totalUnitsReturned,
        totalReturnsCount: returnStats.totalReturnsCount || 0,
        cashRefunded: Number((returnStats.totalCashRefunded || 0).toFixed(2)),
      },
      // Cash Position & Movement Details
      cashSummary: {
        cashInHand,
        periodCashInflows,
        periodCashOutflows,
        periodNetCashMovement,
        cumulativeCashInflows: Number(cumulativeCashInflows.toFixed(2)),
        cumulativeCashOutflows: Number(cumulativeCashOutflows.toFixed(2)),
        periodCashSales: periodCashInflows,
        periodSupplierCashPaid: Number(cashSupplierPaymentsData.periodCashPaid.toFixed(2)),
        periodExpensesCash: Number(cashExpensesData.periodCashExpenses.toFixed(2)),
        periodCashRefunds: Number(cashRefundsData.periodCashRefunds.toFixed(2)),
        periodLocalPurchasesCash: 0,
        periodLocalSettlementsCash: 0,
      },
      // Daily Expenses Summary
      expensesSummary: {
        totalExpenses,
        expenseCount: periodExpenses.expenseCount,
      },
      // P&L Trend Chart Data
      profitLossTrend: mergedTrend,
      // Top Selling Leaderboard
      topSellingItems: topSellingRes,
      // Recent Sales List
      recentSales: recentSalesRes,
      // Recent Returns List
      recentReturns: recentReturnsRes,
      // Supplier Financial Summary
      supplierSummary: {
        // Period metrics
        periodPurchases: Number(periodPurchases.totalPurchases.toFixed(2)),
        periodPaid: Number(periodPayments.totalPaidToSuppliers.toFixed(2)),
        periodInvoicesCount: periodPurchases.totalInvoicesCount,
        // Current state liabilities
        currentOutstandingDue: combinedTotalAccountsPayable,
        supplierOutstandingDue: totalSupplierDueVal,
        shopkeeperOutstandingDue: totalShopkeeperDueVal,
        totalSuppliersCount: supplierCountRes || 0,
        suppliersWithDebtCount: suppliersWithDueRes ? suppliersWithDueRes.length : 0,
        allTimePurchases: Number(currentSupplierDue.allTimePurchases.toFixed(2)),
        allTimePaid: Number(currentSupplierDue.allTimePaid.toFixed(2)),
        // Invoice status breakdown
        invoicesBreakdown: {
          total: currentSupplierDue.totalInvoices,
          paid: currentSupplierDue.paidInvoicesCount,
          partial: currentSupplierDue.partialInvoicesCount,
          unpaid: currentSupplierDue.unpaidInvoicesCount,
        },
      },
      // Recent Supplier Payments
      recentSupplierPayments: recentPaymentsRes,
      // Current-State Inventory Snapshot
      inventorySnapshot: {
        shop: {
          inventoryValue: shopAssetValue,
          totalUnits: shopEntry.totalUnits || 0,
          totalProducts: shopEntry.totalProducts || 0,
          lowStockCount: shopEntry.lowStockCount || 0,
          outOfStockCount: shopEntry.outOfStockCount || 0,
          inStockCount: shopEntry.inStockCount || 0,
        },
        warehouse: {
          inventoryValue: warehouseAssetValue,
          totalUnits: warehouseEntry.totalUnits || 0,
          totalProducts: warehouseEntry.totalProducts || 0,
          lowStockCount: warehouseEntry.lowStockCount || 0,
          outOfStockCount: warehouseEntry.outOfStockCount || 0,
          inStockCount: warehouseEntry.inStockCount || 0,
        },
        shopkeeperConsignment: {
          inventoryValue: shopkeeperStockCost,
          expectedValue: shopkeeperStockValue,
          totalUnits: shopkeeperStockUnits,
          shopkeeperCount,
        },
        total: {
          inventoryValue: totalInventoryValue,
          totalUnits,
          totalProducts,
          lowStockCount: (shopEntry.lowStockCount || 0) + (warehouseEntry.lowStockCount || 0),
          outOfStockCount: (shopEntry.outOfStockCount || 0) + (warehouseEntry.outOfStockCount || 0),
          inStockCount: (shopEntry.inStockCount || 0) + (warehouseEntry.inStockCount || 0),
        },
        totalProducts: shopEntry.totalProducts || 0,
        totalUnits: shopEntry.totalUnits || 0,
        inventoryValue: shopAssetValue,
        lowStockCount: shopEntry.lowStockCount || 0,
        outOfStockCount: shopEntry.outOfStockCount || 0,
        inStockCount: shopEntry.inStockCount || 0,
      },
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate dashboard overview.",
    });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/stats
 */
const getDashboardStats = async (req, res) => {
  return getDashboardOverview(req, res);
};

/**
 * Sub-endpoint: GET /api/dashboard/recent-sales
 */
const getRecentSales = async (req, res) => {
  try {
    const { period, from, to, limit = 15 } = req.query;
    const { start, end } = getDateRangeFilter(period, from, to);
    const saleDateMatch = {
      status: "completed",
      ...buildDateMatch("saleDate", start, end),
    };

    const sales = await Sale.find(saleDateMatch)
      .sort({ saleDate: -1, _id: -1 })
      .limit(Math.min(parseInt(limit, 10) || 15, 100))
      .lean();

    return res.status(200).json({ success: true, data: sales });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/top-selling
 */
const getTopSelling = async (req, res) => {
  try {
    const { period, from, to, limit = 10 } = req.query;
    const { start, end } = getDateRangeFilter(period, from, to);
    const saleDateMatch = {
      status: "completed",
      ...buildDateMatch("saleDate", start, end),
    };

    const topSelling = await Sale.aggregate([
      { $match: saleDateMatch },
      {
        $project: {
          itemsList: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
              "$items",
              [
                {
                  productName: "$productName",
                  quantity: "$quantity",
                  totalAmount: "$totalAmount",
                  totalCost: "$totalCost",
                  profit: "$profit",
                  loss: "$loss",
                },
              ],
            ],
          },
        },
      },
      { $unwind: "$itemsList" },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$itemsList.productName" } } },
          productName: { $first: "$itemsList.productName" },
          unitsSold: { $sum: "$itemsList.quantity" },
          totalRevenue: { $sum: "$itemsList.totalAmount" },
          totalProfit: { $sum: "$itemsList.profit" },
          totalLoss: { $sum: "$itemsList.loss" },
        },
      },
      { $sort: { unitsSold: -1, totalRevenue: -1 } },
      { $limit: Math.min(parseInt(limit, 10) || 10, 50) },
    ]);

    return res.status(200).json({ success: true, data: topSelling });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/profit-loss
 */
const getProfitLoss = async (req, res) => {
  try {
    const { period, from, to } = req.query;
    const { start, end, groupByFormat } = getDateRangeFilter(period, from, to);
    const saleDateMatch = {
      status: "completed",
      ...buildDateMatch("saleDate", start, end),
    };

    const trend = await Sale.aggregate([
      { $match: saleDateMatch },
      {
        $group: {
          _id: { $dateToString: { format: groupByFormat, date: "$saleDate" } },
          revenue: { $sum: "$totalAmount" },
          cost: { $sum: "$totalCost" },
          profit: { $sum: "$profit" },
          loss: { $sum: "$loss" },
          units: { $sum: "$quantity" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          revenue: { $round: ["$revenue", 2] },
          cost: { $round: ["$cost", 2] },
          profit: { $round: ["$profit", 2] },
          loss: { $round: ["$loss", 2] },
          netProfit: { $round: [{ $subtract: ["$profit", "$loss"] }, 2] },
          units: "$units",
          transactions: "$transactions",
          _id: 0,
        },
      },
    ]);

    return res.status(200).json({ success: true, data: trend });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/supplier-summary
 */
const getSupplierSummary = async (req, res) => {
  try {
    const { period, from, to } = req.query;
    const { start, end } = getDateRangeFilter(period, from, to);

    const [periodPurchases, periodPayments, currentDue, totalSuppliers, suppliersWithDue] =
      await Promise.all([
        PurchaseInvoice.aggregate([
          { $match: { isLinkedToLedger: true, ...buildDateMatch("purchaseDate", start, end) } },
          { $group: { _id: null, totalPurchases: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
        ]),
        SupplierPayment.aggregate([
          {
            $match: {
              status: { $ne: "Cancelled" },
              ...buildDateMatch("paymentDate", start, end),
            },
          },
          { $group: { _id: null, totalPaid: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        PurchaseInvoice.aggregate([
          {
            $match: {
              isLinkedToLedger: true,
            },
          },
          {
            $group: {
              _id: null,
              totalDue: { $sum: "$amountDue" },
              allTimePurchases: { $sum: "$totalAmount" },
              allTimePaid: { $sum: "$amountPaid" },
              totalInvoices: { $sum: 1 },
            },
          },
        ]),
        Supplier.countDocuments({}),
        PurchaseInvoice.distinct("supplierId", {
          isLinkedToLedger: true,
          supplierId: { $ne: null },
          amountDue: { $gt: 0 },
        }),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        periodPurchases: periodPurchases[0]?.totalPurchases || 0,
        periodPaid: periodPayments[0]?.totalPaid || 0,
        currentOutstandingDue: currentDue[0]?.totalDue || 0,
        totalSuppliersCount: totalSuppliers || 0,
        suppliersWithDebtCount: suppliersWithDue?.length || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/recent-payments
 */
const getRecentPayments = async (req, res) => {
  try {
    const { period, from, to, limit = 10 } = req.query;
    const { start, end } = getDateRangeFilter(period, from, to);
    const filter = {
      status: { $ne: "Cancelled" },
      ...buildDateMatch("paymentDate", start, end),
    };

    const payments = await SupplierPayment.find(filter)
      .sort({ paymentDate: -1, _id: -1 })
      .limit(Math.min(parseInt(limit, 10) || 10, 50))
      .lean();

    return res.status(200).json({ success: true, data: payments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sub-endpoint: GET /api/dashboard/inventory-summary
 */
const getInventorySummary = async (req, res) => {
  try {
    const agg = await Stock.aggregate([
      {
        $group: {
          _id: null,
          inventoryValue: {
            $sum: {
              $multiply: [
                { $max: ["$quantity", 0] },
                { $ifNull: ["$unitPrice", 0] },
              ],
            },
          },
          totalUnits: { $sum: { $max: ["$quantity", 0] } },
          totalProducts: {
            $sum: { $cond: [{ $gt: ["$quantity", 0] }, 1, 0] },
          },
          lowStockCount: {
            $sum: {
              $cond: [{ $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", 20] }] }, 1, 0],
            },
          },
          outOfStockCount: {
            $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] },
          },
        },
      },
    ]);

    const result = agg[0] || {
      inventoryValue: 0,
      totalUnits: 0,
      totalProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getCacheDiagnostics = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "In-memory caching is disabled.",
  });
};

module.exports = {
  getDashboardOverview,
  getDashboardStats,
  getRecentSales,
  getTopSelling,
  getProfitLoss,
  getSupplierSummary,
  getRecentPayments,
  getInventorySummary,
  getDateRangeFilter,
  getCacheDiagnostics,
};

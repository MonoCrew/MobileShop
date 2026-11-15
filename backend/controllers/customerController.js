const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Stock = require("../models/Stock");
const SupplierPayment = require("../models/SupplierPayment");
const { autoSettleTradeInInvoices } = require("./supplierController");

/**
 * @route   GET /api/customers
 * @desc    Search and list customers with balances and pagination
 */
const getCustomers = async (req, res) => {
  try {
    if (typeof autoSettleTradeInInvoices === "function") {
      await autoSettleTradeInInvoices();
    }
    const { search = "", limit = 30, page = 1, sort = "newest", withBalanceOnly = "false" } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = {};
    if (search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    if (withBalanceOnly === "true") {
      query.balance = { $gt: 0 };
    }

    let sortObj = { createdAt: -1 };
    if (sort === "balance_desc") sortObj = { balance: -1, name: 1 };
    if (sort === "name_asc") sortObj = { name: 1 };

    const [customers, totalCount, aggregateStats] = await Promise.all([
      Customer.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parsedLimit)
        .select("-ledger")
        .lean(),
      Customer.countDocuments(query),
      Customer.aggregate([
        {
          $group: {
            _id: null,
            totalStoreCreditOwed: { $sum: "$balance" },
            customersWithBalance: {
              $sum: { $cond: [{ $gt: ["$balance", 0] }, 1, 0] },
            },
            totalCustomers: { $sum: 1 },
          },
        },
      ]),
    ]);

    const customerIds = customers.map((c) => c._id);
    const customerNames = customers.map((c) => c.name).filter(Boolean);

    const [customerInvoiceStats, customerStockStats, customerPayStats] = await Promise.all([
      PurchaseInvoice.aggregate([
        {
          $match: {
            $or: [
              { customerId: { $in: customerIds } },
              { isLocalPurchase: true, customerName: { $in: customerNames } },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$customerId", { $toLower: "$customerName" }] },
            totalOrders: { $sum: 1 },
            totalPurchases: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
            totalDue: { $sum: { $ifNull: ["$amountDue", 0] } },
          },
        },
      ]),
      Stock.aggregate([
        {
          $match: {
            $or: [
              { customerId: { $in: customerIds } },
              { isLocalPurchase: true, customerName: { $in: customerNames } },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$customerId", { $toLower: "$customerName" }] },
            stockCount: { $sum: 1 },
            stockUnits: { $sum: { $ifNull: ["$quantity", 0] } },
            stockValue: { $sum: { $multiply: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$unitPrice", 0] }] } },
            stockPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
            stockDue: { $sum: { $ifNull: ["$amountDue", 0] } },
          },
        },
      ]),
      SupplierPayment.aggregate([
        {
          $match: {
            customerId: { $in: customerIds },
          },
        },
        {
          $group: {
            _id: "$customerId",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const custInvoiceMap = new Map();
    if (Array.isArray(customerInvoiceStats)) {
      customerInvoiceStats.forEach((s) => {
        if (s && s._id) {
          custInvoiceMap.set(String(s._id), s);
          if (typeof s._id === "string") custInvoiceMap.set(s._id.toLowerCase(), s);
        }
      });
    }

    const custStockMap = new Map();
    if (Array.isArray(customerStockStats)) {
      customerStockStats.forEach((s) => {
        if (s && s._id) {
          custStockMap.set(String(s._id), s);
          if (typeof s._id === "string") custStockMap.set(s._id.toLowerCase(), s);
        }
      });
    }

    const custPayMap = new Map();
    if (Array.isArray(customerPayStats)) {
      customerPayStats.forEach((s) => {
        if (s && s._id) custPayMap.set(String(s._id), s);
      });
    }

    const enrichedCustomers = customers.map((cust) => {
      const idStr = String(cust._id);
      const nameLower = (cust.name || "").trim().toLowerCase();
      const invId = custInvoiceMap.get(idStr);
      const invName = custInvoiceMap.get(nameLower);
      const stId = custStockMap.get(idStr);
      const stName = custStockMap.get(nameLower);
      const pay = custPayMap.get(idStr);

      let totalPurchases = 0;
      let totalPaid = 0;
      let totalOrders = 0;

      if (invId || invName) {
        const pId = invId ? (invId.totalPurchases || 0) : 0;
        const pName = (invName && invName !== invId) ? (invName.totalPurchases || 0) : 0;
        totalPurchases = Number((pId + pName).toFixed(2));

        const paidId = invId ? (invId.totalPaid || 0) : 0;
        const paidName = (invName && invName !== invId) ? (invName.totalPaid || 0) : 0;
        totalPaid = Number((paidId + paidName).toFixed(2));

        const oId = invId ? (invId.totalOrders || 0) : 0;
        const oName = (invName && invName !== invId) ? (invName.totalOrders || 0) : 0;
        totalOrders = oId + oName;
      } else if (stId || stName) {
        const vId = stId ? (stId.stockValue || 0) : 0;
        const vName = (stName && stName !== stId) ? (stName.stockValue || 0) : 0;
        totalPurchases = Number((vId + vName).toFixed(2));

        const paidId = stId ? (stId.stockPaid || 0) : 0;
        const paidName = (stName && stName !== stId) ? (stName.stockPaid || 0) : 0;
        totalPaid = Number((paidId + paidName).toFixed(2));

        const cId = stId ? (stId.stockCount || 0) : 0;
        const cName = (stName && stName !== stId) ? (stName.stockCount || 0) : 0;
        totalOrders = cId + cName;
      }

      if (pay && pay.totalPaid > 0) {
        totalPaid = Number((pay.totalPaid || 0).toFixed(2));
      }

      let totalDue = Number((totalPurchases - totalPaid).toFixed(2));
      if (cust.balance && cust.balance > 0) {
        totalDue = Number((totalDue + cust.balance).toFixed(2));
      }

      return {
        ...cust,
        isCustomer: true,
        type: "customer",
        totalPurchases,
        totalPaid,
        totalDue,
        totalOrders,
        paymentStatus: totalDue === 0 ? "Settled" : totalDue > 0 ? (totalPaid > 0 ? "Partial" : "Due") : "Credit",
      };
    });

    const stats = aggregateStats[0] || {
      totalStoreCreditOwed: 0,
      customersWithBalance: 0,
      totalCustomers: totalCount,
    };

    return res.status(200).json({
      success: true,
      data: enrichedCustomers,
      stats: {
        totalStoreCreditOwed: Number((stats.totalStoreCreditOwed || 0).toFixed(2)),
        customersWithBalance: stats.customersWithBalance || 0,
        totalCustomers: stats.totalCustomers || totalCount,
      },
      pagination: {
        totalCount,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit),
        hasMore: skip + customers.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch customers.",
    });
  }
};

/**
 * @route   GET /api/customers/:id
 * @desc    Get customer profile and complete ledger
 */
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID format." });
    }

    const customer = await Customer.findById(id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found." });
    }

    // Sort ledger newest first for UI display
    if (Array.isArray(customer.ledger)) {
      customer.ledger.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return res.status(200).json({ success: true, data: customer });
  } catch (error) {
    console.error("Error fetching customer:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/customers
 * @desc    Create a new customer profile
 */
const createCustomer = async (req, res) => {
  try {
    const { name, phone = "", email = "", address = "", notes = "", initialBalance = 0 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Customer name is required." });
    }

    const initBal = Number(initialBalance) || 0;
    const newCustomer = new Customer({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      notes: notes.trim(),
      balance: Math.max(0, initBal),
      totalStoreCreditIssued: Math.max(0, initBal),
      ledger:
        initBal > 0
          ? [
              {
                date: new Date(),
                type: "credit",
                amount: initBal,
                balanceAfter: initBal,
                referenceType: "Manual",
                description: "Initial store credit balance",
              },
            ]
          : [],
    });

    await newCustomer.save();

    return res.status(201).json({
      success: true,
      data: newCustomer,
      message: "Customer created successfully.",
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/customers/:id/settle-balance
 * @desc    Settle owed store credit balance via cash or card payout
 */
const settleBalance = async (req, res) => {
  const { id } = req.params;
  const { amount, payoutMethod = "Cash", notes = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid customer ID format." });
  }

  const payoutAmount = Number(amount);
  if (isNaN(payoutAmount) || payoutAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Payout amount must be a positive number greater than 0.",
    });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const customer = await Customer.findById(id).session(session);
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Customer not found." });
    }

    const currentBal = Number(customer.balance || 0);
    if (payoutAmount > currentBal) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Payout amount ($${payoutAmount.toFixed(
          2
        )}) exceeds customer's current store credit balance ($${currentBal.toFixed(2)}).`,
        currentBalance: currentBal,
      });
    }

    const newBalance = Number((currentBal - payoutAmount).toFixed(2));
    customer.balance = newBalance;
    customer.totalCashPayouts = Number(((customer.totalCashPayouts || 0) + payoutAmount).toFixed(2));

    const ledgerEntry = {
      date: new Date(),
      type: "payout",
      amount: payoutAmount,
      balanceAfter: newBalance,
      referenceType: "Payout",
      referenceNumber: `PAYOUT-${Date.now().toString().slice(-6)}`,
      description: notes.trim() || `Cash payout of store credit balance (${payoutMethod})`,
      processedBy: "Admin",
    };

    customer.ledger.push(ledgerEntry);
    await customer.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: `Successfully paid out $${payoutAmount.toFixed(2)} to ${customer.name}.`,
      data: {
        customerId: customer._id,
        customerName: customer.name,
        payoutAmount,
        payoutMethod,
        remainingBalance: newBalance,
        ledgerEntry,
      },
    });
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    console.error("Error settling customer balance:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process balance settlement.",
    });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {}
    }
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  settleBalance,
};

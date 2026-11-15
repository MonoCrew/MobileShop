const mongoose = require("mongoose");
const Return = require("../models/Return");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const StockItem = require("../models/StockItem");
const Customer = require("../models/Customer");
const ShopkeeperTransfer = require("../models/ShopkeeperTransfer");

/**
 * Generate unique human-readable Return Number (e.g. RET-261007-8391)
 */
const generateUniqueReturnNumber = async (session = null) => {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  let isUnique = false;
  let attempts = 0;
  let returnNum = "";

  while (!isUnique && attempts < 30) {
    attempts++;
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    returnNum = `RET-${yy}${mm}${dd}-${randomPart}`;

    const query = Return.findOne({ returnNumber: returnNum });
    if (session) query.session(session);
    const existing = await query.lean();

    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    returnNum = `RET-${yy}${mm}${dd}-${Date.now().toString().slice(-4)}`;
  }

  return returnNum;
};

/**
 * Generate unique Sale Number for exchange transactions
 */
const generateUniqueSaleNumber = async (session = null) => {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  let isUnique = false;
  let attempts = 0;
  let saleNum = "";

  while (!isUnique && attempts < 30) {
    attempts++;
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    saleNum = `SALE-EXC-${yy}${mm}${dd}-${randomPart}`;

    const query = Sale.findOne({ saleNumber: saleNum });
    if (session) query.session(session);
    const existing = await query.lean();

    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    saleNum = `SALE-EXC-${yy}${mm}${dd}-${Date.now().toString().slice(-4)}`;
  }

  return saleNum;
};

/**
 * @route   GET /api/returns/lookup
 * @desc    Fast lookup by barcode scan, invoice/sale number, or product search
 */
/**
 * @route   GET /api/returns/lookup
 * @desc    Strict lookup for an existing completed sale by sale number, ID, customer, barcode, or product name
 */
const lookupReturn = async (req, res) => {
  try {
    const { query = "", barcode = "", saleNumber = "" } = req.query;
    const term = (query || barcode || saleNumber).trim();

    if (!term) {
      return res.status(400).json({
        success: false,
        message: "Please enter a Sale ID, Invoice #, Barcode, or Customer name to find a sale.",
      });
    }

    let foundSale = null;

    // 1. Search by exact or regex sale number or _id
    if (mongoose.Types.ObjectId.isValid(term)) {
      foundSale = await Sale.findById(term).lean();
    }
    if (!foundSale) {
      foundSale = await Sale.findOne({
        saleNumber: { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        status: { $ne: "cancelled" },
      }).lean();
    }
    if (!foundSale) {
      foundSale = await Sale.findOne({
        saleNumber: { $regex: term, $options: "i" },
        status: { $ne: "cancelled" },
      })
        .sort({ saleDate: -1 })
        .lean();
    }

    // 2. Search by barcode in items or sold barcodes
    if (!foundSale) {
      foundSale = await Sale.findOne({
        $or: [
          { barcode: term },
          { soldBarcodes: term },
          { "items.barcode": term },
          { "items.soldBarcodes": term },
        ],
        status: { $ne: "cancelled" },
      })
        .sort({ saleDate: -1 })
        .lean();
    }

    // 3. Search by product name or customer
    if (!foundSale) {
      foundSale = await Sale.findOne({
        $or: [
          { productName: { $regex: term, $options: "i" } },
          { "items.productName": { $regex: term, $options: "i" } },
          { customerName: { $regex: term, $options: "i" } },
          { customerPhone: { $regex: term, $options: "i" } },
        ],
        status: { $ne: "cancelled" },
      })
        .sort({ saleDate: -1 })
        .lean();
    }

    if (!foundSale) {
      return res.status(404).json({
        success: false,
        message: `No completed sale found matching "${term}". Returns must be based on an actual completed sale.`,
      });
    }

    // Format items with remaining returnable quantity calculation
    const rawItems =
      foundSale.items && foundSale.items.length > 0
        ? foundSale.items
        : [
            {
              stockId: foundSale.stockId,
              productName: foundSale.productName,
              barcode: foundSale.barcode,
              category: foundSale.category,
              quantity: foundSale.quantity,
              unitPurchaseCost: foundSale.unitPurchaseCost,
              unitSellingPrice: foundSale.unitSellingPrice,
              totalAmount: foundSale.totalAmount,
              totalCost: foundSale.totalCost,
              returnedQuantity: foundSale.returnedQuantity || 0,
              refundedAmount: foundSale.refundedAmount || 0,
              soldStockItemIds: foundSale.soldStockItemIds || [],
              soldBarcodes: foundSale.soldBarcodes || [],
            },
          ];

    const eligibleItems = rawItems.map((it) => {
      const soldQty = Number(it.quantity || 1);
      const returnedQty = Number(it.returnedQuantity || 0);
      const returnableQty = Math.max(0, soldQty - returnedQty);
      const unitCost = Number(it.unitPurchaseCost || 0);
      const unitPrice = Number(
        it.unitSellingPrice ||
          (soldQty > 0 && it.totalAmount ? it.totalAmount / soldQty : 0) ||
          0
      );
      const profitPerUnit = Math.max(0, unitPrice - unitCost);

      return {
        _id: it._id,
        stockId: it.stockId,
        productName: it.productName,
        storage: it.storage || "",
        color: it.color || "",
        barcode: it.barcode || "N/A",
        category: it.category || "General",
        soldQuantity: soldQty,
        alreadyReturnedQuantity: returnedQty,
        availableReturnQuantity: returnableQty,
        originalSellingPrice: unitPrice,
        originalCostPrice: unitCost,
        originalProfit: Number(profitPerUnit.toFixed(2)),
        totalAmount: Number(it.totalAmount || unitPrice * soldQty),
        soldStockItemIds: it.soldStockItemIds || [],
        soldBarcodes: it.soldBarcodes || [],
        isEligible: returnableQty > 0,
        saleSource: it.saleSource || foundSale.saleSource || (foundSale.shopkeeperName ? "shopkeeper" : "direct"),
        shopkeeperName: it.shopkeeperName || foundSale.shopkeeperName || "",
        shopkeeperId: it.shopkeeperId || foundSale.shopkeeperId || null,
        shopkeeperTransferId: it.shopkeeperTransferId || foundSale.shopkeeperTransferId || null,
      };
    });

    let customer = null;
    if (foundSale.customerId) {
      customer = await Customer.findById(foundSale.customerId)
        .select("name phone balance")
        .lean();
    }

    const saleTotal = Number(foundSale.totalAmount || 0);
    const refundedTotal = Number(foundSale.refundedAmount || 0);
    const remainingRefundable = Math.max(
      0,
      Number((saleTotal - refundedTotal).toFixed(2))
    );

    return res.status(200).json({
      success: true,
      lookupType: "invoice",
      data: {
        sale: {
          _id: foundSale._id,
          saleNumber: foundSale.saleNumber,
          saleDate: foundSale.saleDate,
          customerName:
            foundSale.customerName ||
            (foundSale.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim()) ||
            (customer ? customer.name : "Walk-in Customer"),
          customerPhone:
            foundSale.customerPhone || (customer ? customer.phone : ""),
          customerId: foundSale.customerId || null,
          customerBalance: customer ? customer.balance : 0,
          paymentMethod: foundSale.paymentMethod || "Cash",
          originalSaleTotal: saleTotal,
          alreadyRefunded: refundedTotal,
          remainingRefundableAmount: remainingRefundable,
          status: foundSale.status,
          returnStatus: foundSale.returnStatus || "none",
          saleSource:
            foundSale.saleSource ||
            (rawItems.some((it) => it.saleSource === "shopkeeper" || it.shopkeeperName)
              ? "shopkeeper"
              : "direct"),
          shopkeeperName:
            foundSale.shopkeeperName ||
            rawItems.find((it) => it.shopkeeperName)?.shopkeeperName ||
            "",
          shopkeeperId:
            foundSale.shopkeeperId ||
            rawItems.find((it) => it.shopkeeperId)?.shopkeeperId ||
            null,
          shopkeeperTransferId:
            foundSale.shopkeeperTransferId ||
            rawItems.find((it) => it.shopkeeperTransferId)?.shopkeeperTransferId ||
            null,
        },
        items: eligibleItems,
      },
    });
  } catch (error) {
    console.error("Error in lookupReturn:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to perform lookup.",
    });
  }
};

/**
 * @route   GET /api/returns/search
 * @route   GET /api/returns/search-products
 * @desc    Search matching completed sales from DB by invoice #, customer name/phone, barcode, or product
 */
const searchReturnProducts = async (req, res) => {
  try {
    const {
      query = "",
      limit = 50,
      period = "all",
      startDate,
      endDate,
      customFrom,
      customTo,
    } = req.query;
    const term = query.trim();

    const maxResults = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const regex = term ? new RegExp(term, "i") : null;

    const queryFilter = {
      status: { $ne: "cancelled" },
    };

    if (regex) {
      queryFilter.$or = [
        { saleNumber: regex },
        { customerName: regex },
        { customerPhone: regex },
        { productName: regex },
        { barcode: regex },
        { soldBarcodes: regex },
        { "items.productName": regex },
        { "items.barcode": regex },
        { "items.soldBarcodes": regex },
      ];
    }

    // Apply Date Range Filtering: Today, Yesterday, or Custom Date Range
    const fromDate = startDate || customFrom;
    const toDate = endDate || customTo;

    if (fromDate || toDate) {
      queryFilter.saleDate = {};
      if (fromDate) {
        const parts = String(fromDate).split("-").map(Number);
        if (parts.length === 3) {
          queryFilter.saleDate.$gte = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        } else {
          const s = new Date(fromDate);
          s.setHours(0, 0, 0, 0);
          queryFilter.saleDate.$gte = s;
        }
      }
      if (toDate) {
        const parts = String(toDate).split("-").map(Number);
        if (parts.length === 3) {
          queryFilter.saleDate.$lte = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
        } else {
          const e = new Date(toDate);
          e.setHours(23, 59, 59, 999);
          queryFilter.saleDate.$lte = e;
        }
      }
    } else if (period && period !== "all") {
      const now = new Date();
      if (period === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        queryFilter.saleDate = { $gte: start, $lte: end };
      } else if (period === "yesterday") {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
        const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        queryFilter.saleDate = { $gte: start, $lte: end };
      }
    }

    // Strictly search ONLY from the Sale collection (only completed/refunded sales)
    const matchingSales = await Sale.find(queryFilter)
      .sort({ saleDate: -1 })
      .limit(maxResults)
      .lean();

    const sales = [];
    const results = [];
    const seenItemKeys = new Set();

    for (const sale of matchingSales) {
      const saleItems =
        sale.items && sale.items.length > 0
          ? sale.items
          : [
              {
                productName: sale.productName,
                barcode: sale.barcode,
                quantity: sale.quantity,
                returnedQuantity: sale.returnedQuantity || 0,
                unitPurchaseCost: sale.unitPurchaseCost,
                unitSellingPrice: sale.unitSellingPrice,
                totalAmount: sale.totalAmount,
              },
            ];

      const totalSold = saleItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
      const totalReturned = saleItems.reduce(
        (acc, it) => acc + (it.returnedQuantity || 0),
        0
      );
      const returnableUnits = Math.max(0, totalSold - totalReturned);

      // Only include sales that have pending returnable units
      if (returnableUnits <= 0) continue;

      sales.push({
        _id: sale._id,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        customerName:
          sale.customerName ||
          (sale.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim()) ||
          "Walk-in Customer",
        customerPhone: sale.customerPhone || "",
        paymentMethod: sale.paymentMethod || "Cash",
        totalAmount: Number(sale.totalAmount || 0),
        refundedAmount: Number(sale.refundedAmount || 0),
        remainingRefundableAmount: Math.max(
          0,
          Number(((sale.totalAmount || 0) - (sale.refundedAmount || 0)).toFixed(2))
        ),
        totalSoldUnits: totalSold,
        totalReturnedUnits: totalReturned,
        availableReturnUnits: returnableUnits,
        returnStatus: sale.returnStatus || "none",
        status: sale.status,
        itemsCount: saleItems.length,
        itemsSummary: saleItems
          .map((it) => `${it.productName} (x${it.quantity})`)
          .join(", "),
        isFullyReturned: returnableUnits === 0,
        saleSource:
          sale.saleSource ||
          (saleItems.some((it) => it.saleSource === "shopkeeper" || it.shopkeeperName)
            ? "shopkeeper"
            : "direct"),
        shopkeeperName:
          sale.shopkeeperName ||
          saleItems.find((it) => it.shopkeeperName)?.shopkeeperName ||
          "",
        shopkeeperId:
          sale.shopkeeperId ||
          saleItems.find((it) => it.shopkeeperId)?.shopkeeperId ||
          null,
      });

      for (const item of saleItems) {
        if (!item || !item.productName) continue;

        const isProductMatch =
          !regex ||
          regex.test(item.productName) ||
          (item.barcode && regex.test(item.barcode)) ||
          (Array.isArray(item.soldBarcodes) && item.soldBarcodes.some((bc) => regex.test(bc))) ||
          (Array.isArray(sale.soldBarcodes) && sale.soldBarcodes.some((bc) => regex.test(bc))) ||
          regex.test(sale.saleNumber) ||
          (sale.customerName && regex.test(sale.customerName));

        if (!isProductMatch) continue;

        const soldQty = Number(item.quantity || 1);
        const returnedQty = Number(item.returnedQuantity || 0);
        const returnableQty = Math.max(0, soldQty - returnedQty);

        // Only show items that are actually returnable (returnableQty > 0)
        // Fully refunded items can be inspected in the Return Audit Trail
        if (returnableQty <= 0) continue;

        const uniqueKey = `${sale._id}_${item._id || item.stockId || item.barcode || item.productName}`;
        if (seenItemKeys.has(uniqueKey)) continue;
        seenItemKeys.add(uniqueKey);

        const unitCost = Number(item.unitPurchaseCost || 0);
        const unitSelling = Number(
          item.unitSellingPrice ||
            (soldQty > 0 && item.totalAmount ? item.totalAmount / soldQty : 0) ||
            0
        );

        const itemSoldBarcodes = Array.isArray(item.soldBarcodes) && item.soldBarcodes.length > 0
          ? item.soldBarcodes
          : (Array.isArray(sale.soldBarcodes) && sale.soldBarcodes.length > 0
              ? sale.soldBarcodes
              : (item.barcode && item.barcode !== "N/A" ? [item.barcode] : []));

        const itemSaleSource =
          item.saleSource ||
          sale.saleSource ||
          (item.shopkeeperName || sale.shopkeeperName ? "shopkeeper" : "direct");
        const itemShopkeeperName = item.shopkeeperName || sale.shopkeeperName || "";

        results.push({
          type: "sold_item",
          id: uniqueKey,
          saleId: sale._id,
          saleNumber: sale.saleNumber,
          saleDate: sale.saleDate,
          customerName:
            sale.customerName ||
            (sale.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim()) ||
            "Walk-in Customer",
          customerId: sale.customerId || null,
          customerPhone: sale.customerPhone || "",
          stockId: item.stockId || sale.stockId,
          productName: item.productName,
          barcode: item.barcode || (itemSoldBarcodes.length > 0 ? itemSoldBarcodes[0] : "N/A"),
          soldBarcodes: itemSoldBarcodes,
          category: item.category || "General",
          soldQuantity: soldQty,
          returnedQuantity: returnedQty,
          returnableQuantity: returnableQty,
          unitPurchaseCost: unitCost,
          unitSellingPrice: unitSelling,
          saleSource: itemSaleSource,
          shopkeeperName: itemShopkeeperName,
          shopkeeperId: item.shopkeeperId || sale.shopkeeperId || null,
          title: `${item.productName} (Sale #${sale.saleNumber})`,
          subtitle: `Sold Qty: ${soldQty} | Returnable: ${returnableQty} | Sold At: Rs. ${unitSelling.toLocaleString()} | Date: ${new Date(
            sale.saleDate
          ).toLocaleDateString()}`,
          isEligible: returnableQty > 0,
        });
      }
    }

    return res.status(200).json({
      success: true,
      sales,
      results,
    });
  } catch (error) {
    console.error("Error searching sold items:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/returns
 * @desc    Process stock return & refund / store credit / exchange inside an atomic ACID transaction
 */
const processReturn = async (req, res) => {
  const {
    saleId,
    saleNumber,
    customerId,
    customerName = "Walk-in Customer",
    customerPhone = "",
    settlementType = "cash_payout", // 'cash_payout', 'store_credit', 'exchange'
    payoutMethod = "Cash",
    reason = "Customer Return",
    notes = "",
    exchangeItems = [],
    exchangePaymentMethod = "Cash",
    // Single-item fallback fields from spec
    itemId,
    returnQty,
    originalSoldPrice,
    actualRefundedAmount,
    retainedProfit,
    restoreToInventory,
  } = req.body;

  let items = req.body.items;

  // Support both multi-item payload ({ items: [...] }) and single-item payload ({ itemId, returnQty, ... })
  if ((!Array.isArray(items) || items.length === 0) && (itemId || req.body.stockId || req.body.productId)) {
    items = [
      {
        _id: itemId,
        stockId: req.body.stockId || itemId,
        returnQuantity: returnQty || req.body.returnQuantity || 1,
        originalSoldPrice,
        actualRefundedAmount,
        retainedProfit,
        restoreToInventory: restoreToInventory !== undefined ? restoreToInventory : true,
      },
    ];
  }

  // Validation
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one item must be selected for return.",
    });
  }

  if (!["cash_payout", "store_credit", "exchange"].includes(settlementType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid settlement type. Allowed: 'cash_payout', 'store_credit', 'exchange'.",
    });
  }

  if (settlementType === "exchange" && (!Array.isArray(exchangeItems) || exchangeItems.length === 0)) {
    return res.status(400).json({
      success: false,
      message: "Exchange settlement requires at least one exchange purchase item.",
    });
  }

  let session = null;
  let useTransactions = false;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    useTransactions = true;
  } catch (txErr) {
    session = null;
    useTransactions = false;
  }

  try {
    // 1. Mandatory lookup of original completed Sale
    if (!saleId && !saleNumber) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "A return must be based on an original completed sale. Sale ID or Sale Number is required.",
      });
    }

    let originalSale = null;
    if (saleId && mongoose.Types.ObjectId.isValid(saleId)) {
      const q = Sale.findById(saleId);
      if (useTransactions && session) q.session(session);
      originalSale = await q;
    }

    if (!originalSale && (saleNumber || saleId)) {
      const targetSaleNumber = saleNumber || saleId;
      const q = Sale.findOne({ saleNumber: targetSaleNumber });
      if (useTransactions && session) q.session(session);
      originalSale = await q;
    }

    if (!originalSale) {
      if (useTransactions && session) await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Original sale transaction not found in records. Returns must reference a valid completed sale.",
      });
    }

    // 2. Validate line items & calculate financial impact
    const validatedReturnItems = [];
    let totalOriginalSoldPrice = 0;
    let totalRefundAmount = 0;
    let totalRetainedProfit = 0;
    let totalCostRefunded = 0;
    let totalProfitReversed = 0;
    let totalUnitsReturned = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const returnQty = parseInt(it.returnQuantity, 10);

      if (isNaN(returnQty) || returnQty <= 0) {
        if (useTransactions && session) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Item #${i + 1} (${it.productName || "Unknown"}): Return quantity must be at least 1.`,
        });
      }

      // Find matching item in original sale with barcode/ID specificity
      const saleItems = originalSale.items || [];
      let matchedSaleItem = null;
      if (it._id) {
        matchedSaleItem = saleItems.find((si) => String(si._id) === String(it._id));
      }
      if (!matchedSaleItem && it.barcode && it.barcode !== "N/A") {
        matchedSaleItem = saleItems.find(
          (si) => si.barcode === it.barcode || (si.soldBarcodes && si.soldBarcodes.includes(it.barcode))
        );
      }
      if (!matchedSaleItem && it.stockId) {
        matchedSaleItem = saleItems.find((si) => String(si.stockId) === String(it.stockId));
      }
      if (!matchedSaleItem && it.itemId) {
        matchedSaleItem = saleItems.find(
          (si) => String(si._id) === String(it.itemId) || String(si.stockId) === String(it.itemId)
        );
      }
      if (!matchedSaleItem && it.productName) {
        matchedSaleItem = saleItems.find(
          (si) => si.productName && si.productName.trim().toLowerCase() === String(it.productName).trim().toLowerCase()
        );
      }
      if (!matchedSaleItem && saleItems.length === 1) {
        matchedSaleItem = saleItems[0];
      }

      if (!matchedSaleItem && originalSale.productName) {
        if (
          !it.productName ||
          originalSale.productName.trim().toLowerCase() === String(it.productName).trim().toLowerCase()
        ) {
          matchedSaleItem = originalSale;
        }
      }

      if (matchedSaleItem && !it.productName) {
        it.productName = matchedSaleItem.productName;
      }

      if (!matchedSaleItem) {
        if (useTransactions && session) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Item "${it.productName}" was not part of original sale #${originalSale.saleNumber}. Never allow returning items not on the original sale.`,
        });
      }

      const soldQuantity = Number(matchedSaleItem.quantity || 1);
      const alreadyReturned = Number(matchedSaleItem.returnedQuantity || 0);
      const returnable = Math.max(0, soldQuantity - alreadyReturned);

      if (returnQty > returnable) {
        if (useTransactions && session) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Cannot return ${returnQty} unit(s) of "${matchedSaleItem.productName}". Only ${returnable} unit(s) remaining returnable (Sold: ${soldQuantity}, Already Returned: ${alreadyReturned}).`,
          availableReturnQuantity: returnable,
          soldQuantity,
          alreadyReturnedQuantity: alreadyReturned,
        });
      }

      // Authoritative historical prices strictly from the original sale line item
      const unitCost = Number(matchedSaleItem.unitPurchaseCost || 0);
      const unitPrice = Number(
        matchedSaleItem.unitSellingPrice ||
          (soldQuantity > 0 && matchedSaleItem.totalAmount ? matchedSaleItem.totalAmount / soldQuantity : 0) ||
          0
      );

      const calculatedSoldSubtotal = Number((unitPrice * returnQty).toFixed(2));
      const itemOriginalSoldPrice = (it.originalSoldPrice != null && !isNaN(Number(it.originalSoldPrice)) && Number(it.originalSoldPrice) >= 0)
        ? Number(Number(it.originalSoldPrice).toFixed(2))
        : calculatedSoldSubtotal;

      // Actual cash refund offered/paid to customer
      let itemActualRefund;
      if (it.actualRefundedAmount != null && !isNaN(Number(it.actualRefundedAmount))) {
        itemActualRefund = Number(Number(it.actualRefundedAmount).toFixed(2));
      } else if (it.refundAmount != null && !isNaN(Number(it.refundAmount))) {
        itemActualRefund = Number(Number(it.refundAmount).toFixed(2));
      } else {
        itemActualRefund = itemOriginalSoldPrice;
      }
      // Guard: Cannot refund negative, cannot exceed original sold price
      itemActualRefund = Math.max(0, Math.min(itemActualRefund, itemOriginalSoldPrice));

      // Retained profit / Return processing fee
      let itemRetainedProfit;
      if (it.retainedProfit != null && !isNaN(Number(it.retainedProfit))) {
        itemRetainedProfit = Number(Number(it.retainedProfit).toFixed(2));
      } else {
        itemRetainedProfit = Number((itemOriginalSoldPrice - itemActualRefund).toFixed(2));
      }
      itemRetainedProfit = Math.max(0, itemRetainedProfit);

      const itemCostRefunded = Number((unitCost * returnQty).toFixed(2));
      // Net Profit Reversal = actual money refunded minus restored asset cost
      // Equivalently: (itemOriginalSoldPrice - itemCostRefunded) - itemRetainedProfit = itemActualRefund - itemCostRefunded
      const itemProfitReversed = Number((itemActualRefund - itemCostRefunded).toFixed(2));

      totalOriginalSoldPrice += itemOriginalSoldPrice;
      totalRefundAmount += itemActualRefund;
      totalRetainedProfit += itemRetainedProfit;
      totalCostRefunded += itemCostRefunded;
      totalProfitReversed += itemProfitReversed;
      totalUnitsReturned += returnQty;

      // 3. Locate Stock record and increment inventory stock count
      const targetLocation = (matchedSaleItem.location || originalSale.location || "shop") === "warehouse" ? "warehouse" : "shop";
      let stockDoc = null;
      if (it.barcode && it.barcode !== "N/A") {
        const q = Stock.findOne({ barcode: it.barcode, location: targetLocation });
        if (useTransactions && session) q.session(session);
        stockDoc = await q;
      }
      if (!stockDoc && matchedSaleItem.barcode && matchedSaleItem.barcode !== "N/A") {
        const q = Stock.findOne({ barcode: matchedSaleItem.barcode, location: targetLocation });
        if (useTransactions && session) q.session(session);
        stockDoc = await q;
      }
      if (!stockDoc && matchedSaleItem.stockId && mongoose.Types.ObjectId.isValid(matchedSaleItem.stockId)) {
        const q = Stock.findById(matchedSaleItem.stockId);
        if (useTransactions && session) q.session(session);
        const s = await q;
        if (s && (s.location || "shop") === targetLocation) {
          stockDoc = s;
        } else if (s) {
          const altQ = Stock.findOne({
            productName: { $regex: `^${s.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
            location: targetLocation,
          });
          if (useTransactions && session) altQ.session(session);
          stockDoc = await altQ;
        }
      }
      if (!stockDoc && it.stockId && mongoose.Types.ObjectId.isValid(it.stockId)) {
        const q = Stock.findById(it.stockId);
        if (useTransactions && session) q.session(session);
        const s = await q;
        if (s && (s.location || "shop") === targetLocation) {
          stockDoc = s;
        }
      }
      if (!stockDoc && matchedSaleItem.productName) {
        const q = Stock.findOne({
          productName: { $regex: `^${matchedSaleItem.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          location: targetLocation,
        });
        if (useTransactions && session) q.session(session);
        stockDoc = await q;
      }
      if (!stockDoc && matchedSaleItem.stockId) {
        const q = Stock.findById(matchedSaleItem.stockId);
        if (useTransactions && session) q.session(session);
        stockDoc = await q;
      }

      // Check whether this item originated from another shopkeeper
      const isShopkeeperItem =
        matchedSaleItem.saleSource === "shopkeeper" ||
        originalSale.saleSource === "shopkeeper" ||
        Boolean(matchedSaleItem.shopkeeperTransferId || originalSale.shopkeeperTransferId) ||
        Boolean(matchedSaleItem.shopkeeperName || originalSale.shopkeeperName);

      const targetTransferId =
        matchedSaleItem.shopkeeperTransferId || originalSale.shopkeeperTransferId;

      let shopkeeperTransferDoc = null;
      if (isShopkeeperItem && targetTransferId) {
        const tQ = ShopkeeperTransfer.findById(targetTransferId);
        if (useTransactions && session) tQ.session(session);
        shopkeeperTransferDoc = await tQ;
      }

      const condition = it.condition || "resellable";
      const shouldRestore = (it.restoreToInventory !== false) && condition === "resellable";

      if (isShopkeeperItem && shopkeeperTransferDoc) {
        // Return stock to shopkeeper consignment balance without modifying shop's inventory
        shopkeeperTransferDoc.soldQuantity = Math.max(
          0,
          (shopkeeperTransferDoc.soldQuantity || 0) - returnQty
        );
        shopkeeperTransferDoc.remainingQuantity =
          (shopkeeperTransferDoc.remainingQuantity || 0) + returnQty;
        shopkeeperTransferDoc.totalExpectedAmount = Number(
          (
            (shopkeeperTransferDoc.remainingQuantity || 0) *
            (shopkeeperTransferDoc.agreedAmountPerUnit || 0)
          ).toFixed(2)
        );
        await shopkeeperTransferDoc.save(
          useTransactions && session ? { session } : undefined
        );
      } else {
        // Regular shop inventory return
        if (shouldRestore) {
          if (stockDoc) {
            stockDoc.quantity += returnQty;
            stockDoc.totalPrice = Number(
              ((stockDoc.totalPrice || 0) + itemCostRefunded).toFixed(2)
            );
            await stockDoc.save(useTransactions && session ? { session } : undefined);
          } else {
            // Re-create stock document at target location if not found
            const newStockDoc = new Stock({
              productName: matchedSaleItem.productName,
              barcode: matchedSaleItem.barcode || "N/A",
              category: matchedSaleItem.category || "General",
              quantity: returnQty,
              unitPrice: unitCost,
              totalPrice: itemCostRefunded,
              location: targetLocation,
              supplier: originalSale.supplier || "Unknown Supplier",
            });
            await newStockDoc.save(useTransactions && session ? { session } : undefined);
            stockDoc = newStockDoc;
          }
        }

        // Restore StockItem units to available status
        const specificBarcodes = Array.isArray(it.returnBarcodes) && it.returnBarcodes.length > 0
          ? it.returnBarcodes
          : (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []);

        const unitStockStatus = shouldRestore ? "available" : (condition === "resellable" ? "damaged" : condition);
        let restoredCount = 0;

        // 1. Restore by specific return barcodes if provided
        if (specificBarcodes.length > 0) {
          for (const bc of specificBarcodes) {
            const resItem = await StockItem.findOneAndUpdate(
              { barcode: bc, status: { $ne: unitStockStatus } },
              { $set: { status: unitStockStatus, sellingPrice: 0, location: targetLocation } },
              useTransactions && session ? { session } : {}
            );
            if (resItem) restoredCount++;
          }
        }

        // 2. Restore by soldStockItemIds explicitly recorded during sale
        const remainingToRestoreFromIds = returnQty - restoredCount;
        if (remainingToRestoreFromIds > 0 && Array.isArray(matchedSaleItem.soldStockItemIds) && matchedSaleItem.soldStockItemIds.length > 0) {
          const q = StockItem.find({
            _id: { $in: matchedSaleItem.soldStockItemIds },
            status: { $ne: unitStockStatus },
          }).limit(remainingToRestoreFromIds);
          if (useTransactions && session) q.session(session);
          const soldUnitsById = await q;

          for (const unit of soldUnitsById) {
            unit.status = unitStockStatus;
            unit.sellingPrice = 0;
            unit.location = targetLocation;
            await unit.save(useTransactions && session ? { session } : undefined);
            restoredCount++;
          }
        }

        // 3. Restore by matchedSaleItem.soldBarcodes
        const remainingToRestoreFromBarcodes = returnQty - restoredCount;
        if (remainingToRestoreFromBarcodes > 0 && Array.isArray(matchedSaleItem.soldBarcodes) && matchedSaleItem.soldBarcodes.length > 0) {
          const q = StockItem.find({
            barcode: { $in: matchedSaleItem.soldBarcodes },
            status: { $ne: unitStockStatus },
          }).limit(remainingToRestoreFromBarcodes);
          if (useTransactions && session) q.session(session);
          const soldUnitsByBc = await q;

          for (const unit of soldUnitsByBc) {
            unit.status = unitStockStatus;
            unit.sellingPrice = 0;
            unit.location = targetLocation;
            await unit.save(useTransactions && session ? { session } : undefined);
            restoredCount++;
          }
        }

        // 4. Fallback for unbarcoded products (barcode is null or N/A)
        const remainingToRestoreGeneral = returnQty - restoredCount;
        if (remainingToRestoreGeneral > 0) {
          const pNameEscaped = matchedSaleItem.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const generalFindQuery = {
            productName: { $regex: `^${pNameEscaped}$`, $options: "i" },
            status: "sold",
          };
          if (stockDoc?.transactionRef) {
            generalFindQuery.transactionRef = stockDoc.transactionRef;
          }

          let qGen = StockItem.find(generalFindQuery).limit(remainingToRestoreGeneral);
          if (useTransactions && session) qGen.session(session);
          let soldUnitsGen = await qGen;

          if (soldUnitsGen.length === 0) {
            const fallbackQuery = {
              productName: { $regex: `^${pNameEscaped}$`, $options: "i" },
              status: "sold",
            };
            let qFallback = StockItem.find(fallbackQuery).limit(remainingToRestoreGeneral);
            if (useTransactions && session) qFallback.session(session);
            soldUnitsGen = await qFallback;
          }

          for (const unit of soldUnitsGen) {
            unit.status = unitStockStatus;
            unit.sellingPrice = 0;
            unit.location = targetLocation;
            await unit.save(useTransactions && session ? { session } : undefined);
            restoredCount++;
          }
        }
      }

      // Update matched line item in original sale
      matchedSaleItem.returnedQuantity = (matchedSaleItem.returnedQuantity || 0) + returnQty;
      matchedSaleItem.refundedAmount = Number(
        ((matchedSaleItem.refundedAmount || 0) + itemActualRefund).toFixed(2)
      );

      const resolvedSkName =
        matchedSaleItem.shopkeeperName ||
        originalSale.shopkeeperName ||
        (shopkeeperTransferDoc ? shopkeeperTransferDoc.shopkeeperName : "");
      const resolvedSkId =
        matchedSaleItem.shopkeeperId ||
        originalSale.shopkeeperId ||
        (shopkeeperTransferDoc ? shopkeeperTransferDoc.shopkeeperId : null);

      validatedReturnItems.push({
        stockId: stockDoc ? stockDoc._id : matchedSaleItem.stockId,
        productName: matchedSaleItem.productName,
        storage: matchedSaleItem.storage || (stockDoc ? stockDoc.storage : "") || "",
        color: matchedSaleItem.color || (stockDoc ? stockDoc.color : "") || "",
        barcode: matchedSaleItem.barcode || "N/A",
        category: matchedSaleItem.category || (stockDoc ? stockDoc.category : "General"),
        soldQuantity,
        returnQuantity: returnQty,
        quantity: returnQty,
        unitPurchaseCost: unitCost,
        unitSellingPrice: unitPrice,
        originalSoldPrice: itemOriginalSoldPrice,
        actualRefundedAmount: itemActualRefund,
        refundAmount: itemActualRefund,
        subtotal: itemActualRefund,
        retainedProfit: itemRetainedProfit,
        returnFee: itemRetainedProfit,
        restoreToInventory: shouldRestore,
        costRefunded: itemCostRefunded,
        profitReversed: itemProfitReversed,
        reason: it.reason || reason,
        condition: it.condition || "resellable",
        saleSource: isShopkeeperItem ? "shopkeeper" : "direct",
        shopkeeperName: resolvedSkName,
        shopkeeperId: resolvedSkId,
        shopkeeperTransferId: targetTransferId || null,
      });
    }

    totalOriginalSoldPrice = Number(totalOriginalSoldPrice.toFixed(2));
    totalRefundAmount = Number(totalRefundAmount.toFixed(2));
    totalRetainedProfit = Number(totalRetainedProfit.toFixed(2));
    totalCostRefunded = Number(totalCostRefunded.toFixed(2));
    totalProfitReversed = Number(totalProfitReversed.toFixed(2));

    // 4. Update Original Sale status and returned metrics
    if (originalSale) {
      originalSale.returnedQuantity = (originalSale.returnedQuantity || 0) + totalUnitsReturned;
      originalSale.refundedAmount = Number(
        ((originalSale.refundedAmount || 0) + totalRefundAmount).toFixed(2)
      );

      const originalTotalQty = (originalSale.items && originalSale.items.length > 0)
        ? originalSale.items.reduce((acc, curr) => acc + (curr.quantity || 0), 0)
        : (originalSale.quantity || 1);

      if (originalSale.returnedQuantity >= originalTotalQty) {
        originalSale.returnStatus = "refunded";
        originalSale.status = "refunded";
      } else {
        originalSale.returnStatus = "partial";
      }

      await originalSale.save(useTransactions && session ? { session } : undefined);
    }

    // 5. Customer Ledger & Store Credit Balance Management
    let customerDoc = null;
    let targetCustomerId = customerId || (originalSale ? originalSale.customerId : null);

    if (targetCustomerId && mongoose.Types.ObjectId.isValid(targetCustomerId)) {
      const q = Customer.findById(targetCustomerId);
      if (useTransactions && session) q.session(session);
      customerDoc = await q;
    }

    // If Walk-in with name/phone provided but no customer doc, and store credit requested, auto-register customer
    if (!customerDoc && settlementType === "store_credit" && customerName && customerName !== "Walk-in Customer") {
      customerDoc = new Customer({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        balance: 0,
      });
      await customerDoc.save(useTransactions && session ? { session } : undefined);
    }

    const returnNumber = await generateUniqueReturnNumber(useTransactions ? session : null);

    let cashRefundAmount = 0;
    let storeCreditAmount = 0;

    if (settlementType === "cash_payout") {
      cashRefundAmount = totalRefundAmount;
      if (customerDoc) {
        customerDoc.totalCashPayouts = Number(
          ((customerDoc.totalCashPayouts || 0) + totalRefundAmount).toFixed(2)
        );
        // Record credit then immediate payout in ledger for complete audit trail
        customerDoc.ledger.push({
          date: new Date(),
          type: "credit",
          amount: totalRefundAmount,
          balanceAfter: Number((customerDoc.balance + totalRefundAmount).toFixed(2)),
          referenceType: "Return",
          referenceNumber: returnNumber,
          description: `Return refund credited for ${returnNumber}`,
        });
        customerDoc.ledger.push({
          date: new Date(),
          type: "payout",
          amount: totalRefundAmount,
          balanceAfter: customerDoc.balance,
          referenceType: "Payout",
          referenceNumber: returnNumber,
          description: `Cash payout for Return #${returnNumber} (${payoutMethod})`,
        });
        await customerDoc.save(useTransactions && session ? { session } : undefined);
      }
    } else if (settlementType === "store_credit") {
      storeCreditAmount = totalRefundAmount;
      if (customerDoc) {
        const newBalance = Number((customerDoc.balance + totalRefundAmount).toFixed(2));
        customerDoc.balance = newBalance;
        customerDoc.totalStoreCreditIssued = Number(
          ((customerDoc.totalStoreCreditIssued || 0) + totalRefundAmount).toFixed(2)
        );
        customerDoc.ledger.push({
          date: new Date(),
          type: "credit",
          amount: totalRefundAmount,
          balanceAfter: newBalance,
          referenceType: "Return",
          referenceNumber: returnNumber,
          description: `Store credit issued for Return #${returnNumber}`,
        });
        await customerDoc.save(useTransactions && session ? { session } : undefined);
      }
    }

    // 6. Handle Exchange Workflow (Option: Exchange / Apply to New Sale)
    let exchangeDetails = null;
    let exchangeSale = null;

    if (settlementType === "exchange") {
      let exchangeCartTotal = 0;
      let exchangeCartCost = 0;
      let exchangeTotalQty = 0;
      const exchangeSaleItems = [];

      for (let j = 0; j < exchangeItems.length; j++) {
        const exc = exchangeItems[j];
        const excQty = parseInt(exc.quantity, 10) || 1;
        const excPrice = Number(exc.sellingPrice);

        let excStock = null;
        if (exc.stockId && mongoose.Types.ObjectId.isValid(exc.stockId)) {
          const q = Stock.findById(exc.stockId);
          if (useTransactions && session) q.session(session);
          excStock = await q;
        }
        if (!excStock && exc.barcode) {
          const q = Stock.findOne({ barcode: exc.barcode });
          if (useTransactions && session) q.session(session);
          excStock = await q;
        }

        if (!excStock) {
          if (useTransactions && session) await session.abortTransaction();
          return res.status(404).json({
            success: false,
            message: `Exchange item "${exc.productName || "Unknown"}" not found in inventory.`,
          });
        }

        if (excStock.quantity < excQty) {
          if (useTransactions && session) await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient inventory for exchange item "${excStock.productName}". Available: ${excStock.quantity}, requested: ${excQty}.`,
          });
        }

        // Decrement stock for exchange purchase
        const excUnitCost = Number(excStock.unitPrice || 0);
        excStock.quantity -= excQty;
        excStock.totalPrice = Number(
          Math.max(0, (excStock.totalPrice || 0) - excUnitCost * excQty).toFixed(2)
        );
        await excStock.save(useTransactions && session ? { session } : undefined);

        if (exc.barcode && exc.barcode !== "N/A") {
          await StockItem.findOneAndUpdate(
            { barcode: exc.barcode, status: "available" },
            { $set: { status: "sold", sellingPrice: excPrice } },
            useTransactions && session ? { session } : {}
          );
        }

        const itemTotal = Number((excPrice * excQty).toFixed(2));
        const itemCost = Number((excUnitCost * excQty).toFixed(2));
        const itemProfit = Math.max(0, itemTotal - itemCost);
        const itemLoss = Math.max(0, itemCost - itemTotal);

        exchangeCartTotal += itemTotal;
        exchangeCartCost += itemCost;
        exchangeTotalQty += excQty;

        exchangeSaleItems.push({
          stockId: excStock._id,
          productName: excStock.productName,
          storage: excStock.storage || exc.storage || "",
          color: excStock.color || exc.color || "",
          barcode: excStock.barcode || "N/A",
          category: excStock.category || "General",
          quantity: excQty,
          unitPurchaseCost: excUnitCost,
          unitSellingPrice: excPrice,
          totalCost: itemCost,
          totalAmount: itemTotal,
          profit: itemProfit,
          loss: itemLoss,
        });
      }

      exchangeCartTotal = Number(exchangeCartTotal.toFixed(2));
      const netDifference = Number((exchangeCartTotal - totalRefundAmount).toFixed(2));

      let differenceAction = "even";
      if (netDifference > 0) {
        differenceAction = "customer_paid_extra";
      } else if (netDifference < 0) {
        differenceAction = "refunded_to_customer";
        cashRefundAmount = Math.abs(netDifference);
      }

      const exchangeSaleNumber = await generateUniqueSaleNumber(useTransactions ? session : null);

      // Create linked exchange sale record
      exchangeSale = new Sale({
        saleNumber: exchangeSaleNumber,
        items: exchangeSaleItems,
        stockId: exchangeSaleItems[0]?.stockId,
        productName: exchangeSaleItems[0]?.productName,
        barcode: exchangeSaleItems[0]?.barcode,
        quantity: exchangeTotalQty,
        unitPurchaseCost: exchangeSaleItems[0]?.unitPurchaseCost,
        unitSellingPrice: exchangeSaleItems[0]?.unitSellingPrice,
        totalCost: exchangeCartCost,
        totalAmount: exchangeCartTotal,
        profit: Math.max(0, exchangeCartTotal - exchangeCartCost),
        loss: Math.max(0, exchangeCartCost - exchangeCartTotal),
        paymentMethod: exchangePaymentMethod || "Cash",
        paymentStatus: "Paid",
        saleDate: new Date(),
        notes: `Exchange purchase against Return #${returnNumber}. Original Return Value: Rs. ${totalRefundAmount.toFixed(2)}. Net Difference: Rs. ${netDifference.toFixed(2)}.`,
        status: "completed",
        customerId: customerDoc ? customerDoc._id : null,
        customerName: customerDoc ? customerDoc.name : customerName,
        customerPhone: customerDoc ? customerDoc.phone : customerPhone,
        isExchange: true,
        exchangeReturnNumber: returnNumber,
        returnCredit: totalRefundAmount,
        netDifference: netDifference,
        returnedItems: validatedReturnItems.map((i) => ({
          productName: i.productName,
          barcode: i.barcode || "N/A",
          returnBarcodes: i.returnBarcodes || [],
          quantity: i.returnQuantity || 1,
          refundAmount: i.actualRefundedAmount != null ? i.actualRefundedAmount : i.refundAmount,
        })),
        tradeInItem: {
          productName: validatedReturnItems.map((i) => i.productName).join(", "),
          barcode: validatedReturnItems[0]?.barcode || "N/A",
          barcodes: validatedReturnItems.flatMap((i) =>
            Array.isArray(i.returnBarcodes) && i.returnBarcodes.length > 0
              ? i.returnBarcodes
              : i.barcode && i.barcode !== "N/A"
              ? [i.barcode]
              : []
          ),
          quantity: totalUnitsReturned,
          unitPrice: Number((totalRefundAmount / (totalUnitsReturned || 1)).toFixed(2)),
          purchasePrice: Number((totalRefundAmount / (totalUnitsReturned || 1)).toFixed(2)),
          totalValue: totalRefundAmount,
          customerName: customerDoc ? customerDoc.name : customerName,
          customerId: customerDoc ? customerDoc._id : null,
        },
      });

      await exchangeSale.save(useTransactions && session ? { session } : undefined);

      exchangeDetails = {
        exchangeSaleId: exchangeSale._id,
        exchangeSaleNumber,
        exchangeCartTotal,
        netDifference,
        differenceAction,
        returnedItems: validatedReturnItems.map((i) => ({
          productName: i.productName,
          barcode: i.barcode,
          returnBarcodes: i.returnBarcodes,
          quantity: i.returnQuantity,
          refundAmount: i.actualRefundedAmount,
        })),
        exchangeItems: exchangeSaleItems.map((e) => ({
          productName: e.productName,
          barcode: e.barcode,
          quantity: e.quantity,
          sellingPrice: e.unitSellingPrice,
          subtotal: e.totalAmount,
        })),
      };
    }

    // 7. Save Dedicated Return Audit Record
    const resolvedCustomerName =
      (customerDoc ? customerDoc.name : null) ||
      (customerName && customerName !== "Walk-in Customer" ? customerName : null) ||
      (originalSale?.customerName && originalSale.customerName !== "Walk-in Customer" ? originalSale.customerName : null) ||
      (originalSale?.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim()) ||
      "Walk-in Customer";

    const returnRecord = new Return({
      returnNumber,
      saleId: originalSale ? originalSale._id : null,
      saleNumber: originalSale ? originalSale.saleNumber : (saleNumber || ""),
      customerId: customerDoc ? customerDoc._id : (originalSale?.customerId || null),
      customerName: resolvedCustomerName,
      customerPhone: customerDoc ? customerDoc.phone : (customerPhone || originalSale?.customerPhone || ""),
      saleSource:
        originalSale?.saleSource ||
        (validatedReturnItems.some((it) => it.saleSource === "shopkeeper") ? "shopkeeper" : "direct"),
      shopkeeperName:
        originalSale?.shopkeeperName ||
        validatedReturnItems.find((it) => it.shopkeeperName)?.shopkeeperName ||
        "",
      shopkeeperId:
        originalSale?.shopkeeperId ||
        validatedReturnItems.find((it) => it.shopkeeperId)?.shopkeeperId ||
        null,
      shopkeeperTransferId:
        originalSale?.shopkeeperTransferId ||
        validatedReturnItems.find((it) => it.shopkeeperTransferId)?.shopkeeperTransferId ||
        null,
      items: validatedReturnItems,
      totalOriginalSoldPrice,
      totalRefundAmount,
      totalRetainedProfit,
      totalReturnFee: totalRetainedProfit,
      totalCostRefunded,
      totalProfitReversed,
      totalUnitsReturned,
      settlementType,
      payoutMethod: settlementType === "exchange" ? "Exchange" : payoutMethod,
      cashRefundAmount,
      storeCreditAmount,
      exchangeDetails: exchangeDetails || {},
      status: "completed",
      returnDate: new Date(),
      reason,
      notes,
      processedBy: "Admin",
      location: (originalSale && originalSale.location === "warehouse") ? "warehouse" : "shop",
    });

    await returnRecord.save(useTransactions && session ? { session } : undefined);

    // Commit Transaction if active
    if (useTransactions && session) {
      await session.commitTransaction();
    }

    // Invalidate affected barcode cache entries and dashboard summaries ONLY after commit succeeds
    const affectedBarcodes = [];
    if (Array.isArray(validatedReturnItems)) {
      for (const it of validatedReturnItems) {
        if (it.barcode && it.barcode !== "N/A") affectedBarcodes.push(it.barcode);
        if (Array.isArray(it.barcodes)) affectedBarcodes.push(...it.barcodes);
        if (Array.isArray(it.soldBarcodes)) affectedBarcodes.push(...it.soldBarcodes);
      }
    }
    if (Array.isArray(exchangeItems)) {
      for (const exc of exchangeItems) {
        if (exc.barcode && exc.barcode !== "N/A") affectedBarcodes.push(exc.barcode);
        if (Array.isArray(exc.barcodes)) affectedBarcodes.push(...exc.barcodes);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Return #${returnNumber} processed successfully.`,
      data: {
        returnRecord,
        receipt: {
          returnNumber: returnRecord.returnNumber,
          saleNumber: returnRecord.saleNumber,
          originalSaleReference: returnRecord.saleNumber,
          returnedItem: validatedReturnItems.map((i) => i.productName + (i.barcode && i.barcode !== "N/A" ? ` (${i.barcode})` : "")).join(", "),
          customerName: returnRecord.customerName,
          customerPhone: returnRecord.customerPhone,
          returnDate: returnRecord.returnDate,
          saleSource: returnRecord.saleSource,
          shopkeeperName: returnRecord.shopkeeperName,
          shopkeeperId: returnRecord.shopkeeperId,
          shopkeeperTransferId: returnRecord.shopkeeperTransferId,
          items: validatedReturnItems.map((i) => ({
            productName: i.productName,
            barcode: i.barcode,
            barcodes: Array.isArray(i.returnBarcodes) && i.returnBarcodes.length > 0
              ? i.returnBarcodes
              : (i.barcode && i.barcode !== "N/A" ? [i.barcode] : []),
            returnBarcodes: i.returnBarcodes,
            quantity: i.returnQuantity,
            unitSellingPrice: i.unitSellingPrice,
            unitPrice: i.unitSellingPrice,
            originalSoldPrice: i.originalSoldPrice,
            refundAmount: i.actualRefundedAmount,
            actualRefundedAmount: i.actualRefundedAmount,
            subtotal: i.actualRefundedAmount,
            totalAmount: i.actualRefundedAmount,
            saleSource: i.saleSource || returnRecord.saleSource,
            shopkeeperName: i.shopkeeperName || returnRecord.shopkeeperName,
            shopkeeperId: i.shopkeeperId || returnRecord.shopkeeperId,
            shopkeeperTransferId: i.shopkeeperTransferId || returnRecord.shopkeeperTransferId,
          })),
          exchangeItems: Array.isArray(exchangeItems)
            ? exchangeItems.map((e) => {
                const q = parseInt(e.quantity, 10) || 1;
                const p = Number(e.sellingPrice || 0);
                return {
                  productName: e.productName,
                  barcode: e.barcode || "N/A",
                  quantity: q,
                  sellingPrice: p,
                  subtotal: Number((q * p).toFixed(2)),
                };
              })
            : [],
          exchangeDetails: exchangeDetails || {},
          totalReturnCredit: totalRefundAmount,
          netRefundPaid: totalRefundAmount,
          actualRefundedAmount: totalRefundAmount,
          totalRefundAmount,
          totalUnitsReturned,
          settlementType,
          payoutMethod: returnRecord.payoutMethod,
          reason: returnRecord.reason,
        },
        customer: customerDoc
          ? {
              _id: customerDoc._id,
              name: customerDoc.name,
              balance: customerDoc.balance,
            }
          : null,
        exchangeSale: exchangeSale
          ? {
              _id: exchangeSale._id,
              saleNumber: exchangeSale.saleNumber,
              totalAmount: exchangeSale.totalAmount,
            }
          : null,
      },
    });
  } catch (error) {
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    console.error("Error processing return:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process return transaction.",
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
 * @route   GET /api/returns
 * @desc    Get return audit records with filtering, pagination, and summary metrics
 */
const getReturns = async (req, res) => {
  try {
    const {
      search = "",
      settlementType,
      startDate,
      endDate,
      limit = 30,
      page = 1,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = { status: "completed" };

    if (settlementType && ["cash_payout", "store_credit", "exchange"].includes(settlementType)) {
      query.settlementType = settlementType;
    }

    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        query.returnDate.$lte = endD;
      }
    }

    if (search.trim()) {
      const q = search.trim();
      query.$or = [
        { returnNumber: { $regex: q, $options: "i" } },
        { saleNumber: { $regex: q, $options: "i" } },
        { customerName: { $regex: q, $options: "i" } },
        { "items.productName": { $regex: q, $options: "i" } },
        { "items.barcode": { $regex: q, $options: "i" } },
      ];
    }

    const [returns, totalCount, summaryRes] = await Promise.all([
      Return.find(query)
        .sort({ returnDate: -1, _id: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("customerId", "name phone balance")
        .lean(),
      Return.countDocuments(query),
      Return.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalOriginalSoldPrice: { $sum: "$totalOriginalSoldPrice" },
            totalRefundAmount: { $sum: "$totalRefundAmount" },
            totalRetainedProfit: { $sum: "$totalRetainedProfit" },
            totalCostRefunded: { $sum: "$totalCostRefunded" },
            totalProfitReversed: { $sum: "$totalProfitReversed" },
            totalUnitsReturned: { $sum: "$totalUnitsReturned" },
            totalCashPaidOut: { $sum: "$cashRefundAmount" },
            totalStoreCreditIssued: { $sum: "$storeCreditAmount" },
          },
        },
      ]),
    ]);

    const summary = summaryRes[0] || {
      totalOriginalSoldPrice: 0,
      totalRefundAmount: 0,
      totalRetainedProfit: 0,
      totalCostRefunded: 0,
      totalProfitReversed: 0,
      totalUnitsReturned: 0,
      totalCashPaidOut: 0,
      totalStoreCreditIssued: 0,
    };

    return res.status(200).json({
      success: true,
      data: returns,
      summary: {
        totalOriginalSoldPrice: Number((summary.totalOriginalSoldPrice || 0).toFixed(2)),
        totalRefundAmount: Number(summary.totalRefundAmount.toFixed(2)),
        totalRetainedProfit: Number((summary.totalRetainedProfit || 0).toFixed(2)),
        totalCostRefunded: Number(summary.totalCostRefunded.toFixed(2)),
        totalProfitReversed: Number(summary.totalProfitReversed.toFixed(2)),
        totalUnitsReturned: summary.totalUnitsReturned,
        totalCashPaidOut: Number(summary.totalCashPaidOut.toFixed(2)),
        totalStoreCreditIssued: Number(summary.totalStoreCreditIssued.toFixed(2)),
        totalReturnsCount: totalCount,
      },
      pagination: {
        totalCount,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit),
        hasMore: skip + returns.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching returns:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch return records.",
    });
  }
};

/**
 * @route   GET /api/returns/:id
 * @desc    Get single return audit record by ID
 */
const getReturnById = async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { returnNumber: id }] };
    } else {
      query = { returnNumber: id };
    }

    const returnRecord = await Return.findOne(query)
      .populate("customerId", "name phone email balance")
      .populate("saleId")
      .populate({
        path: "exchangeDetails.exchangeSaleId",
        select: "saleNumber items totalAmount paymentMethod",
      })
      .lean();

    if (!returnRecord) {
      return res.status(404).json({ success: false, message: "Return record not found." });
    }

    // Ensure exchangeItems is available for vouchers
    if (!returnRecord.exchangeItems || returnRecord.exchangeItems.length === 0) {
      let excSale = returnRecord.exchangeDetails?.exchangeSaleId?.items ? returnRecord.exchangeDetails.exchangeSaleId : null;
      if (!excSale) {
        const Sale = require("../models/Sale");
        const excSaleNum = returnRecord.exchangeDetails?.exchangeSaleNumber;
        const retNum = returnRecord.returnNumber;
        const orConditions = [];
        if (excSaleNum) orConditions.push({ saleNumber: excSaleNum });
        if (retNum) orConditions.push({ exchangeReturnNumber: retNum });
        if (returnRecord.exchangeDetails?.exchangeSaleId && mongoose.Types.ObjectId.isValid(returnRecord.exchangeDetails.exchangeSaleId)) {
          orConditions.push({ _id: returnRecord.exchangeDetails.exchangeSaleId });
        }
        if (orConditions.length > 0) {
          excSale = await Sale.findOne({ $or: orConditions }).lean();
        }
      }

      if (excSale && Array.isArray(excSale.items)) {
        returnRecord.exchangeItems = excSale.items.map((it) => ({
          productName: it.productName,
          storage: it.storage || "",
          color: it.color || "",
          barcode: it.barcode || "N/A",
          barcodes: it.soldBarcodes || it.barcodes || (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
          quantity: it.quantity || 1,
          sellingPrice: it.unitSellingPrice || it.sellingPrice || 0,
          subtotal: it.totalAmount || (it.unitSellingPrice || it.sellingPrice || 0) * (it.quantity || 1),
        }));
        if (!returnRecord.exchangeDetails) returnRecord.exchangeDetails = {};
        if (!returnRecord.exchangeDetails.exchangeSaleNumber) returnRecord.exchangeDetails.exchangeSaleNumber = excSale.saleNumber;
        if (!returnRecord.exchangeDetails.exchangeCartTotal) returnRecord.exchangeDetails.exchangeCartTotal = excSale.totalAmount;
      }
    }

    return res.status(200).json({ success: true, data: returnRecord });
  } catch (error) {
    console.error("Error fetching return by ID:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  lookupReturn,
  searchReturnProducts,
  processReturn,
  getReturns,
  getReturnById,
};

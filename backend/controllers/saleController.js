const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Stock = require("../models/Stock");
const StockItem = require("../models/StockItem");
const Supplier = require("../models/Supplier");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Expense = require("../models/Expense");
const Return = require("../models/Return");
const { autoSettleTradeInInvoices } = require("./supplierController");

// Base64URL Cursor helpers
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
 * Helper to compute date boundaries for filters
 */
const getDateRangeFilter = (period, customFrom, customTo) => {
  const now = new Date();
  let start = null;
  let end = null;

  if (customFrom || customTo) {
    if (customFrom) start = new Date(customFrom);
    if (customTo) {
      end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  }

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      break;
    }
    case "last7days":
    case "this_week": {
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "this_month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case "this_year": {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    }
    default:
      // All time
      break;
  }

  return { start, end };
};

/**
 * Generate unique human-readable Sale Number (e.g. SALE-261004-8921)
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
    saleNum = `SALE-${yy}${mm}${dd}-${randomPart}`;

    const query = Sale.findOne({ saleNumber: saleNum });
    if (session) query.session(session);
    const existing = await query.lean();

    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    saleNum = `SALE-${yy}${mm}${dd}-${Date.now().toString().slice(-4)}`;
  }

  return saleNum;
};

/**
 * @route   POST /api/sales
/**
 * Helper to roll back stock changes when replica-set transactions are unavailable
 */
const rollbackMutations = async (modifiedStocks, modifiedStockItemIds) => {
  try {
    for (const ms of modifiedStocks) {
      await Stock.findByIdAndUpdate(ms.stockId, {
        $inc: { quantity: ms.qty, totalPrice: ms.totalPrice },
      });
    }
    if (modifiedStockItemIds.length > 0) {
      await StockItem.updateMany(
        { _id: { $in: modifiedStockItemIds } },
        { $set: { status: "available", sellingPrice: 0 } }
      );
    }
  } catch (rollbackErr) {
    console.error("Rollback error:", rollbackErr);
  }
};

/**
 * @route   POST /api/sales
 * @desc    Record a new retail sale transaction with atomic inventory decrement
 *          Validates physical serialized unit availability, prevents intra-request
 *          and concurrency race conditions, and marks exact scanned StockItems as sold.
 */
const createSale = async (req, res) => {
  const {
    items,
    stockId,
    barcode,
    barcodes,
    quantity = 1,
    sellingPrice,
    paymentMethod = "Cash",
    notes = "",
    billDescription = "",
    description = "",
  } = req.body;

  const saleLocation =
    (req.body.location || "shop").toLowerCase() === "warehouse" ? "warehouse" : "shop";

  // Check if a custom supplier / counterparty was specified for this sale
  let selectedSupplierName = (req.body.supplier || req.body.supplierName || "").trim();
  if (selectedSupplierName) {
    try {
      const existingSup = await Supplier.findOne({
        name: {
          $regex: `^${selectedSupplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      }).lean();
      if (existingSup) {
        selectedSupplierName = existingSup.name;
      }
    } catch (supErr) {
      console.warn("Notice: Supplier lookup during sale:", supErr.message);
    }
  }

  // 1. Normalize into an array of line items
  let rawItems = [];
  if (Array.isArray(items) && items.length > 0) {
    rawItems = items;
  } else if (stockId || barcode || (Array.isArray(barcodes) && barcodes.length > 0)) {
    rawItems = [{ stockId, barcode, barcodes, quantity, sellingPrice, totalAmount: req.body.totalAmount, location: saleLocation }];
  } else {
    return res.status(400).json({
      success: false,
      message: "At least one product item is required to complete a sale.",
    });
  }

  // 2. Intra-request duplicate physical piece protection across all line items
  const seenStockItemIds = new Set();
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    if (Array.isArray(it.stockItemIds)) {
      for (const sId of it.stockItemIds) {
        if (sId) {
          const strId = String(sId).trim();
          if (seenStockItemIds.has(strId)) {
            return res.status(400).json({
              success: false,
              message: `Duplicate physical unit in this sale request.`,
            });
          }
          seenStockItemIds.add(strId);
        }
      }
    }
  }

  // 3. Pre-validate line items and authoritative stock data from database
  const validatedLines = [];
  const allClaimedStockItemIds = new Set();

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const lineIndex = i + 1;
    const itemLocation =
      (it.location || saleLocation).toLowerCase() === "warehouse" ? "warehouse" : "shop";

    const qty = parseInt(it.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: `Line #${lineIndex}: Quantity must be a positive integer (minimum 1).`,
      });
    }

    const sPrice = Number(it.sellingPrice);
    if (isNaN(sPrice) || sPrice < 0) {
      return res.status(400).json({
        success: false,
        message: `Line #${lineIndex}: Unit selling price must be a valid non-negative number.`,
      });
    }

    // Extract genuine serialized barcodes for this line item
    const lineBarcodes = (
      Array.isArray(it.barcodes)
        ? it.barcodes
        : it.barcode ? [it.barcode] : []
    )
      .map((b) => (typeof b === "string" ? b.trim() : ""))
      .filter(
        (b) =>
          b &&
          b.toUpperCase() !== "N/A" &&
          b.toLowerCase() !== "null" &&
          b.toLowerCase() !== "undefined"
      );

    // If barcodes were explicitly scanned, ensure barcode count matches quantity
    if (lineBarcodes.length > 0 && lineBarcodes.length !== qty) {
      return res.status(400).json({
        success: false,
        message: `Line #${lineIndex}: Number of scanned barcodes (${lineBarcodes.length}) does not match quantity (${qty}).`,
      });
    }

    // Special handling for Small / Quick Items (unlisted items without inventory catalog)
    if (it.isSmallItem || it.category === "small-item" || it.category === "Small Item") {
      const pName = (it.productName || "Small Item").trim();
      const unitPurchaseCost = Math.max(0, Number(it.unitPurchaseCost ?? it.costPrice ?? 0));
      const lineCost = Number((unitPurchaseCost * qty).toFixed(2));
      let lineTotal;
      let unitSellingPrice;

      if (it.totalAmount !== undefined && it.totalAmount !== null && !isNaN(Number(it.totalAmount))) {
        lineTotal = Number(Number(it.totalAmount).toFixed(2));
        unitSellingPrice = qty > 0 ? Number((lineTotal / qty).toFixed(4)) : lineTotal;
      } else {
        unitSellingPrice = sPrice;
        lineTotal = Number((sPrice * qty).toFixed(2));
      }

      const lineDiff = Number((lineTotal - lineCost).toFixed(2));
      const lineProfit = lineDiff > 0 ? lineDiff : 0;
      const lineLoss = lineDiff < 0 ? Math.abs(lineDiff) : 0;

      validatedLines.push({
        stock: null,
        isSmallItem: true,
        productName: pName,
        barcode: "N/A",
        lineBarcodes: [],
        category: "Small Item",
        supplier: it.supplier || "Small Item / Counter",
        quantity: qty,
        unitPurchaseCost,
        unitSellingPrice,
        totalCost: lineCost,
        totalAmount: lineTotal,
        profit: lineProfit,
        loss: lineLoss,
      });
      continue;
    }

    // Find Stock catalog document strictly for the item's target location
    let stock = null;
    if (it.stockId && mongoose.Types.ObjectId.isValid(it.stockId)) {
      stock = await Stock.findById(it.stockId).populate("supplier", "name");
      if (stock && (stock.location || "shop") !== itemLocation) {
        // Check if there is an inventory document for this product at the specified location
        const altStock = await Stock.findOne({
          productName: {
            $regex: `^${stock.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i",
          },
          location: itemLocation,
        }).populate("supplier", "name");
        if (altStock) {
          stock = altStock;
        } else {
          return res.status(400).json({
            success: false,
            message: `Product "${stock.productName}" is located in the ${stock.location || "shop"}, not in the ${itemLocation}.`,
          });
        }
      }
    }

    // Fallback: If not found by stockId, locate by barcode ownership at target location
    if (!stock && lineBarcodes.length > 0) {
      const firstBc = lineBarcodes[0];
      const scannedStockItem = await StockItem.findOne({
        barcode: firstBc,
        location: itemLocation,
      });
      if (scannedStockItem) {
        stock = await Stock.findOne({
          productName: {
            $regex: `^${scannedStockItem.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i",
          },
          location: itemLocation,
        }).populate("supplier", "name");
      }
      if (!stock) {
        stock = await Stock.findOne({
          barcode: firstBc,
          location: itemLocation,
        }).populate("supplier", "name");
      }
    }

    // Fallback by productName at target location if specified
    if (!stock && it.productName) {
      stock = await Stock.findOne({
        productName: {
          $regex: `^${it.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
        location: itemLocation,
      }).populate("supplier", "name");
    }

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: `Line #${lineIndex}: Product not found in ${itemLocation} inventory.`,
      });
    }

    // Validate each exact serialized StockItem if physical barcodes are provided
    const candidateStockItems = [];
    for (let bcIdx = 0; bcIdx < lineBarcodes.length; bcIdx++) {
      const bc = lineBarcodes[bcIdx];
      const targetStockItemId = Array.isArray(it.stockItemIds) ? it.stockItemIds[bcIdx] : null;

      const alreadyClaimedIds = Array.from(allClaimedStockItemIds);
      let specificItem = null;
      if (targetStockItemId && mongoose.Types.ObjectId.isValid(targetStockItemId)) {
        specificItem = await StockItem.findById(targetStockItemId);
      }
      if (!specificItem) {
        specificItem =
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: bc,
            status: "available",
            location: itemLocation,
          })) ||
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: bc,
            status: "available",
          })) ||
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: bc,
          })) ||
          (await StockItem.findOne({ barcode: bc }));
      }
      if (!specificItem) {
        return res.status(404).json({
          success: false,
          message: `Barcode "${bc}" not found.`,
        });
      }

      if ((specificItem.location || "shop") !== itemLocation) {
        return res.status(400).json({
          success: false,
          message: `Unit with barcode "${bc}" is currently in the ${specificItem.location || "shop"}, not the ${itemLocation}.`,
          barcode: bc,
        });
      }

      if (specificItem.status === "sold") {
        return res.status(400).json({
          success: false,
          message: "This barcode has already been sold and is no longer available.",
          barcode: bc,
        });
      }

      if (specificItem.status !== "available") {
        return res.status(400).json({
          success: false,
          message: `The scanned unit with barcode "${bc}" is currently "${specificItem.status}" and cannot be sold.`,
          barcode: bc,
        });
      }

      // Check product match (Never guess product, ensure exact unit belongs to this product)
      if (
        specificItem.productName.trim().toLowerCase() !== stock.productName.trim().toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          message: `Barcode "${bc}" belongs to product "${specificItem.productName}", not "${stock.productName}".`,
        });
      }

      allClaimedStockItemIds.add(specificItem._id.toString());
      candidateStockItems.push(specificItem);
    }

    // Check available stock quantity in catalog
    if (stock.quantity < qty) {
      return res.status(400).json({
        success: false,
        message: `Line #${lineIndex} ("${stock.productName}"): Insufficient inventory. Available: ${stock.quantity}, requested: ${qty}.`,
        availableQuantity: stock.quantity,
      });
    }

    // Authoritative purchase cost from database
    const unitPurchaseCost = Number(stock.unitPrice);
    if (isNaN(unitPurchaseCost) || unitPurchaseCost < 0) {
      return res.status(500).json({
        success: false,
        message: `Database error: Product "${stock.productName}" has an invalid purchase cost record.`,
      });
    }

    const lineCost = Number((unitPurchaseCost * qty).toFixed(2));
    let lineTotal;
    let unitSellingPrice;

    if (it.totalAmount !== undefined && it.totalAmount !== null && !isNaN(Number(it.totalAmount))) {
      lineTotal = Number(Number(it.totalAmount).toFixed(2));
      unitSellingPrice = qty > 0 ? Number((lineTotal / qty).toFixed(4)) : lineTotal;
    } else {
      unitSellingPrice = sPrice;
      lineTotal = Number((sPrice * qty).toFixed(2));
    }

    const lineDiff = Number((lineTotal - lineCost).toFixed(2));
    const lineProfit = lineDiff > 0 ? lineDiff : 0;
    const lineLoss = lineDiff < 0 ? Math.abs(lineDiff) : 0;

    const supplierName =
      (stock.supplier && stock.supplier.name) ||
      (typeof stock.supplier === "string" ? stock.supplier : "Unknown Supplier");

    validatedLines.push({
      stock,
      quantity: qty,
      unitPurchaseCost,
      unitSellingPrice,
      totalCost: lineCost,
      totalAmount: lineTotal,
      profit: lineProfit,
      loss: lineLoss,
      supplier: supplierName,
      lineBarcodes,
      category: candidateStockItems[0]?.category || stock.category || "General",
      storage: candidateStockItems[0]?.storage || stock.storage || (typeof it.storage === "string" ? it.storage.trim() : ""),
      color: candidateStockItems[0]?.color || stock.color || (typeof it.color === "string" ? it.color.trim() : ""),
      description: (it.description || billDescription || description || "").trim(),
      candidateStockItems,
    });
  }

  // 4. Atomic Execution across all cart line items with Concurrency Protection
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

  const modifiedStocks = [];
  const modifiedStockItemIds = [];

  try {
    const processedItems = [];
    const allSoldStockItemIds = [];
    const allSoldBarcodes = [];

    let grandTotalCost = 0;
    let grandTotalAmount = 0;
    let grandProfit = 0;
    let grandLoss = 0;
    let grandTotalQuantity = 0;

    for (const line of validatedLines) {
      if (line.isSmallItem) {
        processedItems.push({
          stockId: null,
          productName: line.productName,
          storage: typeof line.storage === "string" ? line.storage : "",
          color: typeof line.color === "string" ? line.color : "",
          description: line.description || (billDescription || description || "").trim(),
          barcode: line.barcode || "N/A",
          category: line.category || "Small Item",
          supplier: line.supplier || "Small Item / Counter",
          quantity: line.quantity,
          unitPurchaseCost: line.unitPurchaseCost,
          unitSellingPrice: line.unitSellingPrice,
          totalCost: line.totalCost,
          totalAmount: line.totalAmount,
          profit: line.profit,
          loss: line.loss,
          isSmallItem: true,
          soldStockItemIds: [],
          soldBarcodes: [],
          location: saleLocation,
        });

        grandTotalCost += line.totalCost;
        grandTotalAmount += line.totalAmount;
        grandProfit += line.profit;
        grandLoss += line.loss;
        grandTotalQuantity += line.quantity;
        continue;
      }

      const {
        stock,
        quantity: lineQty,
        unitSellingPrice: linePrice,
        unitPurchaseCost,
        lineBarcodes,
      } = line;

      // Atomic conditional update on Stock to guarantee catalog concurrency safety
      const stockQuery = Stock.findOneAndUpdate(
        { _id: stock._id, quantity: { $gte: lineQty } },
        {
          $inc: {
            quantity: -lineQty,
            totalPrice: -Number((unitPurchaseCost * lineQty).toFixed(2)),
          },
        },
        { returnDocument: "after" }
      );
      if (useTransactions && session) stockQuery.session(session);

      const updatedStock = await stockQuery;
      if (!updatedStock) {
        if (useTransactions && session) {
          await session.abortTransaction();
        } else {
          await rollbackMutations(modifiedStocks, modifiedStockItemIds);
        }
        return res.status(409).json({
          success: false,
          message: `Inventory concurrency conflict on "${stock.productName}". Not enough stock remaining.`,
        });
      }

      modifiedStocks.push({
        stockId: stock._id,
        qty: lineQty,
        totalPrice: Number((unitPurchaseCost * lineQty).toFixed(2)),
      });

      // Safeguard: If remaining quantity is 0 or less, ensure remaining totalPrice is strictly 0
      if (updatedStock.quantity <= 0 && updatedStock.totalPrice !== 0) {
        updatedStock.totalPrice = 0;
        await updatedStock.save({ session: useTransactions ? session : undefined });
      }

      // Atomic serialized unit updates for physical barcodes
      const lineSoldStockItemIds = [];
      const lineSoldBarcodes = [];
      const stockLocation = stock.location || "shop";

      if (lineBarcodes.length > 0) {
        for (let bIdx = 0; bIdx < lineBarcodes.length; bIdx++) {
          const bc = lineBarcodes[bIdx];
          const candidateDoc = line.candidateStockItems && line.candidateStockItems[bIdx];
          const itemFilter = candidateDoc
            ? { _id: candidateDoc._id, status: "available" }
            : {
                _id: { $nin: modifiedStockItemIds },
                barcode: bc,
                status: "available",
                location: stockLocation === "warehouse" ? "warehouse" : { $ne: "warehouse" },
              };
          const itemUpdateQuery = StockItem.findOneAndUpdate(
            itemFilter,
            {
              $set: {
                status: "sold",
                sellingPrice: linePrice,
              },
            },
            { returnDocument: "after" }
          );
          if (useTransactions && session) itemUpdateQuery.session(session);

          const updatedItem = await itemUpdateQuery;
          if (!updatedItem) {
            // CONCURRENCY RACE CONDITION CAUGHT!
            if (useTransactions && session) {
              await session.abortTransaction();
            } else {
              await rollbackMutations(modifiedStocks, modifiedStockItemIds);
            }
            return res.status(409).json({
              success: false,
              message: `Barcode ${bc} is no longer available in ${stockLocation}.`,
            });
          }

          lineSoldStockItemIds.push(updatedItem._id);
          lineSoldBarcodes.push(updatedItem.barcode);
          modifiedStockItemIds.push(updatedItem._id);
        }
      } else {
        // Manual product add (no explicit barcodes):
        // Consume unbarcoded StockItems if available for this product at the target location
        const unbarcodedItems = await StockItem.find({
          productName: stock.productName,
          status: "available",
          barcode: null,
          location: stockLocation === "warehouse" ? "warehouse" : { $ne: "warehouse" },
        }).limit(lineQty);

        if (unbarcodedItems.length > 0) {
          const uIds = unbarcodedItems.map((u) => u._id);
          const updateQuery = StockItem.updateMany(
            { _id: { $in: uIds }, status: "available" },
            { $set: { status: "sold", sellingPrice: linePrice } }
          );
          if (useTransactions && session) updateQuery.session(session);
          await updateQuery;
          lineSoldStockItemIds.push(...uIds);
          modifiedStockItemIds.push(...uIds);
        }
      }

      processedItems.push({
        stockId: stock._id,
        productName: stock.productName,
        storage: line.storage || "",
        color: line.color || "",
        barcode: lineSoldBarcodes[0] || stock.barcode || "N/A",
        category: line.category,
        supplier: line.supplier,
        quantity: lineQty,
        unitPurchaseCost: line.unitPurchaseCost,
        unitSellingPrice: linePrice,
        totalCost: line.totalCost,
        totalAmount: line.totalAmount,
        profit: line.profit,
        loss: line.loss,
        soldStockItemIds: lineSoldStockItemIds,
        soldBarcodes: lineSoldBarcodes,
        location: stockLocation,
        description: line.description || (billDescription || description || "").trim(),
      });

      allSoldStockItemIds.push(...lineSoldStockItemIds);
      allSoldBarcodes.push(...lineSoldBarcodes);

      grandTotalCost += line.totalCost;
      grandTotalAmount += line.totalAmount;
      grandProfit += line.profit;
      grandLoss += line.loss;
      grandTotalQuantity += lineQty;
    }

    grandTotalCost = Number(grandTotalCost.toFixed(2));
    grandTotalAmount = Number(grandTotalAmount.toFixed(2));
    grandProfit = Number(grandProfit.toFixed(2));
    grandLoss = Number(grandLoss.toFixed(2));

    // Calculate cash vs credit settlement amounts
    const isCreditMethod = String(paymentMethod).toLowerCase() === "credit";
    let calcAmountPaid = req.body.amountPaid !== undefined && req.body.amountPaid !== null
      ? Number(req.body.amountPaid)
      : (isCreditMethod ? 0 : grandTotalAmount);
    if (isNaN(calcAmountPaid) || calcAmountPaid < 0) calcAmountPaid = 0;
    calcAmountPaid = Number(calcAmountPaid.toFixed(2));

    let calcAmountDue = req.body.amountDue !== undefined && req.body.amountDue !== null
      ? Number(req.body.amountDue)
      : Number(Math.max(0, grandTotalAmount - calcAmountPaid).toFixed(2));
    if (isNaN(calcAmountDue) || calcAmountDue < 0) calcAmountDue = 0;
    calcAmountDue = Number(calcAmountDue.toFixed(2));

    let calcPaymentStatus = "Paid";
    if (calcAmountDue > 0) {
      calcPaymentStatus = calcAmountPaid > 0 ? "Partial" : "Credit";
    }

    const saleNumber = await generateUniqueSaleNumber(useTransactions ? session : null);

    const primaryLine = processedItems[0];
    const summaryProductName =
      processedItems.length === 1
        ? primaryLine.productName
        : `${primaryLine.productName} + ${processedItems.length - 1} other item(s)`;

    const hasSmallItems = processedItems.some((it) => it.isSmallItem);

    // Extract trade-in / exchange details if present
    const isExchange = Boolean(req.body.isExchange || req.body.tradeInItem);
    let tradeInItem = null;
    if (req.body.tradeInItem && typeof req.body.tradeInItem === "object") {
      const ti = req.body.tradeInItem;
      const tiQty = Number(ti.quantity) || 1;
      const tiUnit = Number(ti.unitPrice) || Number(ti.purchasePrice) || 0;
      const tiTotal = Number(ti.totalValue) || Number(ti.purchasePrice) || (tiQty * tiUnit);
      tradeInItem = {
        stockId: ti.stockId || null,
        productName: (ti.productName || "").trim(),
        barcode: (ti.barcode || "N/A").trim(),
        barcodes: Array.isArray(ti.barcodes) ? ti.barcodes : (ti.barcode && ti.barcode !== "N/A" ? [ti.barcode] : []),
        quantity: tiQty,
        unitPrice: tiUnit,
        purchasePrice: Number(ti.purchasePrice) || tiUnit,
        totalValue: tiTotal,
        customerName: (ti.customerName || req.body.customerName || "").trim(),
        customerId: ti.customerId || req.body.customerId || null,
        purchaseDate: ti.purchaseDate ? new Date(ti.purchaseDate) : new Date(),
      };
    }

    const returnCreditVal = tradeInItem ? Number(tradeInItem.totalValue || tradeInItem.purchasePrice || 0) : 0;
    const netDifferenceVal = isExchange ? Number((grandTotalAmount - returnCreditVal).toFixed(2)) : 0;

    const salePayload = {
      saleNumber,
      items: processedItems,
      hasSmallItems,
      hasLocalPurchases: false,
      isExchange,
      tradeInItem,
      returnCredit: returnCreditVal,
      netDifference: netDifferenceVal,
      stockId: primaryLine.stockId || null,
      productName: summaryProductName,
      barcode: primaryLine.barcode || "N/A",
      category: primaryLine.category || "General",
      supplier: selectedSupplierName || primaryLine.supplier || "Unknown Supplier",
      quantity: grandTotalQuantity,
      unitPurchaseCost: primaryLine.unitPurchaseCost,
      unitSellingPrice: primaryLine.unitSellingPrice,
      totalCost: grandTotalCost,
      totalAmount: grandTotalAmount,
      profit: grandProfit,
      loss: grandLoss,
      soldStockItemIds: allSoldStockItemIds,
      soldBarcodes: allSoldBarcodes,
      paymentMethod,
      paymentStatus: calcPaymentStatus,
      amountPaid: calcAmountPaid,
      amountDue: calcAmountDue,
      location: saleLocation,
      customerName: (req.body.customerName || (tradeInItem ? tradeInItem.customerName : "") || "").trim(),
      customerPhone: (req.body.customerPhone || "").trim(),
      customerId: req.body.customerId || (tradeInItem ? tradeInItem.customerId : null) || null,
      saleDate: new Date(),
      paymentDate: new Date(),
      status: "completed",
      notes: notes ? notes.trim() : "",
      billDescription: (billDescription || description || "").trim(),
      description: (billDescription || description || "").trim(),
    };

    let newSale = null;
    if (useTransactions && session) {
      const created = await Sale.create([salePayload], { session });
      newSale = created[0];
      await session.commitTransaction();
    } else {
      newSale = await Sale.create(salePayload);
    }

    if (newSale && (newSale.isExchange || newSale.tradeInItem)) {
      try {
        if (typeof autoSettleTradeInInvoices === "function") {
          await autoSettleTradeInInvoices();
        }
      } catch (settleErr) {
        console.error("Auto-settle exchange trade-in error:", settleErr);
      }
    }


    return res.status(201).json({
      success: true,
      message: `Sale ${saleNumber} completed successfully (${grandTotalQuantity} unit(s) across ${processedItems.length} item(s)).`,
      data: {
        sale: newSale,
        financials: {
          totalCost: grandTotalCost,
          totalAmount: grandTotalAmount,
          profit: grandProfit,
          loss: grandLoss,
          totalQuantity: grandTotalQuantity,
        },
      },
    });
  } catch (error) {
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    console.error("Error creating sale:", error);
    if (
      error.code === 112 ||
      error.codeName === "WriteConflict" ||
      (error.errorResponse && error.errorResponse.code === 112) ||
      error.hasErrorLabel?.("TransientTransactionError") ||
      (error.errorLabels && error.errorLabels.includes("TransientTransactionError"))
    ) {
      return res.status(409).json({
        success: false,
        message: "Inventory concurrency conflict. Barcode is no longer available.",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process sale transaction.",
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
 * @route   GET /api/sales
 * @desc    Fetch sales list with cursor pagination, database search, date filters, and sorting
 */
const getSales = async (req, res) => {
  try {
    const {
      search,
      period,
      startDate,
      endDate,
      profitStatus,
      paymentMethod,
      supplier,
      sortBy = "newest",
      limit = 50,
      cursor,
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const filter = { status: { $in: ["completed", "refunded"] } };

    // 1. Text Search across saleNumber, productName, barcode, soldBarcodes, items, supplier, customer, tradeIn
    if (search && typeof search === "string" && search.trim() !== "") {
      const cleanSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { saleNumber: { $regex: cleanSearch, $options: "i" } },
        { productName: { $regex: cleanSearch, $options: "i" } },
        { barcode: { $regex: cleanSearch, $options: "i" } },
        { soldBarcodes: { $regex: cleanSearch, $options: "i" } },
        { "items.productName": { $regex: cleanSearch, $options: "i" } },
        { "items.barcode": { $regex: cleanSearch, $options: "i" } },
        { "items.soldBarcodes": { $regex: cleanSearch, $options: "i" } },
        { supplier: { $regex: cleanSearch, $options: "i" } },
        { shopkeeperName: { $regex: cleanSearch, $options: "i" } },
        { "items.shopkeeperName": { $regex: cleanSearch, $options: "i" } },
        { customerName: { $regex: cleanSearch, $options: "i" } },
        { "tradeInItem.productName": { $regex: cleanSearch, $options: "i" } },
        { "tradeInItem.barcode": { $regex: cleanSearch, $options: "i" } },
        { "tradeInItem.customerName": { $regex: cleanSearch, $options: "i" } },
        { notes: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    // 2. Date Range Filter
    const { start, end } = getDateRangeFilter(period, startDate, endDate);
    if (start || end) {
      filter.saleDate = {};
      if (start) filter.saleDate.$gte = start;
      if (end) filter.saleDate.$lte = end;
    }

    // 3. Profit / Loss filter
    if (profitStatus === "profit_only") {
      filter.profit = { $gt: 0 };
    } else if (profitStatus === "loss_only") {
      filter.loss = { $gt: 0 };
    } else if (profitStatus === "break_even") {
      filter.profit = 0;
      filter.loss = 0;
    }

    // 4. Payment Method
    if (paymentMethod && paymentMethod !== "all") {
      filter.paymentMethod = paymentMethod;
    }

    // 5. Supplier
    if (supplier && supplier.trim()) {
      filter.supplier = { $regex: supplier.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    // 5.5 Location Filter
    if (req.query.location) {
      if (req.query.location === "warehouse") {
        filter.location = "warehouse";
      } else if (req.query.location === "shop") {
        filter.location = { $ne: "warehouse" };
      }
    }

    // 6. Sorting Setup
    let sortField = "saleDate";
    let sortDir = -1;

    switch (sortBy) {
      case "oldest":
        sortField = "saleDate";
        sortDir = 1;
        break;
      case "profit_desc":
        sortField = "profit";
        sortDir = -1;
        break;
      case "profit_asc":
        sortField = "profit";
        sortDir = 1;
        break;
      case "amount_desc":
        sortField = "totalAmount";
        sortDir = -1;
        break;
      case "amount_asc":
        sortField = "totalAmount";
        sortDir = 1;
        break;
      case "newest":
      default:
        sortField = "saleDate";
        sortDir = -1;
        break;
    }

    // 7. Cursor Pagination
    let cursorCondition = null;
    const decodedCursor = decodeCursor(cursor);
    if (decodedCursor && decodedCursor.val !== undefined && decodedCursor.id) {
      let cursorVal = decodedCursor.val;
      if (sortField === "saleDate") cursorVal = new Date(cursorVal);
      const cursorId = new mongoose.Types.ObjectId(decodedCursor.id);

      if (sortDir === -1) {
        cursorCondition = {
          $or: [
            { [sortField]: { $lt: cursorVal } },
            { [sortField]: cursorVal, _id: { $lt: cursorId } },
          ],
        };
      } else {
        cursorCondition = {
          $or: [
            { [sortField]: { $gt: cursorVal } },
            { [sortField]: cursorVal, _id: { $gt: cursorId } },
          ],
        };
      }
    }

    const queryConditions = [filter];
    if (cursorCondition) queryConditions.push(cursorCondition);
    const finalQuery = queryConditions.length > 1 ? { $and: queryConditions } : queryConditions[0];

    const sortCriteria = { [sortField]: sortDir, _id: sortDir };

    const sales = await Sale.find(finalQuery)
      .sort(sortCriteria)
      .limit(limitNum + 1)
      .select(
        "saleNumber productName storage color quantity unitSellingPrice totalAmount unitPurchaseCost totalCost profit loss paymentMethod saleDate status customerName customerPhone returnStatus returnedQuantity refundedAmount saleSource shopkeeperName shopkeeperId shopkeeperTransferId agreedAmountPerUnit customerSalePrice soldBarcodes notes billDescription description isExchange exchangeReturnNumber returnCredit netDifference returnedItems tradeInItem items.productName items.storage items.color items.description items.stockId items.barcode items.quantity items.unitSellingPrice items.totalAmount items.returnedQuantity items.refundedAmount items.saleSource items.shopkeeperName items.shopkeeperId items.shopkeeperTransferId items.agreedAmountPerUnit items.customerSalePrice items.soldBarcodes items.location"
      )
      .lean();

    const hasMore = sales.length > limitNum;
    if (hasMore) sales.pop();

    // Backwards compatibility for legacy sales where exchange info was in notes
    const formattedSales = sales.map((sale) => {
      if (!sale.isExchange && sale.notes) {
        const tradeMatch = sale.notes.match(/\(Trade-in \/ Local Purchase:\s*([^)]+)\)/i);
        const custMatch = sale.notes.match(/Customer:\s*([^()]+)/i);
        if (tradeMatch || (custMatch && sale.notes.includes("Trade-in"))) {
          sale.isExchange = true;
          const parsedCust = custMatch ? custMatch[1].trim() : (sale.customerName || "");
          const parsedItem = tradeMatch ? tradeMatch[1].trim() : "";
          if (!sale.customerName && parsedCust) {
            sale.customerName = parsedCust;
          }
          if (!sale.tradeInItem || !sale.tradeInItem.productName) {
            sale.tradeInItem = {
              productName: parsedItem,
              customerName: parsedCust,
              quantity: 1,
              barcode: "N/A",
              barcodes: [],
              unitPrice: 0,
              totalValue: 0,
            };
          }
        }
      }
      return sale;
    });

    // Populate matching return/refund audit records for these sales
    const saleIds = formattedSales.map((s) => s._id);
    const saleNumbers = formattedSales.map((s) => s.saleNumber).filter(Boolean);

    let returnsMap = {};
    if (saleIds.length > 0) {
      try {
        const matchedReturns = await Return.find({
          $or: [
            { saleId: { $in: saleIds } },
            { saleNumber: { $in: saleNumbers } },
          ],
          status: { $ne: "cancelled" },
        })
          .sort({ returnDate: -1, _id: -1 })
          .lean();

        for (const ret of matchedReturns) {
          const sIdKey = ret.saleId ? String(ret.saleId) : "";
          const sNumKey = ret.saleNumber || "";
          if (sIdKey) {
            if (!returnsMap[sIdKey]) returnsMap[sIdKey] = [];
            returnsMap[sIdKey].push(ret);
          }
          if (sNumKey && sNumKey !== sIdKey) {
            if (!returnsMap[sNumKey]) returnsMap[sNumKey] = [];
            returnsMap[sNumKey].push(ret);
          }
        }
      } catch (retQueryErr) {
        console.error("Error populating returns for sales:", retQueryErr);
      }
    }

    const salesWithReturns = formattedSales.map((sale) => {
      const sId = String(sale._id);
      const rets = returnsMap[sId] || (sale.saleNumber ? returnsMap[sale.saleNumber] : []) || [];
      return {
        ...sale,
        returns: rets,
      };
    });

    let nextCursor = null;
    if (hasMore && salesWithReturns.length > 0) {
      const lastItem = salesWithReturns[salesWithReturns.length - 1];
      const sortVal = lastItem[sortField];
      nextCursor = encodeCursor({
        val: sortVal instanceof Date ? sortVal.toISOString() : sortVal,
        id: lastItem._id.toString(),
      });
    }

    let totalCount = null;
    if (!cursor) {
      totalCount = await Sale.countDocuments(filter);
    }

    return res.status(200).json({
      success: true,
      data: salesWithReturns,
      pagination: {
        nextCursor,
        hasMore,
        totalCount,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching sales history:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/sales/stats
 * @desc    Aggregate sales metrics for a given date range
 */
const getSalesStats = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRangeFilter(period, startDate, endDate);

    const match = { status: { $in: ["completed", "refunded"] } };
    if (start || end) {
      match.saleDate = {};
      if (start) match.saleDate.$gte = start;
      if (end) match.saleDate.$lte = end;
    }

    const statsAgg = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSales: {
            $sum: {
              $subtract: [
                "$totalAmount",
                { $ifNull: ["$refundedAmount", 0] },
              ],
            },
          },
          totalCost: { $sum: "$totalCost" },
          totalProfit: {
            $sum: {
              $cond: [
                { $eq: ["$status", "refunded"] },
                0,
                "$profit",
              ],
            },
          },
          totalLoss: { $sum: "$loss" },
          totalItemsSold: {
            $sum: {
              $subtract: [
                "$quantity",
                { $ifNull: ["$returnedQuantity", 0] },
              ],
            },
          },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const result = statsAgg[0] || {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      totalLoss: 0,
      totalItemsSold: 0,
      totalTransactions: 0,
    };

    result.netProfit = Number((result.totalProfit - result.totalLoss).toFixed(2));
    result.averageTransactionValue =
      result.totalTransactions > 0
        ? Number((result.totalSales / result.totalTransactions).toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      data: result,
      periodInfo: { start, end, period: period || "all" },
    });
  } catch (error) {
    console.error("Error calculating sales stats:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/sales/analytics
 * @desc    Comprehensive business analytics for Dashboard:
 *          Timeline chart series, top selling products, supplier payables summary,
 *          and active inventory valuation.
 */
// const getSalesAnalytics = async (req, res) => {
//   try {
//     const { period = "this_month", startDate, endDate } = req.query;
//     const { start, end } = getDateRangeFilter(period, startDate, endDate);

//     const saleMatch = { status: "completed" };
//     if (start || end) {
//       saleMatch.saleDate = {};
//       if (start) saleMatch.saleDate.$gte = start;
//       if (end) saleMatch.saleDate.$lte = end;
//     }

//     // 1. Overall Financial Summary for selected period
//     const statsPromise = Sale.aggregate([
//       { $match: saleMatch },
//       {
//         $group: {
//           _id: null,
//           totalSales: { $sum: "$totalAmount" },
//           totalCost: { $sum: "$totalCost" },
//           totalProfit: { $sum: "$profit" },
//           totalLoss: { $sum: "$loss" },
//           totalItemsSold: { $sum: "$quantity" },
//           totalTransactions: { $sum: 1 },
//         },
//       },
//     ]);

//     // 2. Timeline Aggregation (Daily grouping)
//     const timelinePromise = Sale.aggregate([
//       { $match: saleMatch },
//       {
//         $group: {
//           _id: {
//             $dateToString: { format: "%Y-%m-%d", date: "$saleDate" },
//           },
//           revenue: { $sum: "$totalAmount" },
//           profit: { $sum: "$profit" },
//           loss: { $sum: "$loss" },
//           units: { $sum: "$quantity" },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { _id: 1 } },
//       {
//         $project: {
//           date: "$_id",
//           revenue: { $round: ["$revenue", 2] },
//           profit: { $round: ["$profit", 2] },
//           loss: { $round: ["$loss", 2] },
//           units: "$units",
//           count: "$count",
//           _id: 0,
//         },
//       },
//     ]);

//     // 3. Top-Selling Products (handles both multi-item carts and single-item sales)
//     const topProductsPromise = Sale.aggregate([
//       { $match: saleMatch },
//       {
//         $project: {
//           itemsList: {
//             $cond: [
//               { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
//               "$items",
//               [
//                 {
//                   productName: "$productName",
//                   quantity: "$quantity",
//                   totalAmount: "$totalAmount",
//                   profit: "$profit",
//                   totalCost: "$totalCost",
//                 },
//               ],
//             ],
//           },
//         },
//       },
//       { $unwind: "$itemsList" },
//       {
//         $group: {
//           _id: "$itemsList.productName",
//           unitsSold: { $sum: "$itemsList.quantity" },
//           totalRevenue: { $sum: "$itemsList.totalAmount" },
//           totalProfit: { $sum: "$itemsList.profit" },
//           totalCost: { $sum: "$itemsList.totalCost" },
//         },
//       },
//       { $sort: { unitsSold: -1, totalRevenue: -1 } },
//       { $limit: 8 },
//       {
//         $project: {
//           productName: "$_id",
//           unitsSold: "$unitsSold",
//           totalRevenue: { $round: ["$totalRevenue", 2] },
//           totalProfit: { $round: ["$totalProfit", 2] },
//           _id: 0,
//         },
//       },
//     ]);

//     // 4. Latest 10 Transactions
//     const recentSalesPromise = Sale.find({ status: "completed" })
//       .sort({ saleDate: -1, _id: -1 })
//       .limit(10)
//       .lean();

//     // 5. Existing Supplier Ledger Summary (reused from PurchaseInvoice)
//     const supplierPayablesPromise = PurchaseInvoice.aggregate([
//       {
//         $group: {
//           _id: null,
//           totalPurchases: { $sum: "$totalAmount" },
//           totalPaid: { $sum: "$amountPaid" },
//           totalDue: { $sum: "$amountDue" },
//           totalInvoices: { $sum: 1 },
//         },
//       },
//     ]);

//     // 6. Current Inventory Valuation & Low Stock Count (from Stock)
//     const inventoryValuationPromise = Stock.aggregate([
//       {
//         $group: {
//           _id: null,
//           totalInventoryValue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
//           totalStockUnits: { $sum: "$quantity" },
//           lowStockCount: {
//             $sum: {
//               $cond: [{ $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", 20] }] }, 1, 0],
//             },
//           },
//           outOfStockCount: {
//             $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] },
//           },
//         },
//       },
//     ]);

//     const [statsResult, timeline, topProducts, recentSales, supplierResult, invResult] =
//       await Promise.all([
//         statsPromise,
//         timelinePromise,
//         topProductsPromise,
//         recentSalesPromise,
//         supplierPayablesPromise,
//         inventoryValuationPromise,
//       ]);

//     const summary = statsResult[0] || {
//       totalSales: 0,
//       totalCost: 0,
//       totalProfit: 0,
//       totalLoss: 0,
//       totalItemsSold: 0,
//       totalTransactions: 0,
//     };
//     summary.netProfit = Number((summary.totalProfit - summary.totalLoss).toFixed(2));
//     summary.averageTransactionValue =
//       summary.totalTransactions > 0
//         ? Number((summary.totalSales / summary.totalTransactions).toFixed(2))
//         : 0;

//     const supplierPayables = supplierResult[0] || {
//       totalPurchases: 0,
//       totalPaid: 0,
//       totalDue: 0,
//       totalInvoices: 0,
//     };

//     const inventorySummary = invResult[0] || {
//       totalInventoryValue: 0,
//       totalStockUnits: 0,
//       lowStockCount: 0,
//       outOfStockCount: 0,
//     };

//     return res.status(200).json({
//       success: true,
//       data: {
//         summary,
//         timeline,
//         topProducts,
//         recentSales,
//         supplierPayables,
//         inventorySummary,
//         periodInfo: { period, start, end },
//       },
//     });
//   } catch (error) {
//     console.error("Error fetching sales analytics:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };

/**
 * @route   GET /api/sales/:id
 * @desc    Get single sale detail with receipt information
 */
const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    let sale = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      sale = await Sale.findById(id)
        .populate("stockId", "productName barcode quantity unitPrice storage color")
        .populate("items.stockId", "productName barcode quantity unitPrice storage color");
    } else {
      sale = await Sale.findOne({ saleNumber: id })
        .populate("stockId", "productName barcode quantity unitPrice storage color")
        .populate("items.stockId", "productName barcode quantity unitPrice storage color");
    }

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale transaction record not found.",
      });
    }

    const saleObj = sale.toObject ? sale.toObject() : { ...sale };

    // Ensure items have storage and color resolved
    if (Array.isArray(saleObj.items)) {
      const missingBarcodes = [];
      saleObj.items.forEach((it) => {
        if (!it.storage || !it.color) {
          if (it.barcode && it.barcode !== "N/A") missingBarcodes.push(it.barcode);
          if (Array.isArray(it.soldBarcodes)) missingBarcodes.push(...it.soldBarcodes);
        }
      });

      let stockItemMap = new Map();
      if (missingBarcodes.length > 0) {
        try {
          const matchedSi = await StockItem.find({
            barcode: { $in: missingBarcodes },
          }).select("barcode storage color").lean();
          matchedSi.forEach((si) => {
            if (si.barcode) stockItemMap.set(si.barcode, si);
          });
        } catch (e) {}
      }

      const resolvedBillDesc =
        saleObj.billDescription ||
        saleObj.description ||
        (saleObj.notes
          ? saleObj.notes
              .replace(/^Customer:\s*[^-\n]+(\s*-\s*)?/i, "")
              .replace(/\(Trade-in[^\)]*\)/i, "")
              .replace(/Original Return Value:[^\n]*/i, "")
              .replace(/Net Difference:[^\n]*/i, "")
              .trim()
          : "");

      saleObj.billDescription = resolvedBillDesc;
      saleObj.description = resolvedBillDesc;

      saleObj.items = saleObj.items.map((it) => {
        const bc = it.barcode && it.barcode !== "N/A" ? it.barcode : (Array.isArray(it.soldBarcodes) ? it.soldBarcodes[0] : null);
        const si = bc ? stockItemMap.get(bc) : null;
        const itStorage = it.storage || it.stockId?.storage || si?.storage || saleObj.storage || "";
        const itColor = it.color || it.stockId?.color || si?.color || saleObj.color || "";
        return {
          ...it,
          storage: itStorage,
          color: itColor,
          description: it.description || resolvedBillDesc || "",
        };
      });
    }
    if (!saleObj.isExchange && saleObj.notes) {
      const tradeMatch = saleObj.notes.match(/\(Trade-in \/ Local Purchase:\s*([^)]+)\)/i);
      const custMatch = saleObj.notes.match(/Customer:\s*([^()]+)/i);
      if (tradeMatch || (custMatch && saleObj.notes.includes("Trade-in"))) {
        saleObj.isExchange = true;
        const parsedCust = custMatch ? custMatch[1].trim() : (saleObj.customerName || "");
        const parsedItem = tradeMatch ? tradeMatch[1].trim() : "";
        if (!saleObj.customerName && parsedCust) {
          saleObj.customerName = parsedCust;
        }
        if (!saleObj.tradeInItem || !saleObj.tradeInItem.productName) {
          saleObj.tradeInItem = {
            productName: parsedItem,
            customerName: parsedCust,
            quantity: 1,
            barcode: "N/A",
            barcodes: [],
            unitPrice: 0,
            totalValue: 0,
          };
        }
      }
    }

    try {
      const matchedReturns = await Return.find({
        $or: [{ saleId: saleObj._id }, { saleNumber: saleObj.saleNumber }],
        status: { $ne: "cancelled" },
      }).lean();
      saleObj.returns = matchedReturns || [];
    } catch (e) {
      saleObj.returns = [];
    }

    return res.status(200).json({ success: true, data: saleObj });
  } catch (error) {
    console.error("Error fetching sale by id:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createSale,
  getSales,
  getSalesStats,
  getSaleById,
};

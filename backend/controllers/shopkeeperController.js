const mongoose = require("mongoose");
const Shopkeeper = require("../models/Shopkeeper");
const ShopkeeperTransfer = require("../models/ShopkeeperTransfer");
const Stock = require("../models/Stock");
const StockItem = require("../models/StockItem");
const Sale = require("../models/Sale");
const PurchaseInvoice = require("../models/PurchaseInvoice");

/**
 * Generate unique human-readable Sale Number (e.g. SALE-261020-1234)
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
 * Generate unique human-readable Transfer Number (e.g. SKT-261020-5678)
 */
const generateUniqueTransferNumber = async (session = null) => {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  let isUnique = false;
  let attempts = 0;
  let transferNum = "";

  while (!isUnique && attempts < 30) {
    attempts++;
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    transferNum = `SKT-${yy}${mm}${dd}-${randomPart}`;

    const query = ShopkeeperTransfer.findOne({ transferNumber: transferNum });
    if (session) query.session(session);
    const existing = await query.lean();

    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    transferNum = `SKT-${yy}${mm}${dd}-${Date.now().toString().slice(-4)}`;
  }

  return transferNum;
};

/**
 * @route   GET /api/shopkeepers
 * @desc    Search and list shopkeepers with live autocomplete, pagination, and summary metrics
 */
const getShopkeepers = async (req, res) => {
  try {
    const { search = "", limit = 50 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    const filter = {};
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
      filter.$or = orConditions;
    }

    const shopkeepers = await Shopkeeper.find(filter)
      .sort({ name: 1 })
      .limit(limitNum)
      .lean();

    return res.status(200).json({
      success: true,
      data: shopkeepers,
      count: shopkeepers.length,
    });
  } catch (error) {
    console.error("Error in getShopkeepers:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load shopkeepers." });
  }
};

/**
 * @route   POST /api/shopkeepers
 * @desc    Get existing or create new shopkeeper idempotently (never creates duplicates for same name)
 */
const createOrGetShopkeeper = async (req, res) => {
  try {
    const { name, phone = "", address = "", notes = "" } = req.body;
    const cleanName = (typeof name === "string" ? name.trim() : "");

    if (!cleanName) {
      return res.status(400).json({ success: false, message: "Shopkeeper name is required." });
    }

    // Check if shopkeeper exists (case-insensitive exact match)
    const existing = await Shopkeeper.findOne({
      name: { $regex: `^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        data: existing,
        isExisting: true,
        message: `Existing shopkeeper "${existing.name}" selected.`,
      });
    }

    // Create new shopkeeper
    const newShopkeeper = await Shopkeeper.create({
      name: cleanName,
      phone: (phone || "").trim(),
      address: (address || "").trim(),
      notes: (notes || "").trim(),
    });

    return res.status(201).json({
      success: true,
      data: newShopkeeper,
      isExisting: false,
      message: `Shopkeeper "${newShopkeeper.name}" created successfully.`,
    });
  } catch (error) {
    // Handle unique constraint conflict gracefully
    if (error.code === 11000) {
      const cleanName = (req.body.name || "").trim();
      const existing = await Shopkeeper.findOne({
        name: { $regex: `^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });
      if (existing) {
        return res.status(200).json({
          success: true,
          data: existing,
          isExisting: true,
          message: `Existing shopkeeper "${existing.name}" selected.`,
        });
      }
    }
    console.error("Error in createOrGetShopkeeper:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to save shopkeeper." });
  }
};

/**
 * @route   GET /api/shopkeepers/:id
 * @desc    Get detailed shopkeeper record with complete linked transaction history (transfers, returns, sales)
 */
const getShopkeeperById = async (req, res) => {
  try {
    const { id } = req.params;
    let shopkeeper = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      shopkeeper = await Shopkeeper.findById(id).lean();
    }
    if (!shopkeeper) {
      shopkeeper = await Shopkeeper.findOne({
        name: { $regex: `^${decodeURIComponent(id).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      }).lean();
    }

    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: "Shopkeeper not found." });
    }

    // Fetch all stock transfers linked to this shopkeeper
    const transfers = await ShopkeeperTransfer.find({ shopkeeperId: shopkeeper._id })
      .sort({ transferDate: -1, createdAt: -1 })
      .lean();

    // Fetch all completed sales linked to this shopkeeper
    const sales = await Sale.find({
      $or: [{ shopkeeperId: shopkeeper._id }, { shopkeeperName: shopkeeper.name }],
      status: "completed",
    })
      .sort({ saleDate: -1 })
      .lean();

    // Calculate live aggregated financial metrics
    let totalUnitsTaken = 0;
    let totalUnitsReturned = 0;
    let totalUnitsSold = 0;
    let currentUnitsHeld = 0;
    let totalExpectedValue = 0;

    transfers.forEach((t) => {
      totalUnitsTaken += t.originalQuantity || 0;
      totalUnitsReturned += t.returnedQuantity || 0;
      totalUnitsSold += t.soldQuantity || 0;
      currentUnitsHeld += t.remainingQuantity || 0;
      totalExpectedValue += Number(((t.remainingQuantity || 0) * (t.agreedAmountPerUnit || 0)).toFixed(2));
    });

    let totalSalesPayable = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let totalProfit = 0;

    sales.forEach((s) => {
      totalSalesPayable += s.totalAmount || 0;
      totalPaid += s.amountPaid || 0;
      totalDue += s.amountDue || 0;
      totalProfit += s.profit || 0;
    });

    const summary = {
      totalTransfers: transfers.length,
      totalUnitsTaken,
      totalUnitsReturned,
      totalUnitsSold,
      currentUnitsHeld,
      totalExpectedValue: Number(totalExpectedValue.toFixed(2)),
      totalSalesPayable: Number(totalSalesPayable.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalDue: Number(totalDue.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
    };

    return res.status(200).json({
      success: true,
      data: {
        shopkeeper,
        summary,
        transfers,
        sales,
      },
    });
  } catch (error) {
    console.error("Error in getShopkeeperById:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load shopkeeper details." });
  }
};

/**
 * @route   GET /api/shopkeepers/transfers
 * @desc    List all shopkeeper stock transfers with search, filtering, and summary
 */
const getTransfers = async (req, res) => {
  try {
    const {
      search = "",
      shopkeeperId,
      shopkeeperName,
      productName,
      status,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      limit = 100,
    } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);

    const andConditions = [];

    // 1. Status Filter
    if (status && status !== "all") {
      andConditions.push({ status });
    } else {
      // By default (All Transfers), exclude fully returned transfers.
      // Once an item is returned back to the shop, it is restored to shop inventory
      // and is no longer held by or expected from the shopkeeper.
      andConditions.push({ status: { $ne: "returned" } });
    }

    // 2. Shopkeeper Filter
    if (shopkeeperId && mongoose.Types.ObjectId.isValid(shopkeeperId)) {
      andConditions.push({ shopkeeperId: new mongoose.Types.ObjectId(shopkeeperId) });
    } else if (shopkeeperName && typeof shopkeeperName === "string" && shopkeeperName.trim()) {
      const cleanShop = shopkeeperName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({ shopkeeperName: { $regex: cleanShop, $options: "i" } });
    }

    // 3. Product Name Filter
    if (productName && typeof productName === "string" && productName.trim()) {
      const cleanProd = productName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({ productName: { $regex: cleanProd, $options: "i" } });
    }

    // 4. Date Range Filter
    if (startDate || endDate) {
      const dateCond = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateCond.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateCond.$lte = e;
      }
      andConditions.push({ transferDate: dateCond });
    }

    // 5. Price Range Filter per Unit
    if ((minPrice !== undefined && minPrice !== "") || (maxPrice !== undefined && maxPrice !== "")) {
      const priceCond = {};
      if (minPrice !== undefined && minPrice !== "" && !isNaN(parseFloat(minPrice))) {
        priceCond.$gte = parseFloat(minPrice);
      }
      if (maxPrice !== undefined && maxPrice !== "" && !isNaN(parseFloat(maxPrice))) {
        priceCond.$lte = parseFloat(maxPrice);
      }
      if (Object.keys(priceCond).length > 0) {
        andConditions.push({ agreedAmountPerUnit: priceCond });
      }
    }

    // 6. Global Search Input
    if (search && typeof search === "string" && search.trim() !== "") {
      const clean = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({
        $or: [
          { shopkeeperName: { $regex: clean, $options: "i" } },
          { productName: { $regex: clean, $options: "i" } },
          { barcode: { $regex: clean, $options: "i" } },
          { transferNumber: { $regex: clean, $options: "i" } },
        ],
      });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const transfers = await ShopkeeperTransfer.find(filter)
      .sort({ transferDate: -1, createdAt: -1 })
      .limit(limitNum)
      .lean();

    // Summary calculations across current active transfers
    const statsAgg = await ShopkeeperTransfer.aggregate([
      {
        $group: {
          _id: null,
          totalTransfers: {
            $sum: { $cond: [{ $ne: ["$status", "returned"] }, 1, 0] },
          },
          totalUnitsTaken: { $sum: "$originalQuantity" },
          totalUnitsReturned: { $sum: "$returnedQuantity" },
          totalUnitsSold: { $sum: "$soldQuantity" },
          currentUnitsHeld: { $sum: "$remainingQuantity" },
          totalExpectedAmount: {
            $sum: {
              $multiply: ["$remainingQuantity", "$agreedAmountPerUnit"],
            },
          },
          totalAmountReceived: { $sum: "$amountReceived" },
          totalAmountDue: { $sum: "$amountDue" },
        },
      },
    ]);

    const stats = statsAgg[0] || {
      totalTransfers: 0,
      totalUnitsTaken: 0,
      totalUnitsReturned: 0,
      totalUnitsSold: 0,
      currentUnitsHeld: 0,
      totalExpectedAmount: 0,
      totalAmountReceived: 0,
      totalAmountDue: 0,
    };

    return res.status(200).json({
      success: true,
      data: transfers,
      count: transfers.length,
      stats,
    });
  } catch (error) {
    console.error("Error in getTransfers:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load transfers." });
  }
};

/**
 * @route   POST /api/shopkeepers/transfers
 * @desc    Transfer stock from shop inventory to another shopkeeper
 *          Reduces available stock in inventory, creates immutable transfer record.
 */
const createTransfer = async (req, res) => {
  try {
    const {
      stockId,
      shopkeeperId,
      shopkeeperName,
      quantity,
      agreedAmountPerUnit,
      barcode,
      barcodes,
      notes = "",
    } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: "Transfer quantity must be at least 1." });
    }

    const parsedAgreedAmount = parseFloat(agreedAmountPerUnit);
    if (isNaN(parsedAgreedAmount) || parsedAgreedAmount < 0) {
      return res.status(400).json({ success: false, message: "Agreed amount payable must be a valid non-negative number." });
    }

    if (!stockId || !mongoose.Types.ObjectId.isValid(stockId)) {
      return res.status(400).json({ success: false, message: "A valid stock item is required." });
    }

    // Handle serialized StockItems / IMEIs if present or specified
    let targetBarcodes = [];
    if (Array.isArray(barcodes) && barcodes.length > 0) {
      targetBarcodes = barcodes.map((b) => String(b).trim()).filter(Boolean);
    } else if (barcode && typeof barcode === "string" && barcode.trim() && barcode.trim().toUpperCase() !== "N/A") {
      targetBarcodes = [barcode.trim()];
    }

    // Locate source stock in database (supporting both direct Stock._id and PurchaseInvoice._id from batch mode)
    let stock = await Stock.findById(stockId);

    // If not found directly, stockId may be a PurchaseInvoice ID (e.g. from Batch mode in View Stock)
    if (!stock) {
      const invoice = await PurchaseInvoice.findById(stockId);
      if (invoice) {
        const invoiceRefs = [
          invoice.standaloneReference,
          invoice.invoiceNumber,
        ].filter(Boolean);

        let candidateProductNames = [];
        if (targetBarcodes.length > 0) {
          const itemDoc = await StockItem.findOne({
            barcode: { $in: targetBarcodes },
          });
          if (itemDoc?.productName) {
            candidateProductNames.push(itemDoc.productName);
          }
        }
        if (req.body.productName && typeof req.body.productName === "string" && req.body.productName.trim()) {
          const cleanP = req.body.productName.replace(/\s*\(\d+\s*units?\)$/i, "").trim();
          if (cleanP) candidateProductNames.push(cleanP);
        }
        if (Array.isArray(invoice.itemsSummary)) {
          for (const s of invoice.itemsSummary) {
            if (s.productName) candidateProductNames.push(s.productName.trim());
          }
        }
        candidateProductNames = Array.from(new Set(candidateProductNames));

        // 1. Try matching transactionRef AND candidate product name with sufficient quantity
        if (invoiceRefs.length > 0 && candidateProductNames.length > 0) {
          stock = await Stock.findOne({
            transactionRef: { $in: invoiceRefs },
            productName: {
              $in: candidateProductNames.map(
                (p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
              ),
            },
            quantity: { $gte: parsedQty },
          });
        }

        // 2. Try matching transactionRef with sufficient quantity
        if (!stock && invoiceRefs.length > 0) {
          stock = await Stock.findOne({
            transactionRef: { $in: invoiceRefs },
            quantity: { $gte: parsedQty },
          });
        }

        // 3. Try matching candidate product name with sufficient quantity
        if (!stock && candidateProductNames.length > 0) {
          stock = await Stock.findOne({
            productName: {
              $in: candidateProductNames.map(
                (p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
              ),
            },
            quantity: { $gte: parsedQty },
          });
        }

        // 4. Fallback matching any stock under this transactionRef or candidate product name
        if (!stock) {
          stock = await Stock.findOne({
            $or: [
              ...(invoiceRefs.length > 0 ? [{ transactionRef: { $in: invoiceRefs } }] : []),
              ...(candidateProductNames.length > 0
                ? [
                    {
                      productName: {
                        $in: candidateProductNames.map(
                          (p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
                        ),
                      },
                    },
                  ]
                : []),
            ],
          });
        }
      }
    }

    // If still not found, try resolving via target barcode from StockItem
    if (!stock && targetBarcodes.length > 0) {
      const itemDoc = await StockItem.findOne({ barcode: { $in: targetBarcodes } });
      if (itemDoc) {
        if (itemDoc.transactionRef) {
          stock = await Stock.findOne({
            transactionRef: itemDoc.transactionRef,
            quantity: { $gte: parsedQty },
          });
        }
        if (!stock) {
          stock = await Stock.findOne({
            productName: { $regex: `^${itemDoc.productName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
            quantity: { $gte: parsedQty },
          });
        }
        if (!stock) {
          stock = await Stock.findOne({
            productName: { $regex: `^${itemDoc.productName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          });
        }
      }
    }

    if (!stock) {
      return res.status(404).json({ success: false, message: "Product stock not found in inventory." });
    }

    if (stock.quantity < parsedQty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for "${stock.productName}". Available: ${stock.quantity}, Requested: ${parsedQty}.`,
      });
    }

    // Resolve or create persistent Shopkeeper record
    let resolvedShopkeeper = null;
    if (shopkeeperId && mongoose.Types.ObjectId.isValid(shopkeeperId)) {
      resolvedShopkeeper = await Shopkeeper.findById(shopkeeperId);
    }

    if (!resolvedShopkeeper && shopkeeperName && shopkeeperName.trim()) {
      const cleanName = shopkeeperName.trim();
      resolvedShopkeeper = await Shopkeeper.findOne({
        name: { $regex: `^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });

      if (!resolvedShopkeeper) {
        resolvedShopkeeper = await Shopkeeper.create({
          name: cleanName,
        });
      }
    }

    if (!resolvedShopkeeper) {
      return res.status(400).json({ success: false, message: "A valid shopkeeper name or record is required." });
    }

    let transferredItemIds = [];
    if (targetBarcodes.length > 0) {
      // Find the specific requested units that are available
      const specificUnits = await StockItem.find({
        barcode: { $in: targetBarcodes },
        status: "available",
      }).limit(parsedQty);

      if (specificUnits.length > 0) {
        transferredItemIds = specificUnits.map((u) => u._id);
        targetBarcodes = specificUnits.map((u) => u.barcode);
      }
      // Fallback: If no specific barcode was selected, find available StockItem units for this batch/product
      let generalUnits = [];
      if (stock.transactionRef) {
        generalUnits = await StockItem.find({
          productName: stock.productName,
          transactionRef: stock.transactionRef,
          status: "available",
        }).limit(parsedQty);
      }
      if (generalUnits.length === 0) {
        generalUnits = await StockItem.find({
          productName: stock.productName,
          status: "available",
        }).limit(parsedQty);
      }

      if (generalUnits.length > 0) {
        transferredItemIds = generalUnits.map((u) => u._id);
        targetBarcodes = generalUnits.map((u) => u.barcode).filter(Boolean);
      }
    }

    // Atomic stock deduction to prevent race conditions & negative inventory
    const updatedStock = await Stock.findOneAndUpdate(
      { _id: stock._id, quantity: { $gte: parsedQty } },
      {
        $inc: {
          quantity: -parsedQty,
          totalPrice: -Number((stock.unitPrice * parsedQty).toFixed(2)),
        },
      },
      { returnDocument: "after" }
    );

    if (!updatedStock) {
      return res.status(409).json({
        success: false,
        message: `Inventory concurrency conflict on "${stock.productName}". Not enough stock remaining.`,
      });
    }

    if (updatedStock.quantity <= 0 && updatedStock.totalPrice !== 0) {
      updatedStock.totalPrice = 0;
      await updatedStock.save();
    }

    // Generate unique transfer number
    const transferNumber = await generateUniqueTransferNumber();

    const transferBarcode = targetBarcodes.length > 0 ? targetBarcodes[0] : (stock.barcode || "N/A");

    // Create persistent ShopkeeperTransfer record
    const transfer = await ShopkeeperTransfer.create({
      transferNumber,
      stockId: stock._id,
      shopkeeperId: resolvedShopkeeper._id,
      shopkeeperName: resolvedShopkeeper.name,
      productName: stock.productName,
      barcode: transferBarcode,
      barcodes: targetBarcodes,
      originalQuantity: parsedQty,
      remainingQuantity: parsedQty,
      returnedQuantity: 0,
      soldQuantity: 0,
      unitCost: stock.unitPrice, // Immutable snapshot
      agreedAmountPerUnit: parsedAgreedAmount,
      totalExpectedAmount: Number((parsedAgreedAmount * parsedQty).toFixed(2)),
      status: "active",
      transferDate: new Date(),
      notes: (notes || "").trim(),
    });

    // Mark transferred StockItems with transferred status and link to transfer
    if (transferredItemIds.length > 0) {
      await StockItem.updateMany(
        { _id: { $in: transferredItemIds } },
        {
          $set: {
            status: "transferred",
            shopkeeperId: resolvedShopkeeper._id,
            transferId: transfer._id,
          },
        }
      );
    }

    // Update shopkeeper's running totals
    await Shopkeeper.findByIdAndUpdate(resolvedShopkeeper._id, {
      $inc: {
        totalStockTaken: parsedQty,
        currentStockHeld: parsedQty,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        transfer,
        updatedStock: {
          _id: updatedStock._id,
          quantity: updatedStock.quantity,
          totalPrice: updatedStock.totalPrice,
        },
      },
      message: `Successfully transferred ${parsedQty} unit(s) of "${stock.productName}" to ${resolvedShopkeeper.name}. Available stock is now ${updatedStock.quantity}.`,
    });
  } catch (error) {
    console.error("Error in createTransfer:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to complete stock transfer." });
  }
};

/**
 * @route   POST /api/shopkeepers/transfers/:id/return
 * @desc    Return unsold stock back to shop inventory from shopkeeper
 *          Increases available inventory in shop, decreases remaining stock with shopkeeper.
 *          Does NOT create sale, revenue, or profit.
 */
const returnStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, notes = "", returnDate } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: "Return quantity must be at least 1." });
    }

    const transfer = await ShopkeeperTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({ success: false, message: "Transfer record not found." });
    }

    if (transfer.remainingQuantity < parsedQty) {
      return res.status(400).json({
        success: false,
        message: `Cannot return ${parsedQty} units. Only ${transfer.remainingQuantity} units currently held by ${transfer.shopkeeperName}.`,
      });
    }

    const effectiveReturnDate = returnDate ? new Date(returnDate) : new Date();

    // 1. Atomically update ShopkeeperTransfer
    const newReturned = (transfer.returnedQuantity || 0) + parsedQty;
    const newRemaining = transfer.remainingQuantity - parsedQty;

    transfer.returnedQuantity = newReturned;
    transfer.remainingQuantity = newRemaining;
    transfer.totalExpectedAmount = Number((newRemaining * transfer.agreedAmountPerUnit).toFixed(2));
    transfer.returns.push({
      quantity: parsedQty,
      returnDate: effectiveReturnDate,
      notes: (notes || "").trim(),
    });

    if (newRemaining === 0) {
      transfer.status = transfer.soldQuantity > 0 ? "completed" : "returned";
    } else {
      transfer.status = "partially_completed";
    }

    // Revert returned StockItems back to available
    if (Array.isArray(transfer.barcodes) && transfer.barcodes.length > 0) {
      const returningBarcodes = transfer.barcodes.slice(0, parsedQty);
      await StockItem.updateMany(
        { barcode: { $in: returningBarcodes }, transferId: transfer._id },
        {
          $set: {
            status: "available",
            shopkeeperId: null,
            transferId: null,
          },
        }
      );
      transfer.barcodes = transfer.barcodes.filter((b) => !returningBarcodes.includes(b));
    }

    await transfer.save();

    // 2. Add returned units back to shop stock
    let stock = await Stock.findById(transfer.stockId);
    if (stock) {
      await Stock.findByIdAndUpdate(stock._id, {
        $inc: {
          quantity: parsedQty,
          totalPrice: Number((stock.unitPrice * parsedQty).toFixed(2)),
        },
      });
    } else {
      // If original stock document was deleted because quantity hit 0, restore it
      await Stock.create({
        productName: transfer.productName,
        barcode: transfer.barcode || "N/A",
        quantity: parsedQty,
        unitPrice: transfer.unitCost,
        totalPrice: Number((transfer.unitCost * parsedQty).toFixed(2)),
        location: "shop",
        purchaseDate: transfer.transferDate || new Date(),
        entryOrigin: "general_intake",
        paymentStatus: "Paid",
      });
    }

    // 3. Update shopkeeper running totals
    await Shopkeeper.findByIdAndUpdate(transfer.shopkeeperId, {
      $inc: {
        totalStockReturned: parsedQty,
        currentStockHeld: -parsedQty,
      },
    });

    return res.status(200).json({
      success: true,
      data: transfer,
      message: `Successfully returned ${parsedQty} unit(s) of "${transfer.productName}" from ${transfer.shopkeeperName}. Available shop stock increased.`,
    });
  } catch (error) {
    console.error("Error in returnStock:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process stock return." });
  }
};

/**
 * @route   POST /api/shopkeepers/transfers/:id/sell
 * @desc    Mark stock held by shopkeeper as SOLD to their customer
 *          Decreases remaining stock held, creates a Sale record in Sales History,
 *          calculates shopkeeper margin and my shop's realized profit.
 *          Does NOT deduct stock again (stock was already deducted upon transfer).
 */
const markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      quantity,
      agreedAmountPerUnit,
      customerSalePrice,
      amountPaid = 0,
      paymentMethod = "Cash",
      notes = "",
      saleDate,
    } = req.body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: "Sale quantity must be at least 1." });
    }

    const transfer = await ShopkeeperTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({ success: false, message: "Transfer record not found." });
    }

    if (transfer.remainingQuantity < parsedQty) {
      return res.status(400).json({
        success: false,
        message: `Cannot sell ${parsedQty} units. Only ${transfer.remainingQuantity} units currently held by ${transfer.shopkeeperName}.`,
      });
    }

    // Financial calculations
    const effectiveAgreedPrice =
      agreedAmountPerUnit !== undefined && agreedAmountPerUnit !== null && !isNaN(parseFloat(agreedAmountPerUnit))
        ? parseFloat(agreedAmountPerUnit)
        : transfer.agreedAmountPerUnit;

    const originalUnitCost = transfer.unitCost;
    const myProfitPerUnit = Number((effectiveAgreedPrice - originalUnitCost).toFixed(2));
    const totalAmountPayableToMe = Number((effectiveAgreedPrice * parsedQty).toFixed(2));
    const totalProfit = Number((myProfitPerUnit * parsedQty).toFixed(2));
    const totalCost = Number((originalUnitCost * parsedQty).toFixed(2));

    const parsedCustomerPrice = customerSalePrice ? parseFloat(customerSalePrice) : effectiveAgreedPrice;

    const parsedAmountPaid =
      amountPaid !== undefined && amountPaid !== null && !isNaN(parseFloat(amountPaid))
        ? Math.max(0, parseFloat(amountPaid))
        : totalAmountPayableToMe;
    const calculatedDue = Math.max(0, Number((totalAmountPayableToMe - parsedAmountPaid).toFixed(2)));
    const paymentStatus = calculatedDue === 0 ? "Paid" : (parsedAmountPaid > 0 ? "Partial" : "Due");

    const effectiveSaleDate = saleDate ? new Date(saleDate) : new Date();

    // Mark sold StockItems
    let soldBarcodes = [];
    if (Array.isArray(transfer.barcodes) && transfer.barcodes.length > 0) {
      soldBarcodes = transfer.barcodes.slice(0, parsedQty);
      await StockItem.updateMany(
        { barcode: { $in: soldBarcodes }, transferId: transfer._id },
        {
          $set: {
            status: "sold",
            sellingPrice: effectiveAgreedPrice,
          },
        }
      );
      transfer.barcodes = transfer.barcodes.filter((b) => !soldBarcodes.includes(b));
    }

    // 1. Generate unique sale number
    const saleNumber = await generateUniqueSaleNumber();

    // 2. Create Sale record in Sales History (integrates seamlessly with existing sales history)
    const salePayload = {
      saleNumber,
      saleSource: "shopkeeper",
      shopkeeperId: transfer.shopkeeperId,
      shopkeeperName: transfer.shopkeeperName,
      shopkeeperTransferId: transfer._id,
      productName: transfer.productName,
      barcode: soldBarcodes.length > 0 ? soldBarcodes[0] : (transfer.barcode || "N/A"),
      category: "Mobile Phones",
      supplier: "Shopkeeper Transfer",
      quantity: parsedQty,
      unitPurchaseCost: originalUnitCost,
      unitSellingPrice: effectiveAgreedPrice, // Price agreed to be paid to my shop
      agreedAmountPerUnit: effectiveAgreedPrice,
      customerSalePrice: parsedCustomerPrice,
      totalCost,
      totalAmount: totalAmountPayableToMe,
      profit: totalProfit > 0 ? totalProfit : 0,
      loss: totalProfit < 0 ? Math.abs(totalProfit) : 0,
      soldStockItemIds: [],
      soldBarcodes: soldBarcodes,
      paymentMethod: paymentMethod || "Cash",
      paymentStatus,
      amountPaid: parsedAmountPaid,
      amountDue: calculatedDue,
      saleDate: effectiveSaleDate,
      status: "completed",
      notes: notes
        ? `${notes.trim()} (Transferred via ${transfer.transferNumber} to ${transfer.shopkeeperName})`
        : `Consignment sale by ${transfer.shopkeeperName} (Transfer #${transfer.transferNumber})`,
      items: [
        {
          stockId: transfer.stockId,
          productName: transfer.productName,
          storage: transfer.storage || "",
          color: transfer.color || "",
          barcode: transfer.barcode || "N/A",
          category: "Mobile Phones",
          supplier: "Shopkeeper Transfer",
          quantity: parsedQty,
          unitPurchaseCost: originalUnitCost,
          unitSellingPrice: effectiveAgreedPrice,
          agreedAmountPerUnit: effectiveAgreedPrice,
          customerSalePrice: parsedCustomerPrice,
          totalCost,
          totalAmount: totalAmountPayableToMe,
          profit: totalProfit > 0 ? totalProfit : 0,
          loss: totalProfit < 0 ? Math.abs(totalProfit) : 0,
          shopkeeperName: transfer.shopkeeperName,
          shopkeeperId: transfer.shopkeeperId,
          shopkeeperTransferId: transfer._id,
          saleSource: "shopkeeper",
          location: "shop",
          soldBarcodes: soldBarcodes,
        },
      ],
    };

    const createdSale = await Sale.create(salePayload);

    // 3. Update ShopkeeperTransfer record
    const newSold = (transfer.soldQuantity || 0) + parsedQty;
    const newRemaining = transfer.remainingQuantity - parsedQty;

    transfer.soldQuantity = newSold;
    transfer.remainingQuantity = newRemaining;
    transfer.totalExpectedAmount = Number((newRemaining * transfer.agreedAmountPerUnit).toFixed(2));
    transfer.amountReceived = Number(((transfer.amountReceived || 0) + parsedAmountPaid).toFixed(2));
    transfer.amountDue = Number(((transfer.amountDue || 0) + calculatedDue).toFixed(2));

    transfer.sales.push({
      saleId: createdSale._id,
      saleNumber: createdSale.saleNumber,
      quantity: parsedQty,
      unitCost: originalUnitCost,
      agreedAmountPerUnit: effectiveAgreedPrice,
      customerSalePrice: parsedCustomerPrice,
      myProfitPerUnit,
      totalAmountPayable: totalAmountPayableToMe,
      totalProfit,
      amountPaid: parsedAmountPaid,
      amountDue: calculatedDue,
      paymentMethod,
      paymentStatus,
      saleDate: effectiveSaleDate,
      notes: (notes || "").trim(),
    });

    if (newRemaining === 0) {
      transfer.status = "completed";
    } else {
      transfer.status = "partially_completed";
    }

    await transfer.save();

    // 4. Update Shopkeeper record running totals
    await Shopkeeper.findByIdAndUpdate(transfer.shopkeeperId, {
      $inc: {
        totalStockSold: parsedQty,
        currentStockHeld: -parsedQty,
        totalPayable: totalAmountPayableToMe,
        totalPaid: parsedAmountPaid,
        totalDue: calculatedDue,
        totalProfitGenerated: totalProfit > 0 ? totalProfit : 0,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        transfer,
        sale: createdSale,
      },
      message: `Successfully marked ${parsedQty} unit(s) of "${transfer.productName}" as sold by ${transfer.shopkeeperName}. Profit of Rs. ${totalProfit.toLocaleString()} recorded in Sales History.`,
    });
  } catch (error) {
    console.error("Error in markAsSold:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to complete sale." });
  }
};

/**
 * @route   POST /api/shopkeepers/:id/payments
 * @desc    Record money received from a shopkeeper against their outstanding balance
 */
const recordShopkeeperPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod = "Cash", notes = "" } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Payment amount must be greater than zero." });
    }

    const shopkeeper = await Shopkeeper.findById(id);
    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: "Shopkeeper not found." });
    }

    // Allocate payment against oldest unpaid/partial sales from this shopkeeper
    const salesWithDue = await Sale.find({
      shopkeeperId: shopkeeper._id,
      amountDue: { $gt: 0 },
      status: "completed",
    }).sort({ saleDate: 1 });

    let unallocated = parsedAmount;
    for (const sale of salesWithDue) {
      if (unallocated <= 0) break;
      const due = sale.amountDue || 0;
      const payTowardsThis = Math.min(due, unallocated);

      sale.amountPaid = Number(((sale.amountPaid || 0) + payTowardsThis).toFixed(2));
      sale.amountDue = Number((due - payTowardsThis).toFixed(2));
      sale.paymentStatus = sale.amountDue === 0 ? "Paid" : "Partial";
      await sale.save();

      unallocated -= payTowardsThis;
    }

    // Update shopkeeper's overall balances
    const newTotalPaid = Number(((shopkeeper.totalPaid || 0) + parsedAmount).toFixed(2));
    const newTotalDue = Math.max(0, Number(((shopkeeper.totalDue || 0) - parsedAmount).toFixed(2)));

    shopkeeper.totalPaid = newTotalPaid;
    shopkeeper.totalDue = newTotalDue;
    await shopkeeper.save();

    return res.status(200).json({
      success: true,
      data: shopkeeper,
      message: `Recorded payment of Rs. ${parsedAmount.toLocaleString()} from ${shopkeeper.name}. Remaining due: Rs. ${newTotalDue.toLocaleString()}.`,
    });
  } catch (error) {
    console.error("Error in recordShopkeeperPayment:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to record payment." });
  }
};

/**
 * @route   GET /api/shopkeepers/filter-options
 * @desc    Get dynamic filter options from DB (distinct shopkeepers, distinct products, min/max prices)
 */
const getFilterOptions = async (req, res) => {
  try {
    const [shopkeepers, products, priceBounds] = await Promise.all([
      Shopkeeper.find({}, { _id: 1, name: 1, phone: 1 }).sort({ name: 1 }).lean(),
      ShopkeeperTransfer.distinct("productName"),
      ShopkeeperTransfer.aggregate([
        {
          $group: {
            _id: null,
            minPrice: { $min: "$agreedAmountPerUnit" },
            maxPrice: { $max: "$agreedAmountPerUnit" },
          },
        },
      ]),
    ]);

    const bounds = priceBounds[0] || { minPrice: 0, maxPrice: 100000 };

    return res.status(200).json({
      success: true,
      data: {
        shopkeepers,
        products: (products || []).filter(Boolean).sort(),
        minPrice: bounds.minPrice || 0,
        maxPrice: bounds.maxPrice || 0,
      },
    });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    return res.status(500).json({ success: false, message: "Failed to load filter options." });
  }
};

module.exports = {
  getShopkeepers,
  createOrGetShopkeeper,
  getShopkeeperById,
  getTransfers,
  getFilterOptions,
  createTransfer,
  returnStock,
  markAsSold,
  recordShopkeeperPayment,
};

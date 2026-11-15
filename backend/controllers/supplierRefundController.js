const mongoose = require("mongoose");
const StockItem = require("../models/StockItem");
const Stock = require("../models/Stock");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Sale = require("../models/Sale");
const Supplier = require("../models/Supplier");
const SupplierPayment = require("../models/SupplierPayment");
const SupplierRefund = require("../models/SupplierRefund");

/**
 * Helper: Generate unique Refund Number
 */
const generateRefundNumber = async () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let isUnique = false;
  let refundNum = "";
  let attempts = 0;

  while (!isUnique && attempts < 15) {
    attempts++;
    const random = Math.floor(1000 + Math.random() * 9000);
    refundNum = `SUP-RET-${yy}${mm}${dd}-${random}`;
    const exists = await SupplierRefund.findOne({ refundNumber: refundNum });
    if (!exists) isUnique = true;
  }
  return refundNum;
};

/**
 * Helper: Generate unique Replacement Purchase Invoice Number
 */
const generateInvoiceNumber = async () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let isUnique = false;
  let invNum = "";
  let attempts = 0;

  while (!isUnique && attempts < 15) {
    attempts++;
    const random = Math.floor(1000 + Math.random() * 9000);
    invNum = `INV-GEN-${yy}${mm}${dd}-${random}`;
    const exists = await PurchaseInvoice.findOne({ invoiceNumber: invNum });
    if (!exists) isUnique = true;
  }
  return invNum;
};

/**
 * Helper: Calculate Supplier Balance
 */
const calculateSupplierBalance = async (supplierName, supplierId) => {
  if (!supplierName) return 0;
  const escName = supplierName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const query = supplierId
    ? { supplierId }
    : { supplier: { $regex: `^${escName}$`, $options: "i" } };

  const [invoices, payments, refunds] = await Promise.all([
    PurchaseInvoice.find(query).lean(),
    SupplierPayment.find(query).lean(),
    SupplierRefund.find({ ...query, status: "completed" }).lean(),
  ]);

  const grossPurchases = invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
  const totalRefundAmount = refunds.reduce((sum, r) => sum + (Number(r.totalRefundAmount) || 0), 0);
  const netPurchases = Number((grossPurchases - totalRefundAmount).toFixed(2));

  let grossPaid = 0;
  let refundsReceived = 0;
  payments.forEach((p) => {
    const amt = Number(p.amount) || 0;
    if (p.paymentType === "Supplier Refund" || String(p.invoiceNumber || "").startsWith("SUP-RET")) {
      refundsReceived += amt;
    } else {
      grossPaid += amt;
    }
  });

  const netPaid = Number((grossPaid - refundsReceived).toFixed(2));
  return Number((netPurchases - netPaid).toFixed(2));
};

/**
 * @route   GET /api/supplier-refunds/check-imei
 * @desc    Validate an IMEI for supplier refund eligibility
 * @query   imei, supplierName, supplierId
 */
const checkImei = async (req, res) => {
  try {
    const rawImei = req.query.imei;
    const targetSupplierName = req.query.supplierName ? req.query.supplierName.trim() : "";

    if (!rawImei || typeof rawImei !== "string" || !rawImei.trim()) {
      return res.status(400).json({
        success: false,
        message: "IMEI is required for stock lookup.",
      });
    }

    const cleanImei = rawImei.trim();

    // 1. Search StockItem database by barcode/IMEI (sorted newest first)
    const matchingItems = await StockItem.find({ barcode: cleanImei })
      .sort({ createdAt: -1 })
      .lean();

    if (!matchingItems || matchingItems.length === 0) {
      // Check if it exists in Sales even if StockItem was somehow pruned
      const saleWithImei = await Sale.findOne({
        $or: [
          { "items.soldBarcodes": cleanImei },
          { soldBarcodes: cleanImei },
        ],
      })
        .sort({ saleDate: -1, createdAt: -1 })
        .lean();

      if (saleWithImei) {
        const custName =
          saleWithImei.customerName ||
          saleWithImei.items?.find((it) => it.soldBarcodes?.includes(cleanImei))?.customerName ||
          "Walk-in Customer";

        return res.status(200).json({
          success: false,
          status: "SOLD",
          message: "This phone has already been sold.",
          imei: cleanImei,
          saleDetails: {
            customerName: custName,
            saleNumber: saleWithImei.saleNumber || "N/A",
            saleDate: saleWithImei.saleDate || saleWithImei.createdAt || null,
            productName:
              saleWithImei.items?.find((it) => it.soldBarcodes?.includes(cleanImei))?.productName ||
              saleWithImei.productName ||
              "Phone",
            customerPhone: saleWithImei.customerPhone || "",
          },
        });
      }

      return res.status(200).json({
        success: false,
        status: "NOT_FOUND",
        message: "No phone found with this IMEI.",
        imei: cleanImei,
      });
    }

    // Inspect the latest active unit
    let activeItem = matchingItems.find(
      (it) =>
        it.status === "available" &&
        (!targetSupplierName || (it.supplier || "").trim().toLowerCase() === targetSupplierName.toLowerCase())
    ) || matchingItems.find((it) => it.status === "available") || matchingItems[0];

    // CASE 1: Phone has already been sold
    if (activeItem.status === "sold") {
      const sale = await Sale.findOne({
        $or: [
          { "items.soldBarcodes": cleanImei },
          { soldBarcodes: cleanImei },
          { "items.soldStockItemIds": activeItem._id },
          { soldStockItemIds: activeItem._id },
        ],
      })
        .sort({ saleDate: -1, createdAt: -1 })
        .lean();

      const custName =
        sale?.customerName ||
        sale?.items?.find((it) => it.soldBarcodes?.includes(cleanImei))?.customerName ||
        "Walk-in Customer";

      return res.status(200).json({
        success: false,
        status: "SOLD",
        message: "This phone has already been sold.",
        imei: cleanImei,
        saleDetails: {
          customerName: custName,
          saleNumber: sale?.saleNumber || "N/A",
          saleDate: sale?.saleDate || sale?.createdAt || null,
          productName: activeItem.productName,
          customerPhone: sale?.customerPhone || "",
        },
      });
    }

    // CASE 2: Phone was already refunded to supplier
    if (activeItem.status === "returned_to_supplier" || activeItem.status === "returned") {
      const previousRefund = await SupplierRefund.findOne({
        $or: [
          { "returnedItems.stockItemId": activeItem._id },
          { "returnedItems.barcode": cleanImei },
        ],
      }).lean();

      return res.status(200).json({
        success: false,
        status: "ALREADY_REFUNDED",
        message: "This phone was already refunded to the supplier.",
        imei: cleanImei,
        productName: activeItem.productName,
        refundNumber: previousRefund?.refundNumber || null,
      });
    }

    // CASE 3: Status is damaged, transferred, or other ambiguous state
    if (activeItem.status !== "available") {
      return res.status(200).json({
        success: false,
        status: "INVALID_STATUS",
        message: `This phone cannot be refunded because its current inventory status is "${activeItem.status}".`,
        imei: cleanImei,
        productName: activeItem.productName,
        currentStatus: activeItem.status,
      });
    }

    // CASE 4: Phone is available, but belongs to another supplier
    if (targetSupplierName) {
      const itemSup = (activeItem.supplier || "").trim().toLowerCase();
      const targetSup = targetSupplierName.trim().toLowerCase();

      if (itemSup && targetSup && itemSup !== targetSup) {
        return res.status(200).json({
          success: false,
          status: "WRONG_SUPPLIER",
          message: `This phone belongs to supplier "${activeItem.supplier}", not the currently selected supplier "${targetSupplierName}".`,
          imei: cleanImei,
          productName: activeItem.productName,
          actualSupplier: activeItem.supplier,
        });
      }
    }

    // CASE 5: ELIGIBLE AVAILABLE PHONE
    // Retrieve original purchase reference from PurchaseInvoice
    let invoiceNumber = "N/A";
    if (activeItem.invoiceId) {
      const inv = await PurchaseInvoice.findById(activeItem.invoiceId).lean();
      if (inv) invoiceNumber = inv.invoiceNumber;
    }
    if (invoiceNumber === "N/A" && activeItem.transactionRef) {
      invoiceNumber = activeItem.transactionRef;
    }

    return res.status(200).json({
      success: true,
      status: "ELIGIBLE",
      message: "Phone is currently available in stock and eligible for supplier refund.",
      item: {
        stockItemId: activeItem._id,
        barcode: activeItem.barcode,
        productName: activeItem.productName,
        storage: activeItem.storage || "",
        color: activeItem.color || "",
        category: activeItem.category || "General",
        purchaseCost: Number(activeItem.purchaseCost || 0),
        refundAmount: Number(activeItem.purchaseCost || 0),
        supplier: activeItem.supplier,
        invoiceId: activeItem.invoiceId || null,
        invoiceNumber,
        purchaseDate: activeItem.purchaseDate || activeItem.createdAt,
        location: activeItem.location || "shop",
        status: activeItem.status,
      },
    });
  } catch (error) {
    console.error("Error in checkImei:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while verifying IMEI.",
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/supplier-refunds
 * @desc    Submit a batch refund to supplier (Workflow A or Workflow B)
 */
const createSupplierRefund = async (req, res) => {
  try {
    const {
      supplier,
      supplierId,
      workflowType = "refund_only", // "refund_only" | "refund_and_purchase"
      returnedItems = [],
      replacementItems = [],
      cashPaid = 0, // Actual cash payment made during this transaction (default: 0, received on credit)
      refundAction = "credit_adjustment", // "credit_adjustment" | "cash_payout"
      notes = "",
      processedBy = "Admin",
    } = req.body;

    const numCashPaid = Math.max(0, Number(cashPaid) || 0);

    // 1. Basic validation
    if (!supplier || typeof supplier !== "string" || !supplier.trim()) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required.",
      });
    }

    if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one phone must be selected for refund.",
      });
    }

    const cleanSupplierName = supplier.trim();

    // 2. Prevent duplicate physical units in the submitted batch
    const seenStockItemIds = new Set();
    for (const item of returnedItems) {
      const bc = (item.barcode || "").trim();
      const sId = item.stockItemId || item._id ? String(item.stockItemId || item._id).trim() : "";
      if (!bc && !sId) {
        return res.status(400).json({
          success: false,
          message: "All items must have a valid IMEI or Stock Item ID.",
        });
      }
      if (sId) {
        if (seenStockItemIds.has(sId)) {
          return res.status(400).json({
            success: false,
            message: `Duplicate physical unit (IMEI: "${bc || sId}") selected multiple times in the refund batch.`,
          });
        }
        seenStockItemIds.add(sId);
      }
    }

    // 3. Server-side validation of every returned item against the actual database
    const validatedReturnedItems = [];
    let totalRefundAmount = 0;

    for (const it of returnedItems) {
      let stockItemDoc = null;
      const targetId = it.stockItemId || it._id;
      if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
        stockItemDoc = await StockItem.findById(targetId);
      }
      if (!stockItemDoc && it.barcode) {
        const alreadyClaimedIds = validatedReturnedItems.map((v) => v.stockItemId);
        stockItemDoc =
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: it.barcode.trim(),
            supplier: { $regex: `^${cleanSupplierName}$`, $options: "i" },
            status: "available",
          })) ||
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: it.barcode.trim(),
            status: "available",
          })) ||
          (await StockItem.findOne({
            _id: { $nin: alreadyClaimedIds },
            barcode: it.barcode.trim(),
          }));
      }
      if (!stockItemDoc) {
        return res.status(404).json({
          success: false,
          message: `Stock record not found for IMEI "${it.barcode}".`,
        });
      }

      // Check for accidental duplicate physical unit claim within this batch
      if (validatedReturnedItems.some((v) => String(v.stockItemId) === String(stockItemDoc._id))) {
        return res.status(400).json({
          success: false,
          message: `The physical unit (IMEI: "${it.barcode}") is selected multiple times in this batch.`,
        });
      }

      // Check current status strictly at moment of submission
      if (stockItemDoc.status !== "available") {
        return res.status(409).json({
          success: false,
          message: `IMEI "${it.barcode}" is no longer available in stock (current status: "${stockItemDoc.status}"). Refund rejected.`,
        });
      }

      // Check supplier match
      const docSupplier = (stockItemDoc.supplier || "").trim().toLowerCase();
      if (docSupplier && docSupplier !== cleanSupplierName.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: `IMEI "${it.barcode}" belongs to supplier "${stockItemDoc.supplier}", not "${cleanSupplierName}".`,
        });
      }

      const itemRefundAmount =
        it.refundAmount != null && Number(it.refundAmount) >= 0
          ? Number(it.refundAmount)
          : Number(stockItemDoc.purchaseCost || 0);

      totalRefundAmount += itemRefundAmount;

      validatedReturnedItems.push({
        stockItemId: stockItemDoc._id,
        stockId: stockItemDoc.stockId || null,
        productName: stockItemDoc.productName,
        storage: stockItemDoc.storage || "",
        color: stockItemDoc.color || "",
        category: stockItemDoc.category || "General",
        barcode: stockItemDoc.barcode,
        originalPurchaseCost: Number(stockItemDoc.purchaseCost || 0),
        refundAmount: itemRefundAmount,
        invoiceId: stockItemDoc.invoiceId || null,
        invoiceNumber: it.invoiceNumber || "N/A",
        location: stockItemDoc.location || "shop",
        doc: stockItemDoc,
      });
    }

    totalRefundAmount = Number(totalRefundAmount.toFixed(2));

    // 4. Calculate previous supplier balance before any mutations
    const previousBalance = await calculateSupplierBalance(cleanSupplierName, supplierId);

    // 5. Generate unique refund reference
    const refundNumber = await generateRefundNumber();

    // 6. Transition StockItem documents to 'returned_to_supplier'
    for (const item of validatedReturnedItems) {
      item.doc.status = "returned_to_supplier";
      await item.doc.save();

      // Decrement aggregate Stock model
      const stockFilter = {
        productName: item.productName,
        location: item.location || "shop",
      };
      if (item.storage) stockFilter.storage = item.storage;
      if (item.color) stockFilter.color = item.color;

      const refundVal = Number(item.refundAmount || item.originalPurchaseCost || 0);

      const stockDoc = await Stock.findOne(stockFilter);
      if (stockDoc) {
        stockDoc.quantity = Math.max(0, stockDoc.quantity - 1);
        stockDoc.totalPrice = Math.max(
          0,
          Number(((stockDoc.totalPrice || 0) - item.originalPurchaseCost).toFixed(2))
        );

        // Deduct from paid/due so View Stock and Ledger stay 0, 0
        if (stockDoc.amountPaid > 0) {
          const deduction = Math.min(stockDoc.amountPaid, refundVal);
          stockDoc.amountPaid = Math.max(0, Number((stockDoc.amountPaid - deduction).toFixed(2)));
          const rem = refundVal - deduction;
          if (rem > 0 && stockDoc.amountDue > 0) {
            stockDoc.amountDue = Math.max(0, Number((stockDoc.amountDue - rem).toFixed(2)));
          }
        } else if (stockDoc.amountDue > 0) {
          stockDoc.amountDue = Math.max(0, Number((stockDoc.amountDue - refundVal).toFixed(2)));
        }
        await stockDoc.save();
      }

      // NOTE: Preserving permanent audit trail!
      // The original PurchaseInvoice is intentionally NOT mutated so historical purchase
      // records and receipts remain 100% accurate. The return is documented via SupplierRefund.
    }

    // 7. Handle Replacement Purchase (Workflow B)
    let replacementInvoiceId = null;
    let replacementInvoiceNumber = null;
    let replacementCartTotal = 0;
    let totalReplacementQty = 0;
    let validatedReplacementItems = [];

    if (workflowType === "refund_and_purchase" && Array.isArray(replacementItems) && replacementItems.length > 0) {
      replacementInvoiceNumber = await generateInvoiceNumber();

      const newStockItemsToInsert = [];

      for (const rep of replacementItems) {
        const rQty = Number(rep.quantity) || 1;
        const rUnitPrice = Number(rep.unitPrice) || 0;
        const rSubtotal = Number((rQty * rUnitPrice).toFixed(2));
        replacementCartTotal += rSubtotal;
        totalReplacementQty += rQty;

        const repBarcodes = Array.isArray(rep.barcodes) ? rep.barcodes : [];

        validatedReplacementItems.push({
          productName: (rep.productName || "").trim(),
          storage: (rep.storage || "").trim(),
          color: (rep.color || "").trim(),
          quantity: rQty,
          unitPrice: rUnitPrice,
          subtotal: rSubtotal,
          barcodes: repBarcodes,
        });

        // Prepare serialized StockItems
        for (const bc of repBarcodes) {
          if (bc && bc !== "N/A") {
            newStockItemsToInsert.push({
              barcode: bc.trim(),
              productName: (rep.productName || "").trim(),
              storage: (rep.storage || "").trim(),
              color: (rep.color || "").trim(),
              category: rep.category || "General",
              purchaseCost: rUnitPrice,
              sellingPrice: rep.sellingPrice || 0,
              supplier: cleanSupplierName,
              purchaseDate: new Date(),
              status: "available",
              location: "shop",
            });
          }
        }

        // Update/Create aggregate Stock record
        const aggStock = await Stock.findOne({
          productName: (rep.productName || "").trim(),
          storage: (rep.storage || "").trim(),
          color: (rep.color || "").trim(),
          location: "shop",
        });

        if (aggStock) {
          aggStock.quantity += rQty;
          aggStock.totalPrice = Number(((aggStock.totalPrice || 0) + rSubtotal).toFixed(2));
          await aggStock.save();
        } else {
          await Stock.create({
            productName: (rep.productName || "").trim(),
            storage: (rep.storage || "").trim(),
            color: (rep.color || "").trim(),
            barcode: repBarcodes[0] || "N/A",
            quantity: rQty,
            unitPrice: rUnitPrice,
            totalPrice: rSubtotal,
            location: "shop",
            purchaseDate: new Date(),
            supplierName: cleanSupplierName,
          });
        }
      }

      replacementCartTotal = Number(replacementCartTotal.toFixed(2));

      // Create PurchaseInvoice for the replacement purchase (supports receiving stock on credit with 0 cash paid)
      const invoiceAmountDue = Math.max(0, Number((replacementCartTotal - numCashPaid).toFixed(2)));
      const invoicePaymentStatus =
        numCashPaid >= replacementCartTotal
          ? "paid"
          : numCashPaid > 0
          ? "partial"
          : "unpaid";

      const [newInvoice] = await PurchaseInvoice.create([
        {
          invoiceNumber: replacementInvoiceNumber,
          supplier: cleanSupplierName,
          supplierId: supplierId || null,
          purchaseDate: new Date(),
          totalQuantity: totalReplacementQty,
          totalAmount: replacementCartTotal,
          amountPaid: numCashPaid,
          amountDue: invoiceAmountDue,
          paymentStatus: invoicePaymentStatus,
          isLinkedToLedger: true,
          entryOrigin: "general_intake",
          itemsSummary: validatedReplacementItems.map((v) => ({
            productName: v.productName,
            storage: v.storage,
            color: v.color,
            quantity: v.quantity,
            unitPrice: v.unitPrice,
            subtotal: v.subtotal,
            barcodes: v.barcodes,
          })),
        },
      ]);

      replacementInvoiceId = newInvoice._id;

      // Assign invoiceId to all new serialized StockItems and insert them
      if (newStockItemsToInsert.length > 0) {
        newStockItemsToInsert.forEach((item) => {
          item.invoiceId = replacementInvoiceId;
        });
        await StockItem.insertMany(newStockItemsToInsert);
      }

      // Record payment transaction only if actual cash was disbursed
      if (numCashPaid > 0) {
        await SupplierPayment.create({
          supplier: cleanSupplierName,
          supplierId: supplierId || null,
          amount: numCashPaid,
          paymentDate: new Date(),
          paymentMethod: "Cash",
          paymentType: "Direct Payment",
          invoiceNumber: replacementInvoiceNumber,
          notes: `Cash payment made for new stock intake #${replacementInvoiceNumber} during return #${refundNumber}`,
        });
      }
    } else if (workflowType === "refund_only" && refundAction === "cash_payout") {
      // In Workflow A cash payout: Supplier physically hands cash back to shopkeeper
      await SupplierPayment.create({
        supplier: cleanSupplierName,
        supplierId: supplierId || null,
        amount: totalRefundAmount,
        paymentDate: new Date(),
        paymentMethod: "Supplier Refund",
        paymentType: "Supplier Refund",
        invoiceNumber: refundNumber,
        notes: `Cash refund payout collected from supplier for return #${refundNumber}`,
      });
    }

    // 8. Calculate Final Outstanding Supplier Balance:
    // Final outstanding = Previous outstanding + New purchase value − Refund value − Actual payments made
    const resultingBalance = Number(
      (previousBalance + replacementCartTotal - totalRefundAmount - numCashPaid).toFixed(2)
    );

    // 9. Persist SupplierRefund record
    const supplierRefundDoc = await SupplierRefund.create({
      refundNumber,
      supplier: cleanSupplierName,
      supplierId: supplierId || null,
      refundDate: new Date(),
      workflowType,
      returnedItems: validatedReturnedItems.map((v) => ({
        stockItemId: v.stockItemId,
        stockId: v.stockId,
        productName: v.productName,
        storage: v.storage,
        color: v.color,
        category: v.category,
        barcode: v.barcode,
        originalPurchaseCost: v.originalPurchaseCost,
        refundAmount: v.refundAmount,
        invoiceId: v.invoiceId,
        invoiceNumber: v.invoiceNumber,
      })),
      totalQuantity: validatedReturnedItems.length,
      totalRefundAmount,
      replacementInvoiceId,
      replacementInvoiceNumber,
      replacementCartTotal,
      netDifference: Number((replacementCartTotal - totalRefundAmount).toFixed(2)),
      cashPaid: numCashPaid,
      differenceSettlement:
        replacementCartTotal > totalRefundAmount
          ? "paid_extra"
          : replacementCartTotal < totalRefundAmount
          ? "credit_retained"
          : "even",
      replacementItems: validatedReplacementItems,
      previousSupplierBalance: previousBalance,
      resultingSupplierBalance: resultingBalance,
      notes: notes || "",
      status: "completed",
      processedBy,
    });

    return res.status(201).json({
      success: true,
      message: "Supplier refund and stock adjustment processed successfully.",
      data: supplierRefundDoc,
      receipt: {
        supplier: cleanSupplierName,
        supplierId,
        refundNumber,
        refundDate: supplierRefundDoc.refundDate,
        workflowType,
        returnedItems: validatedReturnedItems,
        totalRefundAmount,
        totalQuantityReturned: validatedReturnedItems.length,
        replacementInvoiceNumber,
        replacementItems: validatedReplacementItems,
        replacementCartTotal,
        totalQuantityReceived: totalReplacementQty,
        previousBalance,
        newPurchaseValue: replacementCartTotal,
        refundValue: totalRefundAmount,
        cashPaid: numCashPaid,
        finalBalance: resultingBalance,
        netDifference: Number((replacementCartTotal - totalRefundAmount).toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error in createSupplierRefund:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing supplier refund.",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/supplier-refunds
 * @desc    Get paginated supplier refund transactions
 */
const getSupplierRefunds = async (req, res) => {
  try {
    const { supplier, search, page = 1, limit = 20 } = req.query;
    const filter = { status: "completed" };

    if (supplier) {
      filter.supplier = { $regex: `^${supplier.trim()}$`, $options: "i" };
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { refundNumber: { $regex: q, $options: "i" } },
        { supplier: { $regex: q, $options: "i" } },
        { "returnedItems.barcode": { $regex: q, $options: "i" } },
        { "returnedItems.productName": { $regex: q, $options: "i" } },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const totalCount = await SupplierRefund.countDocuments(filter);
    const refunds = await SupplierRefund.find(filter)
      .sort({ refundDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    return res.status(200).json({
      success: true,
      data: refunds,
      pagination: {
        totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error("Error in getSupplierRefunds:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while retrieving supplier refunds.",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/supplier-refunds/:id
 * @desc    Get single supplier refund record for receipt reprinting
 */
const getSupplierRefundById = async (req, res) => {
  try {
    const refund = await SupplierRefund.findById(req.params.id).lean();
    if (!refund) {
      return res.status(404).json({
        success: false,
        message: "Supplier refund record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: refund,
    });
  } catch (error) {
    console.error("Error in getSupplierRefundById:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while retrieving refund details.",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/supplier-refunds/supplier-stock
 * @desc    Get all available stock items purchased from a specific supplier, optionally filtered by phone name / model
 * @query   supplierName, productName
 */
const getSupplierStockItems = async (req, res) => {
  try {
    const supplierName = req.query.supplierName ? req.query.supplierName.trim() : "";
    const productName = req.query.productName ? req.query.productName.trim() : "";

    if (!supplierName) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required.",
      });
    }

    const escSupplier = supplierName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = {
      supplier: { $regex: `^${escSupplier}$`, $options: "i" },
      status: "available",
    };

    const search = req.query.search ? req.query.search.trim() : (req.query.q ? req.query.q.trim() : "");
    if (search) {
      const escSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { productName: { $regex: escSearch, $options: "i" } },
        { barcode: { $regex: escSearch, $options: "i" } },
        { storage: { $regex: escSearch, $options: "i" } },
        { color: { $regex: escSearch, $options: "i" } },
      ];
    } else if (productName) {
      const escProduct = productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.productName = { $regex: escProduct, $options: "i" };
    }

    const stockItems = await StockItem.find(query)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .populate("invoiceId", "invoiceNumber purchaseDate")
      .lean();

    const formatted = stockItems.map((item) => ({
      stockItemId: item._id,
      productName: item.productName,
      storage: item.storage || "",
      color: item.color || "",
      barcode: item.barcode || "N/A",
      purchaseCost: Number(item.purchaseCost || 0),
      refundAmount: Number(item.purchaseCost || 0),
      invoiceId: item.invoiceId?._id || item.invoiceId || null,
      invoiceNumber: item.invoiceId?.invoiceNumber || "N/A",
      purchaseDate: item.invoiceId?.purchaseDate || item.purchaseDate,
      supplier: item.supplier,
      status: item.status,
    }));

    // Distinct available models bought from this supplier
    const availableModels = await StockItem.distinct("productName", {
      supplier: { $regex: `^${escSupplier}$`, $options: "i" },
      status: "available",
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      availableModels: (availableModels || []).filter(Boolean).sort(),
      totalCount: formatted.length,
    });
  } catch (error) {
    console.error("Error in getSupplierStockItems:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while retrieving supplier stock items.",
      error: error.message,
    });
  }
};

module.exports = {
  checkImei,
  createSupplierRefund,
  getSupplierRefunds,
  getSupplierRefundById,
  getSupplierStockItems,
};


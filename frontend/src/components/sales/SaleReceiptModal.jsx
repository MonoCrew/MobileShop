import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  FiPrinter,
  FiDownload,
  FiCheckCircle,
  FiAlertCircle,
  FiTag,
  FiRotateCcw,
  FiUsers,
} from "react-icons/fi";
import { downloadReceiptAsPdf } from "../../utils/receiptDownload";
import {
  RECEIPT_TERMS,
  formatDateTimeAmPm,
  formatFullDateTimeAmPm,
} from "../add-stock/StockReceiptModal";
import ReceiptWhatsAppQr from "../common/ReceiptWhatsAppQr";

/**
 * Extract storage/GB from product name as clean fallback if missing from database
 */
const extractSpecsFromProductName = (name = "") => {
  if (!name || typeof name !== "string") return { storage: "", color: "" };
  let storage = "";
  const stMatch = name.match(/\b(16|32|64|128|256|512)\s*(GB|gb)\b|\b1\s*(TB|tb)\b/i);
  if (stMatch) {
    storage = stMatch[0].toUpperCase().replace(/\s+/, "");
  }
  return { storage, color: "" };
};

/**
 * Standardized 80mm x 210mm POS Thermal / Single-Sheet Receipt Modal
 * Supports:
 * - Standard multi-item & single-item retail sales
 * - Customer Trade-In Exchange transactions
 * - Shopkeeper consignment sales
 * - Non-destructive refunded state (void alert + disabled print)
 * - Return / refund audit vouchers
 */
export default function SaleReceiptModal({
  receipt,
  onClose,
  onProcessReturn,
}) {
  if (!receipt) return null;

  // Determine transaction nature
  const isReturnVoucher = Boolean(
    receipt.returnNumber ||
    receipt.isRefundReceipt ||
    receipt.receiptType === "return" ||
    receipt.recordType === "return"
  );

  const isExchange = Boolean(
    !isReturnVoucher &&
    (receipt.isExchange ||
      receipt.exchangeReturnNumber ||
      (receipt.saleNumber && receipt.saleNumber.includes("-EXC-")) ||
      receipt.tradeInItem?.productName ||
      (receipt.notes && (receipt.notes.includes("Trade-in") || receipt.notes.includes("Exchange purchase"))))
  );

  const isFullyRefunded = Boolean(
    !isReturnVoucher &&
    (receipt.status === "refunded" ||
      receipt.returnStatus === "refunded" ||
      (receipt.returnedQuantity && receipt.quantity && receipt.returnedQuantity >= receipt.quantity))
  );

  const isPartiallyRefunded = Boolean(
    !isReturnVoucher &&
    !isFullyRefunded &&
    (receipt.returnStatus === "partial" ||
      (receipt.returnedQuantity && receipt.returnedQuantity > 0))
  );

  // Shopkeeper check
  const isShopkeeper = Boolean(
    receipt.saleSource === "shopkeeper" ||
    receipt.shopkeeperId ||
    receipt.shopkeeperTransferId ||
    (Array.isArray(receipt.items) &&
      receipt.items.some(
        (it) => it.saleSource === "shopkeeper" || it.shopkeeperId || it.shopkeeperName
      ))
  );

  const shopkeeperName =
    receipt.shopkeeperName ||
    receipt.items?.find((i) => i.shopkeeperName)?.shopkeeperName ||
    "";

  // Trade-in details extraction
  const extractExchangeDetails = () => {
    let customerName = (receipt.customerName || receipt.tradeInItem?.customerName || "").trim();
    let takenItemName = receipt.tradeInItem?.productName || "";
    let takenBarcode = receipt.tradeInItem?.barcode || "";
    let takenBarcodes = Array.isArray(receipt.tradeInItem?.barcodes)
      ? receipt.tradeInItem.barcodes
      : takenBarcode && takenBarcode !== "N/A"
        ? [takenBarcode]
        : [];
    let takenQty = Number(receipt.tradeInItem?.quantity || 1);
    let takenPrice = Number(
      receipt.tradeInItem?.totalValue ??
      receipt.tradeInItem?.purchasePrice ??
      receipt.returnCredit ??
      0
    );

    if (Array.isArray(receipt.returnedItems) && receipt.returnedItems.length > 0) {
      takenItemName = receipt.returnedItems.map((r) => r.productName).filter(Boolean).join(", ");
      takenBarcode = receipt.returnedItems[0]?.barcode || takenBarcode;
      takenPrice = receipt.returnedItems.reduce(
        (acc, r) => acc + (Number(r.refundAmount) || 0),
        0
      );
    } else if (receipt.notes) {
      const tradeMatch = receipt.notes.match(/\(Trade-in \/ Local Purchase:\s*([^)]+)\)/i);
      const valMatch = receipt.notes.match(/Original Return Value:\s*Rs\.\s*([\d.]+)/i);
      const custMatch = receipt.notes.match(/Customer:\s*([^()]+)/i);
      if (tradeMatch && !takenItemName) takenItemName = tradeMatch[1].trim();
      if (valMatch && !takenPrice) takenPrice = Number(valMatch[1]);
      if (custMatch && !customerName) customerName = custMatch[1].trim();
    }

    const soldItems = Array.isArray(receipt.items) && receipt.items.length > 0
      ? receipt.items
      : [receipt];
    const myPrice = Number(receipt.totalAmount || 0);
    const netDiff = receipt.netDifference != null
      ? Number(receipt.netDifference)
      : Number((myPrice - takenPrice).toFixed(2));

    return {
      customerName,
      takenItemName: takenItemName || "Customer Trade-in Item",
      takenBarcode,
      takenBarcodes,
      takenQty,
      takenPrice,
      soldItems,
      myPrice,
      netDiff,
    };
  };

  const exchangeDetails = isExchange ? extractExchangeDetails() : null;

  // Normalized line items
  const items = Array.isArray(receipt.items) && receipt.items.length > 0
    ? receipt.items
    : [receipt];

  // Bill-level description / terms (with fallback extraction from notes)
  const billDescription = (
    receipt.billDescription ||
    receipt.description ||
    (() => {
      if (!receipt.notes) return "";
      const cleaned = receipt.notes
        .replace(/\(Trade-in[^)]*\)/gi, "")
        .replace(/Original Return Value:[^)]*/gi, "")
        .trim();
      const match = cleaned.match(/Customer:\s*[^-\n]+-\s*(.+)$/i);
      return match ? match[1].trim() : "";
    })() ||
    ""
  ).trim();

  const displayCustomer =
    (receipt.customerName && receipt.customerName !== "Walk-in Customer" ? receipt.customerName : null) ||
    (receipt.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim()) ||
    (isExchange ? exchangeDetails?.customerName : "") ||
    "Walk-in Customer";

  const totalAmountNum = Number(
    isReturnVoucher
      ? (receipt.totalRefundAmount || receipt.refundAmount || 0)
      : (receipt.totalAmount || 0)
  );

  const receiptContent = (
    <div
      className="modal fade show d-block sales-receipt-backdrop"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1070 }}
      tabIndex="-1"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes salesReceiptEntrance {
          0% {
            opacity: 0;
            transform: scale(0.94) translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes salesReceiptBackdropFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .sales-receipt-backdrop {
          animation: salesReceiptBackdropFade 0.2s ease-out forwards;
        }
        .sales-receipt-dialog {
          animation: salesReceiptEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        #printable-sales-receipt,
        #printable-sales-receipt * {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif;
        }
        #printable-sales-receipt .font-monospace,
        #printable-sales-receipt code,
        #printable-sales-receipt kbd {
          font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        }
        #printable-sales-receipt .text-nowrap {
          white-space: nowrap !important;
        }

        /* Standard 80mm x 210mm thermal / invoice single-sheet print rules */
        @page {
          size: 80mm 210mm;
          margin: 0mm;
        }

        @media print {
          html, body {
            width: 80mm !important;
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide all application content and modal wrappers from print engine */
          #root,
          .no-print,
          .modal-backdrop,
          .modal-header,
          .modal-footer,
          .btn,
          .btn-close,
          header,
          nav,
          aside,
          .sidebar {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
          }

          .sales-receipt-backdrop {
            position: static !important;
            display: block !important;
            width: 80mm !important;
            max-width: 80mm !important;
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }

          .sales-receipt-dialog,
          .modal-content,
          .modal-body {
            position: static !important;
            display: block !important;
            width: 80mm !important;
            max-width: 80mm !important;
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          /* The 80mm single-sheet receipt slip */
          #printable-sales-receipt {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif !important;
            display: flex !important;
            flex-direction: column !important;
            position: relative !important;
            width: 80mm !important;
            max-width: 80mm !important;
            height: auto !important;
            min-height: 210mm !important;
            max-height: none !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 3.5mm 4mm 3mm 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            page-break-before: avoid !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-before: avoid !important;
            break-after: avoid !important;
            break-inside: avoid !important;
          }

          #printable-sales-receipt,
          #printable-sales-receipt * {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif !important;
            color: #000000 !important;
          }
          #printable-sales-receipt .font-monospace,
          #printable-sales-receipt code,
          #printable-sales-receipt kbd {
            font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
          }
          #printable-sales-receipt .text-nowrap {
            white-space: nowrap !important;
          }
        }
      `}</style>

      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable sales-receipt-dialog"
        style={{ maxWidth: "440px", width: "95%" }}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden bg-white">
          {/* Modal Header (No Print) */}
          <div className="modal-header bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between no-print">
            <div className="d-flex align-items-center gap-2">
              {isReturnVoucher ? (
                <FiRotateCcw className="text-danger" size={16} />
              ) : isFullyRefunded ? (
                <FiAlertCircle className="text-warning" size={16} />
              ) : (
                <FiPrinter size={16} />
              )}
              <h6 className="modal-title fw-bold mb-0" style={{ fontSize: "0.88rem" }}>
                {isReturnVoucher
                  ? "Return & Refund Voucher (80mm)"
                  : isFullyRefunded
                    ? "Sale Receipt (Refunded - Void)"
                    : "Sale Receipt Slip (80mm × 210mm)"}
              </h6>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          {/* Modal Body / Printable Receipt Slip */}
          <div
            className="modal-body p-3 bg-light overflow-auto"
            style={{ maxHeight: "calc(90vh - 120px)" }}
          >
            <div
              id="printable-sales-receipt"
              className="bg-white rounded-2 border shadow-sm mx-auto my-1"
              style={{
                width: "80mm",
                maxWidth: "80mm",
                minHeight: "210mm",
                height: "auto",
                boxSizing: "border-box",
                padding: "4.5mm 4.5mm 4.5mm 4.5mm",
                fontSize: "0.74rem",
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', 'Helvetica Neue', Arial, sans-serif",
                color: "#18181b",
                lineHeight: 1.3,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="receipt-top-content">
                {/* ─────────────────────────────────────────────────────────────
                    1. STORE & RECEIPT HEADER (Standardized Branding)
                   ───────────────────────────────────────────────────────────── */}
                <div className="text-center pb-2 border-bottom border-dark border-opacity-25">
                  <h4
                    className="fw-bolder text-dark mb-0 tracking-tight"
                    style={{ letterSpacing: "-0.4px", fontSize: "1.24rem" }}
                  >
                    Sheikh Hammad
                  </h4>
                  <div className="text-muted fw-semibold" style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                    Mobile &amp; Accessories Point of Sale
                  </div>
                  <div className="text-dark fw-bold font-monospace" style={{ fontSize: "0.78rem", marginTop: "2px", letterSpacing: "0.2px" }}>
                    +923227406955
                  </div>
                  {/* Clean Outline Badge */}
                  <div className="mt-2">
                    <span
                      className="d-inline-block px-3 py-1 text-uppercase fw-bold rounded-1 border border-dark"
                      style={{
                        fontSize: "0.64rem",
                        letterSpacing: "0.4px",
                        color: "#09090b",
                        backgroundColor: "#f4f4f5",
                      }}
                    >
                      {isReturnVoucher
                        ? "Goods Return Voucher & Refund"
                        : "Customer Retail Sales Invoice"}
                    </span>
                  </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    1.5. NON-DESTRUCTIVE REFUND WATERMARK / VOID BANNER
                   ───────────────────────────────────────────────────────────── */}
                {isFullyRefunded && (
                  <div
                    className="alert alert-danger py-2 px-2 my-2 text-center rounded-1 border border-danger fw-bold"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <div className="d-flex align-items-center justify-content-center gap-2 text-danger">
                      <FiAlertCircle size={14} />
                      <span>TRANSACTION REFUNDED — RECEIPT VOID</span>
                    </div>
                    <div className="text-muted fw-normal mt-1" style={{ fontSize: "0.62rem" }}>
                      This transaction has been refunded in full and cannot be reprinted as an active receipt.
                    </div>
                  </div>
                )}

                {isPartiallyRefunded && (
                  <div
                    className="alert alert-warning py-1 px-2 my-2 text-center rounded-1 border border-warning-subtle small fw-semibold"
                    style={{ fontSize: "0.68rem" }}
                  >
                    <span>⚠️ Partial Return Recorded: {receipt.returnedQuantity} unit(s) refunded</span>
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    2. METADATA INFO BOX (Standardized Card)
                   ───────────────────────────────────────────────────────────── */}
                <div
                  className="my-2 rounded-2 border border-secondary-subtle"
                  style={{
                    padding: "8px 10px",
                    fontSize: "0.70rem",
                    backgroundColor: "#f8fafc",
                    boxSizing: "border-box",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                    <span className="text-secondary fw-medium flex-shrink-0">
                      {isReturnVoucher ? "Return Voucher #:" : "Invoice #:"}
                    </span>
                    <strong
                      className="text-dark font-monospace fw-bold text-end text-truncate"
                      style={{ fontSize: "0.66rem", letterSpacing: "-0.2px" }}
                    >
                      {receipt.returnNumber || receipt.saleNumber}
                    </strong>
                  </div>

                  {isReturnVoucher && receipt.saleNumber && (
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                      <span className="text-secondary fw-medium flex-shrink-0">Original Sale #:</span>
                      <span className="text-dark font-monospace fw-semibold text-end text-truncate" style={{ fontSize: "0.66rem" }}>
                        {receipt.saleNumber}
                      </span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                    <span className="text-secondary fw-medium flex-shrink-0">Date &amp; Time:</span>
                    <span className="text-dark fw-semibold text-end text-truncate" style={{ fontSize: "0.66rem" }}>
                      {formatDateTimeAmPm(receipt.returnDate || receipt.saleDate || Date.now())}
                    </span>
                  </div>

                  <div className="d-flex justify-content-between align-items-center" style={{ gap: "6px" }}>
                    <span className="text-secondary fw-medium flex-shrink-0">Customer:</span>
                    <strong className="text-dark text-truncate text-end" style={{ maxWidth: "155px", fontSize: "0.68rem" }}>
                      {displayCustomer}
                    </strong>
                  </div>

                  {isReturnVoucher && (receipt.settlementType === "exchange" || receipt.settlementType === "store_credit") && (
                    <div className="d-flex justify-content-between align-items-center mt-1 pt-1 border-top border-secondary-subtle" style={{ gap: "6px" }}>
                      <span className="text-secondary fw-medium flex-shrink-0">Settlement:</span>
                      <span className="badge bg-light text-dark border fw-semibold text-end" style={{ fontSize: "0.64rem" }}>
                        {receipt.settlementType === "exchange" ? "Exchange" : "Store Credit"}
                      </span>
                    </div>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    2.5. OTHER SHOPKEEPER SALE DISTINCTION BANNER
                   ───────────────────────────────────────────────────────────── */}
                {isShopkeeper && (
                  <div
                    className="p-2 mb-2 rounded-1 text-start border border-secondary-subtle bg-light-subtle"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-secondary fw-medium">
                        Transaction Source:
                      </span>
                      <strong className="text-dark fw-bold">
                        Sales by Other Shopkeeper
                      </strong>
                    </div>
                    {shopkeeperName && (
                      <div className="d-flex justify-content-between align-items-center" style={{ fontSize: "0.74rem" }}>
                        <span className="text-secondary fw-medium">Original Shopkeeper:</span>
                        <strong className="text-dark fw-bold">{shopkeeperName}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    2.8. CUSTOMER TRADE-IN EXCHANGE BANNER (If Exchange)
                   ───────────────────────────────────────────────────────────── */}
                {isExchange && exchangeDetails && (
                  <div className="p-2 mb-2 rounded-1 text-start border bg-light" style={{ fontSize: "0.68rem" }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-dark fw-bold">Customer Trade-in Exchange</span>
                      <span className="badge bg-light text-dark border font-monospace px-2 py-0" style={{ fontSize: "0.60rem" }}>
                        Exchange
                      </span>
                    </div>
                    <div className="p-1 rounded-1 bg-white border">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-muted">Item Taken:</span>
                        <strong className="text-dark">{exchangeDetails.takenItemName}</strong>
                      </div>
                      {exchangeDetails.takenBarcode && exchangeDetails.takenBarcode !== "N/A" && (
                        <div className="d-flex justify-content-between text-muted" style={{ fontSize: "0.62rem" }}>
                          <span>IMEI/Barcode:</span>
                          <span className="font-monospace text-dark">{exchangeDetails.takenBarcode}</span>
                        </div>
                      )}
                      {exchangeDetails.takenPrice > 0 && (
                        <div className="d-flex justify-content-between text-muted" style={{ fontSize: "0.62rem" }}>
                          <span>Credit Given:</span>
                          <span className="text-dark fw-semibold">
                            Rs. {exchangeDetails.takenPrice.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    3. ITEMS TABLE (Standardized POS Column Structure)
                   ───────────────────────────────────────────────────────────── */}
                <div className="my-2 border rounded-1 overflow-hidden">
                  <table className="table table-sm mb-0 w-100" style={{ fontSize: "0.70rem", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: isReturnVoucher ? "58%" : "46%" }} />
                      <col style={{ width: isReturnVoucher ? "14%" : "10%" }} />
                      {!isReturnVoucher && <col style={{ width: "22%" }} />}
                      <col style={{ width: isReturnVoucher ? "28%" : "22%" }} />
                    </colgroup>
                    <thead className="table-light border-bottom border-secondary-subtle">
                      <tr>
                        <th className="ps-2 py-1 text-secondary text-uppercase fw-bold" style={{ fontSize: "0.62rem" }}>
                          {isReturnVoucher ? "Item Returned" : "Item"}
                        </th>
                        <th
                          className="text-center py-1 text-secondary text-uppercase fw-bold text-nowrap"
                          style={{ fontSize: "0.62rem" }}
                        >
                          Qty
                        </th>
                        {!isReturnVoucher && (
                          <th
                            className="text-end py-1 text-secondary text-uppercase fw-bold text-nowrap"
                            style={{ fontSize: "0.62rem" }}
                          >
                            Price
                          </th>
                        )}
                        <th
                          className="text-end pe-2 py-1 text-secondary text-uppercase fw-bold text-nowrap"
                          style={{ fontSize: "0.62rem" }}
                        >
                          {isReturnVoucher ? "Refund Value" : "Total"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const qty = Number(it.returnQuantity || it.quantity || 1);
                        const unitPrice = Number(
                          it.unitSellingPrice != null && it.unitSellingPrice !== ""
                            ? it.unitSellingPrice
                            : it.sellingPrice || 0
                        );
                        const lineTotal = Number(
                          it.actualRefundedAmount != null
                            ? it.actualRefundedAmount
                            : it.refundAmount != null
                              ? it.refundAmount
                              : it.totalAmount != null
                                ? it.totalAmount
                                : unitPrice * qty
                        );

                        const itemBarcodes = Array.isArray(it.returnBarcodes) && it.returnBarcodes.length > 0
                          ? it.returnBarcodes
                          : Array.isArray(it.soldBarcodes) && it.soldBarcodes.length > 0
                            ? it.soldBarcodes
                            : it.barcode && it.barcode.toUpperCase() !== "N/A"
                              ? [it.barcode]
                              : [];

                        // Specific line item note (or bill description if 1-item sale)
                        const lineNote = (it.description || (items.length === 1 ? billDescription : "")).trim();

                        return (
                          <React.Fragment key={idx}>
                            <tr className={lineNote ? "border-0" : "border-bottom border-light"}>
                              <td className="ps-2 py-1.5 align-top text-start" style={{ overflowWrap: "break-word" }}>
                                <div className="fw-bold text-dark" style={{ fontSize: "0.72rem", lineHeight: 1.25 }}>
                                  {it.productName}
                                </div>
                                {(() => {
                                  const extracted = extractSpecsFromProductName(it.productName);
                                  const itemStorage = it.storage || it.stockId?.storage || receipt.storage || extracted.storage || "";
                                  const itemColor = it.color || it.stockId?.color || receipt.color || extracted.color || "";
                                  const itemSpecs = [itemStorage, itemColor].filter(Boolean).join(" • ");
                                  return itemSpecs ? (
                                    <div
                                      className="text-secondary fw-semibold font-monospace"
                                      style={{
                                        fontSize: "0.60rem",
                                        marginTop: "1px",
                                        letterSpacing: "0.2px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {itemSpecs}
                                    </div>
                                  ) : null;
                                })()}
                                {itemBarcodes.length > 0 && (
                                  <div
                                    className="font-monospace text-muted"
                                    style={{
                                      fontSize: "0.58rem",
                                      marginTop: "1.5px",
                                      lineHeight: 1.25,
                                    }}
                                  >
                                    <span>IMEI:&nbsp;</span>
                                    {itemBarcodes.map((bc, bIdx) => (
                                      <span key={bIdx} style={{ whiteSpace: "nowrap" }}>
                                        {bc}{bIdx < itemBarcodes.length - 1 ? ", " : ""}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {isReturnVoucher && unitPrice > 0 && unitPrice !== lineTotal && (
                                  <div className="text-muted fw-normal" style={{ fontSize: "0.58rem", marginTop: "1px" }}>
                                    Sold at: Rs. {unitPrice.toLocaleString()}
                                  </div>
                                )}
                              </td>
                              <td
                                className="text-center py-1.5 align-top font-monospace text-nowrap"
                                style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                              >
                                {qty}
                              </td>
                              {!isReturnVoucher && (
                                <td
                                  className="text-end py-1.5 align-top font-monospace text-secondary text-nowrap"
                                  style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                                >
                                  Rs.&nbsp;{unitPrice.toLocaleString()}
                                </td>
                              )}
                              <td
                                className="text-end pe-2 py-1.5 align-top fw-bold text-dark font-monospace text-nowrap"
                                style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                              >
                                {isReturnVoucher ? "- " : ""}Rs.&nbsp;{lineTotal.toLocaleString()}
                              </td>
                            </tr>
                            {lineNote && (
                              <tr className="border-bottom border-light bg-light bg-opacity-75">
                                <td colSpan={isReturnVoucher ? 3 : 4} className="ps-2 pe-2 py-1 text-start">
                                  <div className="d-flex align-items-center gap-1.5" style={{ fontSize: "0.64rem", lineHeight: 1.3 }}>
                                    <span
                                      className="badge bg-dark text-white text-uppercase px-1.5 py-0.5 flex-shrink-0"
                                      style={{ fontSize: "0.52rem", letterSpacing: "0.3px", fontWeight: "700" }}
                                    >
                                      Note
                                    </span>
                                    <span className="text-dark fw-bold" style={{ wordBreak: "normal" }}>
                                      {lineNote}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Trade-in line in table if exchange */}
                      {isExchange && exchangeDetails?.takenItemName && (
                        <React.Fragment>
                          <tr className={receipt.tradeInItem?.description ? "border-0 bg-light bg-opacity-50" : "border-bottom border-light bg-light bg-opacity-50"}>
                            <td className="ps-2 py-1.5 align-top text-start" style={{ overflowWrap: "break-word" }}>
                              <div className="fw-bold text-dark" style={{ fontSize: "0.72rem", lineHeight: 1.25 }}>
                                {exchangeDetails.takenItemName}
                              </div>
                              {(() => {
                                const ti = receipt.tradeInItem;
                                const tiExtracted = extractSpecsFromProductName(exchangeDetails.takenItemName);
                                const tiStorage = ti?.storage || tiExtracted.storage || "";
                                const tiColor = ti?.color || tiExtracted.color || "";
                                const tiSpecs = [tiStorage, tiColor].filter(Boolean).join(" • ");
                                return tiSpecs ? (
                                  <div
                                    className="text-secondary fw-semibold font-monospace"
                                    style={{
                                      fontSize: "0.62rem",
                                      marginTop: "1px",
                                      letterSpacing: "0.2px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {tiSpecs}
                                  </div>
                                ) : null;
                              })()}
                              {exchangeDetails.takenBarcode && exchangeDetails.takenBarcode !== "N/A" && (
                                <div className="font-monospace text-muted" style={{ fontSize: "0.58rem", marginTop: "1.5px", lineHeight: 1.25 }}>
                                  <span>IMEI:&nbsp;</span>
                                  <span style={{ whiteSpace: "nowrap" }}>{exchangeDetails.takenBarcode}</span>
                                </div>
                              )}
                            </td>
                            <td
                              className="text-center py-1.5 align-top font-monospace text-nowrap"
                              style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                            >
                              {exchangeDetails.takenQty || 1}
                            </td>
                            <td
                              className="text-end py-1.5 align-top font-monospace text-secondary text-nowrap"
                              style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                            >
                              Rs.&nbsp;{Number(exchangeDetails.takenPrice / (exchangeDetails.takenQty || 1)).toLocaleString()}
                            </td>
                            <td
                              className="text-end pe-2 py-1.5 align-top fw-bold text-danger font-monospace text-nowrap"
                              style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                            >
                              - Rs.&nbsp;{exchangeDetails.takenPrice.toLocaleString()}
                            </td>
                          </tr>
                          {receipt.tradeInItem?.description && (
                            <tr className="border-bottom border-light bg-light bg-opacity-75">
                              <td colSpan={isReturnVoucher ? 3 : 4} className="ps-2 pe-2 py-1 text-start">
                                <div className="d-flex align-items-center gap-1.5" style={{ fontSize: "0.64rem", lineHeight: 1.3 }}>
                                  <span
                                    className="badge bg-dark text-white text-uppercase px-1.5 py-0.5 flex-shrink-0"
                                    style={{ fontSize: "0.52rem", letterSpacing: "0.3px", fontWeight: "700" }}
                                  >
                                    Trade-in Note
                                  </span>
                                  <span className="text-dark fw-bold" style={{ wordBreak: "normal" }}>
                                    {receipt.tradeInItem.description}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    3.5. BILL-LEVEL TERMS & CONDITIONS / REMARKS BANNER
                   ───────────────────────────────────────────────────────────── */}
                {billDescription && items.length > 1 && (
                  <div
                    className="py-1.5 px-2 mb-2 rounded-1 border border-secondary-subtle bg-light text-start d-flex align-items-center gap-1.5"
                    style={{ fontSize: "0.66rem", lineHeight: 1.3 }}
                  >
                    <span
                      className="badge bg-dark text-white text-uppercase px-1.5 py-0.5 flex-shrink-0"
                      style={{ fontSize: "0.56rem", letterSpacing: "0.3px", fontWeight: "700" }}
                    >
                      Terms / Note
                    </span>
                    <strong className="text-dark" style={{ wordBreak: "normal" }}>{billDescription}</strong>
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    4. TOTAL BILL / SETTLEMENT SUMMARY BOX
                   ───────────────────────────────────────────────────────────── */}
                {isExchange && exchangeDetails ? (
                  <div className="border-top border-secondary-subtle pt-2" style={{ fontSize: "0.72rem" }}>
                    <div className="d-flex justify-content-between align-items-center text-secondary py-1" style={{ gap: "6px" }}>
                      <span>New Items Total (Customer Buys):</span>
                      <span className="text-dark fw-semibold font-monospace text-nowrap">
                        Rs. {exchangeDetails.myPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center text-secondary py-1" style={{ gap: "6px" }}>
                      <span>Trade-in Credit (Shop Buys):</span>
                      <span className="text-danger fw-semibold font-monospace text-nowrap">
                        - Rs. {exchangeDetails.takenPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="py-2 px-2 my-1 bg-light rounded-1 border border-dark border-opacity-25">
                      <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                        <div>
                          <div className="fw-bolder text-dark" style={{ fontSize: "0.82rem", lineHeight: 1.2 }}>
                            {exchangeDetails.netDiff >= 0 ? "Net Total" : "Net Refund"}
                          </div>
                          <div className="text-secondary fw-semibold" style={{ fontSize: "0.64rem", lineHeight: 1.1 }}>
                            {exchangeDetails.netDiff >= 0 ? "(Customer Pays)" : "(Shop Pays Customer)"}
                          </div>
                        </div>
                        <div className="text-end">
                          <strong className="text-dark font-monospace text-nowrap" style={{ fontSize: "1.05rem" }}>
                            Rs.&nbsp;{Math.abs(exchangeDetails.netDiff).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isReturnVoucher ? (
                  <div className="py-2 px-2 my-2 bg-light rounded-1 border border-dark border-opacity-25">
                    <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                      <div>
                        <div className="fw-bolder text-dark" style={{ fontSize: "0.82rem", lineHeight: 1.2 }}>
                          Total Refund
                        </div>
                        <div className="text-secondary fw-semibold" style={{ fontSize: "0.66rem", lineHeight: 1.1 }}>
                          (Shop Pays Customer)
                        </div>
                      </div>
                      <div className="text-end">
                        <strong className="text-danger font-monospace text-nowrap" style={{ fontSize: "1.05rem" }}>
                          Rs.&nbsp;{totalAmountNum.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 px-2 my-1 bg-light rounded-1 border border-dark border-opacity-25">
                    <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                      <div>
                        <div className="fw-bolder text-dark" style={{ fontSize: "0.84rem", lineHeight: 1.2 }}>
                          Total Bill
                        </div>
                        <div className="text-secondary fw-semibold" style={{ fontSize: "0.66rem", lineHeight: 1.1 }}>
                          (Customer Pays)
                        </div>
                      </div>
                      <div className="text-end">
                        <strong className="text-dark font-monospace text-nowrap" style={{ fontSize: "1.08rem" }}>
                          Rs.&nbsp;{totalAmountNum.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ─────────────────────────────────────────────────────────────
                  5. TERMS & CONDITIONS (Standard 10-12 Bullet Points)
                 ───────────────────────────────────────────────────────────── */}
              <div className="receipt-terms-container border-top border-dark border-opacity-25 pt-2 mt-2">
                <div
                  className="text-uppercase fw-bold text-dark text-center mb-1"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.3px", lineHeight: 1.2 }}
                >
                  For Valued Customers / Terms &amp; Conditions
                </div>
                <ol
                  className="ps-3 mb-0"
                  style={{
                    fontSize: "0.64rem",
                    lineHeight: 1.3,
                    color: "#27272a",
                    textAlign: "justify",
                    margin: 0,
                  }}
                >
                  {RECEIPT_TERMS.map((term, tIdx) => (
                    <li key={tIdx} style={{ marginBottom: "2.5px" }}>
                      {term}
                    </li>
                  ))}
                </ol>
                <div
                  className="fw-bold text-dark text-center mt-1.5"
                  style={{ fontSize: "0.62rem", lineHeight: 1.25 }}
                >
                  This is an electronically generated receipt; no signature is required. Not valid for use in court.
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────────
                  6. FOOTER
                 ───────────────────────────────────────────────────────────── */}
              <div
                className="text-center pt-2 mt-auto border-top border-secondary-subtle text-muted"
                style={{ fontSize: "0.64rem", lineHeight: 1.25, flexShrink: 0 }}
              >
                {/* WhatsApp Contact QR Code */}
                <ReceiptWhatsAppQr />

                <div className="fw-semibold text-dark">Thank you for doing business with Hammad Sheikh</div>
                <div className="text-dark fw-bold mt-1.5 pt-1 border-top border-light font-monospace" style={{ fontSize: "0.65rem", letterSpacing: "0.1px" }}>
                  For any kind of software development contact +923314567596
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              MODAL ACTION BUTTONS (NO PRINT)
             ───────────────────────────────────────────────────────────── */}
          <div className="modal-footer bg-white border-top py-2.5 px-3 d-flex align-items-center justify-content-center gap-2 no-print">
            {/* Print Receipt / Void Button */}
            {isFullyRefunded ? (
              <button
                type="button"
                className="btn btn-sm btn-secondary py-1.5 px-3 fw-semibold disabled"
                disabled
                style={{ fontSize: "0.78rem", cursor: "not-allowed", opacity: 0.65 }}
                title="Receipt reprint disabled — this transaction has been refunded"
              >
                <FiPrinter size={13} className="me-1" />
                <span>Receipt Void (Refunded)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-2.5 fw-semibold shadow-sm"
                  style={{ fontSize: "0.78rem" }}
                  onClick={async () => {
                    try {
                      const fname = `${receipt.saleNumber || receipt.returnNumber || "SALE-RECEIPT"}.pdf`;
                      await downloadReceiptAsPdf("printable-sales-receipt", fname);
                    } catch (e) {
                      console.error("PDF download error:", e);
                    }
                  }}
                  title="Download receipt as PDF file"
                >
                  <FiDownload size={13} />
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-3 fw-semibold shadow-sm"
                  style={{ fontSize: "0.78rem" }}
                  onClick={() => window.print()}
                  title="Print 80mm x 210mm single sheet receipt"
                >
                  <FiPrinter size={13} />
                  <span>{isReturnVoucher ? "Print Voucher" : "Print Receipt"}</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary py-1.5 px-3 fw-semibold"
              style={{ fontSize: "0.78rem" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(receiptContent, document.body)
    : null;
}

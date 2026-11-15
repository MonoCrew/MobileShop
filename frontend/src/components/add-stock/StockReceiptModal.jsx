import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  FiCheckCircle,
  FiPrinter,
  FiDownload,
  FiUser,
  FiCalendar,
  FiHash,
} from "react-icons/fi";
import { downloadReceiptAsPdf } from "../../utils/receiptDownload";
import ReceiptWhatsAppQr from "../common/ReceiptWhatsAppQr";

export const RECEIPT_TERMS = [
  "7-day backup only (excluding LCD, camera, speakers, and dead phones).",
  "Returns or replacements of new or reconditioned devices within 1 week may incur a deduction of up to 25% of the current market value.",
  "Please verify PTA approval before purchasing. The shopkeeper will not be responsible for any issues afterward.",
  "No guarantee for personal likes or dislikes.",
  "All mobile accessories and related items are checked and handed over on the spot. No responsibility will be accepted afterward.",
  "This receipt/bill is valid for 7 days only. No claims or disputes will be accepted after 7 days.",
];

/**
 * Format any date/time into 12-hour AM/PM format: e.g., "Oct 22, 2026, 08:46 PM"
 */
export const formatDateTimeAmPm = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Format current timestamp into 12-hour AM/PM format with seconds: e.g., "Oct 22, 2026, 08:46:32 PM"
 */
export const formatFullDateTimeAmPm = (dateInput = new Date()) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const StockReceiptModal = ({ receiptData, onClose }) => {
  if (!receiptData) return null;

  const {
    receiptNumber = "STK-RECEIPT",
    allInvoiceNumbers = [],
    date = new Date().toISOString(),
    supplier = "Vendor / Supplier",
    customerName = "",
    isLocalPurchase = false,
    items = [],
    totalUnits = 0,
    grandTotal = 0,
    amountPaid = 0,
    amountDue = 0,
    previousBalance = null,
    isExistingSupplier = false,
    totalPayable = null,
    totalRemainingAmount = null,
    isDraft = false,
  } = receiptData;

  const displaySupplier = isLocalPurchase
    ? (customerName || supplier || "Local Customer")
    : (supplier || "General Supplier");

  const numPreviousBalance = Number(previousBalance || 0);
  const numGrandTotal = Number(grandTotal || 0);
  const numAmountPaid = Number(amountPaid || 0);
  const numAmountDue = Number(
    amountDue != null ? amountDue : Math.max(0, numGrandTotal - numAmountPaid)
  );

  const isOldSupplier = Boolean(isExistingSupplier) && numPreviousBalance > 0;

  const computedTotalPayable =
    totalPayable != null
      ? Number(totalPayable)
      : numPreviousBalance + numGrandTotal;

  const computedTotalRemaining =
    totalRemainingAmount != null
      ? Number(totalRemainingAmount)
      : numPreviousBalance + numAmountDue;

  const formattedDate = formatDateTimeAmPm(date);
  const generatedTime = formatFullDateTimeAmPm(new Date());

  const modalContent = (
    <>
      <style>{`
        @keyframes stockReceiptEntrance {
          0% {
            opacity: 0;
            transform: scale(0.94) translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes stockReceiptBackdropFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .stock-receipt-backdrop {
          animation: stockReceiptBackdropFade 0.2s ease-out forwards;
        }
        .stock-receipt-dialog {
          animation: stockReceiptEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Standard 80mm thermal / POS receipt print rules */
        @page {
          size: 80mm auto;
          margin: 0mm;
        }

        @media print {
          /* Enforce standard 80mm width with dynamic height for all items & IMEIs */
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

          .stock-receipt-backdrop {
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

          .stock-receipt-dialog,
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

          /* The 80mm receipt slip */
          #printable-stock-receipt {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif !important;
            display: flex !important;
            flex-direction: column !important;
            position: relative !important;
            width: 80mm !important;
            max-width: 80mm !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 3.5mm 3.5mm 3mm 3.5mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          #printable-stock-receipt * {
            color: #000000 !important;
          }

          .receipt-badge-outline {
            border: 1.5px solid #000000 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          .receipt-tag-badge {
            border: 1px solid #71717a !important;
            background: #f4f4f5 !important;
            color: #000000 !important;
          }
        }
      `}</style>

      <div
        className="modal fade show d-block stock-receipt-backdrop"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1070 }}
        tabIndex="-1"
        role="dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-dialog-scrollable stock-receipt-dialog"
          style={{ maxWidth: "440px", width: "95%" }}
        >
          <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden bg-white">
            {/* Modal Header (No Print) */}
            <div className="modal-header bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between no-print">
              <div className="d-flex align-items-center gap-2">
                <FiCheckCircle className="text-success" size={17} />
                <h6 className="modal-title fw-bold mb-0" style={{ fontSize: "0.88rem" }}>
                  Stock Receipt Slip (80mm)
                </h6>
                {isDraft ? (
                  <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: "0.62rem" }}>
                    Draft
                  </span>
                ) : (
                  <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style={{ fontSize: "0.62rem" }}>
                    Logged
                  </span>
                )}
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
                id="printable-stock-receipt"
                className="bg-white rounded-2 border shadow-sm mx-auto my-1"
                style={{
                  width: "80mm",
                  maxWidth: "80mm",
                  minHeight: "auto",
                  height: "auto",
                  boxSizing: "border-box",
                  padding: "3.5mm 3.5mm 3.5mm 3.5mm",
                  fontSize: "0.74rem",
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif",
                  color: "#18181b",
                  lineHeight: 1.30,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* ─────────────────────────────────────────────────────────────
                    1. STORE & RECEIPT HEADER
                   ───────────────────────────────────────────────────────────── */}
                <div className="text-center pb-2 border-bottom border-dark border-opacity-25" style={{ flexShrink: 0 }}>
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
                  {/* Clean Outline Badge - No Black Background */}
                  <div className="mt-2">
                    <span
                      className="d-inline-block px-2 py-1 text-uppercase fw-bold rounded-1 receipt-badge-outline"
                      style={{
                        fontSize: "0.64rem",
                        letterSpacing: "0.4px",
                        color: "#09090b",
                        backgroundColor: "#f4f4f5",
                        border: "1.5px solid #18181b",
                      }}
                    >
                      {isLocalPurchase ? "Local Purchase / Intake Voucher" : "Goods Received / Stock Receipt"}
                    </span>
                  </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    2. RECEIPT METADATA INFO BOX
                   ───────────────────────────────────────────────────────────── */}
                <div
                  className="my-2 rounded-2 border border-secondary-subtle"
                  style={{
                    padding: "8px 10px",
                    fontSize: "0.70rem",
                    backgroundColor: "#f8fafc",
                    boxSizing: "border-box",
                    flexShrink: 0,
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                    <span className="text-secondary d-flex align-items-center fw-medium flex-shrink-0" style={{ gap: "5px" }}>
                      <FiHash size={11} className="text-muted" /> Receipt / Inv #:
                    </span>
                    <strong className="text-dark fw-bold text-end text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.2px" }}>
                      {receiptNumber}
                    </strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                    <span className="text-secondary d-flex align-items-center fw-medium flex-shrink-0" style={{ gap: "5px" }}>
                      <FiCalendar size={11} className="text-muted" /> Date &amp; Time:
                    </span>
                    <span className="text-dark fw-semibold text-end text-truncate" style={{ fontSize: "0.66rem" }}>
                      {formattedDate}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center" style={{ gap: "6px" }}>
                    <span className="text-secondary d-flex align-items-center fw-medium flex-shrink-0" style={{ gap: "5px" }}>
                      <FiUser size={11} className="text-muted" /> {isLocalPurchase ? "Customer:" : "Supplier:"}
                    </span>
                    <strong className="text-dark text-truncate text-end" style={{ maxWidth: "145px", fontSize: "0.68rem" }}>
                      {displaySupplier}
                    </strong>
                  </div>
                  {allInvoiceNumbers && allInvoiceNumbers.length > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-1 pt-1 border-top border-secondary-subtle" style={{ gap: "6px" }}>
                      <span className="text-secondary fw-medium flex-shrink-0">Invoices:</span>
                      <span className="text-dark small text-end text-truncate" style={{ fontSize: "0.64rem" }}>
                        {allInvoiceNumbers.join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    3. ITEMS TABLE (FULL BULK LISTING)
                   ───────────────────────────────────────────────────────────── */}
                <div className="my-2 border rounded-1" style={{ flexShrink: 0 }}>
                  <table className="table table-sm mb-0 w-100" style={{ fontSize: "0.68rem", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "42%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "23%" }} />
                      <col style={{ width: "24%" }} />
                    </colgroup>
                    <thead className="table-light border-bottom border-secondary-subtle">
                      <tr>
                        <th className="ps-2 py-1 text-secondary text-uppercase fw-bold" style={{ fontSize: "0.62rem" }}>
                          Item &amp; IMEIs
                        </th>
                        <th className="text-center py-1 text-secondary text-uppercase fw-bold" style={{ fontSize: "0.62rem" }}>
                          Qty
                        </th>
                        <th className="text-end py-1 text-secondary text-uppercase fw-bold" style={{ fontSize: "0.62rem" }}>
                          Rate
                        </th>
                        <th className="text-end pe-2 py-1 text-secondary text-uppercase fw-bold" style={{ fontSize: "0.62rem" }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const qty = Number(it.quantity) || 1;
                        const unitCost = Number(it.unitPrice || it.purchasePrice || 0);
                        const lineTotal = Number(it.subtotal || unitCost * qty);
                        const barcodesList = Array.isArray(it.barcodes)
                          ? it.barcodes.filter((b) => b && b !== "N/A" && typeof b === "string" && b.trim() !== "")
                          : it.barcode && it.barcode !== "N/A"
                            ? [it.barcode]
                            : [];

                        return (
                          <tr key={idx} className="border-bottom border-light">
                            <td className="ps-2 py-1.5 align-top text-start" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
                              <div className="fw-bold text-dark" style={{ fontSize: "0.70rem", lineHeight: 1.25 }}>
                                {it.productName}
                              </div>
                              {(it.storage || it.color || it.stockId?.storage || it.stockId?.color) && (
                                <div className="text-secondary fw-semibold font-monospace" style={{ fontSize: "0.60rem", marginTop: "1px", letterSpacing: "0.2px" }}>
                                  {[it.storage || it.stockId?.storage, it.color || it.stockId?.color].filter(Boolean).join(" • ")}
                                </div>
                              )}
                              {barcodesList.length > 0 && (
                                <div className="d-flex flex-wrap gap-1 mt-1">
                                  {barcodesList.map((bc, bIdx) => (
                                    <span
                                      key={bIdx}
                                      className="badge bg-light text-dark border px-1 py-0 receipt-tag-badge font-monospace"
                                      style={{ fontSize: "0.58rem", fontWeight: "600", letterSpacing: "0.2px" }}
                                    >
                                      {bc}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="text-center py-1.5 align-top fw-semibold font-monospace" style={{ fontSize: "0.68rem" }}>
                              {qty}
                            </td>
                            <td className="text-end py-1.5 align-top text-secondary font-monospace text-nowrap" style={{ fontSize: "0.63rem", letterSpacing: "-0.2px" }}>
                              Rs. {unitCost.toLocaleString()}
                            </td>
                            <td className="text-end pe-2 py-1.5 align-top fw-bold text-dark font-monospace text-nowrap" style={{ fontSize: "0.63rem", letterSpacing: "-0.2px" }}>
                              Rs. {lineTotal.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    4. FINANCIAL SUMMARY BREAKDOWN
                   ───────────────────────────────────────────────────────────── */}
                <div className="pt-2 border-top border-secondary-subtle" style={{ fontSize: "0.72rem", flexShrink: 0 }}>
                  <div className="d-flex justify-content-between py-0.5 text-secondary">
                    <span>Total Line Items:</span>
                    <strong className="text-dark">{items.length} item(s)</strong>
                  </div>
                  <div className="d-flex justify-content-between py-0.5 text-secondary">
                    <span>Total Physical Units:</span>
                    <strong className="text-dark">
                      {totalUnits || items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0)} unit(s)
                    </strong>
                  </div>
                  {isOldSupplier ? (
                    <>
                      {/* 1. This Purchase Amount */}
                      <div className="d-flex justify-content-between py-0.5 text-secondary">
                        <span>This Purchase:</span>
                        <strong className="text-dark fw-bold text-nowrap">
                          Rs. {numGrandTotal.toLocaleString()}
                        </strong>
                      </div>

                      {/* 2. Old / Previous Remaining Balance */}
                      <div className="d-flex justify-content-between py-0.5 text-secondary">
                        <span>Shop has to give Supplier (Old Balance):</span>
                        <strong className="text-dark fw-bold text-nowrap">
                          Rs. {numPreviousBalance.toLocaleString()}
                        </strong>
                      </div>

                      {/* 3. Total Payable Box */}
                      <div className="py-2 px-2 my-1 bg-light rounded-1 border border-dark border-opacity-25">
                        <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                          <div>
                            <div className="fw-bolder text-dark" style={{ fontSize: "0.82rem", lineHeight: 1.2 }}>
                              Total Payable
                            </div>
                          </div>
                          <div className="text-end">
                            <strong className="text-dark fw-bold text-nowrap" style={{ fontSize: "1.05rem", letterSpacing: "-0.2px" }}>
                              Rs. {computedTotalPayable.toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* 4. Cash Paid Now */}
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-secondary">Cash Paid Now:</span>
                        <strong className="text-success fw-bold text-nowrap">
                          Rs. {numAmountPaid.toLocaleString()}
                        </strong>
                      </div>

                      {/* 5. Remaining Due */}
                      <div className="d-flex justify-content-between align-items-center py-1 border-top border-secondary-subtle">
                        <span className="fw-bold text-dark">
                          {computedTotalRemaining > 0
                            ? "Shop pays to supplier:"
                            : computedTotalRemaining < 0
                            ? "Supplier pays to shop:"
                            : "Settled / Balanced:"}
                        </span>
                        <strong
                          className={`fw-bold text-nowrap ${computedTotalRemaining > 0 ? "text-danger" : "text-success"}`}
                          style={{ fontSize: "0.84rem" }}
                        >
                          {computedTotalRemaining > 0
                            ? `Rs. ${computedTotalRemaining.toLocaleString()}`
                            : "Rs. 0"}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Grand Total Highlight Box */}
                      <div className="py-2 px-2 my-1 bg-light rounded-1 border border-dark border-opacity-25">
                        <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                          <div>
                            <div className="fw-bolder text-dark" style={{ fontSize: "0.84rem", lineHeight: 1.2 }}>
                              Total Bill
                            </div>
                          </div>
                          <div className="text-end">
                            <strong className="text-dark fw-bold text-nowrap" style={{ fontSize: "1.05rem", letterSpacing: "-0.2px" }}>
                              Rs. {numGrandTotal.toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-secondary">Cash Paid Now:</span>
                        <strong className="text-success fw-bold text-nowrap">
                          Rs. {numAmountPaid.toLocaleString()}
                        </strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center py-1 border-top border-secondary-subtle">
                        <span className="fw-bold text-dark">
                          {numAmountDue > 0
                            ? "Shop pays to supplier:"
                            : numAmountDue < 0
                            ? "Supplier pays to shop:"
                            : "Settled / Balanced:"}
                        </span>
                        <strong className={`fw-bold text-nowrap ${numAmountDue > 0 ? "text-danger" : "text-success"}`} style={{ fontSize: "0.84rem" }}>
                          {numAmountDue > 0 ? `Rs. ${numAmountDue.toLocaleString()}` : "Rs. 0"}
                        </strong>
                      </div>
                    </>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    5. FOR VALUED CUSTOMERS / TERMS & CONDITIONS (10 Items)
                   ───────────────────────────────────────────────────────────── */}
                <div className="receipt-terms-container border-top border-dark border-opacity-25 pt-2 mt-2" style={{ flexShrink: 0 }}>
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
                      <li key={tIdx} style={{ marginBottom: "1.5px" }}>
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
                    6. FOOTER NOTES
                   ───────────────────────────────────────────────────────────── */}
                <div
                  className="text-center pt-2 mt-auto border-top border-secondary-subtle text-muted"
                  style={{ fontSize: "0.64rem", lineHeight: 1.25, flexShrink: 0 }}
                >
                  {/* WhatsApp Contact QR Code */}
                  <ReceiptWhatsAppQr />

                  <div className="fw-semibold text-dark">
                    Thank you for doing business with Hammad Sheikh
                  </div>
                  <div className="text-dark fw-bold mt-1.5 pt-1 border-top border-light font-monospace" style={{ fontSize: "0.65rem", letterSpacing: "0.1px" }}>
                    For any kind of software development contact +923314567596
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Action Buttons (No Print) */}
            <div className="modal-footer bg-white border-top py-2.5 px-3 d-flex align-items-center justify-content-center gap-2 no-print">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-2.5 fw-semibold shadow-sm"
                style={{ fontSize: "0.78rem" }}
                onClick={async () => {
                  try {
                    const fname = `${receiptNumber || "PURCHASE-RECEIPT"}.pdf`;
                    await downloadReceiptAsPdf("printable-stock-receipt", fname);
                  } catch (e) {
                    console.error("PDF download error:", e);
                  }
                }}
                title="Download 80mm receipt as PDF file"
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
                <span>Print Receipt</span>
              </button>

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
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
};

export default StockReceiptModal;

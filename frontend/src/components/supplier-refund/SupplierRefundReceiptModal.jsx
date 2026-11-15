import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  FiCheckCircle,
  FiPrinter,
  FiDownload,
  FiTruck,
  FiCalendar,
  FiHash,
  FiRotateCcw,
  FiLayers,
} from "react-icons/fi";
import { downloadReceiptAsPdf } from "../../utils/receiptDownload";
import ReceiptWhatsAppQr from "../common/ReceiptWhatsAppQr";
import { formatDateTimeAmPm, RECEIPT_TERMS } from "../add-stock/StockReceiptModal";

/**
 * Standardized 80mm Thermal Receipt for Supplier Refunds & Returns
 */
const SupplierRefundReceiptModal = ({ refund, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!refund) return null;

  const refundNumber = refund.refundNumber || "SUP-RET-RECEIPT";
  const refundDate = refund.refundDate || refund.createdAt || new Date();
  const supplierName = refund.supplier || "Supplier";
  const returnedItems = Array.isArray(refund.returnedItems) ? refund.returnedItems : [];
  const replacementItems = Array.isArray(refund.replacementItems) ? refund.replacementItems : [];
  const isWorkflowB = refund.workflowType === "refund_and_purchase" || replacementItems.length > 0;
  const totalQty = refund.totalQuantity || returnedItems.length || 0;
  const totalRefundAmount = Number(refund.totalRefundAmount || 0);

  const prevBalance = Number(refund.previousSupplierBalance ?? refund.previousBalance ?? 0);
  const resultBalance = Number(refund.resultingSupplierBalance ?? refund.finalBalance ?? 0);
  const newPurchaseVal = Number(refund.replacementCartTotal ?? refund.newPurchaseValue ?? 0);
  const cashPaid = Number(refund.cashPaid ?? 0);

  const modalContent = (
    <>
      <style>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

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

          .supplier-refund-receipt-backdrop {
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

          .supplier-refund-receipt-dialog,
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

          #printable-supplier-refund-receipt {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif !important;
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
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          #printable-supplier-refund-receipt * {
            color: #000000 !important;
          }
        }
      `}</style>

      <div
        className="modal fade show d-block supplier-refund-receipt-backdrop"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1070 }}
        tabIndex="-1"
        role="dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-dialog-scrollable supplier-refund-receipt-dialog"
          style={{ maxWidth: "440px", width: "95%" }}
        >
          <div className="modal-content shadow-lg border-0 rounded-3 overflow-hidden">
            {/* Modal Screen-Only Header */}
            <div className="modal-header bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between no-print">
              <div className="d-flex align-items-center gap-2">
                <FiRotateCcw className="text-warning" size={16} />
                <span className="fw-semibold small">Supplier Refund Voucher</span>
                <span
                  className="badge bg-warning text-dark font-monospace"
                  style={{ fontSize: "0.68rem" }}
                >
                  {refundNumber}
                </span>
              </div>
              <button
                type="button"
                className="btn-close btn-close-white btn-sm"
                onClick={onClose}
                aria-label="Close"
              />
            </div>

            {/* Modal Body / Printable Slip */}
            <div
              className="modal-body p-0 bg-light"
              style={{ maxHeight: "calc(88vh - 90px)", overflowY: "auto" }}
            >
              <div
                id="printable-supplier-refund-receipt"
                className="bg-white mx-auto p-3"
                style={{
                  width: "100%",
                  maxWidth: "80mm",
                  minHeight: "210mm",
                  boxSizing: "border-box",
                  fontSize: "0.72rem",
                  color: "#000000",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  {/* ─────────────────────────────────────────────────────────────
                      1. HEADER
                     ───────────────────────────────────────────────────────────── */}
                  <div className="text-center pb-2 mb-2 border-bottom border-dark">
                    <h5
                      className="fw-black text-uppercase text-dark mb-0 tracking-wider"
                      style={{ fontSize: "1.05rem", fontWeight: 900, letterSpacing: "1.2px" }}
                    >
                      Hammad Sheikh
                    </h5>
                    <div
                      className="text-uppercase fw-bold text-dark mt-0.5"
                      style={{ fontSize: "0.66rem", letterSpacing: "0.6px", lineHeight: 1.25 }}
                    >
                      Mobile &amp; Accessories Point of Sale
                    </div>
                    {/* Contact Number */}
                    <div
                      className="text-dark fw-bold font-monospace mt-0.5"
                      style={{ fontSize: "0.68rem", letterSpacing: "0.4px", lineHeight: 1.2 }}
                    >
                      +923227406955
                    </div>

                    {/* Prominent Voucher Title */}
                    <div className="d-flex justify-content-center mt-1.5">
                      <span
                        className="badge border border-dark bg-white text-dark text-uppercase fw-bolder px-2 py-0.5"
                        style={{ fontSize: "0.70rem", letterSpacing: "0.5px" }}
                      >
                        {isWorkflowB ? "Return & Replacement Voucher" : "Supplier Refund Voucher"}
                      </span>
                    </div>

                    <div className="text-muted mt-1" style={{ fontSize: "0.60rem" }}>
                      Authorized Supplier Debit / Stock Return Slip
                    </div>
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      2. VOUCHER METADATA
                     ───────────────────────────────────────────────────────────── */}
                  <div className="mb-2 pb-1.5 border-bottom border-dark border-opacity-25" style={{ fontSize: "0.67rem" }}>
                    <div className="d-flex justify-content-between py-0.5">
                      <span className="text-muted">Voucher #:</span>
                      <strong className="font-monospace text-dark">{refundNumber}</strong>
                    </div>

                    <div className="d-flex justify-content-between py-0.5">
                      <span className="text-muted">Date &amp; Time:</span>
                      <span className="font-monospace text-dark">{formatDateTimeAmPm(refundDate)}</span>
                    </div>

                    <div className="d-flex justify-content-between py-0.5">
                      <span className="text-muted">Supplier:</span>
                      <strong className="text-dark text-truncate" style={{ maxWidth: "160px" }}>
                        {supplierName}
                      </strong>
                    </div>

                    {isWorkflowB && refund.replacementInvoiceNumber && (
                      <div className="d-flex justify-content-between py-0.5">
                        <span className="text-muted">New Purchase Ref:</span>
                        <strong className="font-monospace text-dark">{refund.replacementInvoiceNumber}</strong>
                      </div>
                    )}
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      3. RETURNED PHONES TABLE
                     ───────────────────────────────────────────────────────────── */}
                  <div className="mb-2">
                    <div className="fw-bold text-dark text-uppercase mb-1" style={{ fontSize: "0.66rem", letterSpacing: "0.3px" }}>
                      Returned Items to Supplier ({totalQty})
                    </div>
                    <table className="w-100 border-collapse" style={{ fontSize: "0.66rem" }}>
                      <thead>
                        <tr className="border-bottom border-dark">
                          <th className="text-start py-1 pe-1" style={{ width: "62%" }}>Item &amp; IMEI</th>
                          <th className="text-center py-1" style={{ width: "12%" }}>Qty</th>
                          <th className="text-end py-1 ps-1" style={{ width: "26%" }}>Refund</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnedItems.map((it, idx) => {
                          const specs = [it.storage || it.stockId?.storage, it.color || it.stockId?.color].filter(Boolean).join(" • ");
                          return (
                            <tr key={idx} className="border-bottom border-light-subtle">
                              <td className="py-1.5 pe-1 align-top">
                                <div className="fw-bold text-dark" style={{ lineHeight: 1.2 }}>
                                  {it.productName}
                                </div>
                                {specs && (
                                  <div className="text-secondary fw-medium" style={{ fontSize: "0.58rem", marginTop: "1px" }}>
                                    {specs}
                                  </div>
                                )}
                                <div className="font-monospace text-dark" style={{ fontSize: "0.58rem", marginTop: "1px", wordBreak: "break-all" }}>
                                  IMEI: {it.barcode}
                                </div>
                                {it.invoiceNumber && it.invoiceNumber !== "N/A" && (
                                  <div className="text-muted" style={{ fontSize: "0.55rem" }}>
                                    Orig: {it.invoiceNumber}
                                  </div>
                                )}
                              </td>
                              <td className="text-center py-1.5 align-top font-monospace">
                                1
                              </td>
                              <td className="text-end py-1.5 ps-1 align-top fw-bold text-dark font-monospace">
                                Rs. {Number(it.refundAmount || it.originalPurchaseCost || 0).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      4. REPLACEMENT PURCHASE TABLE (IF WORKFLOW B)
                     ───────────────────────────────────────────────────────────── */}
                  {isWorkflowB && replacementItems.length > 0 && (
                    <div className="mb-2 mt-2 pt-1 border-top border-dark border-opacity-25">
                      <div className="fw-bold text-dark text-uppercase mb-1" style={{ fontSize: "0.66rem", letterSpacing: "0.3px" }}>
                        Replacement Items Received ({replacementItems.reduce((acc, r) => acc + (r.quantity || 1), 0)})
                      </div>
                      <table className="w-100 border-collapse" style={{ fontSize: "0.66rem" }}>
                        <thead>
                          <tr className="border-bottom border-dark">
                            <th className="text-start py-1 pe-1" style={{ width: "62%" }}>Item</th>
                            <th className="text-center py-1" style={{ width: "12%" }}>Qty</th>
                            <th className="text-end py-1 ps-1" style={{ width: "26%" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replacementItems.map((r, rIdx) => {
                            const rSpecs = [r.storage || r.stockId?.storage, r.color || r.stockId?.color].filter(Boolean).join(" • ");
                            return (
                              <tr key={rIdx} className="border-bottom border-light-subtle">
                                <td className="py-1.5 pe-1 align-top">
                                  <div className="fw-bold text-dark" style={{ lineHeight: 1.2 }}>
                                    {r.productName}
                                  </div>
                                  {rSpecs && (
                                    <div className="text-secondary fw-medium" style={{ fontSize: "0.58rem" }}>
                                      {rSpecs}
                                    </div>
                                  )}
                                  {Array.isArray(r.barcodes) && r.barcodes.length > 0 && (
                                    <div className="font-monospace text-muted" style={{ fontSize: "0.56rem", wordBreak: "break-all" }}>
                                      IMEIs: {r.barcodes.slice(0, 2).join(", ")}{r.barcodes.length > 2 ? ` (+${r.barcodes.length - 2} more)` : ""}
                                    </div>
                                  )}
                                </td>
                                <td className="text-center py-1.5 align-top font-monospace">
                                  {r.quantity}
                                </td>
                                <td className="text-end py-1.5 ps-1 align-top fw-bold text-dark font-monospace">
                                  Rs. {Number(r.subtotal || r.quantity * r.unitPrice || 0).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      5. FINANCIAL TOTALS & LEDGER BALANCE
                     ───────────────────────────────────────────────────────────── */}
                  <div className="border-top border-dark pt-1.5 mb-2" style={{ fontSize: "0.68rem" }}>
                    <div className="d-flex justify-content-between py-0.5">
                      <span className="fw-bold text-dark">Total Return Credit:</span>
                      <strong className="text-dark font-monospace" style={{ fontSize: "0.82rem" }}>
                        Rs.&nbsp;{totalRefundAmount.toLocaleString()}
                      </strong>
                    </div>

                    {isWorkflowB && (
                      <>
                        <div className="d-flex justify-content-between py-0.5">
                          <span className="text-secondary">New Purchase Total:</span>
                          <span className="text-dark font-monospace">
                            Rs.&nbsp;{Number(refund.replacementCartTotal || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between py-0.5 border-top border-light-subtle">
                          <span className="fw-bold text-dark">Net Difference:</span>
                          <span className="fw-bold font-monospace text-dark">
                            {refund.netDifference > 0
                              ? `Shop pays to supplier: Rs. ${Number(refund.netDifference).toLocaleString()}`
                              : refund.netDifference < 0
                              ? `Supplier pays to shop: Rs. ${Math.abs(Number(refund.netDifference)).toLocaleString()}`
                              : "Even Exchange (Rs. 0)"}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Supplier Balance Progression */}
                    <div className="p-1.5 mt-1.5 rounded border border-dark border-opacity-25 bg-light bg-opacity-50">
                      <div className="d-flex justify-content-between py-0.5" style={{ fontSize: "0.64rem" }}>
                        <span className="text-secondary">
                          {prevBalance > 0
                            ? "Shop pays to supplier (Old):"
                            : prevBalance < 0
                            ? "Supplier pays to shop (Old):"
                            : "Settled / Balanced (Old):"}
                        </span>
                        <span className="font-monospace text-dark">
                          Rs.&nbsp;{Math.abs(prevBalance).toLocaleString()}
                        </span>
                      </div>

                      {isWorkflowB && (
                        <div className="d-flex justify-content-between py-0.5" style={{ fontSize: "0.64rem" }}>
                          <span className="text-secondary">New Replacement Phones:</span>
                          <span className="font-monospace text-dark fw-bold">
                            + Rs.&nbsp;{newPurchaseVal.toLocaleString()}
                          </span>
                        </div>
                      )}

                      <div className="d-flex justify-content-between py-0.5" style={{ fontSize: "0.64rem" }}>
                        <span className="text-secondary">Returned Phones Value:</span>
                        <span className="font-monospace text-success fw-bold">
                          - Rs.&nbsp;{totalRefundAmount.toLocaleString()}
                        </span>
                      </div>

                      {isWorkflowB && (
                        <div className="d-flex justify-content-between py-0.5" style={{ fontSize: "0.64rem" }}>
                          <span className="text-secondary">Cash Paid Now:</span>
                          <span className="font-monospace text-dark">
                            - Rs.&nbsp;{cashPaid.toLocaleString()}
                          </span>
                        </div>
                      )}

                      <div className="d-flex justify-content-between py-1 border-top border-secondary-subtle fw-bold" style={{ fontSize: "0.70rem" }}>
                        <span className="text-dark">
                          {resultBalance > 0
                            ? "Shop pays to supplier:"
                            : resultBalance < 0
                            ? "Supplier pays to shop:"
                            : "Settled / Balanced:"}
                        </span>
                        <span className="font-monospace text-dark fs-6">
                          Rs.&nbsp;{Math.abs(resultBalance).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      6. TERMS & CONDITIONS
                     ───────────────────────────────────────────────────────────── */}
                  <div className="border-top border-dark border-opacity-25 pt-1.5 mt-1" style={{ fontSize: "0.60rem" }}>
                    <div className="text-uppercase fw-bold text-dark text-center mb-0.5" style={{ fontSize: "0.64rem" }}>
                      Supplier Return Policy / Terms &amp; Conditions
                    </div>
                    <ol className="ps-3 mb-1" style={{ lineHeight: 1.25, color: "#27272a", margin: 0 }}>
                      <li style={{ marginBottom: "1.5px" }}>
                        All returned devices have been verified via serialized IMEI from active inventory.
                      </li>
                      <li style={{ marginBottom: "1.5px" }}>
                        Return credit is debited directly against the supplier's running ledger balance.
                      </li>
                      <li style={{ marginBottom: "1.5px" }}>
                        This is an electronically generated supplier voucher; no signature required.
                      </li>
                    </ol>
                  </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    7. FOOTER WITH WHATSAPP QR CODE
                   ───────────────────────────────────────────────────────────── */}
                <div
                  className="text-center pt-2 mt-auto border-top border-secondary-subtle text-muted"
                  style={{ fontSize: "0.64rem", lineHeight: 1.25, flexShrink: 0 }}
                >
                  {/* WhatsApp Contact QR Code */}
                  <ReceiptWhatsAppQr />

                  <div className="fw-semibold text-dark">Thank you for doing business with Hammad Sheikh</div>
                  <div
                    className="text-dark fw-bold mt-1.5 pt-1 border-top border-light font-monospace"
                    style={{ fontSize: "0.65rem", letterSpacing: "0.1px" }}
                  >
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
                disabled={isDownloading}
                onClick={async () => {
                  try {
                    setIsDownloading(true);
                    const fname = `${refundNumber}.pdf`;
                    await downloadReceiptAsPdf("printable-supplier-refund-receipt", fname);
                  } catch (e) {
                    console.error("PDF download error:", e);
                  } finally {
                    setIsDownloading(false);
                  }
                }}
                title="Download voucher as PDF"
              >
                <FiDownload size={13} />
                <span>{isDownloading ? "Generating..." : "Download PDF"}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-3 fw-semibold shadow-sm"
                style={{ fontSize: "0.78rem" }}
                onClick={() => window.print()}
                title="Print 80mm supplier refund voucher"
              >
                <FiPrinter size={13} />
                <span>Print Voucher</span>
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

export default SupplierRefundReceiptModal;

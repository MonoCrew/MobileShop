import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FiPrinter,
  FiDownload,
  FiCheckCircle,
} from "react-icons/fi";
import { downloadReceiptAsPdf } from "../../utils/receiptDownload";
import {
  RECEIPT_TERMS,
  formatDateTimeAmPm,
  formatFullDateTimeAmPm,
} from "../add-stock/StockReceiptModal";
import ReceiptWhatsAppQr from "../common/ReceiptWhatsAppQr";

/**
 * Standardized 80mm x 210mm Thermal Return Voucher Modal
 * Shared identically between /returns and /history
 */
export default function ReturnReceiptModal({ receipt, onClose }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const modalBodyRef = useRef(null);

  // Always reset scroll to top when receipt opens
  useEffect(() => {
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  }, [receipt]);

  if (!receipt) return null;

  const returnNumber =
    receipt.returnNumber ||
    receipt.transactionNumber ||
    receipt.receiptNumber ||
    (receipt._id ? `RET-${receipt._id}` : "");

  const originalSaleRef =
    receipt.originalSaleReference ||
    receipt.originalSaleNumber ||
    receipt.saleNumber ||
    receipt.rawDoc?.saleNumber ||
    "—";

  const returnDate =
    receipt.returnDate ||
    receipt.createdAt ||
    receipt.date ||
    Date.now();

  const customerName =
    (receipt.customerName && receipt.customerName !== "Walk-in Customer" ? receipt.customerName : null) ||
    (receipt.partyName && receipt.partyName !== "Customer" ? receipt.partyName : null) ||
    receipt.notes?.match(/Customer:\s*([^()]+)/i)?.[1]?.trim() ||
    receipt.rawDoc?.customerName ||
    "Walk-in Customer";

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
    receipt.items?.find((it) => it.shopkeeperName)?.shopkeeperName ||
    "";

  // Items returned
  const rawItems = Array.isArray(receipt.items) && receipt.items.length > 0
    ? receipt.items
    : Array.isArray(receipt.returnedItems) && receipt.returnedItems.length > 0
      ? receipt.returnedItems
      : [];

  const items = rawItems.map((it) => {
    const itemQty = Number(it.quantity || it.returnQuantity || 1);
    const itemRefund = Number(
      it.refundAmount != null
        ? it.refundAmount
        : it.actualRefundedAmount != null
          ? it.actualRefundedAmount
          : it.subtotal != null
            ? it.subtotal
            : 0
    );

    const unitPrice = Number(
      it.unitSellingPrice != null && it.unitSellingPrice !== ""
        ? it.unitSellingPrice
        : it.unitPrice != null && it.unitPrice !== ""
          ? it.unitPrice
          : it.sellingPrice != null && it.sellingPrice !== ""
            ? it.sellingPrice
            : it.originalSoldPrice != null && it.originalSoldPrice !== "" && itemQty > 0
              ? it.originalSoldPrice / itemQty
              : itemQty > 0
                ? itemRefund / itemQty
                : itemRefund
    );

    const imeiList = Array.isArray(it.returnBarcodes) && it.returnBarcodes.length > 0
      ? it.returnBarcodes
      : Array.isArray(it.barcodes) && it.barcodes.length > 0
        ? it.barcodes
        : Array.isArray(it.soldBarcodes) && it.soldBarcodes.length > 0
          ? it.soldBarcodes
          : (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []);

    return {
      productName: it.productName || "Unknown Item",
      quantity: itemQty,
      unitPrice,
      refundAmount: itemRefund,
      imeiList,
      saleSource: it.saleSource || receipt.saleSource,
      shopkeeperName: it.shopkeeperName || receipt.shopkeeperName,
    };
  });

  // Exchange replacement / purchase items
  let rawExchangeItems = Array.isArray(receipt.exchangeItems) && receipt.exchangeItems.length > 0
    ? receipt.exchangeItems
    : Array.isArray(receipt.exchangeDetails?.exchangeItems) && receipt.exchangeDetails.exchangeItems.length > 0
      ? receipt.exchangeDetails.exchangeItems
      : Array.isArray(receipt.exchangeDetails?.exchangeSaleId?.items) && receipt.exchangeDetails.exchangeSaleId.items.length > 0
        ? receipt.exchangeDetails.exchangeSaleId.items
        : [];

  const exchangeCartTotalFromDetails = Number(
    receipt.exchangeDetails?.exchangeCartTotal != null
      ? receipt.exchangeDetails.exchangeCartTotal
      : 0
  );

  // If marked as exchange with an exchange amount but items array was empty, provide a clean fallback line item
  if (
    rawExchangeItems.length === 0 &&
    (receipt.settlementType === "exchange" || receipt.exchangeDetails?.exchangeSaleNumber) &&
    exchangeCartTotalFromDetails > 0
  ) {
    rawExchangeItems = [
      {
        productName: "Replacement Purchase Item",
        quantity: 1,
        sellingPrice: exchangeCartTotalFromDetails,
        subtotal: exchangeCartTotalFromDetails,
        barcodes: [],
      },
    ];
  }

  const exchangeItems = rawExchangeItems.map((exc) => {
    const eQty = Number(exc.quantity || 1);
    const ePrice = Number(exc.sellingPrice || exc.unitSellingPrice || 0);
    const eSubtotal = Number(exc.subtotal || exc.totalAmount || (eQty * ePrice));
    const excBarcodes = Array.isArray(exc.barcodes) && exc.barcodes.length > 0
      ? exc.barcodes
      : Array.isArray(exc.soldBarcodes) && exc.soldBarcodes.length > 0
        ? exc.soldBarcodes
        : (exc.barcode && exc.barcode !== "N/A" ? [exc.barcode] : []);

    return {
      productName: exc.productName || "Purchase Item",
      storage: exc.storage || exc.stockId?.storage || "",
      color: exc.color || exc.stockId?.color || "",
      quantity: eQty,
      sellingPrice: ePrice,
      subtotal: eSubtotal,
      barcodes: excBarcodes,
    };
  });

  const isExchangeMode = Boolean(
    receipt.settlementType === "exchange" ||
    receipt.exchangeDetails?.exchangeSaleNumber ||
    receipt.exchangeDetails?.exchangeSaleId ||
    exchangeItems.length > 0
  );

  const totalReturnCredit = Number(
    receipt.totalReturnCredit != null
      ? receipt.totalReturnCredit
      : receipt.totalRefundAmount != null
        ? receipt.totalRefundAmount
        : receipt.totalAmount != null
          ? receipt.totalAmount
          : items.reduce((acc, i) => acc + i.refundAmount, 0)
  );

  const exchangeCartTotal = Number(
    receipt.exchangeDetails?.exchangeCartTotal != null
      ? receipt.exchangeDetails.exchangeCartTotal
      : exchangeItems.reduce((acc, e) => acc + e.subtotal, 0)
  );

  const netDifference = receipt.exchangeDetails?.netDifference != null
    ? Number(receipt.exchangeDetails.netDifference)
    : Number((exchangeCartTotal - totalReturnCredit).toFixed(2));

  const totalUnitsReturned = Number(
    receipt.totalUnitsReturned ||
    items.reduce((acc, i) => acc + i.quantity, 0) ||
    1
  );

  const reason = receipt.reason || receipt.rawDoc?.reason || "Customer Return";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      const filename = `Return-Voucher-${returnNumber || "slip"}.pdf`;
      await downloadReceiptAsPdf("printable-return-receipt", filename);
    } catch (err) {
      console.error("PDF download error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const modalMarkup = (
    <div
      className="modal fade show d-block return-receipt-backdrop"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1070 }}
      tabIndex="-1"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <style>{`
        @keyframes returnReceiptEntrance {
          0% {
            opacity: 0;
            transform: scale(0.95) translateY(-8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes returnReceiptBackdropFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .return-receipt-backdrop {
          animation: returnReceiptBackdropFade 0.2s ease-out forwards;
        }
        .return-receipt-dialog {
          animation: returnReceiptEntrance 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        #printable-return-receipt,
        #printable-return-receipt * {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif;
          box-sizing: border-box;
        }
        #printable-return-receipt .font-monospace,
        #printable-return-receipt code,
        #printable-return-receipt kbd {
          font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        }
        #printable-return-receipt .text-nowrap {
          white-space: nowrap !important;
        }

        /* Standard 80mm thermal / POS receipt print rules */
        @page {
          size: 80mm auto;
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

          .return-receipt-backdrop {
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

          .return-receipt-dialog,
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

          #printable-return-receipt {
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
            padding: 4mm 4mm 4mm 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          #printable-return-receipt,
          #printable-return-receipt * {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif !important;
            color: #000000 !important;
          }
          #printable-return-receipt .font-monospace,
          #printable-return-receipt code,
          #printable-return-receipt kbd {
            font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
          }
          #printable-return-receipt .text-nowrap {
            white-space: nowrap !important;
          }
        }
      `}</style>

      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable return-receipt-dialog"
        style={{ maxWidth: "420px", width: "95%" }}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden bg-white">
          {/* Modal Header */}
          <div className="modal-header bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between no-print">
            <div className="d-flex align-items-center gap-2">
              <FiCheckCircle className="text-success" size={17} />
              <h6 className="modal-title fw-bold mb-0" style={{ fontSize: "0.88rem" }}>
                Return Voucher Slip (80mm × 210mm)
              </h6>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          {/* Modal Body */}
          <div
            ref={modalBodyRef}
            className="modal-body p-2.5 bg-light overflow-auto"
            style={{ maxHeight: "calc(90vh - 120px)" }}
          >
            <div
              id="printable-return-receipt"
              className="bg-white rounded-2 border shadow-sm mx-auto my-1"
              style={{
                width: "80mm",
                maxWidth: "80mm",
                minHeight: "210mm",
                height: "auto",
                boxSizing: "border-box",
                padding: "4.5mm 4mm 4.5mm 4mm",
                fontSize: "0.74rem",
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif",
                color: "#18181b",
                lineHeight: 1.3,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="receipt-top-content">
                {/* Brand Header */}
                <div className="text-center pb-2 border-bottom border-dark border-opacity-25">
                  <h4
                    className="fw-bolder text-dark mb-0 tracking-tight"
                    style={{ letterSpacing: "-0.4px", fontSize: "1.24rem" }}
                  >
                    Sheikh Hammad
                  </h4>
                  <div
                    className="text-muted fw-semibold"
                    style={{ fontSize: "0.72rem", marginTop: "2px" }}
                  >
                    Mobile &amp; Accessories Point of Sale
                  </div>
                  <div className="text-dark fw-bold font-monospace" style={{ fontSize: "0.78rem", marginTop: "2px", letterSpacing: "0.2px" }}>
                    +923227406955
                  </div>
                  <div className="mt-1.5">
                    <span
                      className="d-inline-block px-2.5 py-0.5 text-uppercase fw-bold rounded-1 border border-dark"
                      style={{
                        fontSize: "0.64rem",
                        letterSpacing: "0.4px",
                        color: "#09090b",
                        backgroundColor: "#f4f4f5",
                      }}
                    >
                      {isShopkeeper
                        ? "Sale by Other Shopkeeper"
                        : receipt.returnType === "exchange" || receipt.settlementType === "exchange"
                        ? "Official Exchange Voucher"
                        : "Customer Return & Refund Voucher"}
                    </span>
                  </div>
                </div>

                {/* Metadata Card */}
                <div
                  className="my-2 rounded-2 border border-secondary-subtle"
                  style={{
                    padding: "8px 10px",
                    fontSize: "0.70rem",
                    backgroundColor: "#f8fafc",
                    boxSizing: "border-box",
                  }}
                >
                  {isShopkeeper ? (
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                      <span className="text-secondary fw-medium flex-shrink-0">Invoice #:</span>
                      <strong
                        className="text-dark font-monospace fw-bold text-end text-truncate"
                        style={{ fontSize: "0.66rem", letterSpacing: "-0.2px" }}
                      >
                        {originalSaleRef || returnNumber}
                      </strong>
                    </div>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                        <span className="text-secondary fw-medium flex-shrink-0">Return Voucher #:</span>
                        <strong
                          className="text-dark font-monospace fw-bold text-end text-truncate"
                          style={{ fontSize: "0.66rem", letterSpacing: "-0.2px" }}
                        >
                          {returnNumber}
                        </strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                        <span className="text-secondary fw-medium flex-shrink-0">Original Sale #:</span>
                        <span
                          className="text-dark font-monospace fw-semibold text-end text-truncate"
                          style={{ fontSize: "0.66rem" }}
                        >
                          {originalSaleRef}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: "6px" }}>
                    <span className="text-secondary fw-medium flex-shrink-0">Date &amp; Time:</span>
                    <span className="text-dark fw-semibold text-end text-truncate" style={{ fontSize: "0.66rem" }}>
                      {formatDateTimeAmPm(returnDate)}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center" style={{ gap: "6px" }}>
                    <span className="text-secondary fw-medium flex-shrink-0">Customer:</span>
                    <strong
                      className="text-dark text-truncate text-end"
                      style={{ maxWidth: "155px", fontSize: "0.68rem" }}
                    >
                      {customerName}
                    </strong>
                  </div>
                </div>

                {/* 2.5. OTHER SHOPKEEPER SALE DISTINCTION BANNER */}
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

                {/* Items Table */}
                <div className="my-1.5 border rounded-1 overflow-hidden">
                  <table
                    className="table table-sm mb-0"
                    style={{ fontSize: "0.72rem", width: "100%" }}
                  >
                    <thead className="table-light border-bottom border-secondary-subtle">
                      <tr>
                        <th
                          className="ps-2 py-1 text-secondary text-uppercase fw-bold text-start"
                          style={{ fontSize: "0.62rem" }}
                        >
                          {isShopkeeper ? "Item" : "Item Returned"}
                        </th>
                        <th
                          className="py-1 text-secondary text-uppercase fw-bold text-center text-nowrap"
                          style={{ fontSize: "0.62rem", width: "28px", whiteSpace: "nowrap" }}
                        >
                          Qty
                        </th>
                        {isShopkeeper && (
                          <th
                            className="py-1 text-secondary text-uppercase fw-bold text-end text-nowrap"
                            style={{ fontSize: "0.62rem", whiteSpace: "nowrap" }}
                          >
                            Price
                          </th>
                        )}
                        <th
                          className="pe-2 py-1 text-secondary text-uppercase fw-bold text-end text-nowrap"
                          style={{ fontSize: "0.62rem", whiteSpace: "nowrap" }}
                        >
                          {isShopkeeper ? "Total" : "Refund Value"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-bottom border-light">
                          <td
                            className="ps-2 py-1.5 align-top text-start"
                          >
                            <div className="fw-bold text-dark" style={{ fontSize: "0.72rem", lineHeight: 1.25 }}>
                              {it.productName}
                            </div>
                            {(it.storage || it.color || it.stockId?.storage || it.stockId?.color) && (
                              <div className="text-secondary fw-semibold font-monospace" style={{ fontSize: "0.62rem", marginTop: "1px", letterSpacing: "0.2px" }}>
                                {[it.storage || it.stockId?.storage, it.color || it.stockId?.color].filter(Boolean).join(" • ")}
                              </div>
                            )}
                            {it.imeiList.length > 0 && (
                              <div
                                className="font-monospace text-muted"
                                style={{ fontSize: "0.58rem", marginTop: "1.5px", wordBreak: "break-all" }}
                              >
                                IMEI: {it.imeiList.join(", ")}
                              </div>
                            )}
                            {!isShopkeeper && (it.saleSource === "shopkeeper" || it.shopkeeperName) && (
                              <div
                                className="text-dark fw-semibold mt-0.5"
                                style={{ fontSize: "0.62rem" }}
                              >
                                Sales by Other Shopkeeper{it.shopkeeperName ? ` (${it.shopkeeperName})` : ""}
                              </div>
                            )}
                          </td>
                          <td
                            className="text-center py-1.5 align-top font-monospace text-nowrap"
                            style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                          >
                            {it.quantity}
                          </td>
                          {isShopkeeper && (
                            <td
                              className="text-end py-1.5 align-top font-monospace text-secondary text-nowrap"
                              style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                            >
                              Rs.&nbsp;{it.unitPrice.toLocaleString()}
                            </td>
                          )}
                          <td
                            className="text-end pe-2 py-1.5 align-top fw-bold text-dark font-monospace text-nowrap"
                            style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                          >
                            Rs.&nbsp;{it.refundAmount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Purchase Items Table (If Exchange Mode) - Strictly aligned to exact same column widths */}
                {isExchangeMode && exchangeItems.length > 0 && (
                  <div className="my-1.5 border rounded-1 overflow-hidden">
                    <div
                      className="py-1 px-2 bg-light border-bottom text-uppercase fw-bold text-dark text-start"
                      style={{ fontSize: "0.62rem", letterSpacing: "0.3px" }}
                    >
                      Purchase
                    </div>
                    <table
                      className="table table-sm mb-0"
                      style={{ fontSize: "0.72rem", width: "100%" }}
                    >
                      <thead className="table-light border-bottom border-secondary-subtle">
                        <tr>
                          <th
                            className="ps-2 py-1 text-secondary text-uppercase fw-bold text-start"
                            style={{ fontSize: "0.62rem" }}
                          >
                            Item
                          </th>
                          <th
                            className="py-1 text-secondary text-uppercase fw-bold text-center text-nowrap"
                            style={{ fontSize: "0.62rem", width: "28px", whiteSpace: "nowrap" }}
                          >
                            Qty
                          </th>
                          <th
                            className="pe-2 py-1 text-secondary text-uppercase fw-bold text-end text-nowrap"
                            style={{ fontSize: "0.62rem", whiteSpace: "nowrap" }}
                          >
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {exchangeItems.map((exc, eIdx) => (
                          <tr key={eIdx} className="border-bottom border-light">
                            <td
                              className="ps-2 py-1 align-middle fw-semibold text-dark text-break text-start"
                              style={{ lineHeight: 1.2 }}
                            >
                              <div>{exc.productName}</div>
                              {(exc.storage || exc.color) && (
                                <div
                                  className="text-secondary fw-semibold font-monospace"
                                  style={{ fontSize: "0.62rem", marginTop: "1px", letterSpacing: "0.2px" }}
                                >
                                  {[exc.storage, exc.color].filter(Boolean).join(" • ")}
                                </div>
                              )}
                              {exc.barcodes.length > 0 && (
                                <div
                                  className="font-monospace text-muted mt-0.5"
                                  style={{ fontSize: "0.62rem" }}
                                >
                                  IMEI: {exc.barcodes.join(", ")}
                                </div>
                              )}
                            </td>
                            <td
                              className="text-center py-1 align-middle font-monospace text-nowrap"
                              style={{ fontSize: "0.68rem" }}
                            >
                              {exc.quantity}
                            </td>
                            <td
                              className="text-end pe-2 py-1 align-middle fw-bold text-dark font-monospace text-nowrap"
                              style={{ fontSize: "0.68rem" }}
                            >
                              Rs.&nbsp;{exc.subtotal.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Customer-Facing Settlement Summary */}
                {isExchangeMode ? (
                  <div className="my-1.5 p-2 bg-light rounded-1 border border-secondary-subtle">
                    <div
                      className="d-flex justify-content-between align-items-center mb-1 text-secondary"
                      style={{ fontSize: "0.68rem" }}
                    >
                      <span>Return Credit (Shop Pays Customer):</span>
                      <span className="font-monospace fw-semibold text-success">
                        +Rs.&nbsp;{totalReturnCredit.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="d-flex justify-content-between align-items-center mb-1 text-secondary"
                      style={{ fontSize: "0.68rem" }}
                    >
                      <span>Purchase Total (Customer Pays):</span>
                      <span className="font-monospace fw-semibold text-dark">
                        -Rs.&nbsp;{exchangeCartTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="pt-1.5 mt-1 border-top border-dark border-opacity-25">
                      {netDifference > 0 ? (
                        <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                          <div>
                            <div className="fw-bolder text-dark" style={{ fontSize: "0.80rem", lineHeight: 1.2 }}>
                              Net Difference
                            </div>
                            <div className="text-secondary fw-semibold" style={{ fontSize: "0.64rem", lineHeight: 1.1 }}>
                              (Customer Pays)
                            </div>
                          </div>
                          <div className="text-end">
                            <strong className="text-dark font-monospace text-nowrap" style={{ fontSize: "1.00rem" }}>
                              Rs.&nbsp;{netDifference.toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      ) : netDifference < 0 ? (
                        <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                          <div>
                            <div className="fw-bolder text-dark" style={{ fontSize: "0.80rem", lineHeight: 1.2 }}>
                              Net Refund
                            </div>
                            <div className="text-secondary fw-semibold" style={{ fontSize: "0.64rem", lineHeight: 1.1 }}>
                              (Shop Pays Customer)
                            </div>
                          </div>
                          <div className="text-end">
                            <strong className="text-danger font-monospace text-nowrap" style={{ fontSize: "1.00rem" }}>
                              Rs.&nbsp;{Math.abs(netDifference).toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-between align-items-center" style={{ gap: "8px" }}>
                          <span className="fw-bolder text-dark text-nowrap" style={{ fontSize: "0.78rem" }}>
                            Net Balance:
                          </span>
                          <strong className="text-dark font-monospace text-nowrap" style={{ fontSize: "0.80rem" }}>
                            Rs.&nbsp;0 (Even Exchange)
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                ) : isShopkeeper ? (
                  <div className="py-2 px-2 my-2 bg-light rounded-1 border border-dark border-opacity-25">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-secondary fw-medium" style={{ fontSize: "0.70rem" }}>Subtotal:</span>
                      <span className="font-monospace fw-semibold text-dark" style={{ fontSize: "0.72rem" }}>
                        Rs.&nbsp;{totalReturnCredit.toLocaleString()}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center pt-1 border-top border-secondary-subtle" style={{ gap: "8px" }}>
                      <div>
                        <div className="fw-bolder text-dark" style={{ fontSize: "0.82rem", lineHeight: 1.2 }}>
                          Total Amount
                        </div>
                        <div className="text-secondary fw-semibold" style={{ fontSize: "0.64rem", lineHeight: 1.1 }}>
                          (Sales by Other Shopkeeper)
                        </div>
                      </div>
                      <div className="text-end">
                        <strong className="text-dark font-monospace text-nowrap" style={{ fontSize: "1.05rem" }}>
                          Rs.&nbsp;{totalReturnCredit.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
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
                          Rs.&nbsp;{totalReturnCredit.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stock Restored & Reason - Aligned in unified card */}
                {!isShopkeeper && (
                  <div
                    className="my-1.5 p-2 rounded-1 border border-secondary-subtle bg-white"
                    style={{ fontSize: "0.66rem" }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-secondary fw-medium">Stock Restored:</span>
                      <strong className="text-dark font-monospace">{totalUnitsReturned} units</strong>
                    </div>
                    {reason && reason !== "Customer Return" && (
                      <div className="d-flex justify-content-between align-items-center mt-1 pt-1 border-top border-light-subtle">
                        <span className="text-secondary fw-medium">Reason:</span>
                        <span className="text-dark fw-medium text-end text-truncate" style={{ maxWidth: "165px" }}>
                          {reason}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Valued Customers / Terms & Conditions */}
              <div className="receipt-terms-container border-top border-dark border-opacity-25 pt-2 mt-2">
                <div
                  className="text-uppercase fw-bold text-dark text-center mb-1"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.3px", lineHeight: 1.2 }}
                >
                  For Valued Customers / Terms &amp; Conditions
                </div>
                <ol
                  className="ps-3 mb-0"
                  style={{ fontSize: "0.64rem", lineHeight: 1.3, color: "#27272a", textAlign: "justify", margin: 0 }}
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

              {/* Footer */}
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

          {/* Modal Action Buttons (No Print) */}
          <div className="modal-footer bg-white border-top py-2 px-3 d-flex gap-2 justify-content-end no-print">
            <button
              type="button"
              className="btn btn-outline-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-3 fw-semibold shadow-sm"
              style={{ fontSize: "0.80rem" }}
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              title="Download high-resolution PDF voucher"
            >
              {isDownloading ? (
                <span className="spinner-border spinner-border-sm" role="status" style={{ width: 13, height: 13 }} />
              ) : (
                <FiDownload size={15} />
              )}
              <span>{isDownloading ? "Generating..." : "Download PDF"}</span>
            </button>
            <button
              type="button"
              className="btn btn-dark d-inline-flex align-items-center justify-content-center gap-1.5 py-1.5 px-3 fw-semibold shadow-sm"
              style={{ fontSize: "0.80rem" }}
              onClick={handlePrint}
              title="Print 80mm x 210mm single sheet return voucher"
            >
              <FiPrinter size={15} />
              <span>Print Voucher</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary py-1.5 px-3 fw-semibold"
              style={{ fontSize: "0.80rem" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalMarkup, document.body);
}

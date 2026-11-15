import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  FiRotateCcw,
  FiSearch,
  FiTruck,
  FiAlertCircle,
  FiCheckCircle,
  FiPlus,
  FiTrash2,
  FiPrinter,
  FiDownload,
  FiLayers,
  FiDollarSign,
  FiCheck,
  FiCopy,
  FiHash,
  FiX,
  FiRepeat,
  FiPackage,
  FiArrowRight,
  FiCornerDownLeft,
} from "react-icons/fi";
import api from "../api/axios";
import { STORAGE_PRESETS, PHONE_COLOR_PRESETS } from "./AddStock";
import Swal from "sweetalert2";
import SupplierRefundReceiptModal from "../components/supplier-refund/SupplierRefundReceiptModal";

export default function SupplierRefund() {
  // ── 1. Supplier & Workflow Mode ───────────────────────────────────────────
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [supplierBalance, setSupplierBalance] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [workflowType, setWorkflowType] = useState("refund_only"); // 'refund_only' | 'refund_and_purchase'

  // ── 2. Stock Search & Selection ──────────────────────────────────────────
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState(null); // { type: 'error' | 'warning' | 'info', message: '' }
  const [soldPhoneAlert, setSoldPhoneAlert] = useState(null); // Prominent banner for sold phones
  const [supplierStockList, setSupplierStockList] = useState([]);
  const [isLoadingStockList, setIsLoadingStockList] = useState(false);

  // ── 3. Refund Batch Items ────────────────────────────────────────────────
  const [refundBatch, setRefundBatch] = useState([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── 4. Replacement Purchase Items (Workflow B) ───────────────────────────
  const [replacementItems, setReplacementItems] = useState([]);
  const [repProductName, setRepProductName] = useState("");
  const [repStorage, setRepStorage] = useState("");
  const [repColor, setRepColor] = useState("");
  const [repQty, setRepQty] = useState(1);
  const [repUnitPrice, setRepUnitPrice] = useState("");
  const [repBarcodes, setRepBarcodes] = useState([""]);
  const [cashPaid, setCashPaid] = useState("");
  const repBarcodeRefs = useRef([]);

  // ── 5. Receipt Modal ─────────────────────────────────────────────────────
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [copiedImei, setCopiedImei] = useState(null);

  const imeiInputRef = useRef(null);

  // ── Fetch Suppliers on Load ──────────────────────────────────────────────
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const res = await api.get("/suppliers?suppliersOnly=true");
        if (res.data?.success && Array.isArray(res.data.data)) {
          setSuppliers(res.data.data);
        }
      } catch (err) {
        console.error("Error fetching suppliers:", err);
      }
    };
    fetchSuppliers();
  }, []);

  // ── Fetch Supplier Balance and Available Stock when Selection Changes ───
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierBalance(0);
      setSupplierStockList([]);
      setStockSearchQuery("");
      return;
    }
    const fetchBalanceAndStock = async () => {
      setIsLoadingBalance(true);
      setIsLoadingStockList(true);
      try {
        const [balRes, stockRes] = await Promise.all([
          api.get(`/suppliers/${encodeURIComponent(selectedSupplier)}/history`),
          api.get(`/supplier-refunds/supplier-stock?supplierName=${encodeURIComponent(selectedSupplier)}`),
        ]);

        if (balRes.data?.success && balRes.data.data?.summary) {
          setSupplierBalance(Number(balRes.data.data.summary.totalDue || 0));
        }

        if (stockRes.data?.success) {
          setSupplierStockList(stockRes.data.data || []);
        }
      } catch (err) {
        console.error("Error fetching supplier data:", err);
      } finally {
        setIsLoadingBalance(false);
        setIsLoadingStockList(false);
      }
    };
    fetchBalanceAndStock();
  }, [selectedSupplier]);

  // Helper to get unique unit identifier
  const getItemId = (item) => String(item.stockItemId || item._id || item.barcode || "");

  // ── Handle IMEI Search ───────────────────────────────────────────────────
  const handleSearchImei = async (e, manualImei) => {
    if (e) e.preventDefault();
    const clean = (manualImei || stockSearchQuery || "").trim();
    if (!clean) return;

    if (!selectedSupplier) {
      setSearchFeedback({
        type: "warning",
        message: "Please select a target supplier before searching IMEIs.",
      });
      return;
    }

    // Fast local check in already loaded supplier stock list
    const matchingUnsold = supplierStockList.filter(
      (it) => it.barcode && it.barcode.trim().toLowerCase() === clean.toLowerCase()
    );
    if (matchingUnsold.length > 0) {
      // Find an unsold physical piece not yet in the refund batch
      const unselectedUnit = matchingUnsold.find(
        (it) => !refundBatch.some((b) => getItemId(b) === getItemId(it))
      );
      if (unselectedUnit) {
        handleAddToBatch(unselectedUnit);
        setSearchFeedback({
          type: "info",
          message: `Added "${unselectedUnit.productName}" (IMEI: ${unselectedUnit.barcode}) to refund list.`,
        });
        setStockSearchQuery("");
        return;
      } else {
        setSearchFeedback({
          type: "warning",
          message: `All ${matchingUnsold.length} available unsold unit(s) with IMEI "${clean}" are already in the refund batch.`,
        });
        return;
      }
    }

    setIsSearching(true);
    setSearchFeedback(null);

    try {
      const res = await api.get(
        `/supplier-refunds/check-imei?imei=${encodeURIComponent(clean)}&supplierName=${encodeURIComponent(
          selectedSupplier
        )}`
      );

      const data = res.data;

      // CASE 1: SOLD PHONE (Prominent Warning Box per prompt instructions)
      if (data.status === "SOLD") {
        setSoldPhoneAlert({
          imei: clean,
          customerName: data.saleDetails?.customerName || "Walk-in Customer",
          saleNumber: data.saleDetails?.saleNumber || "N/A",
          saleDate: data.saleDetails?.saleDate
            ? new Date(data.saleDetails.saleDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "N/A",
          productName: data.saleDetails?.productName || "Phone",
        });
        setStockSearchQuery("");
        return;
      }

      // CASE 2: WRONG SUPPLIER
      if (data.status === "WRONG_SUPPLIER") {
        setSearchFeedback({
          type: "warning",
          message: data.message,
        });
        return;
      }

      // CASE 3: ALREADY REFUNDED
      if (data.status === "ALREADY_REFUNDED") {
        setSearchFeedback({
          type: "warning",
          message: data.message + (data.refundNumber ? ` (Ref: ${data.refundNumber})` : ""),
        });
        return;
      }

      // CASE 4: NOT FOUND
      if (data.status === "NOT_FOUND") {
        setSearchFeedback({
          type: "error",
          message: "No phone found with this IMEI in database.",
        });
        return;
      }

      // CASE 5: INVALID STATUS
      if (data.status === "INVALID_STATUS") {
        setSearchFeedback({
          type: "error",
          message: data.message,
        });
        return;
      }

      // CASE 6: ELIGIBLE AVAILABLE PHONE
      if (data.status === "ELIGIBLE" && data.item) {
        handleAddToBatch(data.item);
        setSearchFeedback({
          type: "info",
          message: `Added "${data.item.productName}" (IMEI: ${data.item.barcode}) to refund list.`,
        });
        setStockSearchQuery("");
      }
    } catch (err) {
      console.error("Error checking IMEI:", err);
      setSearchFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to verify IMEI with database.",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // ── Add Item to Refund Batch ─────────────────────────────────────────────
  const handleAddToBatch = (itemToAdd) => {
    if (!itemToAdd) return;
    const targetId = getItemId(itemToAdd);

    if (refundBatch.some((b) => getItemId(b) === targetId)) {
      setSearchFeedback({
        type: "warning",
        message: `This phone unit (IMEI: ${itemToAdd.barcode}) is already in the current refund batch.`,
      });
      return;
    }

    setRefundBatch((prev) => [
      ...prev,
      {
        ...itemToAdd,
        refundAmount: itemToAdd.refundAmount || itemToAdd.purchaseCost || 0,
      },
    ]);

    setStockSearchQuery("");
    setSearchFeedback(null);
  };

  // ── Toggle Item Selection (One phone per row) ─────────────────────────────
  const handleToggleStockItem = (item) => {
    const targetId = getItemId(item);
    const isAlready = refundBatch.some((b) => getItemId(b) === targetId);
    if (isAlready) {
      setRefundBatch((prev) => prev.filter((b) => getItemId(b) !== targetId));
    } else {
      setRefundBatch((prev) => [
        ...prev,
        {
          ...item,
          refundAmount: item.refundAmount || item.purchaseCost || 0,
        },
      ]);
    }
  };

  // ── Bulk Select All Filtered ──────────────────────────────────────────────
  const handleSelectAllFiltered = (filteredItems) => {
    setRefundBatch((prev) => {
      const existingIds = new Set(prev.map(getItemId));
      const toAdd = filteredItems
        .filter((it) => !existingIds.has(getItemId(it)))
        .map((it) => ({
          ...it,
          refundAmount: it.refundAmount || it.purchaseCost || 0,
        }));
      return [...prev, ...toAdd];
    });
  };

  // ── Bulk Deselect All Filtered ────────────────────────────────────────────
  const handleDeselectAllFiltered = (filteredItems) => {
    const idsToRemove = new Set(filteredItems.map(getItemId));
    setRefundBatch((prev) => prev.filter((it) => !idsToRemove.has(getItemId(it))));
  };

  // ── Remove Item from Batch ───────────────────────────────────────────────
  const handleRemoveFromBatch = (targetId) => {
    const sTarget = String(targetId);
    setRefundBatch((prev) => prev.filter((b) => getItemId(b) !== sTarget));
  };

  // ── Update Refund Amount per Item ────────────────────────────────────────
  const handleRefundAmountChange = (targetId, val) => {
    const sTarget = String(targetId);
    const num = Math.max(0, Number(val) || 0);
    setRefundBatch((prev) =>
      prev.map((b) => (getItemId(b) === sTarget ? { ...b, refundAmount: num } : b))
    );
  };

  // ── Dynamic Barcode and Qty Handlers (Workflow B) ────────────────────────
  const handleRepQtyChange = (newVal) => {
    const q = Math.max(1, parseInt(newVal, 10) || 1);
    setRepQty(q);
    setRepBarcodes((prev) => {
      let next = [...prev];
      if (q > next.length) {
        next = next.concat(Array(q - next.length).fill(""));
      } else if (q < next.length) {
        next = next.slice(0, q);
      }
      return next;
    });
  };

  const handleRepBarcodeChange = (index, value) => {
    const cleanVal = (typeof value === "string" ? value : "").replace(/\D/g, "").slice(0, 15);
    setRepBarcodes((prev) => {
      const next = [...prev];
      next[index] = cleanVal;
      return next;
    });
  };

  const handleRepBarcodeKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextIdx = index + 1;
      if (nextIdx < repBarcodes.length && repBarcodeRefs.current[nextIdx]) {
        repBarcodeRefs.current[nextIdx].focus();
      }
    }
  };

  // ── Add Replacement Item (Workflow B) ────────────────────────────────────
  const handleAddReplacementItem = (e) => {
    e.preventDefault();
    if (!repProductName.trim()) {
      Swal.fire("Warning", "Product name is required for replacement item.", "warning");
      return;
    }
    const q = Math.max(1, parseInt(repQty, 10) || 1);
    const p = Math.max(0, parseFloat(repUnitPrice) || 0);

    const cleanedBarcodes = repBarcodes
      .map((b) => (b || "").trim())
      .filter(Boolean);

    setReplacementItems((prev) => [
      ...prev,
      {
        productName: repProductName.trim(),
        storage: repStorage.trim(),
        color: repColor.trim(),
        quantity: q,
        unitPrice: p,
        subtotal: Number((q * p).toFixed(2)),
        barcodes: cleanedBarcodes,
      },
    ]);

    setRepProductName("");
    setRepStorage("");
    setRepColor("");
    setRepQty(1);
    setRepUnitPrice("");
    setRepBarcodes([""]);
  };

  const handleRemoveReplacementItem = (idx) => {
    setReplacementItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const filteredSupplierStock = supplierStockList.filter((item) => {
    if (!stockSearchQuery.trim()) return true;
    const q = stockSearchQuery.trim().toLowerCase();
    const prodName = (item.productName || "").toLowerCase();
    const barcode = (item.barcode || "").toLowerCase();
    const storage = (item.storage || "").toLowerCase();
    const color = (item.color || "").toLowerCase();
    const inv = (item.invoiceNumber || "").toLowerCase();
    return prodName.includes(q) || barcode.includes(q) || storage.includes(q) || color.includes(q) || inv.includes(q);
  });

  // ── Calculations ─────────────────────────────────────────────────────────
  const totalRefundAmount = refundBatch.reduce(
    (sum, it) => sum + (Number(it.refundAmount) || 0),
    0
  );

  const replacementCartTotal = replacementItems.reduce(
    (sum, it) => sum + (Number(it.subtotal) || 0),
    0
  );

  const numCashPaid = Math.max(0, parseFloat(cashPaid) || 0);
  const netDifference = Number((replacementCartTotal - totalRefundAmount).toFixed(2));
  const rawProjectedBalance =
    workflowType === "refund_and_purchase"
      ? Number((supplierBalance + replacementCartTotal - totalRefundAmount - numCashPaid).toFixed(2))
      : Number((supplierBalance - totalRefundAmount).toFixed(2));
  const projectedBalance = Math.max(0, rawProjectedBalance);

  // ── Submit Refund ────────────────────────────────────────────────────────
  const handleSubmitRefund = async () => {
    if (!selectedSupplier) {
      Swal.fire("Error", "Please select a supplier.", "error");
      return;
    }

    if (refundBatch.length === 0) {
      Swal.fire("Error", "Please add at least one phone to refund.", "error");
      return;
    }

    if (workflowType === "refund_and_purchase" && replacementItems.length === 0) {
      Swal.fire(
        "Warning",
        "Mode B requires adding at least one replacement item, or switch to 'Refund Only'.",
        "warning"
      );
      return;
    }

    const confirmRes = await Swal.fire({
      title: "Confirm Refund & New Balance",
      html: `
        <div style="text-align: left; font-size: 0.88rem;">
          <p><strong>Supplier:</strong> ${selectedSupplier}</p>
          <p><strong>${supplierBalance > 0 ? "Shop pays to supplier (Old):" : supplierBalance < 0 ? "Supplier pays to shop (Old):" : "Settled / Balanced (Old):"}</strong> Rs. ${Math.abs(supplierBalance).toLocaleString()}</p>
          <p><strong>Returned Phones Value:</strong> - Rs. ${totalRefundAmount.toLocaleString()} (${refundBatch.length} phones)</p>
          ${
            workflowType === "refund_and_purchase"
              ? `<p><strong>New Replacement Phones:</strong> + Rs. ${replacementCartTotal.toLocaleString()}</p>
                 <p><strong>Cash Paid Now:</strong> - Rs. ${numCashPaid.toLocaleString()}</p>
                 <p><strong>Exchange Difference:</strong> ${
                  netDifference > 0
                    ? `Shop pays to supplier: Rs. ${netDifference.toLocaleString()}`
                    : netDifference < 0
                    ? `Supplier pays to shop: Rs. ${Math.abs(netDifference).toLocaleString()}`
                    : "Even Exchange (Rs. 0)"
                }</p>`
              : ""
          }
          <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px;">
            <p style="margin-bottom: 0;"><strong>${
              rawProjectedBalance > 0
                ? "Shop pays to supplier:"
                : rawProjectedBalance < 0
                ? "Supplier pays to shop:"
                : "Settled (Balanced):"
            }</strong> <span style="font-size: 1.05rem; color: #0f172a; font-weight: bold;">Rs. ${Math.abs(rawProjectedBalance).toLocaleString()}</span></p>
          </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0f172a",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Confirm & Print Voucher",
      cancelButtonText: "Cancel",
    });

    if (!confirmRes.isConfirmed) return;

    setIsSubmitting(true);
    try {
      const payload = {
        supplier: selectedSupplier,
        supplierId: selectedSupplierId,
        workflowType,
        cashPaid: numCashPaid,
        returnedItems: refundBatch.map((it) => ({
          stockItemId: it.stockItemId || it._id,
          barcode: it.barcode,
          productName: it.productName,
          storage: it.storage || "",
          color: it.color || "",
          originalPurchaseCost: it.purchaseCost,
          refundAmount: it.refundAmount,
          invoiceId: it.invoiceId,
          invoiceNumber: it.invoiceNumber,
        })),
        replacementItems,
        notes,
      };

      const res = await api.post("/supplier-refunds", payload);
      if (res.data?.success) {
        Swal.fire({
          title: "Refund Completed!",
          text: `Voucher ${res.data.data.refundNumber} generated successfully.`,
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });

        setActiveReceipt(res.data.receipt || res.data.data);
        setRefundBatch([]);
        setReplacementItems([]);
        setRepBarcodes([""]);
        setCashPaid("");
        setStockSearchQuery("");
        setSearchFeedback(null);
        setSoldPhoneAlert(null);
      }
    } catch (err) {
      console.error("Error submitting refund:", err);
      Swal.fire({
        title: "Refund Failed",
        text: err.response?.data?.message || "Failed to process supplier refund.",
        icon: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setCopiedImei(text);
    setTimeout(() => setCopiedImei(null), 1500);
  };

  return (
    <div className="container-fluid py-3 px-md-4">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-2 border-bottom">
        <div className="d-flex align-items-center gap-2.5">
          <div className="p-2 rounded-2 bg-dark text-white d-flex align-items-center justify-content-center shadow-xs">
            <FiRotateCcw size={20} />
          </div>
          <div>
            <h4 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <span>Refund to Supplier</span>
              <span className="badge bg-secondary-subtle text-secondary border font-monospace small">
                IMEI Validation
              </span>
            </h4>
            <span className="text-muted small">
              Verify stock status via IMEI, return eligible devices, and adjust supplier ledger
            </span>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <Link
            to="/history"
            className="btn btn-outline-secondary btn-sm py-1.5 px-3 fw-medium d-inline-flex align-items-center gap-1.5 shadow-xs"
          >
            <FiLayers size={14} />
            <span>Transaction History</span>
          </Link>
          <Link
            to="/suppliers"
            className="btn btn-outline-dark btn-sm py-1.5 px-3 fw-medium d-inline-flex align-items-center gap-1.5 shadow-xs"
          >
            <FiTruck size={14} />
            <span>Supplier Ledger</span>
          </Link>
        </div>
      </div>

      {/* ── PROMINENT SOLD PHONE BANNER (MANDATORY per Prompt Requirements) ── */}
      {soldPhoneAlert && (
        <div
          className="alert alert-danger border-2 border-danger shadow-sm rounded-3 p-3 mb-4 animate__animated animate__fadeIn"
          role="alert"
          style={{ backgroundColor: "#fef2f2", borderColor: "#ef4444" }}
        >
          <div className="d-flex align-items-start justify-content-between gap-2">
            <div className="d-flex align-items-start gap-2.5">
              <div className="p-1.5 bg-danger text-white rounded-circle flex-shrink-0 mt-0.5">
                <FiAlertCircle size={20} />
              </div>
              <div>
                <h5 className="fw-bolder text-danger mb-1" style={{ fontSize: "1.05rem" }}>
                  This phone has already been sold.
                </h5>

                <div
                  className="bg-white p-2.5 rounded-2 border border-danger border-opacity-25 my-2 font-monospace"
                  style={{ fontSize: "0.82rem" }}
                >
                  <div className="row g-2">
                    <div className="col-12 col-md-6">
                      <span className="text-secondary fw-semibold">IMEI: </span>
                      <strong className="text-dark">{soldPhoneAlert.imei}</strong>
                    </div>
                    <div className="col-12 col-md-6">
                      <span className="text-secondary fw-semibold">Phone Model: </span>
                      <strong className="text-dark">{soldPhoneAlert.productName}</strong>
                    </div>
                    <div className="col-12 col-md-6">
                      <span className="text-secondary fw-semibold">Sold to: </span>
                      <strong className="text-dark">{soldPhoneAlert.customerName}</strong>
                    </div>
                    <div className="col-12 col-md-6">
                      <span className="text-secondary fw-semibold">Sale reference: </span>
                      <strong className="text-dark">{soldPhoneAlert.saleNumber}</strong>
                    </div>
                    <div className="col-12 col-md-6">
                      <span className="text-secondary fw-semibold">Sale date: </span>
                      <span className="text-dark">{soldPhoneAlert.saleDate}</span>
                    </div>
                  </div>
                </div>

                <p
                  className="fw-bold text-danger mb-0"
                  style={{ fontSize: "0.85rem", lineHeight: 1.45 }}
                >
                  You cannot refund this phone to the supplier because it is no longer in stock. Please add
                  the phone back into stock through the appropriate existing stock-entry or return workflow
                  first. Once it is available in stock again, you can process the supplier refund.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-link text-danger p-0"
              onClick={() => setSoldPhoneAlert(null)}
              title="Dismiss warning"
            >
              <FiX size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ── Configuration Row: Supplier Selector & Workflow Mode ────────────── */}
      <div className="row g-3 mb-3">
        {/* Supplier Selector */}
        <div className="col-12 col-md-6 col-lg-5">
          <div className="card border shadow-xs h-100">
            <div className="card-body p-3">
              <label className="form-label fw-bold small text-dark d-flex align-items-center justify-content-between mb-1.5">
                <span className="d-flex align-items-center gap-1.5">
                  <FiTruck size={14} className="text-primary" />
                  <span>1. Select Supplier</span>
                </span>
                {selectedSupplier && (
                  <span className="small text-muted font-monospace">
                    Balance Due:{" "}
                    <strong className="text-danger">
                      Rs. {supplierBalance.toLocaleString()}
                    </strong>
                  </span>
                )}
              </label>

              <select
                className="form-select form-select-sm"
                value={selectedSupplier}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedSupplier(val);
                  const matched = suppliers.find((s) => s.name === val);
                  setSelectedSupplierId(matched ? matched._id : null);
                  setStockSearchQuery("");
                  setSearchFeedback(null);
                  setSoldPhoneAlert(null);
                }}
              >
                <option value="">-- Choose Supplier to Refund --</option>
                {suppliers.map((sup) => (
                  <option key={sup._id} value={sup.name}>
                    {sup.name}
                  </option>
                ))}
              </select>

              <div className="form-text small" style={{ fontSize: "0.72rem" }}>
                Only stock units purchased from this specific supplier can be returned.
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Mode Switcher */}
        <div className="col-12 col-md-6 col-lg-7">
          <div className="card border shadow-xs h-100">
            <div className="card-body p-3">
              <label className="form-label fw-bold small text-dark d-flex align-items-center gap-1.5 mb-1.5">
                <FiRepeat size={14} className="text-primary" />
                <span>2. Select Refund Workflow</span>
              </label>

              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn btn-sm py-2 px-3 fw-semibold ${
                    workflowType === "refund_only"
                      ? "btn-dark text-white"
                      : "btn-outline-secondary bg-white text-secondary"
                  }`}
                  onClick={() => setWorkflowType("refund_only")}
                >
                  <span className="d-block small">Workflow A</span>
                  <span style={{ fontSize: "0.74rem" }}>Refund Only (Ledger Credit)</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-sm py-2 px-3 fw-semibold ${
                    workflowType === "refund_and_purchase"
                      ? "btn-dark text-white"
                      : "btn-outline-secondary bg-white text-secondary"
                  }`}
                  onClick={() => setWorkflowType("refund_and_purchase")}
                >
                  <span className="d-block small">Workflow B</span>
                  <span style={{ fontSize: "0.74rem" }}>Refund + Replacement Purchase</span>
                </button>
              </div>

              <div className="form-text small mt-1.5" style={{ fontSize: "0.72rem" }}>
                {workflowType === "refund_only"
                  ? "Deducts return value directly from supplier's running balance without taking new stock."
                  : "Deducts return value against a new batch of replacement stock added into inventory."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Browse Unsold Stock by Phone Name or IMEI ─────────────────── */}
      <div className="card border shadow-xs mb-3">
        <div className="card-header bg-white border-bottom py-2.5 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <div className="p-1 bg-dark text-white rounded">
              <FiSearch size={14} />
            </div>
            <span className="fw-bold small text-dark">
              Search by Phone Name or IMEI {selectedSupplier ? `(${selectedSupplier})` : ""}
            </span>
            {selectedSupplier && (
              <span className="badge bg-light text-secondary border font-monospace small">
                {supplierStockList.length} unsold in stock
              </span>
            )}
          </div>

          {selectedSupplier && filteredSupplierStock.length > 0 && (
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-dark btn-sm py-1 px-2.5 d-inline-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: "0.75rem" }}
                onClick={() => handleSelectAllFiltered(filteredSupplierStock)}
              >
                <FiCheck size={13} />
                <span>Select All ({filteredSupplierStock.length})</span>
              </button>
              {refundBatch.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm py-1 px-2.5 d-inline-flex align-items-center gap-1 font-monospace"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => handleDeselectAllFiltered(filteredSupplierStock)}
                >
                  <FiX size={13} />
                  <span>Deselect All</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card-body p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchImei(e);
            }}
          >
            <div className="input-group mb-2">
              <span className="input-group-text bg-light text-secondary">
                <FiSearch size={16} />
              </span>
              <input
                ref={imeiInputRef}
                type="text"
                className="form-control form-control-lg font-monospace fs-6"
                placeholder={
                  selectedSupplier
                    ? `Type phone name (e.g. Pixel, iPhone) or scan 15-digit IMEI...`
                    : "Please select a supplier first..."
                }
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                disabled={!selectedSupplier || isSearching}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-dark px-4 fw-semibold d-inline-flex align-items-center gap-2"
                disabled={!selectedSupplier || !stockSearchQuery.trim() || isSearching}
              >
                {isSearching ? (
                  <span className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <FiSearch size={16} />
                )}
                <span>Check IMEI</span>
              </button>
            </div>
          </form>

          {/* Search Feedback Message */}
          {searchFeedback && (
            <div
              className={`alert alert-${
                searchFeedback.type === "error"
                  ? "danger"
                  : searchFeedback.type === "warning"
                  ? "warning"
                  : "info"
              } py-2 px-3 mt-2 mb-2 d-flex align-items-center justify-content-between gap-2 shadow-xs`}
              role="alert"
              style={{ fontSize: "0.82rem" }}
            >
              <div className="d-flex align-items-center gap-2">
                <FiAlertCircle size={16} className="flex-shrink-0" />
                <span>{searchFeedback.message}</span>
              </div>
              <button
                type="button"
                className="btn-close btn-sm p-1"
                onClick={() => setSearchFeedback(null)}
              />
            </div>
          )}

          {/* Unsold Stock List Table (One phone per row) */}
          {selectedSupplier && (
            <div className="mt-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="small text-muted">
                  Showing {filteredSupplierStock.length} unsold phone{filteredSupplierStock.length !== 1 ? "s" : ""}
                  {stockSearchQuery.trim() && ` matching "${stockSearchQuery}"`}
                </span>
                <span className="small text-secondary font-monospace">
                  Selected for refund: <strong className="text-dark">{refundBatch.length}</strong>
                </span>
              </div>

              {isLoadingStockList ? (
                <div className="text-center py-4 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Loading unsold phones from {selectedSupplier}...
                </div>
              ) : supplierStockList.length === 0 ? (
                <div className="text-center py-4 text-muted border rounded bg-light">
                  No unsold phones found in inventory for {selectedSupplier}.
                </div>
              ) : filteredSupplierStock.length === 0 ? (
                <div className="text-center py-4 text-muted border rounded bg-light">
                  No unsold phones match "{stockSearchQuery}". Try another model name or IMEI.
                </div>
              ) : (
                <div className="table-responsive border rounded-2" style={{ maxHeight: "360px", overflowY: "auto" }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: "0.82rem" }}>
                    <thead className="table-light text-secondary sticky-top" style={{ zIndex: 1 }}>
                      <tr>
                        <th style={{ width: "42px" }} className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={
                              filteredSupplierStock.length > 0 &&
                              filteredSupplierStock.every((it) =>
                                refundBatch.some((b) => getItemId(b) === getItemId(it))
                              )
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleSelectAllFiltered(filteredSupplierStock);
                              } else {
                                handleDeselectAllFiltered(filteredSupplierStock);
                              }
                            }}
                            title="Select / Deselect all visible"
                          />
                        </th>
                        <th>Phone Model &amp; Specs</th>
                        <th>Serialized IMEI</th>
                        <th>Purchase Ref</th>
                        <th className="text-end">Cost</th>
                        <th className="text-center" style={{ width: "130px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSupplierStock.map((item, idx) => {
                        const isSelected = refundBatch.some((b) => getItemId(b) === getItemId(item));
                        const specs = [item.storage, item.color].filter(Boolean).join(" • ");
                        return (
                          <tr
                            key={item.stockItemId || item._id || `${item.barcode}-${idx}`}
                            className={isSelected ? "table-success bg-opacity-25" : ""}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleToggleStockItem(item)}
                          >
                            <td className="text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={isSelected}
                                onChange={() => handleToggleStockItem(item)}
                              />
                            </td>
                            <td>
                              <strong className="text-dark d-block">{item.productName}</strong>
                              {specs && (
                                <span className="badge bg-light text-secondary border mt-0.5 font-monospace" style={{ fontSize: "0.72rem" }}>
                                  {specs}
                                </span>
                              )}
                            </td>
                            <td className="font-monospace" onClick={(e) => e.stopPropagation()}>
                              <span className="badge bg-light text-dark border d-inline-flex align-items-center gap-1.5 py-1 px-2">
                                <span>{item.barcode}</span>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-link p-0 text-muted"
                                  onClick={() => copyToClipboard(item.barcode)}
                                  title="Copy IMEI"
                                >
                                  {copiedImei === item.barcode ? (
                                    <FiCheck size={11} className="text-success" />
                                  ) : (
                                    <FiCopy size={11} />
                                  )}
                                </button>
                              </span>
                            </td>
                            <td>
                              <span className="font-monospace text-secondary small">
                                {item.invoiceNumber || "N/A"}
                              </span>
                              {item.purchaseDate && (
                                <div className="text-muted small" style={{ fontSize: "0.70rem" }}>
                                  {new Date(item.purchaseDate).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td className="text-end font-monospace fw-semibold text-dark">
                              Rs. {Number(item.purchaseCost || 0).toLocaleString()}
                            </td>
                            <td className="text-center" onClick={(e) => e.stopPropagation()}>
                              {isSelected ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success py-1 px-2.5 fw-semibold d-inline-flex align-items-center gap-1"
                                  style={{ fontSize: "0.75rem" }}
                                  onClick={() => handleToggleStockItem(item)}
                                >
                                  <FiCheck size={12} />
                                  <span>Selected</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-dark py-1 px-2.5 fw-semibold d-inline-flex align-items-center gap-1"
                                  style={{ fontSize: "0.75rem" }}
                                  onClick={() => handleToggleStockItem(item)}
                                >
                                  <FiPlus size={12} />
                                  <span>Select</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Batch Refund Items Table ────────────────────────────────────────── */}
      <div className="card border shadow-xs mb-3">
        <div className="card-header bg-white border-bottom py-2.5 px-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <FiRotateCcw className="text-danger" size={16} />
            <span className="fw-bold small text-dark">
              Phones Selected for Refund ({refundBatch.length})
            </span>
          </div>

          <span className="fw-bold font-monospace text-dark small">
            Total Return Value:{" "}
            <strong className="text-danger">Rs. {totalRefundAmount.toLocaleString()}</strong>
          </span>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.82rem" }}>
            <thead className="table-light text-secondary">
              <tr>
                <th style={{ width: "40px" }} className="text-center">#</th>
                <th>Phone Model &amp; Specs</th>
                <th>Serialized IMEI</th>
                <th>Original Purchase Ref</th>
                <th className="text-end">Original Cost</th>
                <th className="text-end" style={{ width: "160px" }}>Refund Amount</th>
                <th className="text-center" style={{ width: "60px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {refundBatch.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    No phones added to refund batch yet. Scan or search eligible IMEIs above.
                  </td>
                </tr>
              ) : (
                refundBatch.map((item, idx) => {
                  const specs = [item.storage, item.color].filter(Boolean).join(" • ");
                  const itemKey = getItemId(item);
                  return (
                    <tr key={item.stockItemId || item._id || `${item.barcode}-${idx}`}>
                      <td className="text-center font-monospace text-muted">{idx + 1}</td>
                      <td>
                        <strong className="text-dark d-block">{item.productName}</strong>
                        {specs && (
                          <span className="badge bg-light text-secondary border mt-0.5">
                            {specs}
                          </span>
                        )}
                      </td>
                      <td className="font-monospace">
                        <span className="badge bg-light text-dark border d-inline-flex align-items-center gap-1.5 py-1 px-2">
                          <span>{item.barcode}</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-link p-0 text-muted"
                            onClick={() => copyToClipboard(item.barcode)}
                            title="Copy IMEI"
                          >
                            {copiedImei === item.barcode ? (
                              <FiCheck size={11} className="text-success" />
                            ) : (
                              <FiCopy size={11} />
                            )}
                          </button>
                        </span>
                      </td>
                      <td>
                        <span className="font-monospace text-secondary small">
                          {item.invoiceNumber || "N/A"}
                        </span>
                        {item.purchaseDate && (
                          <div className="text-muted small" style={{ fontSize: "0.70rem" }}>
                            {new Date(item.purchaseDate).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="text-end font-monospace text-secondary">
                        Rs. {Number(item.purchaseCost || 0).toLocaleString()}
                      </td>
                      <td className="text-end">
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-light text-muted small">Rs.</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="form-control form-control-sm text-end fw-bold font-monospace"
                            value={item.refundAmount}
                            onChange={(e) => handleRefundAmountChange(itemKey, e.target.value)}
                          />
                        </div>
                        {item.refundAmount !== "" && !isNaN(Number(item.refundAmount)) && (
                          <div className="font-monospace text-dark fw-bold mt-0.5 text-end" style={{ fontSize: "0.74rem" }}>
                            {Number(item.refundAmount).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger p-1 rounded border-0"
                          onClick={() => handleRemoveFromBatch(itemKey)}
                          title="Remove item"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Workflow B: Replacement Purchase Entry Interface ──────────────── */}
      {workflowType === "refund_and_purchase" && (
        <>
          <div className="card border shadow-xs mb-3 border-primary border-opacity-25">
            <div className="card-header bg-primary bg-opacity-10 py-2.5 px-3 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <FiPlus className="text-primary" size={16} />
                <span className="fw-bold small text-dark">
                  Add Replacement Stock Intake (Entry Form)
                </span>
              </div>
              <span className="badge bg-primary text-white font-monospace small">
                Step 2: Add Intake
              </span>
            </div>

            <div className="card-body p-3">
              {/* Quick entry form */}
              <form onSubmit={handleAddReplacementItem} className="mb-0">
              <div className="row g-2 align-items-start mb-2">
                {/* Product / Model */}
                <div className="col-12 col-md-3">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Product / Model <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Pixel 7 Pro"
                    value={repProductName}
                    onChange={(e) => setRepProductName(e.target.value)}
                  />
                </div>

                {/* Storage with Preset Pills (Image 4) */}
                <div className="col-12 col-sm-6 col-md-3">
                  <label className="form-label small fw-semibold text-dark mb-1 d-flex align-items-center justify-content-between">
                    <span>Storage</span>
                    {repStorage && (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none text-muted"
                        style={{ fontSize: "0.68rem" }}
                        onClick={() => setRepStorage("")}
                      >
                        Clear
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. 128GB, 256GB"
                    value={repStorage}
                    onChange={(e) => setRepStorage(e.target.value)}
                    autoComplete="off"
                  />
                  {/* Quick Storage Preset Chips */}
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {STORAGE_PRESETS.map((cap) => {
                      const isSelected = (repStorage || "").trim().toLowerCase() === cap.toLowerCase();
                      return (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => setRepStorage(isSelected ? "" : cap)}
                          className={`btn btn-sm py-0 px-1.5 rounded-pill user-select-none ${
                            isSelected
                              ? "btn-dark text-white shadow-sm"
                              : "btn-outline-secondary border text-secondary bg-white"
                          }`}
                          style={{ fontSize: "0.66rem", lineHeight: "1.4" }}
                        >
                          {cap}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color with Preset Pills (Image 4) */}
                <div className="col-12 col-sm-6 col-md-3">
                  <label className="form-label small fw-semibold text-dark mb-1 d-flex align-items-center justify-content-between">
                    <span>Color</span>
                    {repColor && (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none text-muted"
                        style={{ fontSize: "0.68rem" }}
                        onClick={() => setRepColor("")}
                      >
                        Clear
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    list="rep-color-presets"
                    className="form-control form-control-sm"
                    placeholder="e.g. Obsidian, Natural Titanium"
                    value={repColor}
                    onChange={(e) => setRepColor(e.target.value)}
                    autoComplete="off"
                  />
                  <datalist id="rep-color-presets">
                    {PHONE_COLOR_PRESETS.map((col) => (
                      <option key={col} value={col} />
                    ))}
                  </datalist>
                  {/* Quick Popular Color Chips */}
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {["Black", "White", "Obsidian", "Natural Titanium", "Desert Titanium", "Hazel", "Bay"].map((col) => {
                      const isSelected = (repColor || "").trim().toLowerCase() === col.toLowerCase();
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setRepColor(isSelected ? "" : col)}
                          className={`btn btn-sm py-0 px-1.5 rounded-pill user-select-none ${
                            isSelected
                              ? "btn-dark text-white shadow-sm"
                              : "btn-outline-secondary border text-secondary bg-white"
                          }`}
                          style={{ fontSize: "0.66rem", lineHeight: "1.4" }}
                        >
                          {col}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quantity Stepper (Image 3) */}
                <div className="col-6 col-md-1">
                  <label className="form-label small fw-semibold text-dark mb-1 text-nowrap">
                    Quantity <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => handleRepQtyChange(Math.max(1, repQty - 1))}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={repQty}
                      onChange={(e) => handleRepQtyChange(e.target.value)}
                      className="form-control text-center fw-semibold px-0"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => handleRepQtyChange(repQty + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Unit Cost */}
                <div className="col-6 col-md-2">
                  <label className="form-label small fw-semibold text-secondary mb-1">Unit Cost</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-muted small">Rs.</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="form-control form-control-sm text-end font-monospace"
                      placeholder="Price"
                      value={repUnitPrice}
                      onChange={(e) => setRepUnitPrice(e.target.value)}
                    />
                  </div>
                  {repUnitPrice !== "" && !isNaN(Number(repUnitPrice)) && (
                    <div className="text-end font-monospace text-dark fw-bold mt-1" style={{ fontSize: "0.78rem" }}>
                      {Number(repUnitPrice).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic IMEIs as Quantity Increases (matching AddStock.jsx) */}
              <div className="mt-3 p-3 bg-light bg-opacity-75 rounded border">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label className="form-label small fw-semibold text-dark mb-0 d-flex align-items-center gap-1.5">
                    <FiHash size={13} className="text-primary" />
                    <span>Replacement Serialized IMEIs ({repBarcodes.filter((b) => b && b.trim().length === 15).length}/{repQty})</span>
                  </label>
                  <span className="text-muted small" style={{ fontSize: "0.72rem" }}>
                    Numeric only (15 digits). Fields add dynamically as quantity increases.
                  </span>
                </div>

                <div className="row g-2">
                  {repBarcodes.map((bcVal, idx) => {
                    const cleanBc = String(bcVal || "").trim();
                    const isComplete = cleanBc.length === 15;
                    return (
                      <div key={idx} className={repQty > 1 ? "col-12 col-sm-6 col-lg-4" : "col-12"}>
                        <div className="input-group input-group-sm">
                          <span
                            className={`input-group-text font-monospace px-2 ${
                              isComplete ? "bg-success-subtle text-success fw-bold" : "bg-white text-secondary"
                            }`}
                            style={{ fontSize: "0.72rem", minWidth: "38px" }}
                          >
                            #{idx + 1}
                          </span>
                          <input
                            ref={(el) => (repBarcodeRefs.current[idx] = el)}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={15}
                            value={bcVal}
                            onChange={(e) => handleRepBarcodeChange(idx, e.target.value)}
                            onKeyDown={(e) => handleRepBarcodeKeyDown(e, idx)}
                            onPaste={(e) => {
                              e.preventDefault();
                              const text = e.clipboardData?.getData("text") || "";
                              const digitsOnly = text.replace(/\D/g, "").slice(0, 15);
                              handleRepBarcodeChange(idx, digitsOnly);
                            }}
                            className={`form-control font-monospace ${isComplete ? "is-valid" : ""}`}
                            placeholder="Enter 15 digits only"
                            autoComplete="off"
                          />
                          <span
                            className={`input-group-text px-2 small ${
                              isComplete
                                ? "bg-success-subtle text-success fw-bold"
                                : cleanBc.length > 0
                                ? "bg-warning-subtle text-warning-emphasis"
                                : "bg-light text-muted"
                            }`}
                            style={{ fontSize: "0.7rem", minWidth: "52px", justifyContent: "center" }}
                          >
                            {cleanBc.length}/15
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Intake Button */}
              <div className="d-flex justify-content-end mt-3">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm px-4 fw-semibold d-inline-flex align-items-center gap-1.5 py-1.5 shadow-sm"
                >
                  <FiPlus size={14} />
                  <span>Add Intake</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Dedicated Card: New Stock Intake Items List with Prominent Heading ── */}
        <div className="card border shadow-xs mb-3 border-success border-opacity-25">
          <div className="card-header bg-success bg-opacity-10 py-2.5 px-3 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <FiPackage className="text-success" size={16} />
              <span className="fw-bold small text-dark">
                New Stock Intake ({replacementItems.length} {replacementItems.length === 1 ? "item" : "items"})
              </span>
            </div>

            <span className="fw-bold font-monospace text-dark small">
              Total Intake Value:{" "}
              <strong className="text-success">Rs. {replacementCartTotal.toLocaleString()}</strong>
            </span>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.82rem" }}>
              <thead className="table-light text-secondary">
                <tr>
                  <th style={{ width: "40px" }} className="text-center">#</th>
                  <th>Phone Model &amp; Specs</th>
                  <th className="text-center" style={{ width: "70px" }}>Qty</th>
                  <th className="text-end" style={{ width: "130px" }}>Unit Cost</th>
                  <th className="text-end" style={{ width: "140px" }}>Subtotal</th>
                  <th>Serialized IMEIs</th>
                  <th className="text-center" style={{ width: "60px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {replacementItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted">
                      No new replacement phones added yet. Fill the intake form above and click &quot;+ Add Intake&quot;.
                    </td>
                  </tr>
                ) : (
                  replacementItems.map((rep, idx) => {
                    const specs = [rep.storage, rep.color].filter(Boolean).join(" • ");
                    return (
                      <tr key={idx}>
                        <td className="text-center font-monospace text-muted">{idx + 1}</td>
                        <td>
                          <strong className="text-dark d-block">{rep.productName}</strong>
                          {specs && (
                            <span className="badge bg-light text-secondary border mt-0.5">
                              {specs}
                            </span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className="badge bg-dark-subtle text-dark border px-2 py-1 font-monospace">
                            {rep.quantity}
                          </span>
                        </td>
                        <td className="text-end font-monospace text-secondary">
                          Rs. {rep.unitPrice.toLocaleString()}
                        </td>
                        <td className="text-end font-monospace fw-bold text-dark">
                          Rs. {rep.subtotal.toLocaleString()}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1 align-items-center">
                            {Array.isArray(rep.barcodes) && rep.barcodes.length > 0 ? (
                              rep.barcodes.map((bc, bIdx) => (
                                <span
                                  key={bIdx}
                                  className="badge bg-light text-dark border font-monospace px-2 py-1"
                                  style={{ fontSize: "0.72rem", letterSpacing: "0.5px" }}
                                >
                                  {bc}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger p-1 border-0 rounded-circle"
                            onClick={() => handleRemoveReplacementItem(idx)}
                            title="Remove item"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}

      {/* ── Summary & Settlement Card ───────────────────────────────────────── */}
      <div className="card border shadow-xs mb-3">
        <div className="card-header bg-white border-bottom py-2.5 px-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <FiDollarSign className="text-success" size={16} />
            <span className="fw-bold small text-dark">Financial Settlement &amp; Ledger Impact</span>
          </div>
          <span className="badge bg-light text-secondary border font-monospace small">
            Real-time Credit Calculation
          </span>
        </div>

        <div className="card-body p-3">
          <div className="row g-3">
            {/* Optional Cash Paid Input (for Workflow B) */}
            {workflowType === "refund_and_purchase" && (
              <div className="col-12 col-md-5">
                <div className="p-3 rounded-2 border bg-white h-100 d-flex flex-column justify-content-between">
                  <div>
                    <label className="form-label small fw-bold text-dark d-flex align-items-center gap-1.5 mb-1">
                      <FiDollarSign size={14} className="text-success" />
                      <span>Cash Paid to Supplier (Optional)</span>
                    </label>
                    <div className="input-group input-group-sm mb-1.5">
                      <span className="input-group-text bg-light fw-bold font-monospace">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="form-control form-control-sm text-end font-monospace fw-bold"
                        placeholder="0"
                        value={cashPaid}
                        onChange={(e) => setCashPaid(e.target.value)}
                      />
                    </div>
                    {cashPaid !== "" && !isNaN(Number(cashPaid)) && (
                      <div className="text-end font-monospace text-success fw-bold mb-1.5" style={{ fontSize: "0.82rem" }}>
                        {Number(cashPaid).toLocaleString()}
                      </div>
                    )}
                    <div className="form-text text-muted" style={{ fontSize: "0.72rem", lineHeight: 1.35 }}>
                      Enter cash handed to supplier right now. <strong>Leave 0</strong> if taking replacement items <strong>100% on credit</strong>.
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-top d-flex align-items-center justify-content-between">
                    <span className="text-muted small" style={{ fontSize: "0.74rem" }}>Effective Payment:</span>
                    <span className="badge bg-light text-dark font-monospace border">
                      Rs. {numCashPaid.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Financial Ledger Balance Impact Breakdown */}
            <div className={workflowType === "refund_and_purchase" ? "col-12 col-md-7" : "col-12"}>
              <div className="p-3 rounded-2 bg-light border border-secondary-subtle">
                <div className="d-flex justify-content-between py-0.5 small">
                  <span className="text-secondary">
                    {supplierBalance > 0
                      ? "Shop pays to supplier (Old Balance):"
                      : supplierBalance < 0
                      ? "Supplier pays to shop (Old Balance):"
                      : "Settled / Balanced (Old):"}
                  </span>
                  <span className="font-monospace text-dark fw-semibold">
                    Rs. {Math.abs(supplierBalance).toLocaleString()}
                  </span>
                </div>

                <div className="d-flex justify-content-between py-0.5 small">
                  <span className="text-secondary">Returned Phones Value:</span>
                  <span className="font-monospace text-success fw-bold">
                    - Rs. {totalRefundAmount.toLocaleString()}
                  </span>
                </div>

                {workflowType === "refund_and_purchase" && (
                  <>
                    <div className="d-flex justify-content-between py-0.5 small">
                      <span className="text-secondary">New Replacement Phones:</span>
                      <span className="font-monospace text-primary fw-bold">
                        + Rs. {replacementCartTotal.toLocaleString()}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between py-0.5 small">
                      <span className="text-secondary">Cash Paid Now:</span>
                      <span className="font-monospace text-dark">
                        - Rs. {numCashPaid.toLocaleString()}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between py-0.5 small border-top border-light-subtle">
                      <span className="fw-semibold text-secondary">Exchange Difference:</span>
                      <span className="font-monospace fw-bold text-dark">
                        {netDifference > 0
                          ? `Shop pays to supplier: Rs. ${netDifference.toLocaleString()}`
                          : netDifference < 0
                          ? `Supplier pays to shop: Rs. ${Math.abs(netDifference).toLocaleString()}`
                          : "Even Exchange (Rs. 0)"}
                      </span>
                    </div>
                  </>
                )}

                <div className="d-flex justify-content-between py-1.5 border-top border-secondary-subtle fw-bold">
                  <span className="text-dark fs-6">
                    {rawProjectedBalance > 0
                      ? "Shop pays to supplier:"
                      : rawProjectedBalance < 0
                      ? "Supplier pays to shop:"
                      : "Settled / Balanced:"}
                  </span>
                  <span className="font-monospace text-dark fs-5">
                    Rs. {Math.abs(rawProjectedBalance).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-1.5 px-3 fw-semibold"
              onClick={() => {
                setRefundBatch([]);
                setReplacementItems([]);
                setStockSearchQuery("");
                setSearchFeedback(null);
                setSoldPhoneAlert(null);
              }}
            >
              Clear All
            </button>

            <button
              type="button"
              className="btn btn-dark btn-sm py-2 px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-2"
              disabled={refundBatch.length === 0 || !selectedSupplier || isSubmitting}
              onClick={handleSubmitRefund}
            >
              {isSubmitting ? (
                <span className="spinner-border spinner-border-sm" role="status" />
              ) : (
                <FiCheckCircle size={16} />
              )}
              <span>Confirm &amp; Print Voucher</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Printable Supplier Refund Receipt Modal ───────────────────────── */}
      {activeReceipt && (
        <SupplierRefundReceiptModal
          refund={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FiSearch,
  FiPrinter,
  FiRefreshCw,
  FiFileText,
  FiDollarSign,
  FiPackage,
  FiTruck,
  FiUser,
  FiRepeat,
  FiX,
  FiCalendar,
  FiFilter,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiTag,
  FiRotateCcw,
  FiShoppingCart,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiChevronDown,
  FiChevronUp,
  FiCornerDownLeft,
} from "react-icons/fi";
import api from "../api/axios";
import { usePrivacy } from "../context/PrivacyContext";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import SaleReceiptModal from "../components/sales/SaleReceiptModal";
import StockReceiptModal from "../components/add-stock/StockReceiptModal";
import ReturnReceiptModal from "../components/returns/ReturnReceiptModal";
import SupplierRefundReceiptModal from "../components/supplier-refund/SupplierRefundReceiptModal";

/**
 * Compact, Collapsible Serialized IMEI Badge List
 * Prevents bloated, multi-row table cells when items have many IMEIs (e.g. 10+ devices)
 */
function ImeiBadgeList({ barcodes = [], copiedImei, onCopyImei, maxPreview = 2 }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const validBarcodes = Array.isArray(barcodes)
    ? barcodes.filter((bc) => bc && String(bc).trim() !== "" && String(bc).toUpperCase() !== "N/A")
    : [];

  if (validBarcodes.length === 0) return null;

  const total = validBarcodes.length;
  const showToggle = total > maxPreview;
  const remaining = total - maxPreview;

  const handleCopyAll = (e) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(validBarcodes.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  };

  return (
    <div className="d-inline-flex flex-column align-items-start ms-1" style={{ maxWidth: "100%" }}>
      {/* Inline preview */}
      <div className="d-inline-flex flex-wrap align-items-center gap-1">
        {!isExpanded &&
          validBarcodes.slice(0, maxPreview).map((bc, bIdx) => (
            <div
              key={bIdx}
              className="badge bg-light text-secondary border font-monospace py-0.5 px-1.5 d-inline-flex align-items-center gap-1"
              style={{ fontSize: "0.68rem", fontWeight: "normal" }}
            >
              <span>{bc}</span>
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyImei(bc);
                }}
                title="Copy IMEI"
                style={{ width: "12px", lineHeight: 1 }}
              >
                {copiedImei === bc ? (
                  <FiCheck size={10} className="text-success" />
                ) : (
                  <FiCopy size={9} />
                )}
              </button>
            </div>
          ))}

        {showToggle && (
          <button
            type="button"
            className={`btn btn-sm py-0 px-2 rounded-pill d-inline-flex align-items-center gap-1 border shadow-xs ${
              isExpanded
                ? "btn-dark text-white fw-medium"
                : "btn-light text-dark fw-semibold bg-white border-secondary-subtle"
            }`}
            style={{ fontSize: "0.64rem", height: "20px", lineHeight: "20px" }}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            title={isExpanded ? "Collapse IMEI list" : `Show all ${total} IMEIs`}
          >
            {isExpanded ? (
              <>
                <span>Hide IMEIs</span>
                <FiChevronUp size={10} />
              </>
            ) : (
              <>
                <FiTag size={9} className="text-primary" />
                <span>+{remaining} more</span>
                <FiChevronDown size={10} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Expanded panel when user clicks '+X more' */}
      {isExpanded && (
        <div
          className="w-100 p-2 mt-1 rounded-2 border bg-light bg-opacity-75 shadow-xs"
          style={{ maxWidth: "440px" }}
        >
          <div className="d-flex align-items-center justify-content-between mb-1.5 pb-1 border-bottom border-light-subtle">
            <span className="fw-bold text-dark d-flex align-items-center gap-1" style={{ fontSize: "0.68rem" }}>
              <FiTag size={10} className="text-primary" />
              <span>All Serialized IMEIs ({total})</span>
            </span>
            <div className="d-flex align-items-center gap-1.5">
              <button
                type="button"
                className="btn btn-xs btn-outline-dark py-0 px-2 rounded d-inline-flex align-items-center gap-1 fw-semibold"
                style={{ fontSize: "0.62rem", height: "19px" }}
                onClick={handleCopyAll}
                title="Copy all IMEIs to clipboard"
              >
                {copiedAll ? (
                  <>
                    <FiCheck size={10} className="text-success" />
                    <span className="text-success">Copied All!</span>
                  </>
                ) : (
                  <>
                    <FiCopy size={9} />
                    <span>Copy All</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-link text-secondary p-0 d-inline-flex align-items-center gap-0.5 text-decoration-none"
                style={{ fontSize: "0.64rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
              >
                <FiChevronUp size={11} />
                <span>Collapse</span>
              </button>
            </div>
          </div>

          <div
            className="d-flex flex-wrap gap-1"
            style={{ maxHeight: "115px", overflowY: "auto", paddingRight: "2px" }}
          >
            {validBarcodes.map((bc, bIdx) => (
              <div
                key={bIdx}
                className="badge bg-white text-dark border border-secondary-subtle font-monospace py-0.5 px-1.5 d-inline-flex align-items-center gap-1 shadow-xs"
                style={{ fontSize: "0.66rem", fontWeight: "normal" }}
              >
                <span className="text-muted" style={{ fontSize: "0.60rem" }}>#{bIdx + 1}</span>
                <span>{bc}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyImei(bc);
                  }}
                  title="Copy IMEI"
                  style={{ width: "12px", lineHeight: 1 }}
                >
                  {copiedImei === bc ? (
                    <FiCheck size={10} className="text-success" />
                  ) : (
                    <FiCopy size={9} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function History() {
  const { isRevealed, openUnlockModal, lockMetrics } = usePrivacy();

  const location = useLocation();

  // ── Filters State ────────────────────────────────────────────────────────
  const [activeType, setActiveType] = useState(() => location.state?.defaultType || "all"); // 'all' | 'sale' | 'purchase' | 'exchange' | 'return'
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState("all"); // 'today' | 'this_week' | 'this_month' | 'all' | 'custom'
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // 'newest' | 'oldest' | 'amount_high' | 'amount_low'

  useEffect(() => {
    if (location.state?.defaultType) {
      setActiveType(location.state.defaultType);
    }
  }, [location.state?.defaultType]);

  // ── Cursor-Based Scroll & Data State ──────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Summary Stats ────────────────────────────────────────────────────────
  const [stats, setStats] = useState({
    totalSalesAmount: 0,
    totalSalesCount: 0,
    totalProfit: 0,
    totalLoss: 0,
    totalExchangesCount: 0,
    totalPurchaseAmount: 0,
    totalPurchaseCount: 0,
    totalPurchasePaid: 0,
    totalPurchaseDue: 0,
    totalRefundAmount: 0,
    totalReturnCount: 0,
  });

  // ── Modals & Expanded Rows ───────────────────────────────────────────────
  const [activeSaleReceipt, setActiveSaleReceipt] = useState(null);
  const [activeStockReceipt, setActiveStockReceipt] = useState(null);
  const [activeReturnReceipt, setActiveReturnReceipt] = useState(null);
  const [activeSupplierRefundReceipt, setActiveSupplierRefundReceipt] = useState(null);
  const [expandedImeis, setExpandedImeis] = useState(new Set());
  const [copiedImei, setCopiedImei] = useState(null);

  const abortControllerRef = useRef(null);
  const sentinelRef = useRef(null);

  // ── Date Range Calculation ───────────────────────────────────────────────
  const getDateRangeForPeriod = useCallback((selectedPeriod) => {
    const today = new Date();
    const toYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (selectedPeriod === "today") {
      const d = toYMD(today);
      return { start: d, end: d };
    }
    if (selectedPeriod === "this_week") {
      const dayOfWeek = today.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - diffToMonday);
      return { start: toYMD(monday), end: toYMD(today) };
    }
    if (selectedPeriod === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toYMD(firstDay), end: toYMD(today) };
    }
    return { start: "", end: "" };
  }, []);

  // ── Fetch Unified History (Cursor-Based) ──────────────────────────────────
  const fetchHistory = useCallback(
    async ({ cursorToFetch = null, isAppend = false } = {}) => {
      if (isAppend) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
      }

      try {
        const params = {
          type: activeType,
          limit: 25,
          sortBy,
        };

        if (cursorToFetch) {
          params.cursor = cursorToFetch;
        }

        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }

        let startDate = "";
        let endDate = "";
        if (period === "custom") {
          startDate = customStart;
          endDate = customEnd;
        } else if (period !== "all") {
          const range = getDateRangeForPeriod(period);
          startDate = range.start;
          endDate = range.end;
        }

        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;

        const res = await api.get("/history", {
          params,
          signal: isAppend ? undefined : abortControllerRef.current?.signal,
        });

        if (res.data?.success) {
          const items = res.data.data || [];
          if (isAppend) {
            setTransactions((prev) => [...prev, ...items]);
          } else {
            setTransactions(items);
          }

          if (res.data.stats) {
            setStats(res.data.stats);
          }
          if (res.data.pagination) {
            setNextCursor(res.data.pagination.nextCursor || null);
            setHasMore(Boolean(res.data.pagination.hasMore));
            setTotalCount(res.data.pagination.totalCount || 0);
          }
        }
      } catch (err) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("Error fetching unified history:", err);
        }
      } finally {
        if (isAppend) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [activeType, searchQuery, period, customStart, customEnd, sortBy, getDateRangeForPeriod]
  );

  // ── Reload when Filters change (Always resets cursor, newest on top) ──────
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHistory({ cursorToFetch: null, isAppend: false });
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchHistory]);

  // ── Load More on Scroll (Intersection Observer) ──────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore && nextCursor) {
      fetchHistory({ cursorToFetch: nextCursor, isAppend: true });
    }
  }, [isLoadingMore, isLoading, hasMore, nextCursor, fetchHistory]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          handleLoadMore();
        }
      },
      { root: null, rootMargin: "300px", threshold: 0.1 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, handleLoadMore]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const toggleImeiExpand = (id) => {
    setExpandedImeis((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyImei = (imei) => {
    if (!imei) return;
    navigator.clipboard?.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => setCopiedImei(null), 1500);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
  };

  const [loadingReceiptId, setLoadingReceiptId] = useState(null);

  // Open appropriate receipt modal based on transaction type
  const handleViewReceipt = async (tx) => {
    const isSupplierTx = tx.recordType === "purchase" || tx.recordType === "supplier_refund";
    if (isSupplierTx && tx.isLatest === false) {
      return;
    }

    if (tx.recordType === "purchase") {
      setLoadingReceiptId(tx._id);
      try {
        const res = await api.get(`/stock/purchase-history/${tx.transactionNumber || tx._id}`);
        if (res.data?.success && res.data.data?.receiptData) {
          setActiveStockReceipt(res.data.data.receiptData);
        } else {
          setActiveStockReceipt(tx.rawDoc || tx);
        }
      } catch (err) {
        console.error("Error loading purchase receipt:", err);
        setActiveStockReceipt(tx.rawDoc || tx);
      } finally {
        setLoadingReceiptId(null);
      }
    } else if (tx.recordType === "return") {
      setLoadingReceiptId(tx._id);
      try {
        let returnData = null;
        try {
          const res = await api.get(`/returns/${tx.transactionNumber || tx._id}`);
          if (res.data?.success && res.data.data) {
            returnData = res.data.data;
          }
        } catch (apiErr) {
          console.warn("Could not load return from API, using local record:", apiErr);
        }

        if (!returnData) {
          returnData = tx.rawDoc || tx;
        }

        // If exchangeItems is missing or empty, find linked exchange in loaded transactions
        if (!returnData.exchangeItems || returnData.exchangeItems.length === 0) {
          const excNum = returnData.exchangeDetails?.exchangeSaleNumber || tx.rawDoc?.exchangeDetails?.exchangeSaleNumber;
          const retNum = returnData.returnNumber || tx.transactionNumber;
          const linkedExchange = transactions.find((t) => 
            (excNum && t.transactionNumber === excNum) ||
            (retNum && t.rawDoc?.exchangeReturnNumber === retNum) ||
            (retNum && t.rawDoc?.notes?.includes(retNum))
          );
          if (linkedExchange && Array.isArray(linkedExchange.items) && linkedExchange.items.length > 0) {
            returnData = {
              ...returnData,
              exchangeItems: linkedExchange.items.map((it) => ({
                productName: it.productName,
                storage: it.storage || "",
                color: it.color || "",
                quantity: it.quantity || 1,
                sellingPrice: it.unitPrice || it.sellingPrice || 0,
                subtotal: it.subtotal || (it.unitPrice || 0) * (it.quantity || 1),
                barcodes: it.barcodes || (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
              })),
            };
          }
        }

        setActiveReturnReceipt(returnData);
      } catch (err) {
        console.error("Error loading return voucher:", err);
        setActiveReturnReceipt(tx.rawDoc || tx);
      } finally {
        setLoadingReceiptId(null);
      }
    } else if (tx.recordType === "supplier_refund") {
      if (tx.isLatest === false) {
        return;
      }
      setActiveSupplierRefundReceipt(tx.rawDoc || tx);
    } else {
      // Sale or Exchange Receipt
      setLoadingReceiptId(tx._id);
      try {
        let saleData = null;
        try {
          const res = await api.get(`/sales/${tx.transactionNumber || tx._id}`);
          if (res.data?.success && res.data.data) {
            saleData = res.data.data;
          }
        } catch (apiErr) {
          console.warn("Could not load sale from API, using local record:", apiErr);
        }

        if (!saleData) {
          saleData = tx.rawDoc ? { ...tx.rawDoc } : { ...tx };
        }

        const fallbackBillDesc =
          saleData.billDescription ||
          saleData.description ||
          tx.billDescription ||
          tx.rawDoc?.billDescription ||
          tx.description ||
          tx.rawDoc?.description ||
          "";

        // Ensure all items have storage, color, and description mapped from tx.items or rawDoc if missing
        if (Array.isArray(saleData.items)) {
          saleData.items = saleData.items.map((it, idx) => {
            const txItem = Array.isArray(tx.items) ? tx.items[idx] : null;
            const rawItem = Array.isArray(tx.rawDoc?.items) ? tx.rawDoc.items[idx] : null;
            return {
              ...it,
              storage: it.storage || txItem?.storage || rawItem?.storage || saleData.storage || "",
              color: it.color || txItem?.color || rawItem?.color || saleData.color || "",
              description: it.description || txItem?.description || rawItem?.description || fallbackBillDesc || "",
            };
          });
        }

        if (!saleData.billDescription) {
          saleData.billDescription = fallbackBillDesc;
        }
        if (!saleData.description) {
          saleData.description = fallbackBillDesc;
        }

        setActiveSaleReceipt(saleData);
      } catch (err) {
        console.error("Error loading sale receipt:", err);
        setActiveSaleReceipt(tx.rawDoc || tx);
      } finally {
        setLoadingReceiptId(null);
      }
    }
  };

  // Get shopkeeper name if this transaction originated from consignment/other shopkeeper
  const getShopkeeperName = (tx) => {
    if (!tx) return "";
    if (tx.shopkeeperName && tx.shopkeeperName.trim()) return tx.shopkeeperName.trim();
    if (tx.rawDoc?.shopkeeperName && tx.rawDoc.shopkeeperName.trim()) return tx.rawDoc.shopkeeperName.trim();
    if (Array.isArray(tx.items)) {
      const itemWithSk = tx.items.find((it) => it.shopkeeperName && it.shopkeeperName.trim());
      if (itemWithSk) return itemWithSk.shopkeeperName.trim();
    }
    if (Array.isArray(tx.rawDoc?.items)) {
      const rawWithSk = tx.rawDoc.items.find((it) => it.shopkeeperName && it.shopkeeperName.trim());
      if (rawWithSk) return rawWithSk.shopkeeperName.trim();
    }
    if (tx.rawDoc?.saleId?.shopkeeperName) return tx.rawDoc.saleId.shopkeeperName.trim();
    return "";
  };

  // Decent, cohesive type badge for all transaction types (no ugly loud blue/red/black)
  const getTypeBadge = (tx) => {
    const skName = getShopkeeperName(tx);
    const isSk = Boolean(skName || tx.saleSource === "shopkeeper" || tx.isShopkeeper);

    let label = "SALE";
    if (isSk) {
      label = "SALE BY OTHER SHOPKEEPER";
    } else if (tx.recordType === "exchange") {
      label = "EXCHANGE";
    } else if (tx.recordType === "purchase") {
      label = tx.isLocalPurchase ? "LOCAL IN" : "STOCK IN";
    } else if (tx.recordType === "return") {
      label = "REFUND";
    } else if (tx.recordType === "supplier_refund") {
      label = "SUPPLIER RETURN";
    }

    return {
      label,
      style: {
        backgroundColor: "#f1f5f9",
        color: "#334155",
        borderColor: "#cbd5e1",
        fontSize: "0.66rem",
        fontWeight: "700",
        letterSpacing: "0.4px",
      },
      className: "badge rounded-pill px-2.5 py-0.5 border font-monospace",
    };
  };

  return (
    <div className="container-fluid px-2 px-md-4 py-3">
      {/* ── TOP ACTION & HEADER BAR ────────────────────────────────────────── */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-3">
        <div>
          <h4 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
            <FiClock className="text-dark" />
            <span>History</span>
          </h4>
          <p className="text-muted small mb-0">
            Unified chronological audit trail for all phone sales, stock purchases, trade-in exchanges, and refunds.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Quick Period Selector */}
          <div className="btn-group btn-group-sm bg-white border rounded-2 p-0.5 shadow-sm">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm py-1 px-2.5 rounded-1 fw-semibold ${
                  period === p.id ? "btn-dark text-white" : "btn-light text-secondary border-0"
                }`}
                style={{ fontSize: "0.74rem" }}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Privacy Toggle Button */}
          {isRevealed ? (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-1 px-2.5 rounded-2 d-inline-flex align-items-center gap-1.5"
              onClick={lockMetrics}
              title="Lock and hide financial profit metrics"
              style={{ fontSize: "0.74rem" }}
            >
              <FiEye size={13} />
              <span>Lock Metrics</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-dark btn-sm py-1 px-2.5 rounded-2 d-inline-flex align-items-center gap-1.5 shadow-sm"
              onClick={openUnlockModal}
              title="Enter password to reveal financial profit metrics"
              style={{ fontSize: "0.74rem" }}
            >
              <FiEye size={13} />
              <span>Reveal Metrics</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline-dark btn-sm py-1 px-2.5 rounded-2 d-inline-flex align-items-center gap-1"
            onClick={() => fetchHistory({ cursorToFetch: null, isAppend: false })}
            disabled={isLoading}
            style={{ fontSize: "0.74rem" }}
          >
            <FiRefreshCw size={13} className={isLoading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── CUSTOM DATE PICKER ROW (Only if custom period selected) ─────────── */}
      {period === "custom" && (
        <div className="card border-0 bg-white shadow-sm rounded-2 p-2.5 mb-3">
          <div className="row g-2 align-items-center">
            <div className="col-12 col-sm-auto">
              <span className="small fw-semibold text-secondary d-flex align-items-center gap-1">
                <FiCalendar size={13} /> Custom Date Filter:
              </span>
            </div>
            <div className="col-6 col-sm-auto">
              <input
                type="date"
                className="form-control form-control-sm"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ fontSize: "0.75rem" }}
              />
            </div>
            <div className="col-auto text-muted small">to</div>
            <div className="col-6 col-sm-auto">
              <input
                type="date"
                className="form-control form-control-sm"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ fontSize: "0.75rem" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── AGGREGATE SUMMARY CARDS ────────────────────────────────────────── */}
      <div className="row g-2 mb-3">
        {/* Sales Volume */}
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-white shadow-sm rounded-2 p-2.5 h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium">Total Sales</span>
              <div className="p-1 rounded bg-dark-subtle text-dark">
                <FiShoppingCart size={13} />
              </div>
            </div>
            <h6 className="fw-bold text-dark mb-0 font-monospace">
              PKR {stats.totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </h6>
            <div className="d-flex align-items-center gap-2 mt-1">
              <span className="text-muted small" style={{ fontSize: "0.68rem" }}>
                {stats.totalSalesCount} bills
              </span>
              {isRevealed && (
                <span className="text-success small fw-semibold" style={{ fontSize: "0.68rem" }}>
                  +PKR {(stats.totalProfit - stats.totalLoss).toLocaleString()} net
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stock Purchases */}
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-white shadow-sm rounded-2 p-2.5 h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium">Stock Added (Cost)</span>
              <div className="p-1 rounded bg-primary-subtle text-primary">
                <FiPackage size={13} />
              </div>
            </div>
            <h6 className="fw-bold text-dark mb-0 font-monospace">
              PKR {stats.totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </h6>
            <span className="text-muted small mt-1 d-block" style={{ fontSize: "0.68rem" }}>
              {stats.totalPurchaseCount} batches • Paid: PKR {stats.totalPurchasePaid.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Exchanges */}
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-white shadow-sm rounded-2 p-2.5 h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium">Exchanges</span>
              <div className="p-1 rounded bg-secondary-subtle text-secondary">
                <FiRepeat size={13} />
              </div>
            </div>
            <h6 className="fw-bold text-dark mb-0 font-monospace">
              {stats.totalExchangesCount} Transactions
            </h6>
            <span className="text-muted small mt-1 d-block" style={{ fontSize: "0.68rem" }}>
              Trade-ins & phone swaps
            </span>
          </div>
        </div>

        {/* Returns & Refunds */}
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-white shadow-sm rounded-2 p-2.5 h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium">Returns & Refunds</span>
              <div className="p-1 rounded bg-danger-subtle text-danger">
                <FiRotateCcw size={13} />
              </div>
            </div>
            <h6 className="fw-bold text-danger mb-0 font-monospace">
              PKR {stats.totalRefundAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </h6>
            <span className="text-muted small mt-1 d-block" style={{ fontSize: "0.68rem" }}>
              {stats.totalReturnCount} refund items
            </span>
          </div>
        </div>
      </div>

      {/* ── FILTER TABS & SEARCH BAR ────────────────────────────────────────── */}
      <div className="card border-0 bg-white shadow-sm rounded-2 p-3 mb-3">
        <div className="d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center justify-content-between gap-2.5">
          {/* Type Filter Pills */}
          <div className="d-flex align-items-center gap-1.5 flex-wrap">
            {[
              { id: "all", label: "All Activity", icon: FiClock },
              { id: "sale", label: "Sales", icon: FiShoppingCart },
              { id: "purchase", label: "Stock Added", icon: FiPackage },
              { id: "exchange", label: "Exchanges", icon: FiRepeat },
              { id: "return", label: "Returns & Refunds", icon: FiRotateCcw },
              { id: "supplier_refund", label: "Supplier Returns", icon: FiCornerDownLeft },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn btn-sm py-1.5 px-3 rounded-2 fw-semibold d-inline-flex align-items-center gap-1.5 ${
                    isActive ? "btn-dark text-white" : "btn-light text-secondary border"
                  }`}
                  style={{ fontSize: "0.76rem" }}
                  onClick={() => setActiveType(tab.id)}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Input & Sort Selector */}
          <div className="d-flex align-items-center gap-2">
            <div className="input-group input-group-sm" style={{ minWidth: "260px" }}>
              <span className="input-group-text bg-white text-secondary py-1 border-end-0">
                <FiSearch size={13} />
              </span>
              <input
                type="text"
                className="form-control form-control-sm py-1 border-start-0"
                placeholder="Search phone, IEMI, invoice, customer, payment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: "0.78rem" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm py-1"
                  onClick={() => setSearchQuery("")}
                >
                  <FiX size={12} />
                </button>
              )}
            </div>

            <select
              className="form-select form-select-sm py-1"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ fontSize: "0.78rem", minWidth: "140px" }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount_high">Amount (High to Low)</option>
              <option value="amount_low">Amount (Low to High)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── UNIFIED TIMELINE TABLE ─────────────────────────────────────────── */}
      <div className="card border-0 bg-white shadow-sm rounded-2 overflow-hidden mb-3">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.82rem" }}>
            <thead className="table-light border-bottom">
              <tr>
                <th className="ps-3 py-2.5" style={{ width: "15%" }}>Type & Ref #</th>
                <th className="py-2.5" style={{ width: "16%" }}>Party / Contact</th>
                <th className="py-2.5" style={{ width: "43%" }}>Items & Serialized IMEIs</th>
                <th className="py-2.5 text-end" style={{ width: "16%" }}>Amount</th>
                <th className="py-2.5 text-center pe-3" style={{ width: "10%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-dark me-2" role="status" />
                    <span>Loading latest transaction records...</span>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-5 text-muted">
                    <FiClock size={28} className="text-secondary opacity-50 mb-2 d-block mx-auto" />
                    <h6 className="fw-bold text-dark mb-1">No Transactions Found</h6>
                    <p className="small text-muted mb-0">
                      {searchQuery
                        ? `No records matching "${searchQuery}".`
                        : "No transaction records recorded for this filter."}
                    </p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isExc = tx.recordType === "exchange";
                  const isSale = tx.recordType === "sale";
                  const isPurchase = tx.recordType === "purchase";
                  const isRet = tx.recordType === "return";
                  const isSupplierRefund = tx.recordType === "supplier_refund";
                  const isSupplierTx = isPurchase || isSupplierRefund;

                  const isRefundedSale = Boolean(
                    isSale && (
                      tx.isRefunded ||
                      tx.status === "refunded" ||
                      tx.returnStatus === "refunded" ||
                      tx.rawDoc?.status === "refunded" ||
                      tx.rawDoc?.returnStatus === "refunded" ||
                      (tx.rawDoc?.returnedQuantity && tx.rawDoc?.quantity && tx.rawDoc.returnedQuantity >= tx.rawDoc.quantity)
                    )
                  );
                  const isSuperseded = (isSupplierTx && tx.isLatest === false) || isRefundedSale;

                  const typeBadge = getTypeBadge(tx);

                  return (
                    <tr key={`${tx.recordType}_${tx._id}`} className="border-bottom">
                      {/* 1. Type & Transaction Reference # */}
                      <td className="ps-3 py-2.5 align-top">
                        <div className="d-flex flex-column gap-1">
                          <span
                            className={typeBadge.className}
                            style={{ ...typeBadge.style, fontSize: "0.64rem", letterSpacing: "0.4px" }}
                          >
                            {typeBadge.label}
                          </span>
                          <div className="d-flex align-items-center gap-1">
                            <span
                              className="font-monospace fw-bold text-dark text-truncate"
                              style={{ fontSize: "0.78rem", maxWidth: "140px" }}
                              title={tx.transactionNumber}
                            >
                              {tx.transactionNumber}
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm btn-link p-0 text-secondary"
                              onClick={() => handleCopyImei(tx.transactionNumber)}
                              title="Copy Reference Number"
                              style={{ width: "18px" }}
                            >
                              {copiedImei === tx.transactionNumber ? (
                                <FiCheck size={11} className="text-success" />
                              ) : (
                                <FiCopy size={11} />
                              )}
                            </button>
                          </div>
                          {tx.originalSaleNumber && (
                            <span
                              className="text-secondary font-monospace text-truncate"
                              style={{ fontSize: "0.66rem", maxWidth: "140px" }}
                              title={`Original Sale: ${tx.originalSaleNumber}`}
                            >
                              Orig: {tx.originalSaleNumber}
                            </span>
                          )}
                          <span className="text-muted" style={{ fontSize: "0.7rem" }}>
                            {formatDate(tx.date)} • {formatTime(tx.date)}
                          </span>
                        </div>
                      </td>

                      {/* 2. Party Name (Customer or Supplier) */}
                      <td className="py-2.5 align-top">
                        <div className="d-flex align-items-center gap-1.5 mb-1">
                          {tx.partyType === "Supplier" ? (
                            <FiTruck size={13} className="text-secondary flex-shrink-0" />
                          ) : (
                            <FiUser size={13} className="text-secondary flex-shrink-0" />
                          )}
                          <span
                            className="fw-bold text-dark text-truncate"
                            style={{ fontSize: "0.82rem", maxWidth: "160px" }}
                            title={tx.partyName}
                          >
                            {tx.partyName}
                          </span>
                        </div>
                        <div className="d-flex flex-wrap align-items-center gap-1">
                          {getShopkeeperName(tx) ? (
                            <span
                              className="badge bg-light text-dark border px-1.5 py-0.5 fw-semibold"
                              style={{ fontSize: "0.64rem" }}
                              title={`Consignment sale by ${getShopkeeperName(tx)}`}
                            >
                              Sale by {getShopkeeperName(tx)}
                            </span>
                          ) : isRet ? (
                            <span
                              className={`badge border px-1.5 py-0.5 ${
                                tx.settlementType === "exchange"
                                  ? "bg-primary-subtle text-primary border-primary-subtle"
                                  : "bg-success-subtle text-success border-success-subtle"
                              }`}
                              style={{ fontSize: "0.64rem" }}
                            >
                              {tx.settlementType === "exchange" ? "Exchange" : "Cash Refund"}
                            </span>
                          ) : (
                            <span className="badge bg-light text-secondary border px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>
                              {tx.partyType}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Items & Serialized IMEIs with Decent Subtle Flow Badges */}
                      <td className="py-2.5 align-top">
                        <div className="d-flex flex-column gap-1">
                          {/* If Exchange: Show Trade-in item IN and outgoing items OUT */}
                          {isExc && tx.tradeInItem && (
                            <div className="d-flex align-items-center justify-content-between gap-2 py-0.5 border-bottom border-light-subtle pb-1">
                              <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                <span
                                  className="badge border fw-bold px-1.5 py-0.5"
                                  style={{ backgroundColor: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1", fontSize: "0.62rem" }}
                                >
                                  IN
                                </span>
                                <span className="fw-semibold text-dark" style={{ fontSize: "0.78rem" }}>
                                  {tx.tradeInItem.productName}
                                </span>
                                {(tx.tradeInItem.storage || tx.tradeInItem.color) && (
                                  <span
                                    className="badge bg-light text-secondary border font-monospace py-0.5 px-1.5"
                                    style={{ fontSize: "0.66rem", fontWeight: "600" }}
                                  >
                                    {[tx.tradeInItem.storage, tx.tradeInItem.color].filter(Boolean).join(" • ")}
                                  </span>
                                )}
                                <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                                  (Trade-in)
                                </span>
                                {tx.tradeInItem.barcodes && tx.tradeInItem.barcodes.length > 0 && (
                                  <ImeiBadgeList
                                    barcodes={tx.tradeInItem.barcodes}
                                    copiedImei={copiedImei}
                                    onCopyImei={handleCopyImei}
                                  />
                                )}
                              </div>
                              <span className="fw-semibold text-secondary font-monospace" style={{ fontSize: "0.74rem" }}>
                                Rs. {Number(tx.tradeInItem.tradeInValue || 0).toLocaleString()}
                              </span>
                            </div>
                          )}

                          {/* Standard Items List */}
                          {Array.isArray(tx.items) &&
                            tx.items.map((item, iIdx) => {
                              const isOut = item.flow === "OUT" || isSale || isExc;
                              const isRetItem = item.flow === "RETURN" || isRet;
                              const flowBadge = isRetItem
                                ? { label: "RETURN", style: { backgroundColor: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" } }
                                : isOut
                                ? { label: "OUT", style: { backgroundColor: "#f1f5f9", color: "#475569", borderColor: "#cbd5e1" } }
                                : { label: "IN", style: { backgroundColor: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" } };

                              const itemSk = item.shopkeeperName || (iIdx === 0 ? getShopkeeperName(tx) : "");

                              return (
                                <div
                                  key={iIdx}
                                  className={`d-flex align-items-center justify-content-between gap-2 py-0.5 ${
                                    iIdx > 0 ? "border-top border-light-subtle pt-1" : ""
                                  }`}
                                >
                                  <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                    <span
                                      className="badge border fw-bold px-1.5 py-0.5"
                                      style={{ ...flowBadge.style, fontSize: "0.62rem" }}
                                    >
                                      {flowBadge.label}
                                    </span>
                                    <span className="fw-semibold text-dark" style={{ fontSize: "0.78rem" }}>
                                      {item.productName}
                                    </span>
                                    {(item.storage || item.color) && (
                                      <span
                                        className="badge bg-light text-secondary border font-monospace py-0.5 px-1.5"
                                        style={{ fontSize: "0.66rem", fontWeight: "600" }}
                                      >
                                        {[item.storage, item.color].filter(Boolean).join(" • ")}
                                      </span>
                                    )}
                                    <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                                      × {item.quantity}
                                    </span>

                                    {/* Compact Collapsible Barcodes / IMEIs */}
                                    {Array.isArray(item.barcodes) && item.barcodes.length > 0 && (
                                      <ImeiBadgeList
                                        barcodes={item.barcodes}
                                        copiedImei={copiedImei}
                                        onCopyImei={handleCopyImei}
                                      />
                                    )}

                                    {itemSk && (
                                      <span
                                        className="badge bg-light text-dark border py-0.5 px-1.5 fw-semibold"
                                        style={{ fontSize: "0.64rem" }}
                                        title={`Sold via ${itemSk}`}
                                      >
                                        Sale by {itemSk}
                                      </span>
                                    )}

                                    {isRet && (item.retainedProfit > 0 || (item.originalSoldPrice && item.originalSoldPrice > item.subtotal)) && (
                                      <span className="badge bg-success-subtle text-success border border-success-subtle py-0.5 px-1.5 font-monospace" style={{ fontSize: "0.64rem" }}>
                                        +Rs. {Number(item.retainedProfit || item.originalSoldPrice - item.subtotal).toLocaleString()} fee
                                      </span>
                                    )}
                                  </div>

                                  <span className="fw-semibold text-secondary font-monospace" style={{ fontSize: "0.74rem" }}>
                                    Rs. {Number(item.subtotal || 0).toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </td>

                      {/* 4. Total Amount */}
                      <td className="py-2.5 text-end align-top">
                        <div className="d-flex flex-column align-items-end gap-1">
                          <h6 className="fw-bold text-dark mb-0 font-monospace" style={{ fontSize: "0.88rem" }}>
                            PKR {Number(tx.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </h6>

                          {/* For purchases and supplier returns: show overall supplier balance on latest bill, or settled status on older bills */}
                          {isSupplierTx ? (
                            tx.isLatest === false ? (
                              <span className="badge bg-light text-muted border px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>
                                Settled in later bill
                              </span>
                            ) : tx.totalRemainingDue > 0 ? (
                              <div className="d-flex flex-column align-items-end">
                                <span className="text-danger fw-semibold font-monospace" style={{ fontSize: "0.68rem" }}>
                                  Total Due: PKR {Number(tx.totalRemainingDue).toLocaleString()}
                                </span>
                                {tx.previousBalance > 0 && (
                                  <span className="text-muted" style={{ fontSize: "0.62rem" }}>
                                    (Incl. Rs. {Number(tx.previousBalance).toLocaleString()} prev)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="badge bg-light text-success border px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>
                                Supplier All Paid
                              </span>
                            )
                          ) : (
                            tx.amountDue > 0 && (
                              <span className="text-danger fw-semibold font-monospace" style={{ fontSize: "0.68rem" }}>
                                Due: PKR {Number(tx.amountDue).toLocaleString()}
                              </span>
                            )
                          )}

                          {isRet && (
                            <div className="d-flex flex-column align-items-end mt-0.5">
                              <span className="badge bg-light text-secondary border px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>
                                {getShopkeeperName(tx) ? "Sale by Other Shopkeeper" : "Actual Refund"}
                              </span>
                              {tx.retainedFee > 0 && (
                                <span className="text-success font-monospace" style={{ fontSize: "0.66rem" }}>
                                  (+Rs. {Number(tx.retainedFee).toLocaleString()} fee)
                                </span>
                              )}
                            </div>
                          )}

                          {/* Profit indicator for sales (masked if locked) */}
                          {isSale && (
                            <div className="mt-0.5">
                              {isRevealed ? (
                                <span
                                  className={`small fw-semibold ${tx.profit > 0 ? "text-success" : tx.loss > 0 ? "text-danger" : "text-muted"}`}
                                  style={{ fontSize: "0.68rem" }}
                                >
                                  {tx.profit > 0 ? `+PKR ${tx.profit.toLocaleString()} Profit` : tx.loss > 0 ? `-PKR ${tx.loss.toLocaleString()} Loss` : "Break-even"}
                                </span>
                              ) : (
                                <span className="text-muted small fst-italic" style={{ fontSize: "0.66rem" }}>
                                  Profit masked
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 5. Action: View / Print Receipt */}
                      <td className="py-2.5 text-center pe-3 align-top">
                        {isSuperseded ? (
                          <div className="d-flex flex-column align-items-center">
                            <button
                              type="button"
                              className="btn btn-light btn-sm py-1 px-2 rounded-2 d-inline-flex align-items-center gap-1 text-nowrap border text-muted"
                              style={{ fontSize: "0.72rem", cursor: "not-allowed", opacity: 0.55 }}
                              disabled
                              title={
                                isSupplierTx
                                  ? "Receipt printing disabled for older bills (only latest bill can be printed)"
                                  : "Receipt disabled (transaction has been refunded / superseded)"
                              }
                            >
                              <FiPrinter size={12} />
                              <span>Old Bill</span>
                            </button>
                            <span className="text-muted" style={{ fontSize: "0.60rem", marginTop: "2px" }}>
                              Superseded
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline-dark btn-sm py-1 px-2.5 rounded-2 d-inline-flex align-items-center gap-1 text-nowrap shadow-sm"
                            style={{ fontSize: "0.72rem" }}
                            onClick={() => handleViewReceipt(tx)}
                            disabled={loadingReceiptId === tx._id}
                            title={isRet || isSupplierRefund ? "View & Print Official Voucher" : "View & Print Official Transaction Receipt"}
                          >
                            {loadingReceiptId === tx._id ? (
                              <span className="spinner-border spinner-border-sm" role="status" style={{ width: 10, height: 10 }} />
                            ) : (
                              <FiPrinter size={12} />
                            )}
                            <span>{isRet || isSupplierRefund ? "Voucher" : "Receipt"}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── SENTINEL & CURSOR-BASED INFINITE SCROLL BAR ───────────────────── */}
        <div ref={sentinelRef} style={{ height: "1px" }} />

        <div className="p-3 bg-light border-top d-flex flex-column flex-sm-row align-items-center justify-content-between gap-2">
          <span className="text-muted small" style={{ fontSize: "0.74rem" }}>
            Showing <strong>{transactions.length}</strong> of <strong>{totalCount}</strong> transactions (Latest on top)
          </span>

          <div className="d-flex align-items-center gap-2">
            {isLoadingMore ? (
              <div className="d-flex align-items-center gap-2 py-1 px-3 bg-white border rounded-pill shadow-sm">
                <div className="spinner-border spinner-border-sm text-dark" role="status" style={{ width: "12px", height: "12px" }} />
                <span className="small text-secondary fw-semibold" style={{ fontSize: "0.74rem" }}>
                  Loading more transactions...
                </span>
              </div>
            ) : hasMore ? (
              <button
                type="button"
                className="btn btn-sm btn-dark py-1 px-3 rounded-pill d-inline-flex align-items-center gap-1.5 shadow-sm"
                onClick={handleLoadMore}
                style={{ fontSize: "0.74rem" }}
              >
                <span>Load More</span>
                <FiChevronDown size={13} />
              </button>
            ) : transactions.length > 0 ? (
              <span className="badge bg-white text-secondary border px-2.5 py-1.5 rounded-pill font-monospace" style={{ fontSize: "0.72rem" }}>
                ✓ All {transactions.length} transactions loaded
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── RECEIPT MODALS ─────────────────────────────────────────────────── */}
      {activeReturnReceipt && (
        <ReturnReceiptModal
          receipt={activeReturnReceipt}
          onClose={() => setActiveReturnReceipt(null)}
        />
      )}

      {activeSaleReceipt && (
        <SaleReceiptModal
          receipt={activeSaleReceipt}
          onClose={() => setActiveSaleReceipt(null)}
        />
      )}

      {activeStockReceipt && (
        <StockReceiptModal
          receiptData={activeStockReceipt}
          onClose={() => setActiveStockReceipt(null)}
        />
      )}

      {activeSupplierRefundReceipt && (
        <SupplierRefundReceiptModal
          refund={activeSupplierRefundReceipt}
          onClose={() => setActiveSupplierRefundReceipt(null)}
        />
      )}
    </div>
  );
}

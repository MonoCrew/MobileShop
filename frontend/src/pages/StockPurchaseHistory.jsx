import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  FiSearch,
  FiPrinter,
  FiDownload,
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
  FiEye,
  FiChevronLeft,
  FiChevronRight,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiPlus,
} from "react-icons/fi";
import api from "../api/axios";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import { downloadReceiptAsPdf } from "../utils/receiptDownload";
import StockReceiptModal from "../components/add-stock/StockReceiptModal";
import SaleReceiptModal from "../components/sales/SaleReceiptModal";
import Swal from "sweetalert2";

export default function StockPurchaseHistory() {
  // ── Filters State ────────────────────────────────────────────────────────
  const [activeType, setActiveType] = useState("all"); // 'all' | 'supplier_purchase' | 'local_purchase' | 'exchange'
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all"); // 'all' | 'paid' | 'partial' | 'unpaid'
  const [period, setPeriod] = useState("all"); // 'today' | 'this_week' | 'this_month' | 'custom' | 'all'
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // 'newest' | 'oldest' | 'amount_high' | 'amount_low'

  // ── Pagination State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // ── Data & Loading ───────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalStockAcquired: 0,
    totalPurchaseValue: 0,
    totalAmountPaid: 0,
    totalOutstandingPayables: 0,
    totalExchangeTransactions: 0,
  });

  // ── Modals & Expanded Rows ───────────────────────────────────────────────
  const [activeStockReceipt, setActiveStockReceipt] = useState(null);
  const [activeSaleReceipt, setActiveSaleReceipt] = useState(null);
  const [selectedTransactionDetail, setSelectedTransactionDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [expandedImeis, setExpandedImeis] = useState(new Set());
  const [copiedImei, setCopiedImei] = useState(null);

  const abortControllerRef = useRef(null);

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

  // ── Fetch Transactions ───────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const params = {
        type: activeType,
        page,
        limit,
        sortBy,
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (paymentStatus !== "all") {
        params.paymentStatus = paymentStatus;
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

      const res = await api.get("/stock/purchase-history", {
        params,
        signal: abortControllerRef.current.signal,
      });

      if (res.data?.success) {
        setTransactions(res.data.data || []);
        if (res.data.stats) {
          setStats(res.data.stats);
        }
        if (res.data.pagination) {
          setTotalCount(res.data.pagination.totalCount || 0);
          setTotalPages(res.data.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Error fetching purchase history:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    activeType,
    page,
    limit,
    sortBy,
    searchQuery,
    paymentStatus,
    period,
    customStart,
    customEnd,
    getDateRangeForPeriod,
  ]);

  // Debounced fetch on filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTransactions();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchTransactions]);

  // Reset to page 1 on filter changes
  const handleTypeChange = (newType) => {
    setActiveType(newType);
    setPage(1);
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    setPage(1);
  };

  // ── Open Receipt Handler ─────────────────────────────────────────────────
  const handleOpenReceipt = async (item) => {
    if (item.isLatestForParty === false || item.isLatest === false) {
      Swal.fire({
        icon: "info",
        title: "Print Disabled for Old Bills",
        text: "Only the latest receipt for this supplier can be printed.",
        confirmButtonColor: "#09090b",
      });
      return;
    }

    try {
      const res = await api.get(`/stock/purchase-history/${item.receiptNumber || item.id}`);
      if (res.data?.success && res.data.data) {
        const detail = res.data.data;
        if (detail.isLatest === false) {
          Swal.fire({
            icon: "info",
            title: "Print Disabled for Old Bills",
            text: "Only the latest receipt for this supplier can be printed.",
            confirmButtonColor: "#09090b",
          });
          return;
        }
        if (detail.transactionType === "exchange") {
          setActiveSaleReceipt(detail.receiptData);
        } else {
          setActiveStockReceipt(detail.receiptData);
        }
      } else {
        Swal.fire({
          icon: "error",
          title: "Receipt Error",
          text: "Could not retrieve receipt data for this transaction.",
          confirmButtonColor: "#09090b",
        });
      }
    } catch (err) {
      console.error("Error opening receipt:", err);
      Swal.fire({
        icon: "error",
        title: "Receipt Error",
        text: err.response?.data?.message || "Failed to load receipt.",
        confirmButtonColor: "#09090b",
      });
    }
  };

  // ── Open Detail Modal ────────────────────────────────────────────────────
  const handleOpenDetail = async (item) => {
    setIsLoadingDetail(true);
    try {
      const res = await api.get(`/stock/purchase-history/${item.receiptNumber || item.id}`);
      if (res.data?.success && res.data.data) {
        setSelectedTransactionDetail(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching detail:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to load transaction details.",
        confirmButtonColor: "#09090b",
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // ── Toggle Expand IMEIs ──────────────────────────────────────────────────
  const toggleExpandImei = (id) => {
    setExpandedImeis((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Copy IMEI to Clipboard ───────────────────────────────────────────────
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedImei(text);
    setTimeout(() => setCopiedImei(null), 2000);
  };

  // ── Date Formatters ───────────────────────────────────────────────────────
  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatK = (val) => {
    const n = Number(val || 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return n.toLocaleString();
  };

  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1 overflow-x-hidden">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. HEADER & TOP ACTIONS
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-3 pb-2 border-bottom">
        <div>
          <h1 className="h5 fw-bold text-dark mb-1 d-flex align-items-center gap-2">
            <FiFileText className="text-primary" size={20} />
            <span>Stock Purchase History</span>
          </h1>
          <p className="text-secondary mb-0" style={{ fontSize: "0.74rem" }}>
            Audit supplier purchases, local seller acquisitions, and trade-in exchanges.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm py-1 px-3 d-inline-flex align-items-center gap-2 shadow-sm"
            style={{ fontSize: "0.75rem" }}
            onClick={fetchTransactions}
            title="Refresh history"
          >
            <FiRefreshCw className={isLoading ? "spin-icon" : ""} size={12} />
            <span>Refresh</span>
          </button>

          <Link
            to="/add-stock"
            className="btn btn-dark btn-sm py-1 px-3 d-inline-flex align-items-center gap-2 shadow-sm"
            style={{ fontSize: "0.75rem" }}
          >
            <FiPlus size={13} />
            <span>Add Stock</span>
          </Link>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. TOP KPI SUMMARY CARDS (6 COMPACT CARDS)
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="row g-2 mb-3">
        {/* Card 1: Total Acquisitions */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className="p-1 rounded bg-primary bg-opacity-10 text-primary">
                <FiFileText size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Transactions</span>
            </div>
            <div className="fs-6 fw-bold text-dark mb-0">{stats.totalTransactions.toLocaleString()}</div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Acquisitions</span>
          </div>
        </div>

        {/* Card 2: Total Units Acquired */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className="p-1 rounded bg-info bg-opacity-10 text-info">
                <FiPackage size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Stock Units</span>
            </div>
            <div className="fs-6 fw-bold text-dark mb-0">{stats.totalStockAcquired.toLocaleString()} pcs</div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Inventory</span>
          </div>
        </div>

        {/* Card 3: Total Purchase Value */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className="p-1 rounded bg-dark bg-opacity-10 text-dark">
                <FiDollarSign size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Total Value</span>
            </div>
            <div className="fs-6 fw-bold text-dark mb-0" title={formatFullAmount(stats.totalPurchaseValue)}>
              {formatUnit(stats.totalPurchaseValue)}
            </div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Gross cost</span>
          </div>
        </div>

        {/* Card 4: Total Amount Paid */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className="p-1 rounded bg-success bg-opacity-10 text-success">
                <FiCheckCircle size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Total Paid</span>
            </div>
            <div className="fs-6 fw-bold text-success mb-0" title={formatFullAmount(stats.totalAmountPaid)}>
              {formatUnit(stats.totalAmountPaid)}
            </div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Settled</span>
          </div>
        </div>

        {/* Card 5: Total Outstanding Payables */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className={`p-1 rounded ${stats.totalOutstandingPayables > 0 ? "bg-danger bg-opacity-10 text-danger" : "bg-secondary bg-opacity-10 text-secondary"}`}>
                <FiAlertCircle size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Outstanding</span>
            </div>
            <div className={`fs-6 fw-bold mb-0 ${stats.totalOutstandingPayables > 0 ? "text-danger" : "text-muted"}`} title={formatFullAmount(stats.totalOutstandingPayables)}>
              {formatUnit(stats.totalOutstandingPayables)}
            </div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Remaining due</span>
          </div>
        </div>

        {/* Card 6: Total Exchanges */}
        <div className="col-4 col-md-2">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-2 bg-white">
            <div className="d-flex align-items-center gap-1 text-secondary mb-1">
              <span className="p-1 rounded bg-warning bg-opacity-10 text-warning">
                <FiRepeat size={13} />
              </span>
              <span className="fw-semibold text-truncate" style={{ fontSize: "0.68rem" }}>Exchanges</span>
            </div>
            <div className="fs-6 fw-bold text-dark mb-0">{stats.totalExchangeTransactions.toLocaleString()}</div>
            <span className="text-muted" style={{ fontSize: "0.64rem" }}>Trade-ins</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. FILTER BAR & TABS
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm rounded-3 mb-3 p-3 bg-white">
        {/* Type Tabs */}
        <div className="d-flex flex-wrap gap-2 mb-2 border-bottom pb-2">
          <button
            type="button"
            className={`btn btn-sm fw-semibold rounded-pill px-3 py-1 ${
              activeType === "all"
                ? "btn-dark text-white shadow-sm"
                : "btn-outline-secondary border-0 bg-light text-secondary"
            }`}
            style={{ fontSize: "0.72rem" }}
            onClick={() => handleTypeChange("all")}
          >
            All
          </button>

          <button
            type="button"
            className={`btn btn-sm fw-semibold rounded-pill px-3 py-1 d-inline-flex align-items-center gap-1 ${
              activeType === "supplier_purchase"
                ? "btn-primary text-white shadow-sm"
                : "btn-outline-secondary border-0 bg-light text-secondary"
            }`}
            style={{ fontSize: "0.72rem" }}
            onClick={() => handleTypeChange("supplier_purchase")}
          >
            <FiTruck size={12} />
            <span>Supplier</span>
          </button>

          <button
            type="button"
            className={`btn btn-sm fw-semibold rounded-pill px-3 py-1 d-inline-flex align-items-center gap-1 ${
              activeType === "local_purchase"
                ? "btn-success text-white shadow-sm"
                : "btn-outline-secondary border-0 bg-light text-secondary"
            }`}
            style={{ fontSize: "0.72rem" }}
            onClick={() => handleTypeChange("local_purchase")}
          >
            <FiUser size={12} />
            <span>Local Purchase</span>
          </button>

          <button
            type="button"
            className={`btn btn-sm fw-semibold rounded-pill px-3 py-1 d-inline-flex align-items-center gap-1 ${
              activeType === "exchange"
                ? "btn-warning text-dark shadow-sm"
                : "btn-outline-secondary border-0 bg-light text-secondary"
            }`}
            style={{ fontSize: "0.72rem" }}
            onClick={() => handleTypeChange("exchange")}
          >
            <FiRepeat size={12} />
            <span>Exchange</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="row g-2 align-items-center">
          {/* Search Box */}
          <div className="col-12 col-md-5">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted py-1 px-2">
                <FiSearch size={12} />
              </span>
              <input
                type="text"
                className="form-control form-control-sm bg-light border-start-0 py-1"
                placeholder="Search receipt #, party, model, IMEI..."
                style={{ fontSize: "0.75rem" }}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-sm btn-light border border-start-0 text-muted px-2"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  title="Clear search"
                >
                  <FiX size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Period Dropdown */}
          <div className="col-4 col-md-2">
            <select
              className="form-select form-select-sm py-1"
              style={{ fontSize: "0.74rem" }}
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Payment Status Dropdown */}
          <div className="col-4 col-md-2">
            <select
              className="form-select form-select-sm py-1"
              style={{ fontSize: "0.74rem" }}
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="col-4 col-md-2">
            <select
              className="form-select form-select-sm py-1"
              style={{ fontSize: "0.74rem" }}
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount_high">Highest Amount</option>
              <option value="amount_low">Lowest Amount</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          <div className="col-12 col-md-1 text-end">
            <button
              type="button"
              className="btn btn-light btn-sm text-secondary w-100 border py-1 px-1"
              style={{ fontSize: "0.72rem" }}
              onClick={() => {
                setActiveType("all");
                setSearchQuery("");
                setPaymentStatus("all");
                setPeriod("all");
                setCustomStart("");
                setCustomEnd("");
                setSortBy("newest");
                setPage(1);
              }}
              title="Reset all filters"
            >
              Reset
            </button>
          </div>

          {/* Custom Date Inputs if Custom selected */}
          {period === "custom" && (
            <div className="col-12 mt-1 pt-2 border-top d-flex flex-wrap align-items-center gap-2">
              <span className="small text-secondary fw-semibold" style={{ fontSize: "0.72rem" }}>From:</span>
              <input
                type="date"
                className="form-control form-control-sm py-1"
                style={{ maxWidth: "140px", fontSize: "0.74rem" }}
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setPage(1);
                }}
              />
              <span className="text-secondary small" style={{ fontSize: "0.72rem" }}>To:</span>
              <input
                type="date"
                className="form-control form-control-sm py-1"
                style={{ maxWidth: "140px", fontSize: "0.74rem" }}
                value={customEnd}
                onChange={(e) => {
                  setCustomEnd(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          4. TRANSACTIONS TABLE (COMPACT, 100% FIXED FIT, NO HORIZONTAL SCROLLBAR)
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm rounded-3 overflow-hidden bg-white mb-3">
        <div style={{ overflowX: "hidden" }}>
          <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.73rem", tableLayout: "fixed", width: "100%" }}>
            <thead className="table-light border-bottom text-secondary" style={{ fontSize: "0.68rem", letterSpacing: "0.2px" }}>
              <tr>
                <th className="ps-2 py-2" style={{ width: "12%" }}>Receipt & Type</th>
                <th className="py-2" style={{ width: "8%" }}>Date</th>
                <th className="py-2" style={{ width: "12%" }}>Party</th>
                <th className="py-2" style={{ width: "20%" }}>Product / IMEI</th>
                <th className="py-2 text-center" style={{ width: "4%" }}>Qty</th>
                <th className="py-2 text-end" style={{ width: "10%" }}>Total</th>
                <th className="py-2 text-end" style={{ width: "10%" }}>Paid</th>
                <th className="py-2 text-end" style={{ width: "10%" }}>Due</th>
                <th className="py-2 text-center" style={{ width: "6%" }}>Status</th>
                <th className="pe-2 py-2 text-center" style={{ width: "8%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="10" className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-dark me-2" role="status" />
                    <span className="text-secondary small">Loading purchase records...</span>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-4">
                    <div className="d-flex flex-column align-items-center justify-content-center">
                      <FiPackage size={28} className="text-muted mb-1 opacity-50" />
                      <div className="fw-semibold text-secondary small">No stock acquisition records found</div>
                      <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                        Try adjusting your filters, search term, or date range.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((item) => {
                  const isSupplier = item.transactionType === "supplier_purchase";
                  const isLocal = item.transactionType === "local_purchase";
                  const isExchange = item.transactionType === "exchange";

                  const allImeis = (item.itemsSummary || []).flatMap((it) => it.barcodes || []).filter(Boolean);

                  return (
                    <tr key={item.id} className="align-middle">
                      {/* 1. Receipt # & Type combined */}
                      <td className="ps-2 py-2">
                        {item.isLatestForParty !== false ? (
                          <button
                            type="button"
                            className="btn btn-link p-0 text-decoration-none fw-bold text-dark font-monospace text-truncate d-block"
                            style={{ fontSize: "0.73rem", maxWidth: "120px" }}
                            onClick={() => handleOpenReceipt(item)}
                            title={`Click to view receipt: ${item.receiptNumber}`}
                          >
                            {item.receiptNumber}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-link p-0 text-decoration-none fw-bold text-secondary font-monospace text-truncate d-block"
                            style={{ fontSize: "0.73rem", maxWidth: "120px" }}
                            onClick={() => handleOpenDetail(item)}
                            title={`View details: ${item.receiptNumber}`}
                          >
                            {item.receiptNumber}
                          </button>
                        )}
                        <div className="mt-1">
                          {isSupplier && (
                            <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-1 py-0 rounded-pill fw-semibold" style={{ fontSize: "0.58rem" }}>
                              <FiTruck className="me-1" size={8} /> Supplier
                            </span>
                          )}
                          {isLocal && (
                            <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-1 py-0 rounded-pill fw-semibold" style={{ fontSize: "0.58rem" }}>
                              <FiUser className="me-1" size={8} /> Local
                            </span>
                          )}
                          {isExchange && (
                            <span className="badge bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25 px-1 py-0 rounded-pill fw-semibold" style={{ fontSize: "0.58rem" }}>
                              <FiRepeat className="me-1" size={8} /> Exchange
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Date */}
                      <td className="py-2 text-secondary">
                        <div style={{ fontSize: "0.70rem" }}>
                          {new Date(item.date).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}
                        </div>
                        <div className="text-muted" style={{ fontSize: "0.62rem" }}>
                          {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      {/* 3. Party Details */}
                      <td className="py-2">
                        <div className="fw-semibold text-dark text-truncate" style={{ maxWidth: "115px", fontSize: "0.73rem" }} title={item.party?.name || "—"}>
                          {item.party?.name || "—"}
                        </div>
                        {item.party?.phone && (
                          <div className="text-muted text-truncate" style={{ fontSize: "0.63rem", maxWidth: "115px" }}>
                            {item.party.phone}
                          </div>
                        )}
                      </td>

                      {/* 4. Product Details */}
                      <td className="py-2">
                        {isExchange && item.exchangeDetails ? (
                          <div className="d-flex flex-column gap-1" style={{ fontSize: "0.70rem" }}>
                            {/* Device Received */}
                            <div className="text-truncate" style={{ maxWidth: "170px" }} title={`IN: ${item.exchangeDetails.receivedDevice?.productName} (${formatK(item.exchangeDetails.receivedDevice?.agreedValue)})`}>
                              <span className="badge bg-success text-white py-0 px-1 me-1" style={{ fontSize: "0.56rem" }}>IN</span>
                              <span className="fw-semibold text-dark">
                                {item.exchangeDetails.receivedDevice?.productName}
                              </span>
                              <span className="text-muted ms-1" style={{ fontSize: "0.65rem" }}>
                                ({formatK(item.exchangeDetails.receivedDevice?.agreedValue)})
                              </span>
                            </div>

                            {/* Device Given */}
                            <div className="text-muted text-truncate" style={{ maxWidth: "170px", fontSize: "0.65rem" }} title={`OUT: ${item.exchangeDetails.givenDevices?.map((g) => g.productName).join(", ")}`}>
                              <span className="badge bg-secondary text-white py-0 px-1 me-1" style={{ fontSize: "0.56rem" }}>OUT</span>
                              <span>
                                {item.exchangeDetails.givenDevices?.map((g) => g.productName).join(", ")}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="fw-semibold text-dark text-truncate" style={{ maxWidth: "170px", fontSize: "0.73rem" }} title={(item.itemsSummary || []).map((it) => it.productName).join(", ")}>
                              {(item.itemsSummary || []).map((it) => it.productName).join(", ")}
                            </div>
                            {/* Primary IMEI badge */}
                            {allImeis.length > 0 && (
                              <div className="d-flex align-items-center gap-1 mt-1">
                                <span
                                  className="badge bg-light text-secondary border font-monospace py-0 px-1 text-truncate"
                                  style={{ fontSize: "0.63rem", maxWidth: "110px", cursor: "pointer" }}
                                  title={`Click to copy: ${allImeis[0]}`}
                                  onClick={() => handleCopy(allImeis[0])}
                                >
                                  {allImeis[0]}
                                  {copiedImei === allImeis[0] ? (
                                    <FiCheck className="text-success ms-1" size={8} />
                                  ) : (
                                    <FiCopy className="opacity-50 ms-1" size={8} />
                                  )}
                                </span>

                                {allImeis.length > 1 && (
                                  <span className="badge bg-secondary-subtle text-secondary py-0 px-1" style={{ fontSize: "0.56rem" }}>
                                    +{allImeis.length - 1}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Quantity */}
                      <td className="py-2 text-center fw-semibold" style={{ fontSize: "0.73rem" }}>
                        {item.totalQuantity || 1}
                      </td>

                      {/* 6. Total Value */}
                      <td className="py-2 text-end fw-bold text-dark text-truncate" style={{ fontSize: "0.74rem" }}>
                        Rs. {Number(item.totalAmount || 0).toLocaleString()}
                      </td>

                      {/* 7. Paid Amount */}
                      <td className="py-2 text-end text-success fw-semibold text-truncate" style={{ fontSize: "0.74rem" }}>
                        Rs. {Number(item.amountPaid || 0).toLocaleString()}
                      </td>

                      {/* 8. Outstanding Balance */}
                      <td className="py-2 text-end text-nowrap" style={{ fontSize: "0.74rem" }}>
                        {item.amountDue > 0 ? (
                          <span className="fw-bold text-danger">
                            Rs. {Number(item.amountDue).toLocaleString()}
                          </span>
                        ) : (
                          <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-1 py-0 rounded" style={{ fontSize: "0.62rem" }}>
                            Rs. 0
                          </span>
                        )}
                      </td>

                      {/* 9. Payment Status Badge */}
                      <td className="py-2 text-center text-nowrap">
                        <span
                          className={`badge text-uppercase fw-semibold px-2 py-0 rounded-pill ${
                            item.paymentStatus === "paid"
                              ? "bg-success bg-opacity-10 text-success border border-success border-opacity-25"
                              : item.paymentStatus === "partial"
                              ? "bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25"
                              : "bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25"
                          }`}
                          style={{ fontSize: "0.60rem" }}
                        >
                          {item.paymentStatus}
                        </span>
                      </td>

                      {/* 10. Actions */}
                      <td className="pe-2 py-2 text-center text-nowrap">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm py-1 px-2"
                            style={{ fontSize: "0.68rem" }}
                            title="View Details"
                            onClick={() => handleOpenDetail(item)}
                          >
                            <FiEye size={11} />
                          </button>

                          {item.isLatestForParty !== false ? (
                            <button
                              type="button"
                              className="btn btn-outline-dark btn-sm py-1 px-2"
                              style={{ fontSize: "0.68rem" }}
                              title="Print / View Receipt"
                              onClick={() => handleOpenReceipt(item)}
                            >
                              <FiPrinter size={11} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm py-1 px-2"
                              style={{ fontSize: "0.68rem", opacity: 0.3, cursor: "not-allowed" }}
                              disabled
                              title="Receipt printing disabled for older bills (only latest bill can be printed)"
                            >
                              <FiPrinter size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────────────
            5. SERVER-SIDE PAGINATION CONTROLS
           ───────────────────────────────────────────────────────────────────────────── */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 p-3 border-top bg-light">
          <div className="d-flex align-items-center gap-2 text-secondary small">
            <span>
              Showing{" "}
              <strong>
                {totalCount === 0 ? 0 : (page - 1) * limit + 1} -{" "}
                {Math.min(page * limit, totalCount)}
              </strong>{" "}
              of <strong>{totalCount}</strong> transactions
            </span>

            <span className="ms-3">Rows per page:</span>
            <select
              className="form-select form-select-sm d-inline-block w-auto"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>

          <div className="d-flex align-items-center gap-1">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              <FiChevronLeft size={14} />
              <span className="d-none d-sm-inline ms-1">Prev</span>
            </button>

            <span className="px-2 small text-secondary">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              <span className="d-none d-sm-inline me-1">Next</span>
              <FiChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          6. TRANSACTION DETAIL MODAL
         ───────────────────────────────────────────────────────────────────────────── */}
      {selectedTransactionDetail && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content shadow-lg border-0 rounded-3">
              {/* Modal Header */}
              <div className="modal-header bg-dark text-white py-2 px-3">
                <div className="d-flex align-items-center gap-2">
                  <FiFileText size={18} />
                  <h5 className="modal-title h6 fw-bold mb-0">
                    Acquisition Transaction Details: {selectedTransactionDetail.receiptNumber}
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setSelectedTransactionDetail(null)}
                />
              </div>

              {/* Modal Body */}
              <div className="modal-body p-3">
                {/* Party and Date Overview */}
                <div className="row g-2 mb-3">
                  <div className="col-12 col-md-6">
                    <div className="p-3 rounded border bg-light h-100">
                      <div className="text-secondary small fw-bold text-uppercase mb-1">
                        {selectedTransactionDetail.party?.type === "supplier"
                          ? "Supplier Information"
                          : selectedTransactionDetail.party?.type === "seller"
                          ? "Walk-in Seller Information"
                          : "Customer Information"}
                      </div>
                      <div className="h6 fw-bold text-dark mb-1">
                        {selectedTransactionDetail.party?.name || "—"}
                      </div>
                      {selectedTransactionDetail.party?.phone && (
                        <div className="small text-secondary">
                          Phone: <strong>{selectedTransactionDetail.party.phone}</strong>
                        </div>
                      )}
                      {selectedTransactionDetail.party?.email && (
                        <div className="small text-secondary">
                          Email: {selectedTransactionDetail.party.email}
                        </div>
                      )}
                      {selectedTransactionDetail.party?.address && (
                        <div className="small text-secondary">
                          Address: {selectedTransactionDetail.party.address}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <div className="p-3 rounded border bg-light h-100">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="text-secondary small fw-bold text-uppercase">
                          Cash &amp; Credit Ledger Breakdown
                        </span>
                        <span
                          className={`badge text-uppercase px-2 py-1 rounded-pill ${
                            (selectedTransactionDetail.paymentStatus || "").toLowerCase() === "paid"
                              ? "bg-success bg-opacity-10 text-success border border-success border-opacity-25"
                              : (selectedTransactionDetail.paymentStatus || "").toLowerCase() === "partial"
                              ? "bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25"
                              : "bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25"
                          }`}
                          style={{ fontSize: "0.62rem" }}
                        >
                          {selectedTransactionDetail.paymentStatus || "UNPAID"}
                        </span>
                      </div>

                      {/* 1. This Purchase Amount */}
                      <div className="d-flex justify-content-between small py-1 border-bottom">
                        <span className="text-secondary">This Purchase (Shop Pays):</span>
                        <strong className="text-dark">
                          Rs. {Number(selectedTransactionDetail.totalAmount || 0).toLocaleString()}
                        </strong>
                      </div>

                      {/* 2. Previous Balance */}
                      <div className="d-flex justify-content-between small py-1 border-bottom">
                        <span className="text-secondary">Previous Balance (Shop Owes):</span>
                        <strong className="text-dark">
                          Rs. {Number(selectedTransactionDetail.previousBalance || 0).toLocaleString()}
                        </strong>
                      </div>

                      {/* 3. Total Payable Box */}
                      <div className="p-2 my-1 bg-white rounded border border-dark border-opacity-25">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-bold text-dark" style={{ fontSize: "0.80rem" }}>
                              Total Payable
                            </div>
                            <div className="text-secondary" style={{ fontSize: "0.62rem" }}>
                              (Shop Pays)
                            </div>
                          </div>
                          <strong className="text-dark fs-6">
                            Rs. {Number(
                              selectedTransactionDetail.totalPayable != null
                                ? selectedTransactionDetail.totalPayable
                                : Number(selectedTransactionDetail.previousBalance || 0) +
                                    Number(selectedTransactionDetail.totalAmount || 0)
                            ).toLocaleString()}
                          </strong>
                        </div>
                      </div>

                      {/* 4. Amount Paid */}
                      <div className="d-flex justify-content-between small py-1 border-bottom">
                        <span className="text-secondary">Amount Paid (Shop Paid):</span>
                        <strong className="text-success">
                          Rs. {Number(selectedTransactionDetail.amountPaid || 0).toLocaleString()}
                        </strong>
                      </div>

                      {/* 5. Remaining Due on this Bill */}
                      <div className="d-flex justify-content-between small py-1 border-bottom">
                        <span className="text-secondary">Remaining Due on this Bill:</span>
                        <strong className="text-danger">
                          Rs. {Number(
                            selectedTransactionDetail.totalRemainingAmount != null
                              ? selectedTransactionDetail.totalRemainingAmount
                              : Number(selectedTransactionDetail.previousBalance || 0) +
                                  Number(selectedTransactionDetail.amountDue || 0)
                          ).toLocaleString()}
                        </strong>
                      </div>

                      {/* 6. All-Time Supplier Balance */}
                      {selectedTransactionDetail.currentBalanceDue != null && (
                        <div className="d-flex justify-content-between small py-1 pt-2">
                          <span className="text-dark fw-bold">All-Time Balance (Shop Owes):</span>
                          <strong
                            className={
                              Number(selectedTransactionDetail.currentBalanceDue) > 0
                                ? "text-danger fw-bold"
                                : "text-success fw-bold"
                            }
                          >
                            Rs. {Number(selectedTransactionDetail.currentBalanceDue).toLocaleString()}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Purchased / Acquired Table */}
                <div className="mb-2">
                  <h6 className="fw-bold text-dark mb-2 small text-uppercase">
                    Stock Line Items Acquired
                  </h6>
                  <div className="table-responsive border rounded">
                    <table className="table table-sm align-middle mb-0" style={{ fontSize: "0.80rem" }}>
                      <thead className="table-light">
                        <tr>
                          <th>Item Name</th>
                          <th>Category</th>
                          <th className="text-center">Qty</th>
                          <th className="text-end">Unit Cost</th>
                          <th className="text-end">Subtotal</th>
                          <th>IMEIs / Barcodes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedTransactionDetail.items || []).map((it, idx) => (
                          <tr key={idx}>
                            <td className="fw-semibold text-dark">
                              <span>{it.productName}</span>
                              {(it.storage || it.color) && (
                                <span
                                  className="badge bg-secondary-subtle text-dark border ms-1"
                                  style={{ fontSize: "0.68rem" }}
                                >
                                  {[it.storage, it.color].filter(Boolean).join(" • ")}
                                </span>
                              )}
                            </td>
                            <td className="text-secondary">{it.category || "General"}</td>
                            <td className="text-center">{it.quantity}</td>
                            <td className="text-end">Rs. {Number(it.unitPrice || 0).toLocaleString()}</td>
                            <td className="text-end fw-bold">
                              Rs. {Number(it.subtotal != null ? it.subtotal : it.unitPrice * it.quantity).toLocaleString()}
                            </td>
                            <td>
                              <div className="d-flex flex-wrap gap-1" style={{ maxWidth: "220px", maxHeight: "65px", overflowY: "auto" }}>
                                {(it.barcodes || []).map((b, bIdx) => (
                                  <span key={bIdx} className="badge bg-light text-secondary border font-monospace" style={{ fontSize: "0.68rem" }}>
                                    {b}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-between align-items-center">
                {selectedTransactionDetail.isLatest !== false ? (
                  <button
                    type="button"
                    className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2 shadow-sm"
                    onClick={() => {
                      handleOpenReceipt(selectedTransactionDetail);
                      setSelectedTransactionDetail(null);
                    }}
                    title="Print / View Receipt"
                  >
                    <FiPrinter size={14} />
                    <span>View Printable Receipt</span>
                  </button>
                ) : (
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm d-inline-flex align-items-center gap-2"
                      disabled
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                      title="Receipt printing disabled for older bills (only latest bill can be printed)"
                    >
                      <FiPrinter size={14} />
                      <span>Receipt Disabled (Old Bill)</span>
                    </button>
                    <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                      Only the latest bill for this supplier can be printed.
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setSelectedTransactionDetail(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          7. RECEIPT MODALS (Standard 80mm Print & Download)
         ───────────────────────────────────────────────────────────────────────────── */}
      {/* Stock Receipt Modal (for Supplier and Local Purchases) */}
      {activeStockReceipt && (
        <StockReceiptModal
          receiptData={activeStockReceipt}
          onClose={() => setActiveStockReceipt(null)}
        />
      )}

      {/* Sale Receipt Modal (for Exchange / Trade-In deals) */}
      {activeSaleReceipt && (
        <SaleReceiptModal
          receipt={activeSaleReceipt}
          onClose={() => setActiveSaleReceipt(null)}
        />
      )}
    </div>
  );
}

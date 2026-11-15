import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  FiSearch,
  FiPrinter,
  FiRefreshCw,
  FiFileText,
  FiDollarSign,
  FiPackage,
  FiX,
  FiTag,
  FiChevronDown,
  FiChevronUp,
  FiEyeOff,
  FiLock,
  FiUsers,
  FiRotateCcw,
  FiRepeat,
} from "react-icons/fi";
import api from "../api/axios";
import { usePrivacy } from "../context/PrivacyContext";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import SaleReceiptModal from "../components/sales/SaleReceiptModal";

export default function SalesHistory() {
  const { isRevealed, openUnlockModal, lockMetrics } = usePrivacy();
  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [profitStatus, setProfitStatus] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Data & Pagination
  const [sales, setSales] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Aggregated Stats
  const [stats, setStats] = useState({
    totalSales: 0,
    totalCost: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
    totalItemsSold: 0,
    totalTransactions: 0,
  });

  // Receipt modal
  const [activeReceipt, setActiveReceipt] = useState(null);

  // Expanded barcode rows in the table (Set of sale._id)
  const [expandedBarcodes, setExpandedBarcodes] = useState(new Set());
  const [copiedImei, setCopiedImei] = useState(null);
  
  const abortControllerRef = useRef(null);

  // ── Fetch sales records ──────────────────────────────────────────────────
  const fetchSales = useCallback(
    async (cursorVal = null, append = false) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      if (abortControllerRef.current && !append) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const params = { limit: 30, sortBy, period };
        if (searchQuery.trim()) params.search = searchQuery.trim();
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
        if (profitStatus !== "all") params.profitStatus = profitStatus;
        if (cursorVal) params.cursor = cursorVal;

        const res = await api.get("/sales", {
          params,
          signal: abortControllerRef.current.signal,
        });

        if (res.data?.success) {
          const list = res.data.data || [];
          const pagination = res.data.pagination || {};

          setSales((prev) => (append ? [...prev, ...list] : list));
          setNextCursor(pagination.nextCursor || null);
          setHasMore(Boolean(pagination.hasMore));
          if (!cursorVal) setTotalCount(pagination.totalCount || list.length);
        }
      } catch (err) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("Error fetching sales history:", err);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [searchQuery, period, customStart, customEnd, profitStatus, sortBy]
  );

  // ── Fetch Stats ────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const params = { period };
      if (customStart) params.startDate = customStart;
      if (customEnd) params.endDate = customEnd;

      const res = await api.get("/sales/stats", { params });
      if (res.data?.success && res.data.data) setStats(res.data.data);
    } catch (err) {
      console.error("Error fetching sales stats:", err);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSales(null, false);
      fetchStats();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchSales, fetchStats]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** Collect all unique barcodes sold across a sale (multi-item or single). */
  const getSaleBarcodes = (sale) => {
    if (Array.isArray(sale.items) && sale.items.length > 0) {
      const bcs = [];
      for (const it of sale.items) {
        if (Array.isArray(it.soldBarcodes)) bcs.push(...it.soldBarcodes);
        else if (it.barcode && it.barcode.toUpperCase() !== "N/A") bcs.push(it.barcode);
      }
      return [...new Set(bcs)].filter(Boolean);
    }
    if (Array.isArray(sale.soldBarcodes) && sale.soldBarcodes.length > 0) return sale.soldBarcodes;
    if (sale.barcode && sale.barcode.toUpperCase() !== "N/A") return [sale.barcode];
    return [];
  };

  /** Display name for a sale row — summarises multi-item sales. */
  const getSaleDisplayName = (sale) => {
    if (Array.isArray(sale.items) && sale.items.length > 1) {
      return `${sale.items[0]?.productName} + ${sale.items.length - 1} more`;
    }
    return sale.productName || sale.items?.[0]?.productName || "—";
  };

  const formatK = (val) => {
    const n = Number(val || 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return n.toLocaleString();
  };

  /** Check if a transaction is from another shopkeeper */
  const isShopkeeperSale = (sale) => {
    if (!sale) return false;
    if (sale.saleSource === "shopkeeper") return true;
    if (sale.shopkeeperId || sale.shopkeeperTransferId) return true;
    if (
      Array.isArray(sale.items) &&
      sale.items.some(
        (it) =>
          it.saleSource === "shopkeeper" ||
          it.shopkeeperId ||
          it.shopkeeperTransferId ||
          (it.shopkeeperName && it.shopkeeperName.trim())
      )
    ) {
      return true;
    }
    return false;
  };

  /** Check if a sale is a customer exchange / trade-in transaction */
  const isExchangeSale = (sale) => {
    if (!sale) return false;
    if (sale.isExchange) return true;
    if (sale.exchangeReturnNumber) return true;
    if (sale.saleNumber && sale.saleNumber.includes("-EXC-")) return true;
    if (sale.tradeInItem && (sale.tradeInItem.productName || sale.tradeInItem.barcode)) return true;
    if (sale.notes && (sale.notes.includes("Trade-in") || sale.notes.includes("Local Purchase:") || sale.notes.includes("Exchange purchase against Return"))) return true;
    return false;
  };

  /** Extract structured trade-in exchange details */
  const getExchangeDetails = (sale) => {
    if (!sale) {
      return {
        customerName: "",
        returnNumber: "",
        originalSaleNumber: "",
        returnedItems: [],
        newItems: [],
        takenItemName: "",
        takenBarcode: "",
        takenBarcodes: [],
        takenQty: 1,
        takenPrice: 0,
        myPrice: 0,
        netDiff: 0,
      };
    }

    let customerName = (sale.customerName || sale.tradeInItem?.customerName || "").trim();
    let returnNumber = (sale.exchangeReturnNumber || "").trim();
    let originalSaleNumber = "";

    // Parse notes for return / sale metadata if present
    if (sale.notes) {
      const retMatch = sale.notes.match(/Return #([A-Z0-9-]+)/i);
      if (retMatch && !returnNumber) returnNumber = retMatch[1].trim();

      const origMatch = sale.notes.match(/Original Sale #:\s*([A-Z0-9-]+)/i);
      if (origMatch) originalSaleNumber = origMatch[1].trim();

      const custMatch = sale.notes.match(/Customer:\s*([^()]+)/i);
      if (custMatch && !customerName) customerName = custMatch[1].trim();
    }

    // Extract returned items list
    let returnedItems = [];
    if (Array.isArray(sale.returnedItems) && sale.returnedItems.length > 0) {
      returnedItems = sale.returnedItems.map((r) => ({
        productName: r.productName,
        barcode: r.barcode || "N/A",
        returnBarcodes: Array.isArray(r.returnBarcodes) ? r.returnBarcodes : [],
        quantity: Number(r.quantity) || 1,
        refundAmount: Number(r.refundAmount || 0),
      }));
    } else if (sale.tradeInItem && sale.tradeInItem.productName) {
      const ti = sale.tradeInItem;
      returnedItems = [
        {
          productName: ti.productName,
          barcode: ti.barcode || "N/A",
          returnBarcodes: Array.isArray(ti.barcodes) ? ti.barcodes : (ti.barcode && ti.barcode !== "N/A" ? [ti.barcode] : []),
          quantity: Number(ti.quantity) || 1,
          refundAmount: Number(ti.totalValue ?? ti.purchasePrice ?? ti.unitPrice ?? 0),
        },
      ];
    } else if (sale.notes) {
      const tradeMatch = sale.notes.match(/\(Trade-in \/ Local Purchase:\s*([^)]+)\)/i);
      const valMatch = sale.notes.match(/Original Return Value:\s*Rs\.\s*([\d.]+)/i);
      if (tradeMatch) {
        returnedItems = [
          {
            productName: tradeMatch[1].trim(),
            barcode: "N/A",
            returnBarcodes: [],
            quantity: 1,
            refundAmount: valMatch ? Number(valMatch[1]) : 0,
          },
        ];
      }
    }

    const takenItemName = returnedItems.map((r) => r.productName).filter(Boolean).join(", ") || sale.tradeInItem?.productName || "Customer Return";
    const takenBarcode = returnedItems[0]?.barcode || sale.tradeInItem?.barcode || "";
    const takenBarcodes = returnedItems.flatMap((r) => r.returnBarcodes || []);
    const takenQty = returnedItems.reduce((acc, r) => acc + (Number(r.quantity) || 1), 0) || Number(sale.tradeInItem?.quantity) || 1;

    let takenPrice = 0;
    if (sale.tradeInItem && (sale.tradeInItem.totalValue || sale.tradeInItem.purchasePrice || sale.tradeInItem.unitPrice)) {
      takenPrice = Number(sale.tradeInItem.totalValue ?? sale.tradeInItem.purchasePrice ?? sale.tradeInItem.unitPrice ?? 0);
    } else if (Number(sale.returnCredit || 0) > 0) {
      takenPrice = Number(sale.returnCredit);
    } else if (returnedItems.length > 0) {
      takenPrice = returnedItems.reduce((acc, r) => acc + (Number(r.refundAmount) || 0), 0);
    } else if (sale.notes) {
      const valMatch = sale.notes.match(/Original Return Value:\s*Rs\.\s*([\d.]+)/i);
      if (valMatch) takenPrice = Number(valMatch[1]);
    }

    // New replacement items purchased in this exchange sale
    const newItems = Array.isArray(sale.items) && sale.items.length > 0
      ? sale.items
      : [
          {
            productName: sale.productName || "New Item",
            barcode: sale.barcode || "N/A",
            soldBarcodes: Array.isArray(sale.soldBarcodes) ? sale.soldBarcodes : [],
            quantity: Number(sale.quantity) || 1,
            unitSellingPrice: Number(sale.unitSellingPrice) || Number(sale.totalAmount) || 0,
            totalAmount: Number(sale.totalAmount) || 0,
          },
        ];

    const myPrice = Number(sale.totalAmount || 0);

    // Calculate real net difference
    let netDiff = Number((myPrice - takenPrice).toFixed(2));
    if (sale.notes && (!takenPrice || takenPrice === 0)) {
      const diffMatch = sale.notes.match(/Net Difference:\s*Rs\.\s*(-?[\d.]+)/i);
      if (diffMatch) netDiff = Number(diffMatch[1]);
    }

    return {
      customerName,
      returnNumber,
      originalSaleNumber,
      returnedItems,
      newItems,
      takenItemName,
      takenBarcode,
      takenBarcodes,
      takenQty,
      takenPrice,
      myPrice,
      netDiff,
    };
  };

  /** Get shopkeeper name associated with the sale */
  const getShopkeeperName = (sale) => {
    if (!sale) return "";
    if (sale.shopkeeperName && sale.shopkeeperName.trim()) return sale.shopkeeperName.trim();
    const itemWithSk = sale.items?.find((it) => it.shopkeeperName && it.shopkeeperName.trim());
    if (itemWithSk) return itemWithSk.shopkeeperName.trim();
    return "";
  };

  /** Line items array for the receipt. */
  const getReceiptItems = (sale) => {
    if (Array.isArray(sale.items) && sale.items.length > 0) return sale.items;
    return [sale];
  };

  /** Extract all returns (or synthesize if sale marked refunded) for prepend display */
  const getSaleReturns = (sale) => {
    if (Array.isArray(sale.returns) && sale.returns.length > 0) {
      return sale.returns;
    }
    const isRefunded =
      sale.status === "refunded" ||
      sale.returnStatus === "refunded" ||
      (sale.refundedAmount != null && Number(sale.refundedAmount) > 0);

    if (isRefunded) {
      return [
        {
          _id: `synth-${sale._id}`,
          returnNumber:
            sale.exchangeReturnNumber ||
            `RET-${sale.saleNumber ? sale.saleNumber.replace(/^SALE-/, "") : String(sale._id).slice(-6)}`,
          saleNumber: sale.saleNumber,
          saleId: sale._id,
          returnDate: sale.updatedAt || sale.saleDate,
          customerName: sale.customerName,
          totalRefundAmount: sale.refundedAmount || sale.totalAmount || 0,
          totalUnitsReturned: sale.returnedQuantity || sale.quantity || 1,
          totalProfitReversed: sale.profit || 0,
          settlementType: sale.isExchange ? "exchange" : "cash_payout",
          payoutMethod: "Cash",
          reason: "Customer Refund",
          items:
            Array.isArray(sale.items) && sale.items.length > 0
              ? sale.items.map((it) => ({
                  productName: it.productName,
                  barcode: it.barcode,
                  returnBarcodes:
                    it.soldBarcodes ||
                    (it.barcode && it.barcode !== "N/A" ? [it.barcode] : []),
                  quantity: it.returnedQuantity || it.quantity,
                  returnQuantity: it.returnedQuantity || it.quantity,
                  refundAmount: it.refundedAmount || it.totalAmount,
                  actualRefundedAmount: it.refundedAmount || it.totalAmount,
                }))
              : [
                  {
                    productName: sale.productName,
                    barcode: sale.barcode,
                    returnBarcodes:
                      sale.soldBarcodes ||
                      (sale.barcode && sale.barcode !== "N/A" ? [sale.barcode] : []),
                    quantity: sale.returnedQuantity || sale.quantity,
                    returnQuantity: sale.returnedQuantity || sale.quantity,
                    refundAmount: sale.refundedAmount || sale.totalAmount,
                    actualRefundedAmount: sale.refundedAmount || sale.totalAmount,
                  },
                ],
        },
      ];
    }
    return [];
  };

  const toggleBarcodeExpand = (saleId) => {
    setExpandedBarcodes((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  const handleCopyImei = (val) => {
    if (!val || val === "N/A") return;
    navigator.clipboard.writeText(val);
    setCopiedImei(val);
    setTimeout(() => setCopiedImei(null), 1500);
  };

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1 overflow-x-hidden">
      {/* ── Stat Summary Cards ── */}
      <div className="row g-2 mb-2 flex-shrink-0">
        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white">
            <span className="text-secondary small fw-semibold d-flex align-items-center gap-2 mb-1" style={{ fontSize: "0.72rem" }}>
              <FiDollarSign size={13} className="text-primary" /><span>Total Revenue</span>
            </span>
            <div className="fs-6 fw-bold text-dark" title={formatFullAmount(stats.totalSales)}>
              {formatUnit(stats.totalSales)}
            </div>
            <span className="text-muted small" style={{ fontSize: "0.68rem" }}>{stats.totalTransactions || 0} Transactions</span>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="text-secondary small fw-semibold" style={{ fontSize: "0.72rem" }}>Gross Profit</span>
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-secondary border-0"
                onClick={isRevealed ? lockMetrics : openUnlockModal}
                title={isRevealed ? "Re-mask profit" : "Click to unlock profit"}
              >
                {isRevealed ? <FiLock size={11} className="text-dark" /> : <FiEyeOff size={11} className="text-secondary" />}
              </button>
            </div>
            <div
              className={`fs-6 fw-bold ${isRevealed ? "text-success" : "text-secondary"}`}
              title={isRevealed ? formatFullAmount(stats.totalProfit) : "Sensitive metric protected"}
              style={{ cursor: isRevealed ? "default" : "pointer" }}
              onClick={!isRevealed ? openUnlockModal : undefined}
            >
              {isRevealed ? formatUnit(stats.totalProfit, { sign: true }) : "Rs. ****"}
            </div>
            <span className="text-muted small" style={{ fontSize: "0.68rem" }}>
              Net: {isRevealed ? formatUnit(stats.netProfit) : "Rs. ****"}
            </span>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white">
            <span className="text-secondary small fw-semibold mb-1 d-block" style={{ fontSize: "0.72rem" }}>Discount / Loss</span>
            <div className="fs-6 fw-bold text-danger" title={formatFullAmount(stats.totalLoss)}>
              {formatUnit(stats.totalLoss > 0 ? -stats.totalLoss : 0)}
            </div>
            <span className="text-muted small" style={{ fontSize: "0.68rem" }}>Cost: {formatUnit(stats.totalCost)}</span>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white">
            <span className="text-secondary small fw-semibold d-flex align-items-center gap-2 mb-1" style={{ fontSize: "0.72rem" }}>
              <FiPackage size={13} className="text-secondary" /><span>Units Sold</span>
            </span>
            <div className="fs-6 fw-bold text-dark">{(stats.totalItemsSold || 0).toLocaleString()} pcs</div>
            <span className="text-muted small" style={{ fontSize: "0.68rem" }}>Avg Sale: {formatUnit(stats.averageTransactionValue)}</span>
          </div>
        </div>
      </div>

      {/* ── Main Ledger Card ── */}
      <div className="card border shadow-sm rounded-3 bg-white flex-grow-1 d-flex flex-column overflow-hidden">
        {/* Filters Header */}
        <div className="card-header bg-white border-bottom py-2 px-3 flex-shrink-0">
          <div className="row g-2 align-items-center justify-content-between">
            <div className="col-12 col-md-5">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-light text-secondary"><FiSearch size={13} /></span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by invoice #, product, IEMI, supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ fontSize: "0.78rem" }}
                />
                {searchQuery && (
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setSearchQuery("")}>
                    <FiX size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="col-12 col-md-7 d-flex flex-wrap align-items-center justify-content-md-end gap-2">
              {[
                { label: "Today", val: "today" },
                { label: "Yesterday", val: "yesterday" },
                { label: "Last 7 Days", val: "last7days" },
                { label: "This Month", val: "this_month" },
                { label: "All Time", val: "all" },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  className={`btn btn-sm py-1 px-3 rounded-pill ${period === p.val && !customStart ? "btn-dark text-white shadow-sm" : "btn-outline-secondary bg-white text-secondary"}`}
                  style={{ fontSize: "0.72rem" }}
                  onClick={() => { setPeriod(p.val); setCustomStart(""); setCustomEnd(""); }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-1 px-2 d-inline-flex align-items-center gap-1"
                style={{ fontSize: "0.72rem" }}
                onClick={() => { fetchSales(null, false); fetchStats(); }}
                title="Refresh ledger"
              >
                <FiRefreshCw size={11} /><span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Profit filter + Sort */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <span className="text-secondary small me-1" style={{ fontSize: "0.72rem" }}>Filter By Profit:</span>
              {[{ label: "All Sales", val: "all" }, { label: "Profitable", val: "profit_only" }, { label: "Discount/Loss", val: "loss_only" }].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={`btn btn-sm py-0 px-2 rounded-2 ${profitStatus === opt.val ? "btn-dark text-white" : "btn-light text-secondary border"}`}
                  style={{ fontSize: "0.7rem", height: "24px" }}
                  onClick={() => setProfitStatus(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="text-secondary small" style={{ fontSize: "0.72rem" }}>Sort:</span>
              <select
                className="form-select form-select-sm py-0 px-2"
                style={{ fontSize: "0.72rem", height: "24px", width: "auto" }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="profit_desc">Highest Profit</option>
                <option value="amount_desc">Highest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="card-body p-0 flex-grow-1 overflow-x-hidden overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-center">
              <div className="spinner-border spinner-border-sm text-dark mb-2" role="status" />
              <p className="small text-secondary mb-0">Loading sales records...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="p-5 text-center text-secondary">
              <FiFileText size={36} className="opacity-40 mb-2" />
              <h6 className="fw-bold text-dark mb-1">No Sales Transactions Found</h6>
              <p className="small text-muted mb-0">
                {searchQuery ? `No sales match "${searchQuery}".` : "No sales recorded for the selected date range."}
              </p>
            </div>
          ) : (
            <div style={{ width: "100%", overflowX: "hidden" }}>
              <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.73rem", tableLayout: "fixed", width: "100%" }}>
                <thead className="table-light text-secondary sticky-top border-bottom" style={{ fontSize: "0.68rem" }}>
                  <tr>
                    <th className="ps-2 py-2" style={{ width: "14%" }}>Invoice #</th>
                    <th className="py-2" style={{ width: "10%" }}>Date</th>
                    <th className="py-2" style={{ width: "23%" }}>Product</th>
                    <th className="py-2" style={{ width: "16%" }}>IMEI</th>
                    <th className="py-2 text-center" style={{ width: "5%" }}>Qty</th>
                    <th className="py-2 text-end" style={{ width: "11%" }}>Total</th>
                    <th className="py-2 text-center" style={{ width: "12%" }}>
                      <span className="d-inline-flex align-items-center gap-1">
                        <span>Profit / Loss</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-link p-0 text-secondary border-0 align-middle"
                          onClick={isRevealed ? lockMetrics : openUnlockModal}
                          title={isRevealed ? "Re-mask profit column" : "Click to unlock profit column"}
                        >
                          {isRevealed ? <FiLock size={11} className="text-dark" /> : <FiEyeOff size={11} className="text-secondary" />}
                        </button>
                      </span>
                    </th>
                    <th className="py-2 text-center pe-2" style={{ width: "9%" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const isProfitable = sale.profit > 0;
                    const isLoss = sale.loss > 0;
                    const allBarcodes = getSaleBarcodes(sale);
                    const isMultiItem = Array.isArray(sale.items) && sale.items.length > 1;
                    const isExpanded = expandedBarcodes.has(sale._id);
                    const isEx = isExchangeSale(sale);
                    const ex = isEx ? getExchangeDetails(sale) : null;

                    const returnsList = getSaleReturns(sale);
                    const isFullyRefunded = Boolean(
                      sale.status === "refunded" ||
                      sale.returnStatus === "refunded" ||
                      (sale.returnedQuantity && sale.quantity && sale.returnedQuantity >= sale.quantity)
                    );
                    const isPartiallyRefunded = Boolean(
                      !isFullyRefunded &&
                      (sale.returnStatus === "partial" ||
                        (sale.returnedQuantity && sale.returnedQuantity > 0))
                    );

                    return (
                      <React.Fragment key={sale._id}>
                        {/* ── PREPENDED REFUND MOVEMENTS (DIRECTLY ABOVE ORIGINAL SALE) ── */}
                        {returnsList.map((ret, rIdx) => {
                          const retQty = Number(ret.totalUnitsReturned || ret.quantity || 1);
                          const retAmount = Number(ret.totalRefundAmount || ret.refundAmount || 0);
                          const profitReversed = Number(ret.totalProfitReversed || 0);

                          const retProductNames =
                            Array.isArray(ret.items) && ret.items.length > 0
                              ? ret.items.map((i) => i.productName).filter(Boolean).join(", ")
                              : sale.productName || "Refunded Item";

                          const retBarcodes = [];
                          if (Array.isArray(ret.items)) {
                            for (const it of ret.items) {
                              if (Array.isArray(it.returnBarcodes)) retBarcodes.push(...it.returnBarcodes);
                              else if (it.barcode && it.barcode !== "N/A") retBarcodes.push(it.barcode);
                            }
                          }

                          const rDate = new Date(ret.returnDate || sale.saleDate);

                          return (
                            <tr
                              key={`refund-${ret._id || ret.returnNumber || rIdx}-${sale._id}`}
                              style={{
                                borderLeft: "3px solid #f87171",
                                backgroundColor: "#fffbfb",
                              }}
                            >
                              {/* Invoice # / Refund Ref */}
                              <td className="ps-2 py-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                <div className="d-flex align-items-center gap-1 text-truncate">
                                  <span
                                    className="badge px-1 py-0 fw-bold d-inline-flex align-items-center gap-1 flex-shrink-0"
                                    style={{
                                      backgroundColor: "#fee2e2",
                                      color: "#b91c1c",
                                      border: "1px solid #fecaca",
                                      fontSize: "0.58rem",
                                    }}
                                  >
                                    <FiRotateCcw size={7} /> REFUND
                                  </span>
                                  <span className="font-monospace fw-bold text-dark text-truncate" style={{ fontSize: "0.72rem" }}>
                                    {ret.returnNumber || "REFUND"}
                                  </span>
                                </div>
                                <div className="text-muted font-monospace text-truncate" style={{ fontSize: "0.62rem" }}>
                                  ↳ for #{sale.saleNumber}
                                </div>
                              </td>

                              {/* Date */}
                              <td className="py-2 text-dark" style={{ fontSize: "0.71rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <div className="text-truncate">{rDate.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}</div>
                                <div className="text-muted text-truncate" style={{ fontSize: "0.64rem" }}>
                                  {rDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </td>

                              {/* Product(s) */}
                              <td className="py-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                <div className="d-flex align-items-center gap-1 text-truncate">
                                  <span className="fw-semibold text-dark text-truncate" style={{ fontSize: "0.74rem" }} title={retProductNames}>
                                    {retProductNames}
                                  </span>
                                  <span
                                    className="badge px-1 py-0 flex-shrink-0"
                                    style={{
                                      backgroundColor: "#fef2f2",
                                      color: "#b91c1c",
                                      border: "1px solid #fecaca",
                                      fontSize: "0.58rem",
                                    }}
                                  >
                                    {isFullyRefunded ? "Full Return" : "Partial"}
                                  </span>
                                </div>
                                {(ret.customerName || sale.customerName) && (
                                  <div className="text-muted text-truncate" style={{ fontSize: "0.65rem" }}>
                                    Cust: <span className="text-dark fw-medium">{ret.customerName || sale.customerName}</span>
                                  </div>
                                )}
                              </td>

                              {/* IMEI */}
                              <td className="py-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {retBarcodes.length > 0 ? (
                                  <div className="d-flex align-items-center gap-1 text-truncate">
                                    <span
                                      className="badge font-monospace px-1 py-0 text-truncate"
                                      style={{
                                        backgroundColor: "#fef2f2",
                                        color: "#b91c1c",
                                        border: "1px solid #fecaca",
                                        fontSize: "0.67rem",
                                        maxWidth: "100%",
                                        cursor: "pointer",
                                      }}
                                      title={`Click to copy: ${retBarcodes[0]}`}
                                      onClick={() => handleCopyImei(retBarcodes[0])}
                                    >
                                      {retBarcodes[0]}
                                    </span>
                                    {retBarcodes.length > 1 && (
                                      <span className="badge bg-light text-danger border py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>
                                        +{retBarcodes.length - 1}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>

                              {/* Qty */}
                              <td className="py-2 text-center">
                                <span
                                  className="badge font-monospace px-2 py-0"
                                  style={{
                                    backgroundColor: "#fee2e2",
                                    color: "#b91c1c",
                                    border: "1px solid #fecaca",
                                    fontSize: "0.70rem",
                                  }}
                                >
                                  -{retQty}
                                </span>
                              </td>

                              {/* Total Amount */}
                              <td className="py-2 text-end text-nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                <div className="fw-bold font-monospace text-truncate" style={{ color: "#b91c1c", fontSize: "0.78rem" }}>
                                  -Rs. {retAmount.toLocaleString()}
                                </div>
                              </td>

                              {/* Profit / Loss */}
                              <td className="py-2 text-center text-nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {!isRevealed ? (
                                  <span
                                    role="button"
                                    onClick={openUnlockModal}
                                    className="badge bg-light text-secondary border px-2 py-1 font-monospace"
                                    style={{ cursor: "pointer", fontSize: "0.68rem" }}
                                    title="Sensitive metric protected. Click to unlock."
                                  >
                                    ****
                                  </span>
                                ) : (
                                  <span
                                    className="badge px-2 py-0 font-monospace text-truncate"
                                    style={{
                                      backgroundColor: "#fee2e2",
                                      color: "#b91c1c",
                                      border: "1px solid #fecaca",
                                      fontSize: "0.68rem",
                                    }}
                                  >
                                    -Rs. {profitReversed.toLocaleString()}
                                  </span>
                                )}
                              </td>

                              {/* Action */}
                              <td className="py-2 text-center pe-2 text-nowrap">
                                <button
                                  type="button"
                                  className="btn btn-sm py-1 px-2 d-inline-flex align-items-center gap-1 shadow-none"
                                  style={{
                                    fontSize: "0.68rem",
                                    color: "#b91c1c",
                                    borderColor: "#fecaca",
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #fecaca",
                                  }}
                                  onClick={() =>
                                    setActiveReceipt({
                                      ...ret,
                                      isRefundReceipt: true,
                                      receiptType: "return",
                                    })
                                  }
                                  title="View refund voucher"
                                >
                                  <FiPrinter size={10} />
                                  <span>Voucher</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* ── ORIGINAL SALE RECORD (PRESERVED NON-DESTRUCTIVELY) ── */}
                        <tr
                          key={sale._id}
                          className={isFullyRefunded ? "bg-light bg-opacity-50" : ""}
                        >
                          {/* Invoice # */}
                          <td className="ps-2 py-2 font-monospace fw-bold" style={{ fontSize: "0.74rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div className="d-flex align-items-center gap-1 text-truncate">
                              <span className={`text-truncate ${isFullyRefunded ? "text-muted" : "text-dark"}`} title={sale.saleNumber}>
                                {sale.saleNumber}
                              </span>
                              {isFullyRefunded && (
                                <span
                                  className="badge bg-secondary text-white py-0 px-1 flex-shrink-0"
                                  style={{ fontSize: "0.58rem" }}
                                  title="This sale transaction has been refunded"
                                >
                                  Refunded
                                </span>
                              )}
                              {isPartiallyRefunded && (
                                <span
                                  className="badge bg-warning text-dark py-0 px-1 flex-shrink-0"
                                  style={{ fontSize: "0.58rem" }}
                                  title="Partially refunded sale"
                                >
                                  Partial
                                </span>
                              )}
                            </div>
                            {isEx && (
                              <div className="mt-1">
                                <span className="badge bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25 px-1 py-0 rounded-pill fw-semibold" style={{ fontSize: "0.58rem" }}>
                                  <FiRepeat className="me-1" size={8} /> Exchange
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-2 text-secondary" style={{ fontSize: "0.71rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div className="text-truncate">
                              {new Date(sale.saleDate).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}
                            </div>
                            <div className="text-muted text-truncate" style={{ fontSize: "0.64rem" }}>
                              {new Date(sale.saleDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>

                          {/* Product(s) */}
                          <td className="py-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {isEx ? (
                              <div className="d-flex flex-column gap-1" style={{ fontSize: "0.70rem" }}>
                                {/* Device Received (IN) */}
                                <div
                                  className="text-truncate"
                                  style={{ maxWidth: "100%" }}
                                  title={`IN: ${ex.takenItemName || "Customer Item"}${ex.takenPrice > 0 ? ` (${formatK(ex.takenPrice)})` : ""}`}
                                >
                                  <span className="badge bg-success text-white py-0 px-1 me-1 flex-shrink-0" style={{ fontSize: "0.56rem" }}>
                                    IN
                                  </span>
                                  <span className="fw-semibold text-dark">
                                    {ex.takenItemName || "Customer Item"}
                                  </span>
                                  {ex.takenPrice > 0 && (
                                    <span className="text-muted ms-1" style={{ fontSize: "0.65rem" }}>
                                      ({formatK(ex.takenPrice)})
                                    </span>
                                  )}
                                </div>

                                {/* Device Given (OUT) */}
                                <div
                                  className="text-muted text-truncate"
                                  style={{ maxWidth: "100%", fontSize: "0.65rem" }}
                                  title={`OUT: ${getSaleDisplayName(sale)}${ex.myPrice > 0 ? ` (${formatK(ex.myPrice)})` : ""}${ex.customerName ? ` • ${ex.customerName}` : ""}`}
                                >
                                  <span className="badge bg-secondary text-white py-0 px-1 me-1 flex-shrink-0" style={{ fontSize: "0.56rem" }}>
                                    OUT
                                  </span>
                                  <span className={isFullyRefunded ? "text-muted" : "text-dark"}>
                                    {getSaleDisplayName(sale)}
                                  </span>
                                  {ex.myPrice > 0 && (
                                    <span className="text-muted ms-1" style={{ fontSize: "0.65rem" }}>
                                      ({formatK(ex.myPrice)})
                                    </span>
                                  )}
                                  {isMultiItem && (
                                    <span className="badge bg-light text-secondary border py-0 px-1 ms-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>
                                      +{sale.items.length - 1}
                                    </span>
                                  )}
                                  {ex.customerName && (
                                    <span className="text-muted ms-1 text-truncate">
                                      • {ex.customerName}
                                    </span>
                                  )}
                                </div>

                                {isShopkeeperSale(sale) && (
                                  <span
                                    className="badge bg-purple-subtle text-purple border py-0 px-1 d-inline-block text-truncate mt-1"
                                    style={{ fontSize: "0.60rem", maxWidth: "100%" }}
                                  >
                                    Other Shopkeeper{getShopkeeperName(sale) ? `: ${getShopkeeperName(sale)}` : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className={`fw-semibold text-truncate ${isFullyRefunded ? "text-muted" : "text-dark"}`} style={{ fontSize: "0.75rem" }} title={getSaleDisplayName(sale)}>
                                  {getSaleDisplayName(sale)}
                                </div>
                                <div className="d-flex align-items-center gap-1 mt-1 flex-wrap">
                                  {(sale.items?.[0]?.storage || sale.storage) && (
                                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "0.60rem", padding: "1px 4px" }}>
                                      {sale.items?.[0]?.storage || sale.storage}
                                    </span>
                                  )}
                                  {(sale.items?.[0]?.color || sale.color) && (
                                    <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle" style={{ fontSize: "0.60rem", padding: "1px 4px" }}>
                                      {sale.items?.[0]?.color || sale.color}
                                    </span>
                                  )}
                                  {isMultiItem && (
                                    <span className="badge bg-secondary-subtle text-secondary border py-0 px-1" style={{ fontSize: "0.60rem" }}>
                                      {sale.items.length} items
                                    </span>
                                  )}
                                </div>
                                {isShopkeeperSale(sale) && (
                                  <span
                                    className="badge bg-purple-subtle text-purple border py-0 px-1 d-inline-block text-truncate mt-1"
                                    style={{ fontSize: "0.60rem", maxWidth: "100%" }}
                                  >
                                    Other Shopkeeper{getShopkeeperName(sale) ? `: ${getShopkeeperName(sale)}` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Barcodes / IMEI */}
                          <td className="py-2" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {isEx ? (
                              <div className="d-flex flex-column gap-1">
                                {/* Took barcode (IN) */}
                                {(ex.takenBarcodes.length > 0 || (ex.takenBarcode && ex.takenBarcode !== "N/A")) && (
                                  <div className="d-flex align-items-center gap-1 text-truncate">
                                    <span className="badge bg-success text-white py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>IN</span>
                                    <span
                                      className="font-monospace text-dark text-truncate bg-light border px-1 rounded"
                                      style={{ fontSize: "0.67rem", maxWidth: "100%", cursor: "pointer" }}
                                      title={`Click to copy: ${ex.takenBarcodes[0] || ex.takenBarcode}`}
                                      onClick={() => handleCopyImei(ex.takenBarcodes[0] || ex.takenBarcode)}
                                    >
                                      {ex.takenBarcodes[0] || ex.takenBarcode}
                                    </span>
                                    {ex.takenBarcodes.length > 1 && (
                                      <span className="badge bg-light text-secondary border py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>
                                        +{ex.takenBarcodes.length - 1}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* Gave barcode (OUT) */}
                                {allBarcodes.length > 0 && (
                                  <div className="d-flex align-items-center gap-1 text-truncate">
                                    <span className="badge bg-secondary text-white py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>OUT</span>
                                    <span
                                      className="font-monospace text-dark text-truncate bg-light border px-1 rounded"
                                      style={{ fontSize: "0.67rem", maxWidth: "100%", cursor: "pointer" }}
                                      title={`Click to copy: ${allBarcodes[0]}`}
                                      onClick={() => handleCopyImei(allBarcodes[0])}
                                    >
                                      {allBarcodes[0]}
                                    </span>
                                    {allBarcodes.length > 1 && (
                                      <span className="badge bg-light text-secondary border py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>
                                        +{allBarcodes.length - 1}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {allBarcodes.length === 0 && (!ex.takenBarcodes || ex.takenBarcodes.length === 0) && (!ex.takenBarcode || ex.takenBarcode === "N/A") && (
                                  <span className="text-muted small">—</span>
                                )}
                              </div>
                            ) : (
                              <div className="d-flex align-items-center gap-1 text-truncate">
                                {allBarcodes.length === 0 ? (
                                  <span className="text-muted small">—</span>
                                ) : (
                                  <>
                                    <span
                                      className="badge bg-light text-dark border font-monospace text-truncate px-2 py-0"
                                      style={{ fontSize: "0.68rem", maxWidth: "100%", cursor: "pointer" }}
                                      title={`Click to copy: ${allBarcodes[0]}`}
                                      onClick={() => handleCopyImei(allBarcodes[0])}
                                    >
                                      {allBarcodes[0]}
                                    </span>
                                    {allBarcodes.length > 1 && (
                                      <span className="badge bg-secondary-subtle text-secondary py-0 px-1 flex-shrink-0" style={{ fontSize: "0.58rem" }}>
                                        +{allBarcodes.length - 1}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Qty */}
                          <td className="py-2 text-center">
                            <span className="badge bg-light text-dark border px-2 py-0" style={{ fontSize: "0.72rem" }}>
                              {sale.quantity}
                            </span>
                          </td>

                          {/* Total Amount */}
                          <td className="py-2 text-end text-nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {isEx && ex.takenPrice > 0 ? (
                              <div title={`Calculated: Rs. ${ex.myPrice.toLocaleString()} − Rs. ${ex.takenPrice.toLocaleString()}`}>
                                <div className="fw-bold text-dark font-monospace text-truncate" style={{ fontSize: "0.78rem" }}>
                                  {ex.netDiff >= 0
                                    ? `Rs. ${ex.netDiff.toLocaleString()}`
                                    : `- Rs. ${Math.abs(ex.netDiff).toLocaleString()}`}
                                </div>
                                <span
                                  className={`badge font-monospace px-1 py-0 ${
                                    ex.netDiff > 0
                                      ? "bg-success bg-opacity-10 text-success border border-success border-opacity-25"
                                      : ex.netDiff < 0
                                      ? "bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25"
                                      : "bg-light text-secondary border"
                                  }`}
                                  style={{ fontSize: "0.58rem" }}
                                >
                                  {ex.netDiff > 0 ? "Cust Pays" : ex.netDiff < 0 ? "Shop Pays" : "Even"}
                                </span>
                              </div>
                            ) : (
                              <div className={`fw-bold font-monospace text-truncate ${isFullyRefunded ? "text-muted" : "text-dark"}`} style={{ fontSize: "0.78rem" }}>
                                Rs. {(sale.totalAmount || 0).toLocaleString()}
                              </div>
                            )}
                          </td>

                          {/* Profit / Loss */}
                          <td className="py-2 text-center text-nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {!isRevealed ? (
                              <span
                                role="button"
                                onClick={openUnlockModal}
                                className="badge bg-light text-secondary border px-2 py-1 font-monospace"
                                style={{ cursor: "pointer", fontSize: "0.68rem" }}
                                title="Sensitive metric protected. Click to enter password and reveal."
                              >
                                ****
                              </span>
                            ) : isProfitable ? (
                              <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 font-monospace text-truncate" style={{ fontSize: "0.68rem" }}>
                                +Rs. {(sale.profit || 0).toLocaleString()}
                              </span>
                            ) : isLoss ? (
                              <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1 font-monospace text-truncate" style={{ fontSize: "0.68rem" }}>
                                -Rs. {(sale.loss || 0).toLocaleString()}
                              </span>
                            ) : (
                              <span className="badge bg-light text-secondary border px-2 py-1 font-monospace" style={{ fontSize: "0.68rem" }}>
                                Rs. 0
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-2 text-center pe-2 text-nowrap">
                            {isFullyRefunded ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-light text-muted border py-1 px-2 d-inline-flex align-items-center gap-1 disabled"
                                style={{ fontSize: "0.68rem", cursor: "not-allowed", opacity: 0.65 }}
                                disabled
                                title="Receipt reprint disabled — this sale transaction has been refunded"
                              >
                                <FiPrinter size={10} className="text-muted" />
                                <span className="text-decoration-line-through">Receipt</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-dark py-1 px-2 d-inline-flex align-items-center gap-1"
                                style={{ fontSize: "0.68rem" }}
                                onClick={() => setActiveReceipt(sale)}
                                title="View receipt"
                              >
                                <FiPrinter size={10} />
                                <span>Receipt</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && !isLoading && (
            <div className="p-2 text-center border-top bg-light">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark py-1 px-3"
                disabled={isLoadingMore}
                onClick={() => fetchSales(nextCursor, true)}
                style={{ fontSize: "0.75rem" }}
              >
                {isLoadingMore ? "Loading more sales..." : "Load More Sales"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          STANDARDIZED SALE & RETURN RECEIPT MODAL (80mm POS Slip)
         ──────────────────────────────────────────────────────────────────── */}
      {activeReceipt && (
        <SaleReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}

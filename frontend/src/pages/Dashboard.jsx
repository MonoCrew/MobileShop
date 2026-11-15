import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiPackage,
  FiTruck,
  FiAlertTriangle,
  FiShoppingBag,
  FiCalendar,
  FiRefreshCw,
  FiLayers,
  FiClock,
  FiCreditCard,
  FiZap,
  FiFileText,
  FiX,
  FiChevronRight,
  FiCheckCircle,
  FiAlertCircle,
  FiArrowUpRight,
  FiCoffee,
  FiEye,
  FiEyeOff,
  FiLock,
  FiUsers,
  FiUploadCloud,
} from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../api/axios";
import { usePrivacy } from "../context/PrivacyContext";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import SyncResultModal from "../components/SyncResultModal";

export default function Dashboard() {
  const { isRevealed, openUnlockModal, lockMetrics } = usePrivacy();
  // =========================================================================
  // 1. FILTER & PERIOD STATE
  // =========================================================================
  const [period, setPeriod] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Active chart view toggle: 'rev_cost' (Revenue vs Cost) | 'profit_loss' (Profit vs Loss) | 'net_margin'
  const [chartMode, setChartMode] = useState("rev_cost");
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // =========================================================================
  // CLOUD DATABASE SYNCHRONIZATION STATE & HANDLER
  // =========================================================================
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const handleSaveDataToCloud = async () => {
    if (isSyncing) return;

    // Explicit Confirmation Dialog
    const result = await Swal.fire({
      title: "Sync Local Data to MongoDB Atlas?",
      text: "Sync local MongoDB data to MongoDB Atlas? New documents will be added to the cloud. Existing cloud documents will not be modified or deleted.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#09090b",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Save Data to Cloud",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setIsSyncing(true);
    setSyncError(null);

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
    });

    Toast.fire({
      icon: "info",
      title: "Synchronization started...",
    });

    try {
      const res = await api.post("/admin/sync-local-to-cloud", { batchSize: 500 });
      if (res.data?.success) {
        const summary = res.data.summary;
        setSyncSummary(summary);
        setSyncModalOpen(true);

        if (summary.status === "success") {
          const ins = summary.totalInserted ?? 0;
          const upd = summary.totalUpdated ?? summary.totalSkipped ?? 0;
          const del = summary.totalDeleted ?? 0;
          Toast.fire({
            icon: "success",
            title: `Cloud backup completed! Cloud is now an exact copy of local (${ins} inserted, ${upd} updated, ${del} removed).`,
          });
        } else {
          Toast.fire({
            icon: "warning",
            title: `Cloud sync completed with warnings. ${summary.totalFailed.toLocaleString()} conflicts.`,
          });
        }
      } else {
        const errMsg = res.data?.message || "Cloud synchronization failed.";
        setSyncError(errMsg);
        setSyncSummary(res.data?.summary || null);
        setSyncModalOpen(true);
        Toast.fire({
          icon: "error",
          title: errMsg,
        });
      }
    } catch (err) {
      console.error("Cloud sync error:", err);
      const errMsg =
        err.response?.data?.message ||
        err.message ||
        "Failed to synchronize local data with MongoDB Atlas.";
      setSyncError(errMsg);
      setSyncSummary(err.response?.data?.summary || null);
      setSyncModalOpen(true);
      Toast.fire({
        icon: "error",
        title: errMsg,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // =========================================================================
  // 2. DATA & LOADING STATE
  // =========================================================================
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch complete aggregated dashboard from MongoDB
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { period };
      if (period === "custom") {
        if (customFrom) params.from = customFrom;
        if (customTo) params.to = customTo;
      }

      const res = await api.get("/dashboard", { params });
      if (res.data?.success) {
        setDashboardData(res.data);
      } else {
        setError(res.data?.message || "Failed to load dashboard data.");
      }
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load dashboard metrics from server."
      );
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchDashboardData();

    // Real-time synchronization on stock returns or POS checkout
    const handleSync = () => {
      fetchDashboardData();
    };
    window.addEventListener("pos_data_updated", handleSync);
    let bc;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("pos_system_sync");
        bc.onmessage = () => fetchDashboardData();
      }
    } catch {}

    return () => {
      window.removeEventListener("pos_data_updated", handleSync);
      if (bc) bc.close();
    };
  }, [fetchDashboardData]);

  // Handle preset selection
  const handleSelectPreset = (val) => {
    setPeriod(val);
    setShowCustomPicker(false);
  };

  // Handle custom date range apply
  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    if (!customFrom && !customTo) return;
    setPeriod("custom");
    fetchDashboardData();
  };

  // Handle custom date range clear
  const handleClearCustomRange = () => {
    setCustomFrom("");
    setCustomTo("");
    setPeriod("this_month");
    setShowCustomPicker(false);
  };

  // Safe data extraction
  const kpis = dashboardData?.kpis || {};
  const supplierSummary = dashboardData?.supplierSummary || {};
  const inventory = dashboardData?.inventorySnapshot || {};
  const recentSales = dashboardData?.recentSales || [];
  const topSelling = dashboardData?.topSellingItems || [];
  const recentPayments = dashboardData?.recentSupplierPayments || [];
  const trend = dashboardData?.profitLossTrend || [];
  const activeFilterInfo = dashboardData?.filter || {};

  // Maximum value for chart scaling
  const chartMax = useMemo(() => {
    if (!trend.length) return 100;
    const maxVal = Math.max(
      ...trend.map((t) =>
        Math.max(
          t.revenue || 0,
          t.cost || 0,
          t.profit || 0,
          t.loss || 0,
          Math.abs(t.netProfit || 0)
        )
      )
    );
    return Math.max(maxVal, 50);
  }, [trend]);

  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1 pb-4">
      {/* =====================================================================
          TOP TOOLBAR: TITLE & PERIOD DATE FILTERS
         ===================================================================== */}
      <div className="bg-white border rounded-3 p-3 shadow-sm mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <div className="d-flex align-items-center gap-2">
          
              <h5 className="fw-bold text-dark mb-0">Executive Business Dashboard</h5>
            </div>
            <div className="text-secondary small mt-1" style={{ fontSize: "0.75rem" }}>
              Active Period:{" "}
              <strong className="text-dark">
                {activeFilterInfo.label || "This Month"}
              </strong>{" "}
              • Filter applies to Total Sale, Confirmed Profit &amp; Net Profit/Loss.
            </div>
          </div>

          {/* Quick Date Presets & Custom Trigger */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {[
              { label: "Today", val: "today" },
              { label: "Yesterday", val: "yesterday" },
              { label: "Last 7 Days", val: "last7days" },
              { label: "This Month", val: "this_month" },
              { label: "Last Month", val: "last_month" },
              { label: "This Year", val: "this_year" },
              { label: "All Time", val: "all" },
            ].map((item) => (
              <button
                key={item.val}
                type="button"
                className={`btn btn-sm py-1 px-3 rounded-pill ${
                  period === item.val
                    ? "btn-dark text-white shadow-sm"
                    : "btn-outline-secondary bg-white text-secondary"
                }`}
                style={{ fontSize: "0.73rem", fontWeight: 500 }}
                onClick={() => handleSelectPreset(item.val)}
              >
                {item.label}
              </button>
            ))}

            <button
              type="button"
              className={`btn btn-sm py-1 px-3 rounded-pill d-inline-flex align-items-center gap-1 ${
                period === "custom"
                  ? "btn-dark text-white shadow-sm"
                  : "btn-outline-secondary bg-white text-secondary"
              }`}
              style={{ fontSize: "0.73rem", fontWeight: 500 }}
              onClick={() => setShowCustomPicker((prev) => !prev)}
            >
              <FiCalendar size={12} />
              <span>Custom</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary p-2 ms-1 d-inline-flex align-items-center justify-content-center"
              style={{ width: "30px", height: "30px" }}
              onClick={fetchDashboardData}
              title="Refresh dashboard metrics"
              disabled={isLoading}
            >
              <FiRefreshCw
                size={13}
                className={isLoading ? "spinner-border-sm animate-spin" : ""}
              />
            </button>

            {/* Privacy Reveal / Lock Action Button */}
            {isRevealed ? (
              <button
                type="button"
                className="btn btn-sm py-1 px-3 rounded-pill btn-dark text-white d-inline-flex align-items-center gap-2 shadow-sm ms-1"
                style={{ fontSize: "0.73rem", fontWeight: 500 }}
                onClick={lockMetrics}
                title="Sensitive profit metrics are visible. Click to re-mask / lock."
              >
                <FiLock size={12} className="text-warning" />
                <span>Lock Metrics</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm py-1 px-3 rounded-pill btn-outline-dark bg-light text-dark d-inline-flex align-items-center gap-2 shadow-sm ms-1"
                style={{ fontSize: "0.73rem", fontWeight: 500 }}
                onClick={openUnlockModal}
                title="Sensitive profit metrics are masked. Click to unlock with password."
              >
                <FiEyeOff size={12} className="text-secondary" />
                <span>Unlock Metrics</span>
              </button>
            )}

            {/* Save Data to Cloud Button */}
            <button
              type="button"
              className={`btn btn-sm py-1 px-3 rounded-pill d-inline-flex align-items-center gap-2 shadow-sm ms-1 ${
                isSyncing ? "btn-secondary text-white" : "btn-dark text-white"
              }`}
              style={{ fontSize: "0.73rem", fontWeight: 500 }}
              onClick={handleSaveDataToCloud}
              disabled={isSyncing}
              title="Safely sync all local MongoDB data to MongoDB Atlas (insert-only)"
            >
              {isSyncing ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm text-light"
                    role="status"
                    aria-hidden="true"
                    style={{ width: "12px", height: "12px" }}
                  />
                  <span>Syncing Data...</span>
                </>
              ) : (
                <>
                  <FiUploadCloud size={13} className="text-info" />
                  <span>Save Data to Cloud</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Custom Date Range Collapsible Selector with Smooth Expand/Collapse Animation */}
        <style>{`
          .custom-picker-collapse {
            display: grid;
            grid-template-rows: 0fr;
            opacity: 0;
            transition: grid-template-rows 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease;
          }
          .custom-picker-collapse.show {
            grid-template-rows: 1fr;
            opacity: 1;
          }
          .custom-picker-collapse-inner {
            overflow: hidden;
          }
        `}</style>
        <div className={`custom-picker-collapse ${showCustomPicker ? "show" : ""}`}>
          <div className="custom-picker-collapse-inner">
            <form
              onSubmit={handleApplyCustomRange}
              className="mt-3 pt-3 border-top d-flex flex-wrap align-items-center gap-2"
            >
              <div className="d-flex align-items-center gap-2">
                <span className="small text-secondary fw-semibold" style={{ fontSize: "0.75rem" }}>
                  From:
                </span>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ fontSize: "0.75rem", width: "145px" }}
                  required={showCustomPicker}
                />
              </div>

              <div className="d-flex align-items-center gap-2">
                <span className="small text-secondary fw-semibold" style={{ fontSize: "0.75rem" }}>
                  To:
                </span>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ fontSize: "0.75rem", width: "145px" }}
                  required={showCustomPicker}
                />
              </div>

              <button
                type="submit"
                className="btn btn-sm btn-dark px-3 py-1 text-nowrap shadow-sm"
                style={{ fontSize: "0.75rem" }}
              >
                Apply Filter
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-1 text-nowrap"
                style={{ fontSize: "0.75rem" }}
                onClick={handleClearCustomRange}
              >
                Clear
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Cloud Sync In-Progress Background Notification Banner */}
      {isSyncing && (
        <div
          className="alert alert-dark py-2 px-3 small d-flex align-items-center justify-content-between mb-3 shadow-sm rounded-3 border-0 text-white"
          role="alert"
          style={{ backgroundColor: "#18181b" }}
        >
          <div className="d-flex align-items-center gap-2">
            <span
              className="spinner-border spinner-border-sm text-info flex-shrink-0"
              role="status"
              aria-hidden="true"
              style={{ width: "14px", height: "14px" }}
            />
            <span style={{ fontSize: "0.78rem" }}>
              <strong>Syncing with MongoDB Atlas...</strong> New documents are being securely uploaded to the cloud. You can continue using the dashboard without interruption.
            </span>
          </div>
          <span className="badge bg-white bg-opacity-20 text-white font-monospace" style={{ fontSize: "0.68rem" }}>
            Batch: 500
          </span>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div
          className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 shadow-sm rounded-3"
          role="alert"
        >
          <FiAlertCircle size={16} className="text-danger flex-shrink-0" />
          <div className="flex-grow-1">{error}</div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger py-1 px-2"
            style={{ fontSize: "0.72rem" }}
            onClick={fetchDashboardData}
          >
            Retry
          </button>
        </div>
      )}


      {/* 1st Row: 3 metric cards filtered by period (Total Sale, Confirmed Profit, Net Profit / Loss) */}
      <div className="row g-3 mb-4">
        {/* KPI 1: Total Sales / Revenue */}
        <div className="col-12 col-md-4">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Total Sale
                </span>
                <span
                  className="badge bg-light text-secondary border mt-1"
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed ? "Protected" : "Completed Sales"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask total sales metric" : "Click to unlock sensitive total sales"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div className="p-2 rounded-3 bg-dark text-white">
                  <FiDollarSign size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed ? "text-secondary" : "text-dark"
                  }`}
                  title={isRevealed ? formatFullAmount(kpis.totalRevenue) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.totalRevenue) : "Rs. ****"}
                </strong>
              )}
              <div className="d-flex justify-content-between align-items-center text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                <span>{kpis.totalTransactions || 0} Transactions</span>
                <span
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                  title={isRevealed ? `Average Order Value: Rs. ${(kpis.avgOrderValue || 0).toLocaleString()}` : "Click to unlock"}
                >
                  Avg: {isRevealed ? formatUnit(kpis.avgOrderValue) : "Rs. ****"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Confirmed Profit (Sales Profit / Margin net of returns) */}
        <div className="col-12 col-md-4">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Confirmed Profit
                </span>
                <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 mt-1" style={{ fontSize: "0.68rem" }}>
                  Sales Margin
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask profit metric" : "Click to unlock sensitive profit"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div className="p-2 rounded-3 bg-success-subtle text-success">
                  <FiTrendingUp size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className="fs-4 fw-bold text-success font-monospace d-block text-truncate"
                  title={isRevealed ? formatFullAmount(kpis.totalProfit) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.totalProfit) : "Rs. ****"}
                </strong>
              )}
              <div className="d-flex justify-content-between align-items-center text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                <span>Gross Margin</span>
                <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                  Net of Returns
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Net Profit / Loss */}
        <div className="col-12 col-md-4">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Net Profit / Loss
                </span>
                <span
                  className={`badge mt-1 ${
                    !isRevealed
                      ? "bg-light text-secondary border"
                      : (kpis.netProfit || 0) > 0
                      ? "bg-success text-white"
                      : (kpis.netProfit || 0) < 0
                      ? "bg-danger text-white"
                      : "bg-light text-secondary border"
                  }`}
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed
                    ? "Protected"
                    : (kpis.netProfit || 0) > 0
                    ? "Profitable"
                    : (kpis.netProfit || 0) < 0
                    ? "Net Loss"
                    : "Neutral"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask net profit" : "Click to unlock sensitive net profit"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div
                  className={`p-2 rounded-3 text-white ${
                    !isRevealed
                      ? "bg-secondary"
                      : (kpis.netProfit || 0) >= 0
                      ? "bg-dark"
                      : "bg-danger"
                  }`}
                >
                  <FiZap size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed
                      ? "text-secondary"
                      : (kpis.netProfit || 0) > 0
                      ? "text-success"
                      : (kpis.netProfit || 0) < 0
                      ? "text-danger"
                      : "text-dark"
                  }`}
                  title={isRevealed ? formatFullAmount(kpis.netProfit) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.netProfit, { sign: true }) : "+Rs. ****"}
                </strong>
              )}
              <div className="text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                Gross Margin - Loss - Daily Expenses
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Heading to separate 1st row and 2nd row */}
      <div className="d-flex align-items-center justify-content-between mt-4 mb-3">
        <h3 className="fs-5 fw-bold text-dark mb-0">
          Supplier &amp; Inventory Overview
        </h3>
        <span className="badge bg-light text-secondary border font-monospace" style={{ fontSize: "0.7rem" }}>
          All-Time Standing Metrics
        </span>
      </div>


      {/* 2nd Row: 4 cards (Supplier Cash Paid, Supplier Accounts Payable, Shop Asset Value, Stock with Other Shops) */}
      <div className="row g-3 mb-4">
        {/* Card 1: Cash Paid to Suppliers */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Supplier Cash Paid
                </span>
                <span
                  className="badge bg-light text-secondary border mt-1"
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed ? "Protected" : "Total Cash Paid"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask supplier cash paid" : "Click to unlock sensitive cash paid"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                  <FiCreditCard size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed ? "text-secondary" : "text-primary"
                  }`}
                  title={isRevealed ? formatFullAmount(kpis.totalCashPaidToSuppliers) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.totalCashPaidToSuppliers) : "Rs. ****"}
                </strong>
              )}
              <div className="text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                Actual money disbursed to vendors
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Remaining Supplier Payable (CURRENT-STATE LIABILITY) */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Supplier Accounts Payable
                </span>
                <span
                  className={`badge mt-1 ${
                    !isRevealed
                      ? "bg-light text-secondary border"
                      : (kpis.currentSupplierDue || 0) > 0
                      ? "bg-danger text-white"
                      : "bg-success text-white"
                  }`}
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed
                    ? "Protected"
                    : (kpis.currentSupplierDue || 0) > 0
                    ? "Outstanding Debt"
                    : "Fully Settled"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask payable metric" : "Click to unlock sensitive payable"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div className="p-2 rounded-3 bg-warning-subtle text-warning-emphasis">
                  <FiTruck size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed
                      ? "text-secondary"
                      : (kpis.currentSupplierDue || 0) > 0
                      ? "text-danger"
                      : "text-dark"
                  }`}
                  title={isRevealed ? formatFullAmount(kpis.currentSupplierDue) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.currentSupplierDue) : "Rs. ****"}
                </strong>
              )}
              <div className="text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                Current liability to suppliers
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Shop Asset Value */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Shop Asset Value
                </span>
                <span
                  className="badge bg-light text-secondary border mt-1"
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed ? "Protected" : "Active Shop Stock"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask asset value" : "Click to unlock sensitive asset value"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <div className="p-2 rounded-3 bg-primary-subtle text-primary">
                  <FiPackage size={16} />
                </div>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed ? "text-secondary" : "text-dark"
                  }`}
                  title={isRevealed ? formatFullAmount(kpis.shopAssetValue || 0) : "Sensitive metric protected. Click to unlock."}
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.shopAssetValue || 0) : "Rs. ****"}
                </strong>
              )}
              <div className="text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                {(kpis.shopUnits ?? inventory.shopUnits ?? 0).toLocaleString()} units across {(kpis.shopProducts ?? inventory.shopProducts ?? 0).toLocaleString()} products
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Stock with Other Shops (Consignment Stock transferred from shop) */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100 d-flex flex-column justify-content-between position-relative overflow-hidden">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span className="text-secondary fw-semibold text-uppercase tracking-wider small d-block" style={{ fontSize: "0.7rem" }}>
                  Stock with Other Shops
                </span>
                <span
                  className="badge bg-light text-secondary border mt-1"
                  style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {!isRevealed ? "Protected" : "Consignment Stock"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-link p-1 text-secondary text-decoration-none border-0 d-flex align-items-center justify-content-center"
                  onClick={isRevealed ? lockMetrics : openUnlockModal}
                  title={isRevealed ? "Re-mask stock with other shops" : "Click to unlock sensitive metric"}
                  style={{ borderRadius: "6px" }}
                >
                  {isRevealed ? (
                    <FiLock size={15} className="text-dark" />
                  ) : (
                    <FiEyeOff size={15} className="text-secondary" />
                  )}
                </button>
                <Link
                  to="/shopkeeper-stock"
                  className="p-2 rounded-3 bg-dark-subtle text-dark text-decoration-none d-flex align-items-center justify-content-center"
                  title="View Shopkeeper Stock & Sale"
                >
                  <FiUsers size={16} />
                </Link>
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="placeholder-glow py-1">
                  <span className="placeholder col-8 fs-4 rounded" />
                </div>
              ) : (
                <strong
                  className={`fs-4 fw-bold font-monospace d-block text-truncate ${
                    !isRevealed ? "text-secondary" : "text-dark"
                  }`}
                  title={
                    isRevealed
                      ? `Original Buy Price (Cost): ${formatFullAmount(kpis.shopkeeperStockCost || 0)} (Expected Sale: ${formatFullAmount(kpis.shopkeeperStockValue || 0)})`
                      : "Sensitive metric protected. Click to unlock."
                  }
                  style={{ cursor: isRevealed ? "default" : "pointer" }}
                  onClick={!isRevealed ? openUnlockModal : undefined}
                >
                  {isRevealed ? formatUnit(kpis.shopkeeperStockCost || 0) : "Rs. ****"}
                </strong>
              )}
              <div className="text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                {(kpis.shopkeeperStockUnits || 0).toLocaleString()} units with {(kpis.shopkeeperCount || 0).toLocaleString()} shopkeepers • Expected Sale: {isRevealed ? formatUnit(kpis.shopkeeperStockValue || 0) : "Rs. ****"}
              </div>
            </div>
          </div>
        </div>
      </div>


      <div className="row g-3 mb-3">
        {/* Column 1: Recent Sales */}
        <div className="col-12 col-xl-7">
          <div className="card border shadow-sm rounded-3 bg-white h-100 d-flex flex-column">
            <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <div className="d-flex align-items-center gap-2">
                <div className="p-1 rounded-2 bg-dark text-white">
                  <FiClock size={13} />
                </div>
                <span className="fw-bold small text-dark">
                  Recent Sales Transactions
                </span>
                <span className="badge bg-light text-secondary border" style={{ fontSize: "0.68rem" }}>
                  {recentSales.length} records
                </span>
              </div>
              <Link
                to="/history"
                className="btn btn-sm btn-outline-dark py-1 px-3 d-inline-flex align-items-center gap-1"
                style={{ fontSize: "0.72rem" }}
              >
                <span>View All History</span>
                <FiChevronRight size={12} />
              </Link>
            </div>

            <div className="card-body p-0 flex-grow-1 overflow-y-auto" style={{ maxHeight: "360px" }}>
              {isLoading ? (
                <div className="p-4 text-center">
                  <div className="spinner-border spinner-border-sm text-dark mb-1" role="status" />
                  <p className="small text-secondary mb-0">Loading recent sales...</p>
                </div>
              ) : recentSales.length === 0 ? (
                <div className="p-4 text-center text-secondary">
                  <FiShoppingBag size={28} className="opacity-40 mb-2" />
                  <p className="small text-muted mb-0">No sales transactions logged for this period.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "0.75rem" }}>
                    <thead className="table-light text-secondary sticky-top">
                      <tr>
                        <th className="ps-3 py-1">Invoice #</th>
                        <th className="py-1">Product</th>
                        <th className="py-1 text-center">Qty</th>
                        <th className="py-1 text-end">Sale Amount</th>
                        <th className="py-1 text-end">Cost</th>
                        <th className="py-1 text-center">
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
                        {/* <th className="py-1 pe-3 text-center">Method</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => (
                        <tr key={sale._id}>
                          <td className="ps-3 py-1 font-monospace fw-bold text-dark">
                            {sale.saleNumber}
                          </td>
                          <td className="py-1">
                            <span className="fw-semibold text-dark d-block text-truncate" style={{ maxWidth: "160px" }} title={sale.productName}>
                              {sale.productName}
                            </span>
                          </td>
                          <td className="py-1 text-center">
                            <span className="badge bg-light text-dark border px-2 py-1">
                              {sale.quantity}
                            </span>
                          </td>
                          <td className="py-1 text-end fw-bold text-dark font-monospace">
                            Rs. {(sale.totalAmount || 0).toLocaleString()}
                          </td>
                          <td className="py-1 text-end text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                            Rs. {(sale.totalCost || 0).toLocaleString()}
                          </td>
                          <td className="py-1 text-center">
                            {!isRevealed ? (
                              <span
                                role="button"
                                onClick={openUnlockModal}
                                className="badge bg-light text-secondary border px-2 py-1 font-monospace"
                                style={{ cursor: "pointer" }}
                                title="Sensitive metric protected. Click to enter password and reveal."
                              >
                                ****
                              </span>
                            ) : (sale.profit || 0) > 0 ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle font-monospace px-2 py-1">
                                +Rs. {sale.profit.toLocaleString()}
                              </span>
                            ) : (sale.loss || 0) > 0 ? (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle font-monospace px-2 py-1">
                                -Rs. {sale.loss.toLocaleString()}
                              </span>
                            ) : (
                              <span className="badge bg-light text-secondary border px-2 py-1 font-monospace">
                                Rs. 0
                              </span>
                            )}
                          </td>
                        
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="card border shadow-sm rounded-3 bg-white h-100 d-flex flex-column">
            <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <div className="d-flex align-items-center gap-2">
                <div className="p-1 rounded-2 bg-dark text-white">
                  <FiPackage size={13} />
                </div>
                <span className="fw-bold small text-dark">
                  Top Selling Items
                </span>
              </div>
              <span className="badge bg-dark text-white" style={{ fontSize: "0.68rem" }}>
                Ranked by Volume
              </span>
            </div>

            <div className="card-body p-0 flex-grow-1 overflow-y-auto" style={{ maxHeight: "360px" }}>
              {isLoading ? (
                <div className="p-4 text-center">
                  <div className="spinner-border spinner-border-sm text-dark mb-1" role="status" />
                  <p className="small text-secondary mb-0">Ranking products...</p>
                </div>
              ) : topSelling.length === 0 ? (
                <div className="p-4 text-center text-secondary">
                  <FiPackage size={28} className="opacity-40 mb-2" />
                  <p className="small text-muted mb-0">No top items recorded for this period.</p>
                </div>
              ) : (
                <div className="list-group list-group-flush" style={{ fontSize: "0.78rem" }}>
                  {topSelling.map((item, idx) => (
                    <div
                      key={idx}
                      className="list-group-item d-flex justify-content-between align-items-center py-2 px-3 hover-bg-light"
                    >
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        <span
                          className={`rounded-circle d-inline-flex align-items-center justify-content-center fw-bold flex-shrink-0 ${
                            idx === 0
                              ? "bg-warning text-dark border border-warning"
                              : idx === 1
                              ? "bg-secondary-subtle text-dark border"
                              : idx === 2
                              ? "bg-amber-100 text-dark border"
                              : "bg-light text-secondary border"
                          }`}
                          style={{ width: "22px", height: "22px", fontSize: "0.68rem" }}
                        >
                          #{idx + 1}
                        </span>

                        <div className="overflow-hidden">
                          <span className="fw-semibold text-dark text-truncate d-block" style={{ maxWidth: "180px" }} title={item.productName}>
                            {item.productName}
                          </span>
                          <span className="text-muted small" style={{ fontSize: "0.68rem" }}>
                            {item.unitsSold || 0} pcs sold
                          </span>
                        </div>
                      </div>

                      <div className="text-end flex-shrink-0">
                        <strong className="text-dark d-block font-monospace" style={{ fontSize: "0.8rem" }}>
                          Rs. {(item.totalRevenue || 0).toLocaleString()}
                        </strong>
                        <span
                          className={`${isRevealed ? "text-success" : "text-muted"} small fw-semibold font-monospace`}
                          style={{ fontSize: "0.68rem", cursor: isRevealed ? "default" : "pointer" }}
                          onClick={!isRevealed ? openUnlockModal : undefined}
                          title={isRevealed ? "Profit contribution" : "Click to unlock"}
                        >
                          {isRevealed ? `+Rs. ${(item.totalProfit || 0).toLocaleString()}` : "+Rs. ****"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card border shadow-sm rounded-3 bg-white overflow-hidden">
        <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <div className="p-1 rounded-2 bg-dark text-white">
              <FiPackage size={13} />
            </div>
            <div>
              <span className="fw-bold small text-dark d-block">
                Inventory Catalog Snapshot
              </span>
              <span className="text-muted small" style={{ fontSize: "0.7rem" }}>
                Current stock-level health and catalog thresholds
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
        
       
          </div>
        </div>

        <div className="card-body p-3">
          <div className="row g-3">
            <div className="col-6 col-md-4 col-xl-2">
              <div className="p-3 rounded-2 bg-light border text-center">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: "0.7rem" }}>
                  Catalog Products
                </span>
                <strong className="fs-5 fw-bold text-dark font-monospace">
                  {(inventory.totalProducts || 0).toLocaleString()}
                </strong>
                <span className="text-muted small d-block mt-1" style={{ fontSize: "0.68rem" }}>
                  Unique SKU lines
                </span>
              </div>
            </div>

            <div className="col-6 col-md-4 col-xl-2">
              <div className="p-3 rounded-2 bg-light border text-center">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: "0.7rem" }}>
                  Total Physical Units
                </span>
                <strong className="fs-5 fw-bold text-dark font-monospace">
                  {(inventory.totalUnits || 0).toLocaleString()}
                </strong>
                <span className="text-muted small d-block mt-1" style={{ fontSize: "0.68rem" }}>
                  On-hand shelf stock
                </span>
              </div>
            </div>

            <div className="col-6 col-md-4 col-xl-3">
              <div className="p-3 rounded-2 bg-light border text-center">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: "0.7rem" }}>
                  Total Valuation (Purchase Value)
                </span>
                <strong className="fs-5 fw-bold text-dark font-monospace">
                  Rs. {(inventory.inventoryValue || 0).toLocaleString()}
                </strong>
                <span className="text-muted small d-block mt-1" style={{ fontSize: "0.68rem" }}>
                  Authoritative cost basis
                </span>
              </div>
            </div>

            <div className="col-6 col-md-6 col-xl-2">
              <div className="p-3 rounded-2 bg-light border text-center">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: "0.7rem" }}>
                  Low Stock Threshold
                </span>
                <strong
                  className={`fs-5 fw-bold font-monospace ${
                    (inventory.lowStockCount || 0) > 0 ? "text-warning" : "text-dark"
                  }`}
                >
                  {(inventory.lowStockCount || 0).toLocaleString()} items
                </strong>
                <span className="text-muted small d-block mt-1" style={{ fontSize: "0.68rem" }}>
                  Units &le; 20
                </span>
              </div>
            </div>

            <div className="col-12 col-md-6 col-xl-3">
              <div className="p-3 rounded-2 bg-light border text-center">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: "0.7rem" }}>
                  Out of Stock Alert
                </span>
                <strong
                  className={`fs-5 fw-bold font-monospace ${
                    (inventory.outOfStockCount || 0) > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {(inventory.outOfStockCount || 0).toLocaleString()} items
                </strong>
                <span className="text-muted small d-block mt-1" style={{ fontSize: "0.68rem" }}>
                  {(inventory.outOfStockCount || 0) > 0 ? "Action required (0 qty)" : "Zero depleted items"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Synchronization Results Modal */}
      <SyncResultModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        summary={syncSummary}
        error={syncError}
      />
    </div>
  );
}
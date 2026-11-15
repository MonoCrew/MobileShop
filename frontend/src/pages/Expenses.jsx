import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FiPlus,
  FiSearch,
  FiDollarSign,
  FiTrash2,
  FiRefreshCw,
  FiX,
  FiAlertCircle,
  FiCoffee,
  FiClock,
} from "react-icons/fi";
import api from "../api/axios";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";

const CATEGORIES = [
  "Food & Refreshment",
  "Staff & Daily Wages",
  "Utilities & Bills",
  "Personal / Someone Else",
  "Transportation",
  "Maintenance & Repairs",
  "Shop Supplies",
  "Other",
];

// Helper to get category badge color
const getCategoryBadgeClass = (category) => {
  switch (category) {
    case "Food & Refreshment":
      return "bg-warning bg-opacity-25 text-warning-emphasis border border-warning border-opacity-50";
    case "Staff & Daily Wages":
      return "bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50";
    case "Utilities & Bills":
      return "bg-info bg-opacity-25 text-info-emphasis border border-info border-opacity-50";
    case "Personal / Someone Else":
      return "bg-danger bg-opacity-25 text-danger border border-danger border-opacity-50";
    case "Transportation":
      return "bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-50";
    case "Maintenance & Repairs":
      return "bg-dark bg-opacity-25 text-dark border border-dark border-opacity-25";
    default:
      return "bg-light text-dark border";
  }
};

export default function Expenses() {
  // Filter States
  const [period, setPeriod] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Data States
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    count: 0,
    avgAmount: 0,
    todayAmount: 0,
    todayCount: 0,
    allTimeAmount: 0,
    allTimeCount: 0,
    byCategory: [],
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalExpenses: 0,
    limit: 20,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    category: "Food & Refreshment",
    amount: "",
    date: new Date().toISOString().slice(0, 16),
  });

  const abortControllerRef = useRef(null);

  // Format currency helper using global unit changer
  const formatCurrency = (val) => formatUnit(val);

  // Notification helper
  const showToast = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Fetch expenses from API
  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const params = {
        period,
        page,
        limit: 20,
      };

      if (period === "custom") {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      }

      if (selectedCategory && selectedCategory !== "all") {
        params.category = selectedCategory;
      }

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await api.get("/expenses", {
        params,
        signal: abortControllerRef.current.signal,
      });

      if (res.data?.success) {
        setExpenses(res.data.expenses || []);
        setSummary(
          res.data.summary || {
            totalAmount: 0,
            count: 0,
            avgAmount: 0,
            todayAmount: 0,
            todayCount: 0,
            byCategory: [],
          }
        );
        setPagination(
          res.data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalExpenses: 0,
            limit: 20,
          }
        );
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Failed to load expenses:", err);
        showToast(
          err.response?.data?.message || "Failed to load expenses list",
          "danger"
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [period, customStart, customEnd, selectedCategory, searchQuery, page]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Handle Form Input Change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Reset Form
  const resetForm = () => {
    setFormData({
      title: "",
      category: "Food & Refreshment",
      amount: "",
      date: new Date().toISOString().slice(0, 16),
    });
  };

  // Submit New Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      showToast("Please enter an expense title or description.", "danger");
      return;
    }

    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast("Please enter a valid expense amount greater than 0.", "danger");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post("/expenses", {
        title: formData.title.trim(),
        category: formData.category,
        amount: amountNum,
        date: formData.date ? new Date(formData.date) : new Date(),
      });

      if (res.data?.success) {
        showToast(
          `Expense of ${formatCurrency(amountNum)} recorded and deducted from profit!`,
          "success"
        );
        setShowAddModal(false);
        resetForm();
        fetchExpenses();
      }
    } catch (err) {
      console.error("Failed to add expense:", err);
      showToast(
        err.response?.data?.message || "Error recording expense",
        "danger"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense record?")) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await api.delete(`/expenses/${id}`);
      if (res.data?.success) {
        showToast("Expense record removed successfully", "success");
        fetchExpenses();
      }
    } catch (err) {
      console.error("Failed to delete expense:", err);
      showToast(
        err.response?.data?.message || "Failed to delete expense",
        "danger"
      );
    } finally {
      setDeletingId(null);
    }
  };



  return (
    <div className="container-fluid p-3 p-md-4">
      {/* Toast Alert */}
      {notification && (
        <div
          className={`alert alert-${notification.type} alert-dismissible fade show position-fixed top-0 end-0 m-3 shadow-sm`}
          style={{ zIndex: 1060, maxWidth: "400px" }}
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            <FiAlertCircle className="flex-shrink-0" />
            <div className="flex-grow-1 small">{notification.message}</div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setNotification(null)}
              aria-label="Close"
            />
          </div>
        </div>
      )}

      {/* Page Header with Sleek, Non-Wrapping Action Buttons (Fix Image 1) */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-3">
        <div className="flex-grow-1">
          <h4 className="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
            <FiCoffee className="text-warning" /> Daily Expenses & Operational Costs
          </h4>
          <p className="text-secondary small mb-0">
            Record everyday business spending (food, tea, staff, utilities, personal drawings).
            These expenses are <strong>automatically cut from Net Profit</strong> across the system.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center justify-content-center gap-2 text-nowrap px-3 py-2"
            onClick={fetchExpenses}
            disabled={isLoading}
          >
            <FiRefreshCw className={isLoading ? "spin" : ""} size={14} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-dark btn-sm d-inline-flex align-items-center justify-content-center gap-2 shadow-sm px-3 py-2 text-nowrap"
            onClick={() => setShowAddModal(true)}
          >
            <FiPlus size={16} />
            <span className="fw-semibold">Record Daily Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (2 Boxes: Expenses Till Yet & Today's Expenses) */}
      <div className="row g-3 mb-3">
        {/* Total Expenses Till Yet */}
        <div className="col-12 col-sm-6">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-secondary small fw-medium">Expense Till Yet</span>
              <div className="bg-danger bg-opacity-10 text-danger p-2 rounded-circle">
                <FiDollarSign size={18} />
              </div>
            </div>
            <h4 className="fw-bold text-danger mb-1">
              {formatCurrency(summary.allTimeAmount ?? summary.totalAmount)}
            </h4>
            <div className="text-secondary small">
              {summary.allTimeCount ?? summary.count} total expenses recorded
            </div>
          </div>
        </div>

        {/* Today's Expenses */}
        <div className="col-12 col-sm-6">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-secondary small fw-medium">Today's Expenses</span>
              <div className="bg-warning bg-opacity-10 text-warning p-2 rounded-circle">
                <FiClock size={18} />
              </div>
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {formatCurrency(summary.todayAmount)}
            </h4>
            <div className="text-secondary small">
              {summary.todayCount} recorded today
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card border shadow-sm rounded-3 mb-3 p-3 bg-white">
        {/* Row 1: Search & Category Filter */}
        <div className="row g-2 align-items-center justify-content-between mb-2">
          {/* Keyword Search */}
          <div className="col-12 col-md-7 col-lg-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white text-muted border-end-0">
                <FiSearch size={14} />
              </span>
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="Search expenses by title, payee, category..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0 text-muted px-2"
                  onClick={() => setSearchQuery("")}
                >
                  <FiX size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="col-12 col-md-5 col-lg-4 ms-auto">
            <select
              className="form-select form-select-sm"
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Date Period Quick Filters */}
        <div className="pt-2 border-top d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex flex-wrap align-items-center gap-1">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "last7days", label: "7 Days" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${
                  period === p.id
                    ? "btn-dark fw-semibold shadow-sm"
                    : "btn-outline-secondary bg-white text-secondary"
                }`}
                style={{ fontSize: "0.76rem" }}
                onClick={() => {
                  setPeriod(p.id);
                  setPage(1);
                }}
              >
                {p.label}
              </button>
            ))}

            {/* Custom Date Pickers */}
            {period === "custom" && (
              <div className="d-inline-flex align-items-center gap-1 ms-1">
                <input
                  type="date"
                  className="form-control form-control-sm"
                  style={{ width: "135px", fontSize: "0.75rem" }}
                  value={customStart}
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setPage(1);
                  }}
                />
                <span className="text-muted small">to</span>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  style={{ width: "135px", fontSize: "0.75rem" }}
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </div>

          {pagination?.totalExpenses !== undefined && (
            <div className="text-secondary small d-none d-md-block" style={{ fontSize: "0.75rem" }}>
              Total <strong>{pagination.totalExpenses}</strong> records
            </div>
          )}
        </div>
      </div>

      {/* Expenses Table Card (Removed Notes & Method columns) */}
      <div className="card border-0 shadow-sm rounded-3 overflow-hidden bg-white">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light text-secondary small fw-semibold">
              <tr>
                <th className="ps-3 py-3" style={{ width: "180px" }}>Date & Time</th>
                <th className="py-3">Title / Description</th>
                <th className="py-3" style={{ width: "220px" }}>Category</th>
                <th className="text-end py-3" style={{ width: "180px" }}>Amount</th>
                <th className="text-center pe-3 py-3" style={{ width: "90px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="text-center py-5 text-secondary">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                    <span>Loading expenses...</span>
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-5 text-secondary">
                    <FiCoffee className="display-6 text-muted mb-2 d-block mx-auto" />
                    <h6 className="fw-semibold text-dark mb-1">No Daily Expenses Found</h6>
                    <p className="small text-muted mb-3">
                      No expenses recorded for this filter. Click below to add food, tea, staff or other daily costs.
                    </p>
                    <button
                      type="button"
                      className="btn btn-dark btn-sm px-3"
                      onClick={() => setShowAddModal(true)}
                    >
                      <FiPlus className="me-1" /> Add Daily Expense
                    </button>
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp._id}>
                    <td className="ps-3 text-secondary small">
                      <div className="fw-medium text-dark">
                        {new Date(exp.date).toLocaleDateString("en-PK", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <div style={{ fontSize: "0.75rem" }}>
                        {new Date(exp.date).toLocaleTimeString("en-PK", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold text-dark">{exp.title}</div>
                    </td>
                    <td>
                      <span className={`badge px-2 py-1 small rounded-pill ${getCategoryBadgeClass(exp.category)}`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="text-end">
                      <span className="fw-bold text-danger fs-6">
                        - {formatCurrency(exp.amount)}
                      </span>
                    </td>
                    <td className="text-center pe-3">
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm p-1 rounded-2"
                        title="Delete expense"
                        disabled={deletingId === exp._id}
                        onClick={() => handleDeleteExpense(exp._id)}
                      >
                        {deletingId === exp._id ? (
                          <div className="spinner-border spinner-border-sm" role="status" />
                        ) : (
                          <FiTrash2 size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Count Footer */}
        {pagination.totalPages > 1 && (
          <div className="card-footer bg-white border-top d-flex justify-content-between align-items-center py-2 px-3">
            <span className="text-muted small">
              Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalExpenses} total)
            </span>
            <div className="d-flex gap-1">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Expense Modal (Simplified: No Cash/Method, No Notes) */}
      {showAddModal && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          role="dialog"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow rounded-3">
              <div className="modal-header border-bottom py-3 px-3">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <FiCoffee className="text-warning" /> Record Daily Expense
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close"
                  disabled={isSubmitting}
                />
              </div>

              <form onSubmit={handleAddExpense}>
                <div className="modal-body p-3">
                  <div className="alert alert-info py-2 px-3 small mb-3 border-0 bg-info bg-opacity-10 text-info-emphasis rounded-2">
                    <FiAlertCircle className="me-1" /> This expense will be deducted directly from your Net Profit.
                  </div>

                  {/* Title / Description */}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold text-dark">
                      Expense Title / Reason <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      className="form-control"
                      placeholder="e.g. Lunch for staff, Tea, Given to Brother, Electricity Bill..."
                      value={formData.title}
                      onChange={handleInputChange}
                      required
                      autoFocus
                    />
                  </div>

                  {/* Category & Amount Row */}
                  <div className="row g-2 mb-3">
                    <div className="col-12 col-sm-6">
                      <label className="form-label small fw-semibold text-dark">
                        Category <span className="text-danger">*</span>
                      </label>
                      <select
                        name="category"
                        className="form-select"
                        value={formData.category}
                        onChange={handleInputChange}
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-sm-6">
                      <label className="form-label small fw-semibold text-dark">
                        Amount (Rs.) <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text bg-light text-muted fw-bold">
                          Rs.
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          name="amount"
                          className="form-control fw-bold text-danger"
                          placeholder="0.00"
                          value={formData.amount}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="mb-2">
                    <label className="form-label small fw-semibold text-dark">
                      Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="date"
                      className="form-control"
                      value={formData.date}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="modal-footer border-top py-2 px-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowAddModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger btn-sm px-3 fw-semibold d-inline-flex align-items-center gap-1 shadow-sm text-nowrap"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="spinner-border spinner-border-sm me-1" role="status" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <FiPlus />
                        <span>Save & Deduct from Profit</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

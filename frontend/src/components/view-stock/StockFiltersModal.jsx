import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX, FiFilter, FiDollarSign, FiSearch, FiCreditCard, FiTruck } from "react-icons/fi";
import SupplierSelect from "./SupplierSelect";

export default function StockFiltersModal({
  isOpen,
  onClose,
  currentFilters,
  onApplyFilters,
  onResetFilters,
}) {
  const [draft, setDraft] = useState({
    productName: "",
    minPrice: "",
    maxPrice: "",
    paymentStatus: "",
    supplier: "",
  });

  useEffect(() => {
    if (isOpen) {
      setDraft({
        productName: currentFilters.productName || "",
        minPrice: currentFilters.minPrice || "",
        maxPrice: currentFilters.maxPrice || "",
        paymentStatus: currentFilters.paymentStatus || "",
        supplier: currentFilters.supplier || "",
      });
    }
  }, [isOpen, currentFilters]);

  if (!isOpen) return null;

  const handleApply = (e) => {
    e.preventDefault();
    onApplyFilters(draft);
    onClose();
  };

  const handleReset = () => {
    const clean = {
      productName: "",
      minPrice: "",
      maxPrice: "",
      paymentStatus: "",
      supplier: "",
    };
    setDraft(clean);
    onResetFilters();
    onClose();
  };

  const activeDraftCount = [
    draft.productName?.trim(),
    draft.minPrice,
    draft.maxPrice,
    draft.paymentStatus,
    draft.supplier,
  ].filter(Boolean).length;

  return createPortal(
    <div
      className="pos-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="pos-filter-modal-dialog"
        style={{ maxWidth: "580px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header border-bottom py-3 px-4 bg-light">
          <div className="d-flex align-items-center gap-3">
            <div
              className="bg-dark text-white rounded p-2 d-flex align-items-center justify-content-center"
              style={{ width: 34, height: 34 }}
            >
              <FiFilter size={16} />
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h6 className="modal-title fw-bold text-dark mb-0">
                  Database Stock Filters
                </h6>
                {activeDraftCount > 0 && (
                  <span className="badge bg-dark rounded-pill px-2 py-1 small">
                    {activeDraftCount} Active
                  </span>
                )}
              </div>
              <p className="text-muted small mb-0" style={{ fontSize: "0.78rem" }}>
                Filter products across the entire database by product name, supplier, payment status, and price range.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close"
          />
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="d-flex flex-column m-0">
          <div className="modal-body p-3 p-md-4 pos-modal-body-scroll">
            <div className="row g-3">
              {/* Line 1: Product Name (Fuzzy Search) - Full Width */}
              <div className="col-12">
                <label className="form-label small fw-semibold text-dark d-flex align-items-center justify-content-between mb-2">
                  <span className="d-flex align-items-center gap-2">
                    <FiSearch size={14} className="text-secondary" /> Product Name (Fuzzy Search)
                  </span>
                  {draft.productName && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => setDraft((prev) => ({ ...prev, productName: "" }))}
                    >
                      Clear
                    </button>
                  )}
                </label>

                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white text-muted px-3">
                    <FiSearch size={14} />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search by product name (e.g. Pixel 7, iPhone, Charger)..."
                    value={draft.productName}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, productName: e.target.value }))
                    }
                    autoFocus
                  />
                  {draft.productName && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-2"
                      onClick={() => setDraft((prev) => ({ ...prev, productName: "" }))}
                      title="Clear text"
                    >
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Line 2: Database Supplier & Payment Status in 1 Line */}
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-dark d-flex align-items-center justify-content-between mb-2">
                  <span className="d-flex align-items-center gap-2">
                    <FiTruck size={14} className="text-secondary" /> Database Supplier
                  </span>
                  {draft.supplier && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, supplier: "" }))
                      }
                    >
                      Clear
                    </button>
                  )}
                </label>
                <SupplierSelect
                  value={draft.supplier}
                  onChange={(supId) =>
                    setDraft((prev) => ({ ...prev, supplier: supId }))
                  }
                  placeholder="All Suppliers"
                  dropUp={false}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-dark d-flex align-items-center justify-content-between mb-2">
                  <span className="d-flex align-items-center gap-2">
                    <FiCreditCard size={14} className="text-secondary" /> Payment Status
                  </span>
                  {draft.paymentStatus && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, paymentStatus: "" }))
                      }
                    >
                      Clear
                    </button>
                  )}
                </label>
                <select
                  className="form-select form-select-sm"
                  value={draft.paymentStatus}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, paymentStatus: e.target.value }))
                  }
                >
                  <option value="">All Payment Statuses</option>
                  <option value="Paid">Fully Paid</option>
                  <option value="Partial">Partial Payment</option>
                  <option value="Due">Unpaid / Due</option>
                </select>
              </div>

              {/* Line 3: Unit Price Range (Rs.) in 1 Line */}
              <div className="col-12">
                <label className="form-label small fw-semibold text-dark d-flex align-items-center justify-content-between mb-2">
                  <span className="d-flex align-items-center gap-2">
                    <FiDollarSign size={14} className="text-secondary" /> Price Range / Unit
                  </span>
                  {(draft.minPrice || draft.maxPrice) && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, minPrice: "", maxPrice: "" }))
                      }
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="row g-2">
                  <div className="col-6">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-white text-muted px-3 small">Min</span>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        placeholder="0"
                        value={draft.minPrice}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, minPrice: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-white text-muted px-3 small">Max</span>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        placeholder="Any"
                        value={draft.maxPrice}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, maxPrice: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer border-top py-3 px-4 bg-light d-flex justify-content-between">
            <button
              type="button"
              className="btn btn-outline-danger btn-sm px-3"
              onClick={handleReset}
              disabled={activeDraftCount === 0}
            >
              Reset All Filters
            </button>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-3"
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-dark btn-sm px-4 fw-semibold text-nowrap">
                Apply Filters {activeDraftCount > 0 ? `(${activeDraftCount})` : ""}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

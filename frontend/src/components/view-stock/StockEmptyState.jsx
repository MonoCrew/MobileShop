import React from "react";
import { FiInbox, FiRotateCcw, FiPlus } from "react-icons/fi";
import { Link } from "react-router-dom";

export default function StockEmptyState({
  hasFilters,
  onResetFilters,
}) {
  return (
    <div className="card border shadow-sm rounded-3 bg-white p-5 text-center my-4">
      <div className="d-flex flex-column align-items-center justify-content-center">
        <div
          className="rounded-circle bg-light d-flex align-items-center justify-content-center mb-3 text-secondary"
          style={{ width: "64px", height: "64px" }}
        >
          <FiInbox size={32} />
        </div>
        <h5 className="fw-bold text-dark mb-1">No stock records found</h5>
        <p className="text-secondary small mb-4" style={{ maxWidth: "420px" }}>
          {hasFilters
            ? "We couldn't find any inventory matching your search keywords or filter criteria in the database."
            : "Your inventory is currently empty. Start by adding your first batch of stock."}
        </p>

        <div className="d-flex gap-2">
          {hasFilters ? (
            <button
              type="button"
              className="btn btn-outline-dark btn-sm d-inline-flex align-items-center gap-2 px-3"
              onClick={onResetFilters}
            >
              <FiRotateCcw size={14} /> Clear All Filters
            </button>
          ) : (
            <Link
              to="/add-stock"
              className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2 px-3"
            >
              <FiPlus size={14} /> Add First Stock
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

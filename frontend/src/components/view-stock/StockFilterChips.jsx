import React from "react";
import { FiX, FiCheckCircle } from "react-icons/fi";
import { formatUnit } from "../../utils/unitChanger";

export default function StockFilterChips({
  search,
  filters,
  sort,
  totalCount,
  loadedCount,
  hasMore,
  onRemoveFilter,
  onClearAll,
}) {
  const chips = [];

  if (search && search.trim()) {
    chips.push({
      key: "search",
      label: `Search: "${search.trim()}"`,
    });
  }

  if (filters.productName && filters.productName.trim()) {
    chips.push({
      key: "productName",
      label: `Product: "${filters.productName.trim()}"`,
    });
  }

  if (filters.minPrice !== "" && filters.maxPrice !== "") {
    chips.push({
      key: "price_range",
      label: `Price: ${formatUnit(filters.minPrice)} - ${formatUnit(filters.maxPrice)}`,
    });
  } else if (filters.minPrice !== "") {
    chips.push({
      key: "minPrice",
      label: `Min Price: ${formatUnit(filters.minPrice)}`,
    });
  } else if (filters.maxPrice !== "") {
    chips.push({
      key: "maxPrice",
      label: `Max Price: ${formatUnit(filters.maxPrice)}`,
    });
  }

  if (filters.stockStatus) {
    const labels = {
      out: "Out of Stock (0 units)",
      low: "Low Stock (≤ 20 units)",
      normal: "Normal Stock (21 - 100)",
      high: "High Stock (> 100 units)",
    };
    chips.push({
      key: "stockStatus",
      label: `Stock: ${labels[filters.stockStatus] || filters.stockStatus}`,
    });
  }

  if (filters.paymentStatus) {
    const paymentLabel = filters.paymentStatus === "Due" ? "Due / Unpaid" : filters.paymentStatus;
    chips.push({
      key: "paymentStatus",
      label: `Payment: ${paymentLabel}`,
    });
  }

  if (filters.supplier) {
    chips.push({
      key: "supplier",
      label: `Supplier: ${filters.supplierName || filters.supplier}`,
    });
  }

  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      {/* Active Filter Chips */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        {chips.length > 0 && (
          <span className="small text-muted fw-semibold me-1">Active filters:</span>
        )}
        {chips.map((chip) => (
          <span key={chip.key} className="pos-filter-chip">
            <span>{chip.label}</span>
            <button
              type="button"
              className="pos-filter-chip-remove"
              onClick={() => onRemoveFilter(chip.key)}
              title="Remove filter"
            >
              <FiX size={12} />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button
            type="button"
            className="btn btn-link btn-sm text-decoration-none text-danger p-0 ms-2 small fw-semibold"
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Record Counter Summary */}
      <div className="small text-muted ms-auto">
        <span className="fw-medium text-dark">{loadedCount}</span>
        {totalCount !== null && totalCount !== undefined ? (
          <span> of <span className="fw-medium text-dark">{totalCount}</span> loaded</span>
        ) : (
          <span> records loaded</span>
        )}
        {hasMore && <span className="badge bg-light text-secondary border ms-2">More available</span>}
      </div>
    </div>
  );
}

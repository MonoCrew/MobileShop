import React from "react";
import {
  FiSearch,
  FiX,
  FiFilter,
  FiList,
  FiGrid,
  FiMenu,
  FiRefreshCw,
} from "react-icons/fi";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "stock_desc", label: "Stock: High to Low" },
  { value: "stock_asc", label: "Stock: Low to High" },
  { value: "name_asc", label: "Name: A → Z" },
  { value: "name_desc", label: "Name: Z → A" },
];

export default function StockToolbar({
  search,
  onSearchChange,
  onClearSearch,
  isSearching,
  activeFilterCount,
  onOpenFilters,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  stockMode = "batch",
  onStockModeChange,
  onRefresh,
  totalCount,
  loadedCount,
  isLoading,
  searchInputRef,
  onSearchSubmit,
}) {
  return (
    <div className="card border shadow-sm rounded-3 mb-3 bg-white">
      <div className="card-body p-2 p-md-3">
        <div className="row g-2 align-items-center">
          {/* Search Bar */}
          <div className="col-12 col-md-5 col-lg-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 text-muted ps-2 pe-1">
                {isSearching ? (
                  <div
                    className="spinner-border spinner-border-sm text-dark"
                    style={{ width: "13px", height: "13px" }}
                    role="status"
                  />
                ) : (
                  <FiSearch size={14} />
                )}
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="form-control border-start-0 border-end-0 ps-1 py-1"
                placeholder="Search by name, IEMI, supplier..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const currentVal = e.target.value !== undefined ? e.target.value : search;
                    if (onSearchChange && currentVal !== search) {
                      onSearchChange(currentVal);
                    }
                    if (onSearchSubmit) {
                      onSearchSubmit(currentVal);
                    }
                  }
                }}
              />
              {search && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0 border text-muted px-2"
                  onClick={onClearSearch}
                  title="Clear search"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Action Tools: Sort, Filter, View Modes, Refresh */}
          <div className="col-12 col-md-7 col-lg-8 d-flex flex-wrap align-items-center justify-content-between justify-content-md-end gap-2">
            {/* Sort Selector */}
            <div className="d-flex align-items-center gap-1">
              <span className="small text-muted d-none d-sm-inline">Sort:</span>
              <select
                className="form-select form-select-sm border py-1"
                style={{ width: "auto", minWidth: "140px", fontSize: "0.8rem" }}
                value={sort}
                onChange={(e) => onSortChange(e.target.value)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Drawer Trigger */}
            <button
              type="button"
              className={`btn btn-sm d-inline-flex align-items-center gap-2 position-relative ${
                activeFilterCount > 0 ? "btn-dark" : "btn-outline-secondary"
              }`}
              onClick={onOpenFilters}
            >
              <FiFilter size={13} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="badge rounded-pill bg-danger ms-1" style={{ fontSize: "0.68rem" }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Mode Switcher: Batches vs Products */}
            <div className="btn-group btn-group-sm" role="group" aria-label="Stock Mode">
              <button
                type="button"
                className={`btn btn-sm py-1 px-2 ${
                  stockMode === "batch" ? "btn-dark fw-semibold" : "btn-outline-secondary"
                }`}
                style={{ fontSize: "0.76rem" }}
                onClick={() => onStockModeChange && onStockModeChange("batch")}
                title="View stock grouped by purchase intake batch"
              >
                Batches
              </button>
              <button
                type="button"
                className={`btn btn-sm py-1 px-2 ${
                  stockMode === "product" ? "btn-dark fw-semibold" : "btn-outline-secondary"
                }`}
                style={{ fontSize: "0.76rem" }}
                onClick={() => onStockModeChange && onStockModeChange("product")}
                title="View individual product items"
              >
                Products
              </button>
            </div>

            {/* View Mode Toggle Buttons with Smooth Animations */}
            <div className="pos-view-btn-group" role="group" aria-label="View Mode">
              <button
                type="button"
                className={`pos-view-btn-item ${viewMode === "table" ? "active" : ""}`}
                onClick={() => onViewModeChange("table")}
                title="Table View"
              >
                <FiList size={13} />
                <span className="d-none d-xl-inline">Table</span>
              </button>
              <button
                type="button"
                className={`pos-view-btn-item ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => onViewModeChange("grid")}
                title="Grid / Cards View"
              >
                <FiGrid size={13} />
                <span className="d-none d-xl-inline">Grid</span>
              </button>
              <button
                type="button"
                className={`pos-view-btn-item ${viewMode === "compact" ? "active" : ""}`}
                onClick={() => onViewModeChange("compact")}
                title="Compact Scanner View"
              >
                <FiMenu size={13} />
                <span className="d-none d-xl-inline">Compact</span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm p-2"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Stock"
            >
              <FiRefreshCw size={13} className={isLoading ? "spin-animation" : ""} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

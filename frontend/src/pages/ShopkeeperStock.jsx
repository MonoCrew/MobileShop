import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FiSearch,
  FiRefreshCw,
  FiShare2,
  FiRotateCcw,
  FiDollarSign,
  FiUsers,
  FiPackage,
  FiClock,
  FiAlertCircle,
  FiCheckCircle,
  FiTag,
  FiFilter,
  FiX,
  FiUser,
  FiCalendar,
} from "react-icons/fi";
import api from "../api/axios";
import { formatFullAmount } from "../utils/unitChanger";
import ReturnStockModal from "../components/shopkeeper/ReturnStockModal";
import MarkAsSoldModal from "../components/shopkeeper/MarkAsSoldModal";
import ShopkeeperDetailModal from "../components/shopkeeper/ShopkeeperDetailModal";
import ShopkeeperStockFiltersModal from "../components/shopkeeper/ShopkeeperStockFiltersModal";

export default function ShopkeeperStock() {
  const [transfers, setTransfers] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    shopkeeperName: "",
    productName: "",
    startDate: "",
    endDate: "",
    minPrice: "",
    maxPrice: "",
  });

  // Advanced Filters Modal state
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // DB Suggestions for search input
  const [filterOptions, setFilterOptions] = useState({ shopkeepers: [], products: [] });
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const searchContainerRef = useRef(null);

  useEffect(() => {
    const fetchDbOptions = async () => {
      try {
        const res = await api.get("/shopkeepers/filter-options");
        if (res.data?.success && res.data.data) {
          setFilterOptions(res.data.data);
        }
      } catch (err) {
        console.error("Failed to load DB filter options:", err);
      }
    };
    fetchDbOptions();
  }, []);

  // Close search suggestions on click outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // When an item is returned from shopkeeper to my shop, do not show it in the default/main view.
  // It is only visible if the user explicitly switches to the "Returned" tab.
  const displayedTransfers = transfers.filter((item) => {
    if (filters.status === "all") {
      return item.status !== "returned" && (item.remainingQuantity > 0 || item.soldQuantity > 0);
    }
    return true;
  });

  // Modals state
  const [returnModalTransfer, setReturnModalTransfer] = useState(null);
  const [sellModalTransfer, setSellModalTransfer] = useState(null);
  const [detailShopkeeper, setDetailShopkeeper] = useState(null);

  const abortControllerRef = useRef(null);

  const fetchTransfers = useCallback(async () => {
    try {
      setIsLoading(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      const params = { limit: 100 };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (filters.status && filters.status !== "all") params.status = filters.status;
      if (filters.shopkeeperName?.trim()) params.shopkeeperName = filters.shopkeeperName.trim();
      if (filters.productName?.trim()) params.productName = filters.productName.trim();
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.minPrice !== "" && filters.minPrice != null) params.minPrice = filters.minPrice;
      if (filters.maxPrice !== "" && filters.maxPrice != null) params.maxPrice = filters.maxPrice;

      const res = await api.get("/shopkeepers/transfers", {
        params,
        signal: abortControllerRef.current.signal,
      });

      if (res.data?.success) {
        setTransfers(res.data.data || []);
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Failed to load shopkeeper transfers:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTransfers();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchTransfers]);

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

  const getStatusBadge = (status, remainingQty) => {
    if (remainingQty <= 0) {
      if (status === "returned") {
        return <span className="badge bg-secondary-subtle text-secondary border px-2 py-1" style={{ fontSize: "0.68rem" }}>Returned</span>;
      }
      return <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style={{ fontSize: "0.68rem" }}>Fully Sold</span>;
    }
    if (status === "partially_completed") {
      return <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: "0.68rem" }}>Partial</span>;
    }
    return <span className="badge bg-dark text-white px-2 py-1" style={{ fontSize: "0.68rem" }}>Active</span>;
  };

  return (
    <div className="d-flex flex-column gap-3 w-100 pb-4">
      {/* Page Title & Refresh */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom pb-3">
        <div>
          <h4 className="fw-bold text-dark mb-0">Shopkeeper Stock & Sale</h4>
          <p className="text-secondary small mb-0" style={{ fontSize: "0.78rem" }}>
            Track consignment stock held by other shopkeepers, process returns, and record completed sales.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline-dark btn-sm d-flex align-items-center gap-2 px-3 py-2 rounded-2"
          onClick={fetchTransfers}
          disabled={isLoading}
          title="Refresh shopkeeper stock"
        >
          <FiRefreshCw size={13} className={isLoading ? "spinner-border spinner-border-sm p-0" : ""} />
          <span className="small fw-semibold">Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="row g-2">
        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                Stock Currently Held
              </span>
              <span className="p-1 rounded-circle bg-dark-subtle text-dark">
                <FiPackage size={13} />
              </span>
            </div>
            <h4 className="fw-bold text-dark mb-0">{stats?.currentUnitsHeld || 0} units</h4>
            <span className="text-muted small mt-1" style={{ fontSize: "0.68rem" }}>
              Total taken: {stats?.totalUnitsTaken || 0} units
            </span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                Units Returned
              </span>
              <span className="p-1 rounded-circle bg-secondary-subtle text-secondary">
                <FiRotateCcw size={13} />
              </span>
            </div>
            <h4 className="fw-bold text-dark mb-0">{stats?.totalUnitsReturned || 0} units</h4>
            <span className="text-muted small mt-1" style={{ fontSize: "0.68rem" }}>
              Returned to shop stock
            </span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                Units Sold
              </span>
              <span className="p-1 rounded-circle bg-success-subtle text-success">
                <FiCheckCircle size={13} />
              </span>
            </div>
            <h4 className="fw-bold text-success mb-0">{stats?.totalUnitsSold || 0} units</h4>
            <span className="text-muted small mt-1" style={{ fontSize: "0.68rem" }}>
              Completed retail sales
            </span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card border shadow-sm rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                Total Expected Value
              </span>
              <span className="p-1 rounded-circle bg-primary-subtle text-primary">
                <FiDollarSign size={13} />
              </span>
            </div>
            <h4 className="fw-bold text-dark mb-0">{formatFullAmount(stats?.totalExpectedAmount || 0)}</h4>
            <span className="text-muted small mt-1" style={{ fontSize: "0.68rem" }}>
              Across {stats?.totalTransfers || 0} transfers
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar & Search Bar with DB Suggestions */}
      <div className="card border shadow-sm rounded-3 p-3 bg-white">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          {/* Search Input with Live DB Suggestions */}
          <div className="position-relative flex-grow-1" style={{ maxWidth: "380px" }} ref={searchContainerRef}>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white text-secondary">
                <FiSearch size={14} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchSuggestions(true);
                }}
                onFocus={() => setShowSearchSuggestions(true)}
                placeholder="Search shopkeeper, product, barcode..."
                className="form-control"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary px-2"
                  onClick={() => {
                    setSearchQuery("");
                    setShowSearchSuggestions(false);
                  }}
                  title="Clear search"
                >
                  <FiX size={12} />
                </button>
              )}
            </div>

            {/* DB Autocomplete Dropdown */}
            {showSearchSuggestions && searchQuery.trim().length >= 1 && (
              <div
                className="dropdown-menu show w-100 shadow border rounded-2 p-1 position-absolute mt-1"
                style={{ maxHeight: "240px", overflowY: "auto", zIndex: 1050 }}
              >
                {/* Matched Shopkeepers from DB */}
                {(() => {
                  const q = searchQuery.toLowerCase().trim();
                  const matchedShopkeepers = (filterOptions.shopkeepers || []).filter(
                    (s) => s.name?.toLowerCase().includes(q) || s.phone?.includes(q)
                  );
                  const matchedProducts = (filterOptions.products || []).filter(
                    (p) => p.toLowerCase().includes(q)
                  );

                  return (
                    <>
                      {matchedShopkeepers.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-uppercase text-secondary fw-bold" style={{ fontSize: "0.66rem" }}>
                            Shopkeepers (From DB)
                          </div>
                          {matchedShopkeepers.slice(0, 4).map((s) => (
                            <button
                              key={s._id}
                              type="button"
                              className="dropdown-item py-1 px-2 small rounded d-flex align-items-center gap-2"
                              onClick={() => {
                                setSearchQuery(s.name);
                                setShowSearchSuggestions(false);
                              }}
                            >
                              <FiUser size={13} className="text-primary flex-shrink-0" />
                              <span className="fw-medium text-dark">{s.name}</span>
                              {s.phone && <span className="text-muted small">({s.phone})</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {matchedProducts.length > 0 && (
                        <div className={matchedShopkeepers.length > 0 ? "border-top pt-1 mt-1" : ""}>
                          <div className="px-2 py-1 text-uppercase text-secondary fw-bold" style={{ fontSize: "0.66rem" }}>
                            Products (From DB)
                          </div>
                          {matchedProducts.slice(0, 4).map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="dropdown-item py-1 px-2 small rounded d-flex align-items-center gap-2"
                              onClick={() => {
                                setSearchQuery(p);
                                setShowSearchSuggestions(false);
                              }}
                            >
                              <FiPackage size={13} className="text-success flex-shrink-0" />
                              <span className="fw-medium text-dark">{p}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {matchedShopkeepers.length === 0 && matchedProducts.length === 0 && (
                        <div className="px-3 py-2 text-muted small text-center">
                          Press Enter to search database for "{searchQuery}"
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            {/* Advanced Filters Button */}
            <button
              type="button"
              className={`btn btn-sm d-flex align-items-center gap-2 px-3 py-2 rounded-2 ${
                [
                  filters.shopkeeperName?.trim(),
                  filters.productName?.trim(),
                  filters.startDate,
                  filters.endDate,
                  filters.minPrice !== "" && filters.minPrice != null,
                  filters.maxPrice !== "" && filters.maxPrice != null,
                ].filter(Boolean).length > 0
                  ? "btn-dark text-white fw-semibold"
                  : "btn-outline-dark"
              }`}
              style={{ fontSize: "0.74rem" }}
              onClick={() => setIsFilterModalOpen(true)}
              title="Open advanced database filters (date range, product, shopkeeper, price)"
            >
              <FiFilter size={13} />
              <span>Advanced Filters</span>
              {[
                filters.shopkeeperName?.trim(),
                filters.productName?.trim(),
                filters.startDate,
                filters.endDate,
                filters.minPrice !== "" && filters.minPrice != null,
                filters.maxPrice !== "" && filters.maxPrice != null,
              ].filter(Boolean).length > 0 && (
                <span className="badge bg-primary text-white rounded-pill px-2" style={{ fontSize: "0.68rem" }}>
                  {[
                    filters.shopkeeperName?.trim(),
                    filters.productName?.trim(),
                    filters.startDate,
                    filters.endDate,
                    filters.minPrice !== "" && filters.minPrice != null,
                    filters.maxPrice !== "" && filters.maxPrice != null,
                  ].filter(Boolean).length}
                </span>
              )}
            </button>


          </div>
        </div>

        {/* Active Advanced Filters Chips Bar */}
        {[
          filters.shopkeeperName?.trim(),
          filters.productName?.trim(),
          filters.startDate,
          filters.endDate,
          filters.minPrice !== "" && filters.minPrice != null,
          filters.maxPrice !== "" && filters.maxPrice != null,
        ].filter(Boolean).length > 0 && (
          <div className="d-flex align-items-center gap-2 flex-wrap pt-2 mt-2 border-top" style={{ fontSize: "0.72rem" }}>
            <span className="text-secondary fw-semibold">Active Filters:</span>

            {filters.shopkeeperName && (
              <span className="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2">
                <FiUser size={10} className="text-primary" />
                <span>Shopkeeper: {filters.shopkeeperName}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-dark ms-1"
                  onClick={() => setFilters((prev) => ({ ...prev, shopkeeperName: "" }))}
                >
                  <FiX size={11} />
                </button>
              </span>
            )}

            {filters.productName && (
              <span className="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2">
                <FiPackage size={10} className="text-success" />
                <span>Product: {filters.productName}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-dark ms-1"
                  onClick={() => setFilters((prev) => ({ ...prev, productName: "" }))}
                >
                  <FiX size={11} />
                </button>
              </span>
            )}

            {(filters.startDate || filters.endDate) && (
              <span className="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2">
                <FiCalendar size={10} className="text-secondary" />
                <span>Date: {filters.startDate || "Any"} to {filters.endDate || "Any"}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-dark ms-1"
                  onClick={() => setFilters((prev) => ({ ...prev, startDate: "", endDate: "" }))}
                >
                  <FiX size={11} />
                </button>
              </span>
            )}

            {(filters.minPrice || filters.maxPrice) && (
              <span className="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2">
                <FiDollarSign size={10} className="text-secondary" />
                <span>Price: Rs. {filters.minPrice || 0} - {filters.maxPrice || "Any"}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-dark ms-1"
                  onClick={() => setFilters((prev) => ({ ...prev, minPrice: "", maxPrice: "" }))}
                >
                  <FiX size={11} />
                </button>
              </span>
            )}

            <button
              type="button"
              className="btn btn-link p-0 text-danger small text-decoration-none ms-auto"
              style={{ fontSize: "0.72rem" }}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  shopkeeperName: "",
                  productName: "",
                  startDate: "",
                  endDate: "",
                  minPrice: "",
                  maxPrice: "",
                }))
              }
            >
              Clear All Advanced
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="card border shadow-sm rounded-3 bg-white overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.78rem" }}>
            <thead className="table-light text-uppercase fw-semibold text-secondary" style={{ fontSize: "0.72rem" }}>
              <tr>
                <th className="ps-3 py-2">Shopkeeper Name</th>
                <th className="py-2">Product Name</th>
                <th className="text-center py-2">Qty</th>
                <th className="text-end py-2">Cost / Unit</th>
                <th className="text-end py-2">Agreed Price</th>
                <th className="py-2">Transfer Date</th>
                <th className="text-center pe-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && displayedTransfers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5">
                    <div className="spinner-border spinner-border-sm text-dark mb-2" role="status" />
                    <div className="text-secondary small">Loading shopkeeper stock records...</div>
                  </td>
                </tr>
              ) : displayedTransfers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5">
                    <FiUsers size={28} className="text-muted mb-2 d-block mx-auto" />
                    <h6 className="fw-semibold text-dark mb-1">No shopkeeper stock records found</h6>
                    <p className="text-secondary small mb-0" style={{ fontSize: "0.76rem" }}>
                      {searchQuery
                        ? `No transfers match "${searchQuery}". Try adjusting your search.`
                        : 'Go to "View Stock", click the three dots on any item, and select "Give to Another Shopkeeper".'}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedTransfers.map((item) => {
                  const remaining = item.remainingQuantity || 0;
                  const hasRemaining = remaining > 0;

                  return (
                    <tr key={item._id} className="pos-table-row">
                      {/* Shopkeeper Name (Clickable link to open details modal) */}
                      <td className="ps-3 py-2">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-start text-dark fw-bold text-decoration-none d-flex align-items-center gap-2"
                          style={{ fontSize: "0.78rem" }}
                          onClick={() =>
                            setDetailShopkeeper({
                              _id: item.shopkeeperId,
                              name: item.shopkeeperName,
                            })
                          }
                          title="Click to view shopkeeper profile & complete history"
                        >
                          <FiUsers size={13} className="text-primary flex-shrink-0" />
                          <span className="text-truncate" style={{ maxWidth: "160px" }}>
                            {item.shopkeeperName}
                          </span>
                        </button>
                        <div className="text-muted font-monospace" style={{ fontSize: "0.66rem" }}>
                          #{item.transferNumber}
                        </div>
                      </td>

                      {/* Product Name */}
                      <td className="py-2">
                        <span className="fw-semibold text-dark text-truncate d-block" style={{ maxWidth: "200px" }} title={item.productName}>
                          {item.productName}
                        </span>
                        {item.barcode && item.barcode !== "N/A" && (
                          <span className="text-muted font-monospace" style={{ fontSize: "0.68rem" }}>
                            <FiTag size={10} className="me-1" />
                            {item.barcode}
                          </span>
                        )}
                      </td>

                      {/* Qty (Dynamically updates on sale or return) */}
                      <td className="text-center py-2">
                        <span
                          className={`badge px-2 py-1 ${
                            remaining > 0 ? "bg-dark text-white fw-bold" : "bg-light text-secondary border"
                          }`}
                          style={{ fontSize: "0.74rem" }}
                        >
                          {remaining} units
                        </span>
                        {item.originalQuantity > remaining && (
                          <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                            of {item.originalQuantity} taken
                          </div>
                        )}
                      </td>

                      {/* Cost per Unit */}
                      <td className="text-end py-2 text-nowrap text-secondary">
                        {formatFullAmount(item.unitCost)}
                      </td>

                      {/* Agreed Price per Unit */}
                      <td className="text-end py-2 text-nowrap fw-semibold text-dark">
                        {formatFullAmount(item.agreedAmountPerUnit)}
                      </td>

                      {/* Transfer Date */}
                      <td className="py-2 text-nowrap text-secondary">
                        {formatDate(item.transferDate)}
                      </td>

                      {/* Actions */}
                      <td className="text-center pe-3 py-2">
                        <div className="d-flex align-items-center justify-content-center gap-1">
                          {/* Return Stock Button */}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 px-2 py-1"
                            style={{ fontSize: "0.7rem" }}
                            onClick={() => setReturnModalTransfer(item)}
                            disabled={!hasRemaining}
                            title={hasRemaining ? "Return unsold phones back to my shop" : "All stock already returned or sold"}
                          >
                            <FiRotateCcw size={11} />
                            <span>Return</span>
                          </button>

                          {/* Mark as Sold Button */}
                          <button
                            type="button"
                            className="btn btn-sm btn-dark d-inline-flex align-items-center gap-1 px-3 py-1"
                            style={{ fontSize: "0.7rem" }}
                            onClick={() => setSellModalTransfer(item)}
                            disabled={!hasRemaining}
                            title={hasRemaining ? "Confirm sale & record profit" : "All stock already sold"}
                          >
                            <FiDollarSign size={11} />
                            <span>Mark Sold</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ReturnStockModal
        isOpen={Boolean(returnModalTransfer)}
        transfer={returnModalTransfer}
        onClose={() => setReturnModalTransfer(null)}
        onReturnSuccess={() => {
          fetchTransfers();
        }}
      />

      <MarkAsSoldModal
        isOpen={Boolean(sellModalTransfer)}
        transfer={sellModalTransfer}
        onClose={() => setSellModalTransfer(null)}
        onSaleSuccess={() => {
          fetchTransfers();
        }}
      />

      <ShopkeeperDetailModal
        isOpen={Boolean(detailShopkeeper)}
        shopkeeperId={detailShopkeeper?._id}
        shopkeeperName={detailShopkeeper?.name}
        onClose={() => setDetailShopkeeper(null)}
        onRecordUpdated={() => {
          fetchTransfers();
        }}
      />

      {/* Advanced Filters Modal */}
      <ShopkeeperStockFiltersModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        currentFilters={filters}
        onApplyFilters={(newFilters) => {
          setFilters(newFilters);
        }}
        onResetFilters={() => {
          setFilters({
            status: "all",
            shopkeeperName: "",
            productName: "",
            startDate: "",
            endDate: "",
            minPrice: "",
            maxPrice: "",
          });
        }}
      />
    </div>
  );
}

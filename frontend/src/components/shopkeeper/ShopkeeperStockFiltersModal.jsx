import React, { useState, useEffect, useRef } from "react";
import {
  FiX,
  FiFilter,
  FiSearch,
  FiCalendar,
  FiDollarSign,
  FiUser,
  FiPackage,
  FiCheck,
  FiRotateCcw,
} from "react-icons/fi";
import api from "../../api/axios";

export default function ShopkeeperStockFiltersModal({
  isOpen,
  onClose,
  currentFilters,
  onApplyFilters,
  onResetFilters,
}) {
  const [draft, setDraft] = useState({
    shopkeeperName: "",
    productName: "",
    startDate: "",
    endDate: "",
    minPrice: "",
    maxPrice: "",
  });

  // DB options
  const [dbShopkeepers, setDbShopkeepers] = useState([]);
  const [dbProducts, setDbProducts] = useState([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // Search input state inside popup
  const [shopkeeperQuery, setShopkeeperQuery] = useState("");
  const [showShopkeeperDropdown, setShowShopkeeperDropdown] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const shopkeeperContainerRef = useRef(null);
  const productContainerRef = useRef(null);

  // Sync draft when opened
  useEffect(() => {
    if (isOpen) {
      setDraft({
        shopkeeperName: currentFilters.shopkeeperName || "",
        productName: currentFilters.productName || "",
        startDate: currentFilters.startDate || "",
        endDate: currentFilters.endDate || "",
        minPrice: currentFilters.minPrice || "",
        maxPrice: currentFilters.maxPrice || "",
      });
      setShopkeeperQuery(currentFilters.shopkeeperName || "");
      setProductQuery(currentFilters.productName || "");
      fetchOptionsFromDb();
    }
  }, [isOpen, currentFilters]);

  // Fetch filter options directly from DB
  const fetchOptionsFromDb = async () => {
    try {
      setIsLoadingOptions(true);
      const res = await api.get("/shopkeepers/filter-options");
      if (res.data?.success && res.data.data) {
        setDbShopkeepers(res.data.data.shopkeepers || []);
        setDbProducts(res.data.data.products || []);
      }
    } catch (err) {
      console.error("Failed to load filter options from DB:", err);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (
        shopkeeperContainerRef.current &&
        !shopkeeperContainerRef.current.contains(e.target)
      ) {
        setShowShopkeeperDropdown(false);
      }
      if (
        productContainerRef.current &&
        !productContainerRef.current.contains(e.target)
      ) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  if (!isOpen) return null;

  // Filtered shopkeeper suggestions from DB
  const filteredShopkeepers = dbShopkeepers.filter((s) => {
    const q = shopkeeperQuery.toLowerCase().trim();
    if (!q) return true;
    return s.name?.toLowerCase().includes(q) || s.phone?.includes(q);
  });

  // Filtered product suggestions from DB
  const filteredProducts = dbProducts.filter((p) => {
    const q = productQuery.toLowerCase().trim();
    if (!q) return true;
    return p.toLowerCase().includes(q);
  });

  // Quick date presets
  const setDatePreset = (preset) => {
    const now = new Date();
    const formatYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (preset === "today") {
      const todayStr = formatYMD(now);
      setDraft((prev) => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (preset === "7days") {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setDraft((prev) => ({
        ...prev,
        startDate: formatYMD(past),
        endDate: formatYMD(now),
      }));
    } else if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDraft((prev) => ({
        ...prev,
        startDate: formatYMD(firstDay),
        endDate: formatYMD(now),
      }));
    } else if (preset === "clear") {
      setDraft((prev) => ({ ...prev, startDate: "", endDate: "" }));
    }
  };

  const activeCount = [
    draft.shopkeeperName?.trim(),
    draft.productName?.trim(),
    draft.startDate,
    draft.endDate,
    draft.minPrice,
    draft.maxPrice,
  ].filter(Boolean).length;

  const handleApply = (e) => {
    e.preventDefault();
    onApplyFilters({
      ...draft,
      shopkeeperName: shopkeeperQuery.trim(),
      productName: productQuery.trim(),
    });
    onClose();
  };

  const handleReset = () => {
    setShopkeeperQuery("");
    setProductQuery("");
    setDraft({
      shopkeeperName: "",
      productName: "",
      startDate: "",
      endDate: "",
      minPrice: "",
      maxPrice: "",
    });
    onResetFilters();
    onClose();
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 1065 }}
      tabIndex="-1"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        style={{ maxWidth: "560px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3">
            <div className="d-flex align-items-center gap-2">
              <FiFilter size={16} />
              <h6 className="modal-title fw-semibold mb-0" style={{ fontSize: "0.92rem" }}>
                Advanced Stock Filters
              </h6>
              {activeCount > 0 && (
                <span className="badge bg-light text-dark rounded-pill px-2 py-1 small" style={{ fontSize: "0.68rem" }}>
                  {activeCount} Active
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          <form onSubmit={handleApply} className="d-flex flex-column m-0">
            <div className="modal-body p-3">
              {/* 1. Date Range Section */}
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label className="form-label small fw-semibold text-dark mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.78rem" }}>
                    <FiCalendar size={14} className="text-secondary" />
                    <span>Transfer Date Range</span>
                  </label>
                  <div className="d-flex align-items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => setDatePreset("today")}
                    >
                      Today
                    </button>
                    <span className="text-muted small">•</span>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => setDatePreset("7days")}
                    >
                      Last 7d
                    </button>
                    <span className="text-muted small">•</span>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => setDatePreset("thisMonth")}
                    >
                      This Month
                    </button>
                    {(draft.startDate || draft.endDate) && (
                      <>
                        <span className="text-muted small">•</span>
                        <button
                          type="button"
                          className="btn btn-link p-0 text-decoration-none text-danger small"
                          style={{ fontSize: "0.7rem" }}
                          onClick={() => setDatePreset("clear")}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <div className="input-group input-group-sm" style={{ height: "38px" }}>
                      <span className="input-group-text bg-light text-secondary small px-2">From</span>
                      <input
                        type="date"
                        className="form-control"
                        value={draft.startDate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="input-group input-group-sm" style={{ height: "38px" }}>
                      <span className="input-group-text bg-light text-secondary small px-2">To</span>
                      <input
                        type="date"
                        className="form-control"
                        value={draft.endDate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Shopkeeper Name (DB Populated & Searchable) */}
              <div className="mb-3" ref={shopkeeperContainerRef}>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small fw-semibold text-dark mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.78rem" }}>
                    <FiUser size={14} className="text-secondary" />
                    <span>Shopkeeper Name </span>
                  </label>
                  {shopkeeperQuery && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => {
                        setShopkeeperQuery("");
                        setDraft((prev) => ({ ...prev, shopkeeperName: "" }));
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="position-relative">
                  <div className="input-group input-group-sm" style={{ height: "38px" }}>
                    <span className="input-group-text bg-white text-secondary px-2">
                      <FiSearch size={14} />
                    </span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search or pick shopkeeper from DB..."
                      value={shopkeeperQuery}
                      onChange={(e) => {
                        setShopkeeperQuery(e.target.value);
                        setDraft((prev) => ({ ...prev, shopkeeperName: e.target.value }));
                        setShowShopkeeperDropdown(true);
                      }}
                      onFocus={() => setShowShopkeeperDropdown(true)}
                    />
                    {shopkeeperQuery && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary px-2"
                        onClick={() => {
                          setShopkeeperQuery("");
                          setDraft((prev) => ({ ...prev, shopkeeperName: "" }));
                        }}
                      >
                        <FiX size={12} />
                      </button>
                    )}
                  </div>

                  {/* Searchable Dropdown */}
                  {showShopkeeperDropdown && (
                    <div
                      className="dropdown-menu show w-100 shadow border rounded-2 p-1 position-absolute mt-1"
                      style={{ maxHeight: "180px", overflowY: "auto", zIndex: 1080 }}
                    >
                      <button
                        type="button"
                        className="dropdown-item py-1 px-2 small rounded text-secondary"
                        onClick={() => {
                          setShopkeeperQuery("");
                          setDraft((prev) => ({ ...prev, shopkeeperName: "" }));
                          setShowShopkeeperDropdown(false);
                        }}
                      >
                        <em>All Shopkeepers (No filter)</em>
                      </button>
                      {filteredShopkeepers.length === 0 ? (
                        <div className="px-3 py-2 text-muted small">
                          No matching shopkeepers found in DB
                        </div>
                      ) : (
                        filteredShopkeepers.map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            className="dropdown-item py-1 px-2 small rounded d-flex align-items-center justify-content-between"
                            onClick={() => {
                              setShopkeeperQuery(s.name);
                              setDraft((prev) => ({ ...prev, shopkeeperName: s.name }));
                              setShowShopkeeperDropdown(false);
                            }}
                          >
                            <span className="fw-medium text-dark">{s.name}</span>
                            {shopkeeperQuery === s.name && (
                              <FiCheck size={13} className="text-success" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Product Name (DB Populated & Searchable) */}
              <div className="mb-3" ref={productContainerRef}>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small fw-semibold text-dark mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.78rem" }}>
                    <FiPackage size={14} className="text-secondary" />
                    <span>Product Name </span>
                  </label>
                  {productQuery && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => {
                        setProductQuery("");
                        setDraft((prev) => ({ ...prev, productName: "" }));
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="position-relative">
                  <div className="input-group input-group-sm" style={{ height: "38px" }}>
                    <span className="input-group-text bg-white text-secondary px-2">
                      <FiSearch size={14} />
                    </span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search or pick product from DB..."
                      value={productQuery}
                      onChange={(e) => {
                        setProductQuery(e.target.value);
                        setDraft((prev) => ({ ...prev, productName: e.target.value }));
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                    />
                    {productQuery && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary px-2"
                        onClick={() => {
                          setProductQuery("");
                          setDraft((prev) => ({ ...prev, productName: "" }));
                        }}
                      >
                        <FiX size={12} />
                      </button>
                    )}
                  </div>

                  {/* Searchable Dropdown */}
                  {showProductDropdown && (
                    <div
                      className="dropdown-menu show w-100 shadow border rounded-2 p-1 position-absolute mt-1"
                      style={{ maxHeight: "180px", overflowY: "auto", zIndex: 1080 }}
                    >
                      <button
                        type="button"
                        className="dropdown-item py-1 px-2 small rounded text-secondary"
                        onClick={() => {
                          setProductQuery("");
                          setDraft((prev) => ({ ...prev, productName: "" }));
                          setShowProductDropdown(false);
                        }}
                      >
                        <em>All Products (No filter)</em>
                      </button>
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-2 text-muted small">
                          No matching products found in DB
                        </div>
                      ) : (
                        filteredProducts.map((p) => (
                          <button
                            key={p}
                            type="button"
                            className="dropdown-item py-1 px-2 small rounded d-flex align-items-center justify-content-between"
                            onClick={() => {
                              setProductQuery(p);
                              setDraft((prev) => ({ ...prev, productName: p }));
                              setShowProductDropdown(false);
                            }}
                          >
                            <span className="fw-medium text-dark">{p}</span>
                            {productQuery === p && (
                              <FiCheck size={13} className="text-success" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Price Range per Unit */}
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <label className="form-label small fw-semibold text-dark mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.78rem" }}>
                    <FiDollarSign size={14} className="text-secondary" />
                    <span>Price Range per Unit (Agreed Price)</span>
                  </label>
                  {(draft.minPrice || draft.maxPrice) && (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-muted small"
                      style={{ fontSize: "0.7rem" }}
                      onClick={() => setDraft((prev) => ({ ...prev, minPrice: "", maxPrice: "" }))}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <div className="input-group input-group-sm" style={{ height: "38px" }}>
                      <span className="input-group-text bg-light text-secondary small px-2">Min Rs.</span>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        placeholder="0"
                        value={draft.minPrice}
                        onChange={(e) => setDraft((prev) => ({ ...prev, minPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="input-group input-group-sm" style={{ height: "38px" }}>
                      <span className="input-group-text bg-light text-secondary small px-2">Max Rs.</span>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        placeholder="Any"
                        value={draft.maxPrice}
                        onChange={(e) => setDraft((prev) => ({ ...prev, maxPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-2 d-flex align-items-center gap-2"
                onClick={handleReset}
              >
                <FiRotateCcw size={13} />
                <span>Reset All</span>
              </button>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary px-3 py-2"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-dark px-3 py-2 d-flex align-items-center gap-2"
                >
                  <FiCheck size={14} />
                  <span>Apply Filters</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FiSearch, FiChevronDown, FiX, FiCheck, FiTruck, FiLoader } from "react-icons/fi";
import api from "../../api/axios";

/**
 * SupplierSelect Component
 * Features:
 * - 100% database-driven cursor pagination (batches of 50)
 * - Server-side search with 300ms debouncing (no frontend array filtering)
 * - Infinite scroll near the bottom of options
 * - Abort controller for request cancellation & race-condition prevention
 * - Clean POS theme styling with loading, empty, and no-results states
 */
export default function SupplierSelect({
  value = "",
  onChange,
  placeholder = "All Suppliers",
  className = "",
  compact = false,
  dropUp = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState("");

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

  // If a value is provided and we haven't resolved its name, fetch it
  useEffect(() => {
    if (!value) {
      setSelectedSupplierName("");
      return;
    }

    // Check if it's already in the loaded suppliers
    const found = suppliers.find((s) => s._id === value);
    if (found) {
      setSelectedSupplierName(found.name);
      return;
    }

    // Fetch the single supplier name from backend if not loaded
    let isCancelled = false;
    api
      .get(`/suppliers/${value}`)
      .then((res) => {
        if (!isCancelled && res.data?.success && res.data?.data) {
          setSelectedSupplierName(res.data.data.name);
        }
      })
      .catch(() => {
        // Silently catch in case of network or not found
      });

    return () => {
      isCancelled = true;
    };
  }, [value, suppliers]);

  /**
   * Fetch suppliers from backend with database search and keyset cursor pagination
   */
  const fetchSuppliers = useCallback(
    async ({ cursor = null, search = "", isInitial = false } = {}) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        isFetchingRef.current = false;
      }

      if (isFetchingRef.current) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoadingInitial(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params = { limit: 50 };
        if (cursor) params.cursor = cursor;
        if (search.trim()) params.search = search.trim();

        const res = await api.get("/suppliers", {
          params,
          signal: controller.signal,
        });

        if (res.data?.success) {
          const { data = [], nextCursor: newCursor = null, hasMore: more = false } = res.data;

          if (isInitial) {
            setSuppliers(data);
          } else {
            // Append while avoiding duplicate IDs
            setSuppliers((prev) => {
              const existingIds = new Set(prev.map((s) => s._id));
              const fresh = data.filter((s) => !existingIds.has(s._id));
              return [...prev, ...fresh];
            });
          }

          setNextCursor(newCursor);
          setHasMore(more);
        }
      } catch (err) {
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
          return;
        }
        console.error("Failed to load suppliers:", err);
      } finally {
        isFetchingRef.current = false;
        if (isInitial) {
          setIsLoadingInitial(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    []
  );

  // Initial load when dropdown is first opened
  useEffect(() => {
    if (isOpen && suppliers.length === 0) {
      fetchSuppliers({ cursor: null, search: searchTerm, isInitial: true });
    }
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 50);
    }
  }, [isOpen, suppliers.length, fetchSuppliers, searchTerm]);

  // Debounced database search when user types
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      fetchSuppliers({ cursor: null, search: searchTerm, isInitial: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, fetchSuppliers]);

  // Infinite scroll trigger near bottom (within 40px)
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - (scrollTop + clientHeight) <= 40) {
      if (hasMore && !isLoadingMore && !isLoadingInitial && !isFetchingRef.current && nextCursor) {
        fetchSuppliers({ cursor: nextCursor, search: searchTerm, isInitial: false });
      }
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (sup) => {
    if (!sup) {
      // Clear
      setSelectedSupplierName("");
      onChange?.("", null);
    } else {
      setSelectedSupplierName(sup.name);
      onChange?.(sup._id, sup);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedSupplierName("");
    onChange?.("", null);
  };

  return (
    <div
      ref={containerRef}
      className={`pos-supplier-select-wrapper position-relative ${className}`}
      style={{ minWidth: compact ? "160px" : "100%" }}
    >
      {/* Trigger Button */}
      <div
        className={`form-control form-control-sm d-flex align-items-center justify-content-between cursor-pointer user-select-none bg-white ${
          isOpen ? "border-dark shadow-sm" : ""
        }`}
        style={{ height: compact ? "31px" : "34px", padding: "4px 8px" }}
        onClick={() => setIsOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="d-flex align-items-center gap-2 text-truncate pe-1">
          <FiTruck size={13} className="text-secondary flex-shrink-0" />
          <span
            className={`small text-truncate ${
              value ? "fw-medium text-dark" : "text-muted"
            }`}
          >
            {value ? selectedSupplierName || "Loading..." : placeholder}
          </span>
        </div>

        <div className="d-flex align-items-center gap-1 flex-shrink-0">
          {value && (
            <button
              type="button"
              className="btn btn-link p-0 text-muted hover-text-dark border-0 d-flex align-items-center"
              onClick={handleClear}
              title="Clear Supplier"
            >
              <FiX size={13} />
            </button>
          )}
          <FiChevronDown
            size={13}
            className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            style={{
              transition: "transform 0.2s ease",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`pos-supplier-dropdown-menu shadow-lg border rounded-3 bg-white position-absolute start-0 end-0 ${
            dropUp ? "bottom-100 mb-1" : "mt-1"
          }`}
          style={{
            zIndex: 1070,
            minWidth: "240px",
            animation: "posBackdropFadeIn 0.15s ease-out",
          }}
        >
          {/* Database Search Input */}
          <div className="p-1 border-bottom bg-light">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 text-secondary ps-2 pe-1">
                <FiSearch size={13} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="form-control border-start-0 ps-1 py-1"
                placeholder="Search database suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0 border text-muted px-2"
                  onClick={() => setSearchTerm("")}
                >
                  <FiX size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Supplier List with Infinite Scroll */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{ maxHeight: "125px", overflowY: "auto" }}
            className="p-1"
          >
            {/* "All Suppliers" Option */}
            <div
              className={`dropdown-item rounded-2 py-1 px-2 small cursor-pointer d-flex align-items-center justify-content-between ${
                !value ? "bg-light fw-bold text-dark" : "text-secondary"
              }`}
              onClick={() => handleSelect(null)}
            >
              <span>{placeholder}</span>
              {!value && <FiCheck size={14} className="text-dark" />}
            </div>

            {isLoadingInitial ? (
              <div className="text-center py-2 text-muted small d-flex align-items-center justify-content-center gap-2">
                <div
                  className="spinner-border spinner-border-sm text-dark"
                  style={{ width: "13px", height: "13px" }}
                  role="status"
                />
                <span>Querying suppliers...</span>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-2 text-muted small">
                {searchTerm ? `No suppliers found for "${searchTerm}"` : "No suppliers found."}
              </div>
            ) : (
              suppliers.map((sup) => {
                const isSelected = sup._id === value;
                return (
                  <div
                    key={sup._id}
                    className={`dropdown-item rounded-2 py-1 px-2 small cursor-pointer d-flex align-items-center justify-content-between ${
                      isSelected ? "bg-dark text-white fw-medium" : "text-dark"
                    }`}
                    onClick={() => handleSelect(sup)}
                  >
                    <div className="d-flex align-items-center gap-1 text-truncate pe-2">
                      <span className="text-truncate">{sup.name}</span>
                      {(sup.isCustomer || sup.type === "customer") && (
                        <span
                          className={`badge flex-shrink-0 ${isSelected ? "bg-light text-dark" : "bg-secondary-subtle text-secondary border"}`}
                          style={{ fontSize: "0.62rem", padding: "0.15rem 0.35rem" }}
                        >
                          Customer
                        </span>
                      )}
                    </div>
                    {isSelected && <FiCheck size={14} className="text-white flex-shrink-0" />}
                  </div>
                );
              })
            )}

            {/* Loading More Spinner Indicator */}
            {isLoadingMore && (
              <div className="text-center py-1 text-muted small d-flex align-items-center justify-content-center gap-1">
                <div
                  className="spinner-border spinner-border-sm text-secondary"
                  style={{ width: "12px", height: "12px" }}
                  role="status"
                />
                <span style={{ fontSize: "0.72rem" }}>Loading more...</span>
              </div>
            )}
          </div>

          {/* Footer info showing cursor pagination stats */}
          {!isLoadingInitial && suppliers.length > 0 && (
            <div className="border-top px-2 py-1 bg-light text-muted d-flex justify-content-between align-items-center" style={{ fontSize: "0.68rem" }}>
              <span>
                {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} loaded
              </span>
              {hasMore ? (
                <span className="text-secondary">Scroll for more</span>
              ) : (
                <span className="text-muted">End of results</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
